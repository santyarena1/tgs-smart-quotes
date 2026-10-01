/**
 * API del CRM nuevo: bandeja con vistas, estados del chat, notas internas,
 * respuestas rápidas, archivos del cliente y preferencias de cada usuario.
 *
 * Lo que manda o recibe WhatsApp sigue en whatsapp.ts; esto es la gestión del equipo.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {conversationInclude, conversationView, pauserNames, trainerKeys} from './crm-views.js';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';
import {downloadMedia, loadCredentials} from './whatsapp-client.js';

export const CRM_VIEWS = ['ALL', 'HOT', 'MINE', 'UNASSIGNED', 'NEEDS_HUMAN', 'BOT', 'UNREAD', 'WAITING', 'SNOOZED', 'RESOLVED'] as const;
type CrmView = typeof CRM_VIEWS[number];

const inboxQuerySchema = z.object({
  view: z.enum(CRM_VIEWS).default('ALL'),
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(60).optional(),
  cursor: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

const alwaysOnSchema = z.object({alwaysOn: z.boolean()}).strict();
const snoozeSchema = z.object({until: z.coerce.date()}).strict();
const tagsSchema = z.object({tags: z.array(z.string().trim().min(1).max(40)).max(20)}).strict();
const renameSchema = z.object({displayName: z.string().trim().max(120).nullable()}).strict();
const noteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  mentions: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
}).strict();
const quickReplySchema = z.object({
  shortcut: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}_-]+$/u, 'El atajo va sin espacios: letras, números, - o _.'),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4096),
}).strict();
const themeSchema = z.object({theme: z.enum(['light', 'dark', 'system'])}).strict();

/** Condición de cada vista. Los resueltos y pospuestos solo aparecen en su propia vista. */
function viewWhere(view: CrmView, userId: string, now: Date): Prisma.ChatbotConversationWhereInput {
  const active: Prisma.ChatbotConversationWhereInput = {
    resolvedAt: null,
    OR: [{snoozedUntil: null}, {snoozedUntil: {lte: now}}],
  };
  const needsPerson: Prisma.ChatbotConversationWhereInput = {OR: [{escalatedAt: {not: null}}, {botPausedAt: {not: null}}]};
  switch (view) {
    case 'MINE': return {AND: [active, {assignedUserId: userId}]};
    // A punto de comprar: temperatura alta y la venta todavía abierta.
    case 'HOT': return {AND: [active, {temperature: {gte: 66}}, {stage: {notIn: ['WON', 'LOST']}}]};
    case 'UNASSIGNED': return {AND: [active, needsPerson, {assignedUserId: null}]};
    case 'NEEDS_HUMAN': return {AND: [active, {escalatedAt: {not: null}}]};
    case 'BOT': return {AND: [active, {escalatedAt: null, botPausedAt: null}]};
    case 'UNREAD': return {AND: [active, {unreadCount: {gt: 0}}]};
    // Le contestamos y falta que responda el cliente.
    case 'WAITING': return {AND: [active, {lastOutboundAt: {not: null}}, {
      OR: [{lastInboundAt: null}, {lastOutboundAt: {gt: db.chatbotConversation.fields.lastInboundAt}}],
    }]};
    case 'SNOOZED': return {snoozedUntil: {gt: now}, resolvedAt: null};
    case 'RESOLVED': return {resolvedAt: {not: null}};
    default: return active;
  }
}

const NOT_SIMULATOR: Prisma.ChatbotConversationWhereInput = {NOT: {chatKey: {startsWith: 'sim:'}}};

async function requireConversation(chatKey: string) {
  const row = await db.chatbotConversation.findUnique({where: {chatKey}, select: {chatKey: true}});
  if (!row) throw new NotFoundException('La conversación no existe');
}

async function viewOf(chatKey: string) {
  const row = await db.chatbotConversation.findUniqueOrThrow({where: {chatKey}, include: conversationInclude});
  return jsonSafe(conversationView(row, new Date(), await pauserNames([row]), await trainerKeys()));
}

@Controller('crm')
export class CrmController {
  /** Bandeja: chats de la vista pedida + contadores de todas las vistas. */
  @Get('inbox')
  async inbox(@Query(new ZodPipe(inboxQuerySchema)) query: z.infer<typeof inboxQuerySchema>, @CurrentUser() user: RequestUser) {
    const now = new Date();
    const filters: Prisma.ChatbotConversationWhereInput[] = [NOT_SIMULATOR, viewWhere(query.view, user.id, now)];
    if (query.q) {
      const digits = query.q.replace(/\D/g, '');
      filters.push({OR: [
        {displayName: {contains: query.q, mode: 'insensitive'}},
        {waContactName: {contains: query.q, mode: 'insensitive'}},
        {lastInboundText: {contains: query.q, mode: 'insensitive'}},
        {tags: {has: query.q.toLocaleLowerCase('es-AR')}},
        ...(digits.length >= 4 ? [{chatKey: {contains: digits}}] : []),
      ]});
    }
    if (query.tag) filters.push({tags: {has: query.tag}});

    const [rows, counts] = await Promise.all([
      db.chatbotConversation.findMany({
        where: {AND: filters},
        orderBy: [{lastMessageAt: {sort: 'desc', nulls: 'last'}}, {chatKey: 'asc'}],
        take: query.limit + 1,
        ...(query.cursor ? {skip: 1, cursor: {chatKey: query.cursor}} : {}),
        include: conversationInclude,
      }),
      Promise.all(CRM_VIEWS.map(async (view) => [view, await db.chatbotConversation.count({
        where: {AND: [NOT_SIMULATOR, viewWhere(view, user.id, now)]},
      })] as const)),
    ]);
    const items = rows.slice(0, query.limit);
    const [pausers, trainers] = await Promise.all([pauserNames(items), trainerKeys()]);
    return jsonSafe({
      items: items.map((row) => conversationView(row, now, pausers, trainers)),
      nextCursor: rows.length > query.limit ? items.at(-1)?.chatKey ?? null : null,
      counts: Object.fromEntries(counts),
    });
  }

