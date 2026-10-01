/**
 * Embudo de ventas, ficha del cliente y tareas.
 *
 * Cada chat es un lead. La etapa avanza sola en los pasos obvios (ya sabemos qué
 * quiere → "Calificando"; salió un presupuesto → "Presupuesto enviado") y el resto
 * lo mueve una persona. Ganado y Perdido siempre los marca alguien; Perdido pide motivo.
 */
import {BadRequestException, Body, Controller, Delete, Get, Logger, NotFoundException, Param, Post, Put, Query} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {conversationInclude, conversationView, pauserNames, trainerKeys} from './crm-views.js';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';

const logger = new Logger('CrmPipeline');

export const STAGES = ['NEW', 'QUALIFYING', 'QUOTE_SENT', 'NEGOTIATION', 'DEPOSIT', 'WON', 'LOST'] as const;
export type Stage = typeof STAGES[number];
const OPEN_STAGES: Stage[] = ['NEW', 'QUALIFYING', 'QUOTE_SENT', 'NEGOTIATION', 'DEPOSIT'];

export type LeadProfile = {
  usage?: string | null;
  games?: string[];
  budgetCents?: number | null;
  city?: string | null;
  payment?: string | null;
  delivery?: 'ENVIO' | 'RETIRO' | null;
};

/** Avanza la etapa solo hacia adelante y solo desde las etapas indicadas. */
export async function advanceStage(chatKey: string, to: Stage, onlyFrom: Stage[]): Promise<void> {
  await db.chatbotConversation.updateMany({
    where: {chatKey, stage: {in: onlyFrom}},
    data: {stage: to, stageChangedAt: new Date()},
  });
}

/**
 * Suma a la ficha lo que la IA sacó de la charla. Nunca borra un dato con un vacío:
 * si el cliente ya dijo su presupuesto y en este mensaje no lo repite, queda el anterior.
 */
export async function mergeProfile(chatKey: string, update: LeadProfile | null | undefined): Promise<void> {
  if (!update) return;
  const row = await db.chatbotConversation.findUnique({where: {chatKey}, select: {profile: true, leadValueCents: true}});
  if (!row) return;
  const current = (row.profile ?? {}) as LeadProfile;
  const next: LeadProfile = {...current};
  if (update.usage?.trim()) next.usage = update.usage.trim();
  if (update.games?.length) next.games = [...new Set([...(current.games ?? []), ...update.games.map((game) => game.trim()).filter(Boolean)])].slice(0, 12);
  if (update.budgetCents && update.budgetCents > 0) next.budgetCents = update.budgetCents;
  if (update.city?.trim()) next.city = update.city.trim();
  if (update.payment?.trim()) next.payment = update.payment.trim();
  if (update.delivery) next.delivery = update.delivery;
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  await db.chatbotConversation.update({
    where: {chatKey},
    data: {
      profile: next as Prisma.InputJsonValue,
      // Sin valor del anuncio, el presupuesto que dijo el cliente es una buena estimación.
      ...(!row.leadValueCents && next.budgetCents ? {leadValueCents: BigInt(next.budgetCents)} : {}),
    },
  });
  // Ya sabemos qué quiere y cuánto quiere gastar: está calificado.
  if (next.usage && next.budgetCents) await advanceStage(chatKey, 'QUALIFYING', ['NEW']);
}

// ------------------------------------------------------------------ tareas vencidas

let reminderTimer: NodeJS.Timeout | null = null;

/** Avisa en la campana las tareas que vencieron. Una sola vez por tarea. */
async function notifyDueTasks() {
  const due = await db.crmTask.findMany({
    where: {doneAt: null, notifiedAt: null, dueAt: {lte: new Date()}},
    take: 50,
  });
  for (const task of due) {
    const chat = task.conversationKey
      ? await db.chatbotConversation.findUnique({where: {chatKey: task.conversationKey}, select: {displayName: true, waContactName: true}})
      : null;
    const chatName = chat?.displayName || chat?.waContactName || task.conversationKey?.replace(/^tel:/, '+') || null;
    await db.notification.create({data: {
      userId: task.assignedToId ?? task.createdById,
      chatPhone: task.conversationKey,
      type: 'CRM_TASK_DUE',
      title: `Tarea vencida: ${task.title}`,
      body: chatName ? `Del chat con ${chatName}.` : 'Tarea del CRM.',
      entityType: 'CrmTask',
      entityId: task.id,
    }});
    await db.crmTask.update({where: {id: task.id}, data: {notifiedAt: new Date()}});
  }
}

export function startTaskReminders(): void {
  if (reminderTimer) return;
  const tick = async () => {
    try {
      await notifyDueTasks();
    } catch (error) {
      logger.warn(JSON.stringify({event: 'crm_task_reminders_failed', error: error instanceof Error ? error.message : String(error)}));
    } finally {
      reminderTimer = setTimeout(() => void tick(), 60_000);
    }
  };
  reminderTimer = setTimeout(() => void tick(), 15_000);
}

// ------------------------------------------------------------------ API

const leadSchema = z.object({
  stage: z.enum(STAGES).optional(),
  valueCents: z.coerce.number().int().min(0).max(100_000_000_000).nullable().optional(),
  lostReason: z.string().trim().max(300).nullable().optional(),
  profile: z.object({
    usage: z.string().trim().max(300).nullable().optional(),
    games: z.array(z.string().trim().min(1).max(80)).max(15).optional(),
    budgetCents: z.coerce.number().int().min(0).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    payment: z.string().trim().max(200).nullable().optional(),
    delivery: z.enum(['ENVIO', 'RETIRO']).nullable().optional(),
  }).strict().optional(),
}).strict();

const taskSchema = z.object({
  conversationKey: z.string().trim().max(200).nullable().optional(),
  title: z.string().trim().min(1).max(300),
  dueAt: z.coerce.date().nullable().optional(),
  assignedToId: z.string().trim().max(100).nullable().optional(),
}).strict();

const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  assignedToId: z.string().trim().max(100).nullable().optional(),
  done: z.boolean().optional(),
}).strict();

const pipelineQuerySchema = z.object({
  mine: z.enum(['0', '1']).default('0'),
  days: z.coerce.number().int().min(1).max(365).default(60),
}).strict();

@Controller('crm')
export class CrmPipelineController {
  /** Embudo: leads por etapa (los cerrados, solo los del período). */
  @Get('pipeline')
  async pipeline(@Query(new ZodPipe(pipelineQuerySchema)) query: z.infer<typeof pipelineQuerySchema>, @CurrentUser() user: RequestUser) {
    const now = new Date();
    const since = new Date(now.getTime() - query.days * 86_400_000);
    const trainers = await trainerKeys();
    const rows = await db.chatbotConversation.findMany({
      where: {
        NOT: [{chatKey: {startsWith: 'sim:'}}, {chatKey: {in: [...trainers]}}],
        ...(query.mine === '1' ? {assignedUserId: user.id} : {}),
        OR: [{stage: {in: OPEN_STAGES}}, {stageChangedAt: {gte: since}}],
        lastMessageAt: {gte: new Date(now.getTime() - 180 * 86_400_000)},
      },
      orderBy: [{lastMessageAt: {sort: 'desc', nulls: 'last'}}],
      take: 600,
      include: conversationInclude,
    });
    const pausers = await pauserNames(rows);
    const items = rows.map((row) => conversationView(row, now, pausers, trainers));
    const columns = STAGES.map((stage) => {
      const list = items.filter((item) => item.stage === stage);
      const total = list.reduce((sum, item) => sum + BigInt(item.leadValueCents ?? '0'), 0n);
      return {stage, count: list.length, totalCents: total.toString(), items: list};
    });
    return jsonSafe({columns});
  }