  /** Etiquetas en uso, para sugerirlas al escribir. */
  @Get('tags')
  async tags() {
    const rows = await db.$queryRaw<Array<{tag: string; total: bigint}>>`
      SELECT tag, COUNT(*) AS total FROM "ChatbotConversation", unnest(tags) AS tag
       GROUP BY tag ORDER BY total DESC LIMIT 50`;
    return rows.map((row) => ({tag: row.tag, total: Number(row.total)}));
  }

  @Post('conversations/:chatKey/resolve')
  async resolve(@Param('chatKey') chatKey: string) {
    await requireConversation(chatKey);
    await db.chatbotConversation.update({where: {chatKey}, data: {resolvedAt: new Date(), snoozedUntil: null, unreadCount: 0}});
    return viewOf(chatKey);
  }

  @Post('conversations/:chatKey/reopen')
  async reopen(@Param('chatKey') chatKey: string) {
    await requireConversation(chatKey);
    await db.chatbotConversation.update({where: {chatKey}, data: {resolvedAt: null, snoozedUntil: null}});
    return viewOf(chatKey);
  }

  /** Posponer: desaparece de la bandeja hasta la fecha, o antes si el cliente escribe. */
  @Post('conversations/:chatKey/snooze')
  async snooze(@Param('chatKey') chatKey: string, @Body(new ZodPipe(snoozeSchema)) body: {until: Date}) {
    await requireConversation(chatKey);
    if (body.until.getTime() <= Date.now()) throw new BadRequestException('La fecha para posponer tiene que ser futura.');
    await db.chatbotConversation.update({where: {chatKey}, data: {snoozedUntil: body.until, resolvedAt: null}});
    return viewOf(chatKey);
  }

  @Put('conversations/:chatKey/tags')
  async setTags(@Param('chatKey') chatKey: string, @Body(new ZodPipe(tagsSchema)) body: {tags: string[]}) {
    await requireConversation(chatKey);
    const tags = [...new Set(body.tags.map((tag) => tag.toLocaleLowerCase('es-AR')))];
    await db.chatbotConversation.update({where: {chatKey}, data: {tags}});
    return viewOf(chatKey);
  }

  /** El bot atiende este chat a cualquier hora, aunque el local esté cerrado. */
  @Put('conversations/:chatKey/always-on')
  async setAlwaysOn(@Param('chatKey') chatKey: string, @Body(new ZodPipe(alwaysOnSchema)) body: {alwaysOn: boolean}) {
    await requireConversation(chatKey);
    await db.chatbotConversation.update({where: {chatKey}, data: {alwaysOn: body.alwaysOn}});
    return viewOf(chatKey);
  }

  @Put('conversations/:chatKey/name')
  async rename(@Param('chatKey') chatKey: string, @Body(new ZodPipe(renameSchema)) body: {displayName: string | null}) {
    await requireConversation(chatKey);
    await db.chatbotConversation.update({where: {chatKey}, data: {displayName: body.displayName || null}});
    return viewOf(chatKey);
  }

  // ------------------------------------------------------------ notas internas

  @Get('conversations/:chatKey/notes')
  async notes(@Param('chatKey') chatKey: string) {
    return jsonSafe(await db.crmNote.findMany({where: {conversationKey: chatKey}, orderBy: {createdAt: 'asc'}, take: 500}));
  }