  @Put('conversations/:chatKey/lead')
  async updateLead(@Param('chatKey') chatKey: string, @Body(new ZodPipe(leadSchema)) body: z.infer<typeof leadSchema>) {
    const row = await db.chatbotConversation.findUnique({where: {chatKey}, select: {stage: true, profile: true}});
    if (!row) throw new NotFoundException('La conversación no existe');
    if (body.stage === 'LOST' && !body.lostReason?.trim()) throw new BadRequestException('Para marcarlo como perdido, elegí el motivo.');
    const profile = body.profile ? {...((row.profile ?? {}) as LeadProfile), ...body.profile} : undefined;
    await db.chatbotConversation.update({
      where: {chatKey},
      data: {
        ...(body.stage && body.stage !== row.stage ? {stage: body.stage, stageChangedAt: new Date()} : {}),
        ...(body.stage === 'LOST' ? {lostReason: body.lostReason ?? null} : body.stage ? {lostReason: null} : {}),
        ...(body.valueCents !== undefined ? {leadValueCents: body.valueCents === null ? null : BigInt(body.valueCents)} : {}),
        ...(profile ? {profile: profile as Prisma.InputJsonValue} : {}),
      },
    });
    const updated = await db.chatbotConversation.findUniqueOrThrow({where: {chatKey}, include: conversationInclude});
    return jsonSafe(conversationView(updated, new Date(), await pauserNames([updated]), await trainerKeys()));
  }

  @Get('tasks')
  async tasks(@Query('chatKey') chatKey: string | undefined, @Query('mine') mine: string | undefined, @Query('open') open: string | undefined, @CurrentUser() user: RequestUser) {
    const rows = await db.crmTask.findMany({
      where: {
        ...(chatKey ? {conversationKey: chatKey} : {}),
        ...(mine === '1' ? {OR: [{assignedToId: user.id}, {assignedToId: null, createdById: user.id}]} : {}),
        ...(open === '1' ? {doneAt: null} : {}),
      },
      orderBy: [{doneAt: {sort: 'asc', nulls: 'first'}}, {dueAt: {sort: 'asc', nulls: 'last'}}, {createdAt: 'desc'}],
      take: 200,
    });
    // Nombre del chat para las listas generales de tareas.
    const keys = [...new Set(rows.map((row) => row.conversationKey).filter((key): key is string => Boolean(key)))];
    const chats = keys.length
      ? await db.chatbotConversation.findMany({where: {chatKey: {in: keys}}, select: {chatKey: true, displayName: true, waContactName: true}})
      : [];
    const names = new Map(chats.map((chat) => [chat.chatKey, chat.displayName || chat.waContactName || chat.chatKey.replace(/^tel:/, '+')]));
    return jsonSafe(rows.map((row) => ({...row, chatName: row.conversationKey ? names.get(row.conversationKey) ?? null : null})));
  }

  @Post('tasks')
  async createTask(@Body(new ZodPipe(taskSchema)) body: z.infer<typeof taskSchema>, @CurrentUser() user: RequestUser) {
    const task = await db.crmTask.create({data: {
      conversationKey: body.conversationKey ?? null,
      title: body.title,
      dueAt: body.dueAt ?? null,
      assignedToId: body.assignedToId ?? user.id,
      createdById: user.id,
    }});
    if (task.conversationKey) await db.chatbotConversation.update({where: {chatKey: task.conversationKey}, data: {updatedAt: new Date()}}).catch(() => undefined);
    return jsonSafe(task);
  }

  @Put('tasks/:id')
  async updateTask(@Param('id') id: string, @Body(new ZodPipe(taskUpdateSchema)) body: z.infer<typeof taskUpdateSchema>) {
    const task = await db.crmTask.update({
      where: {id},
      data: {
        ...(body.title ? {title: body.title} : {}),
        ...(body.dueAt !== undefined ? {dueAt: body.dueAt, notifiedAt: null} : {}),
        ...(body.assignedToId !== undefined ? {assignedToId: body.assignedToId} : {}),
        ...(body.done !== undefined ? {doneAt: body.done ? new Date() : null} : {}),
      },
    });
    if (task.conversationKey) await db.chatbotConversation.update({where: {chatKey: task.conversationKey}, data: {updatedAt: new Date()}}).catch(() => undefined);
    return jsonSafe(task);
  }

  @Delete('tasks/:id')
  async deleteTask(@Param('id') id: string) {
    await db.crmTask.delete({where: {id}}).catch(() => undefined);
    return {ok: true};
  }
}