  /** Nota interna. Los mencionados con @ reciben un aviso en la campana. */
  @Post('conversations/:chatKey/notes')
  async addNote(
    @Param('chatKey') chatKey: string,
    @Body(new ZodPipe(noteSchema)) body: {body: string; mentions: string[]},
    @CurrentUser() user: RequestUser,
  ) {
    await requireConversation(chatKey);
    const authorName = user.displayName || user.username;
    const note = await db.crmNote.create({data: {
      conversationKey: chatKey,
      authorId: user.id,
      authorName,
      body: body.body,
      mentions: body.mentions.filter((id) => id !== user.id),
    }});
    // Toca la conversación para que el canal en vivo avise a las otras pantallas.
    await db.chatbotConversation.update({where: {chatKey}, data: {updatedAt: new Date()}});
    const conversation = await db.chatbotConversation.findUnique({where: {chatKey}, select: {displayName: true, waContactName: true}});
    const chatName = conversation?.displayName || conversation?.waContactName || chatKey.replace(/^tel:/, '+');
    if (note.mentions.length) {
      await db.notification.createMany({data: note.mentions.map((userId) => ({
        userId,
        chatPhone: chatKey,
        type: 'CRM_MENTION',
        title: `${authorName} te mencionó en ${chatName}`,
        body: body.body.slice(0, 280),
        entityType: 'ChatbotConversation',
        entityId: chatKey,
        metadata: {noteId: note.id} as Prisma.InputJsonValue,
      }))});
    }
    return jsonSafe(note);
  }

  @Delete('conversations/:chatKey/notes/:id')
  async deleteNote(@Param('chatKey') chatKey: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    const note = await db.crmNote.findFirst({where: {id, conversationKey: chatKey}});
    if (!note) throw new NotFoundException('La nota no existe');
    if (note.authorId !== user.id && user.role !== 'ADMIN') throw new BadRequestException('Solo quien escribió la nota puede borrarla.');
    await db.crmNote.delete({where: {id}});
    await db.chatbotConversation.update({where: {chatKey}, data: {updatedAt: new Date()}});
    return {ok: true};
  }

  // ------------------------------------------------------------ respuestas rápidas

  @Get('quick-replies')
  async quickReplies() {
    return jsonSafe(await db.crmQuickReply.findMany({orderBy: {shortcut: 'asc'}}));
  }

  @Post('quick-replies')
  async createQuickReply(@Body(new ZodPipe(quickReplySchema)) body: z.infer<typeof quickReplySchema>, @CurrentUser() user: RequestUser) {
    const shortcut = body.shortcut.toLocaleLowerCase('es-AR');
    if (await db.crmQuickReply.findUnique({where: {shortcut}})) throw new BadRequestException(`Ya existe la respuesta rápida "/${shortcut}".`);
    return jsonSafe(await db.crmQuickReply.create({data: {...body, shortcut, createdById: user.id}}));
  }

  @Put('quick-replies/:id')
  async updateQuickReply(@Param('id') id: string, @Body(new ZodPipe(quickReplySchema)) body: z.infer<typeof quickReplySchema>) {
    const shortcut = body.shortcut.toLocaleLowerCase('es-AR');
    const clash = await db.crmQuickReply.findUnique({where: {shortcut}});
    if (clash && clash.id !== id) throw new BadRequestException(`Ya existe la respuesta rápida "/${shortcut}".`);
    return jsonSafe(await db.crmQuickReply.update({where: {id}, data: {...body, shortcut}}));
  }

  @Delete('quick-replies/:id')
  async deleteQuickReply(@Param('id') id: string) {
    await db.crmQuickReply.delete({where: {id}}).catch(() => undefined);
    return {ok: true};
  }

  // ------------------------------------------------------------ archivos del cliente

  /**
   * Foto, audio o documento que mandó el cliente. Se baja de Meta en el momento
   * (Meta los guarda ~30 días) y se sirve con cache privada.
   */
  @Get('media/:logId')
  async media(@Param('logId') logId: string, @Res() reply: any) {
    const log = await db.chatbotMessageLog.findUnique({where: {id: logId}, select: {mediaId: true, mediaMimeType: true, mediaFilename: true}});
    if (!log?.mediaId) throw new NotFoundException('Ese mensaje no tiene archivo.');
    const file = await downloadMedia(await loadCredentials(), log.mediaId);
    const filename = (log.mediaFilename ?? 'archivo').replace(/[^\w.\- ]+/g, '_');
    reply
      .header('Content-Type', log.mediaMimeType ?? file.mimeType)
      .header('Cache-Control', 'private, max-age=86400')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(file.bytes);
  }

  // ------------------------------------------------------------ preferencias

  @Get('me/preferences')
  async preferences(@CurrentUser() user: RequestUser) {
    const row = await db.user.findUniqueOrThrow({where: {id: user.id}, select: {themePreference: true}});
    return {theme: row.themePreference ?? 'system'};
  }

  @Put('me/preferences')
  async setPreferences(@Body(new ZodPipe(themeSchema)) body: {theme: 'light' | 'dark' | 'system'}, @CurrentUser() user: RequestUser) {
    await db.user.update({where: {id: user.id}, data: {themePreference: body.theme}});
    return {theme: body.theme};
  }

  /** Equipo para asignar y mencionar. Cualquier usuario logueado lo puede ver (solo nombre). */
  @Get('team')
  async team() {
    const users = await db.user.findMany({
      where: {active: true},
      select: {id: true, username: true, displayName: true, role: true},
      orderBy: [{displayName: 'asc'}, {username: 'asc'}],
    });
    return users.map((user) => ({id: user.id, name: user.displayName || user.username, username: user.username, role: user.role}));
  }
}
