/**
 * Entrenamiento del bot.
 *
 * - El número entrenador (hoy el del local) le escribe al bot y este lo trata como a
 *   su jefe: entiende qué le enseña, lo propone, lo aplica cuando le dicen "sí", lo
 *   prueba como si fuera un cliente y le pregunta lo que no supo responder.
 * - Los vendedores también enseñan: cuando corrigen mucho una sugerencia, eso queda
 *   como propuesta.
 * - NADA llega a los clientes sin aprobación: todo es una BotLearning PENDING hasta
 *   que alguien la aprueba, por WhatsApp o desde el CRM.
 */
import {BadRequestException, Body, Controller, Get, Logger, NotFoundException, Param, Post, Put, Query} from '@nestjs/common';
import {BotTrainerService, createAiClient, DEFAULT_AI_MODEL, SellerEditLearningService} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {db, Prisma} from '@tgs/database';
import {normalizePhone, productSimilarity} from '@tgs/validation';
import {z} from 'zod';
import {settingsDto} from './chatbot-core.js';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';
import {enqueueOutbound} from './whatsapp-outbound.js';
import {loadCredentials, showTyping} from './whatsapp-client.js';

const logger = new Logger('BotTraining');

export type Guidance = {id: string; text: string; enabled: boolean; source: string; createdAt: string};
type KnowledgeEntry = ReturnType<typeof settingsDto>['responses'][number];

const YES = new Set(['si', 'sí', 'dale', 'ok', 'oka', 'okay', 'aplicalo', 'aplicá', 'aplica', 'confirmo', 'de una', 'perfecto', 'listo', 'va', 'sii', 'sip', 'correcto', 'exacto']);
const NO = new Set(['no', 'nop', 'cancela', 'cancelá', 'cancelalo', 'descartalo', 'descarta', 'eso no', 'no no']);

const plain = (value: string) => value
  .toLocaleLowerCase('es-AR')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function parseGuidance(value: unknown): Guidance[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Guidance =>
    Boolean(item) && typeof item === 'object' && typeof (item as Guidance).text === 'string' && typeof (item as Guidance).id === 'string');
}

/** chatKey canónico de un número cargado a mano ("11 4870-4101", "+54 9 11…"). */
export function trainerChatKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Un número local argentino sin código de país se completa con 54.
  const withCountry = digits.startsWith('54') ? digits : `54${digits.replace(/^0/, '')}`;
  const normalized = normalizePhone(withCountry);
  return normalized ? `tel:${normalized}` : null;
}

export async function isTrainerChat(chatKey: string): Promise<boolean> {
  const settings = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {trainerNumbers: true}});
  return Boolean(settings?.trainerNumbers.includes(chatKey));
}

async function aiDeps() {
  const ai = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  const chatbot = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {model: true}});
  const key = ai.apiKeyEncrypted ? decryptSecret(ai.apiKeyEncrypted) : process.env.OPENAI_API_KEY;
  return {client: key?.trim() ? createAiClient({apiKey: key}) : null, model: chatbot?.model ?? ai.model ?? DEFAULT_AI_MODEL};
}

/** Manda uno o varios mensajes al número entrenador. Salen aunque el bot esté apagado. */
export async function sendToTrainer(chatKey: string, messages: string[], metadata: Record<string, unknown> = {}): Promise<void> {
  const bubbles = messages.map((message) => message.trim()).filter(Boolean);
  if (!bubbles.length) return;
  const log = await db.chatbotMessageLog.create({data: {
    conversationKey: chatKey,
    direction: 'OUTBOUND',
    actor: 'SYSTEM',
    status: 'SEND_PENDING',
    channel: 'CLOUD_API',
    text: bubbles.join('\n'),
    decisionMetadata: {trainer: true, bubbles, ...metadata} as Prisma.InputJsonValue,
  }});
  await enqueueOutbound(chatKey, log.id, bubbles.map((text, index) => ({
    kind: 'TEXT' as const,
    payload: {text},
    delaySeconds: index === 0 ? 0 : 1.2,
  })), {initialDelaySeconds: 0.8});
}

// ------------------------------------------------------------------ aplicar

async function updateSettings(change: (state: {responses: KnowledgeEntry[]; guidance: Guidance[]}) => void) {
  const row = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  const dto = settingsDto(row);
  const state = {responses: dto.responses.map((item) => ({...item})), guidance: parseGuidance(row.guidance)};
  change(state);
  await db.chatbotSettings.update({
    where: {id: 'singleton'},
    data: {knowledgeEntries: state.responses as unknown as Prisma.InputJsonValue, guidance: state.guidance as unknown as Prisma.InputJsonValue},
  });
}

const learningOverrideSchema = z.object({
  text: z.string().trim().min(1).max(2000).optional(),
  activators: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  answer: z.string().trim().min(1).max(4000).optional(),
  context: z.string().trim().max(4000).optional(),
}).strict();
type LearningOverride = z.infer<typeof learningOverrideSchema>;

/** Aprueba una propuesta y la incorpora al bot. Devuelve qué quedó aplicado. */
export async function approveLearning(id: string, userId: string | null, override: LearningOverride = {}) {
  const learning = await db.botLearning.findUnique({where: {id}});
  if (!learning) throw new NotFoundException('La propuesta no existe.');
  if (learning.status !== 'PENDING') throw new BadRequestException('Esa propuesta ya fue resuelta.');
  const payload = (learning.payload ?? {}) as Record<string, any>;
  const now = new Date().toISOString();

  if (learning.kind === 'GUIDANCE') {
    const text = override.text ?? payload.text;
    if (!text) throw new BadRequestException('La indicación está vacía.');
    await updateSettings((state) => {
      state.guidance.push({id: learning.id, text, enabled: true, source: learning.source, createdAt: now});
    });
  } else {
    // KNOWLEDGE, o una QUESTION a la que se le cargó la respuesta.
    const question = learning.kind === 'QUESTION' ? String(payload.question ?? '') : '';
    const answer = override.answer ?? payload.answer;
    if (!answer) throw new BadRequestException(learning.kind === 'QUESTION' ? 'Para aprobar una pregunta, cargá qué hay que responder.' : 'El dato está vacío.');
    const activators: string[] = override.activators
      ?? (Array.isArray(payload.activators) && payload.activators.length ? payload.activators : question ? [question] : []);
    const context = override.context ?? payload.context ?? '';
    await updateSettings((state) => {
      const target = payload.replacesId ? state.responses.find((item) => item.id === payload.replacesId) : undefined;
      if (target) {
        target.answer = answer;
        target.activators = [...new Set([...target.activators, ...activators])];
        if (context) target.context = context;
        target.enabled = true;
      } else {
        state.responses.push({
          id: learning.id,
          enabled: true,
          activators,
          similarityThreshold: 80,
          answer,
          context,
          attachments: {imageUrl: null, url: null, quote: null},
        });
      }
    });
  }

  await db.botLearning.update({
    where: {id},
    data: {status: 'APPROVED', decidedAt: new Date(), decidedById: userId, decisionNote: Object.keys(override).length ? 'Editada antes de aprobar' : null},
  });
  if (payload.answersQuestionId) {
    await db.botLearning.updateMany({
      where: {id: payload.answersQuestionId, status: 'PENDING'},
      data: {status: 'APPROVED', decidedAt: new Date(), decidedById: userId, decisionNote: 'Respondida por el entrenador'},
    });
  }
  return learning;
}

export async function rejectLearning(id: string, userId: string | null, note?: string) {
  const updated = await db.botLearning.updateMany({
    where: {id, status: 'PENDING'},
    data: {status: 'REJECTED', decidedAt: new Date(), decidedById: userId, decisionNote: note ?? null},
  });
  if (!updated.count) throw new BadRequestException('Esa propuesta no existe o ya fue resuelta.');
}

// ------------------------------------------------------------------ preguntas sin responder

/**
 * Un cliente preguntó algo que el bot no supo responder. Se agrupan las preguntas
 * parecidas y, si hay un entrenador con la ventana abierta, se le consulta.
 */
export async function recordUnansweredQuestion(chatKey: string, question: string, reason: string | null, logId: string | null): Promise<void> {
  const text = question.trim().slice(0, 1000);
  if (text.length < 4) return;
  const since = new Date(Date.now() - 14 * 86_400_000);
  const open = await db.botLearning.findMany({
    where: {kind: 'QUESTION', status: 'PENDING', createdAt: {gte: since}},
    orderBy: {createdAt: 'desc'},
    take: 200,
  });
  const similar = open.find((item) => productSimilarity(plain(String((item.payload as any)?.question ?? '')), plain(text)) >= 75);
  if (similar) {
    const payload = (similar.payload ?? {}) as Record<string, any>;
    const examples: string[] = Array.isArray(payload.examples) ? payload.examples : [];
    await db.botLearning.update({
      where: {id: similar.id},
      data: {
        occurrences: {increment: 1},
        payload: {...payload, examples: [...new Set([...examples, text])].slice(-5)} as Prisma.InputJsonValue,
      },
    });
    return;
  }
  const created = await db.botLearning.create({data: {
    source: 'UNANSWERED',
    kind: 'QUESTION',
    summary: `Un cliente preguntó y no supe responder: "${text.slice(0, 160)}"`,
    payload: {question: text, reason, examples: [text]} as Prisma.InputJsonValue,
    conversationKey: chatKey,
    logId,
  }});
  await askTrainerAbout(created.id, text).catch((error: unknown) => {
    logger.warn(JSON.stringify({event: 'trainer_ping_failed', error: error instanceof Error ? error.message : String(error)}));
  });
}

/** Le pregunta al entrenador, sin insistir: como mucho un mensaje cada 2 horas. */
async function askTrainerAbout(questionId: string, question: string) {
  const settings = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {trainerNumbers: true}});
  const now = new Date();
  for (const chatKey of settings?.trainerNumbers ?? []) {
    const chat = await db.chatbotConversation.findUnique({where: {chatKey}, select: {windowExpiresAt: true}});
    // Sin ventana abierta solo se podría con plantilla: queda en el CRM, en Entrenamiento.
    if (!chat?.windowExpiresAt || chat.windowExpiresAt <= now) continue;
    const recentPing = await db.chatbotMessageLog.findFirst({
      where: {conversationKey: chatKey, actor: 'SYSTEM', direction: 'OUTBOUND', createdAt: {gte: new Date(now.getTime() - 2 * 3_600_000)}},
      select: {decisionMetadata: true},
      orderBy: {createdAt: 'desc'},
    });
    if (recentPing && (recentPing.decisionMetadata as any)?.ping) continue;
    await sendToTrainer(chatKey, [
      `Me preguntaron algo que no sé responder: "${question.slice(0, 300)}"`,
      'Qué le digo? Respondeme acá y lo propongo para que lo apruebes.',
    ], {ping: true, questionId});
    return;
  }
}

// ------------------------------------------------------------------ correcciones de vendedores

/** Un vendedor corrigió bastante una sugerencia: puede haber algo para aprender. */
export async function recordSellerEdit(chatKey: string, logId: string, botDraft: string, sentByHuman: string): Promise<void> {
  const similarity = productSimilarity(plain(botDraft), plain(sentByHuman));
  if (similarity >= 85) return;
  const customer = await db.chatbotMessageLog.findFirst({
    where: {conversationKey: chatKey, direction: 'INBOUND'},
    orderBy: {createdAt: 'desc'},
    select: {text: true},
  });
  const service = new SellerEditLearningService(await aiDeps());
  const {result} = await service.propose({customerMessage: customer?.text ?? '', botDraft, sentByHuman});
  if (!result.worthLearning || !result.guidance) return;
  await db.botLearning.create({data: {
    source: 'SELLER_EDIT',
    kind: 'GUIDANCE',
    summary: result.summary,
    payload: {text: result.guidance, botDraft, sentByHuman, customerMessage: customer?.text ?? ''} as Prisma.InputJsonValue,
    conversationKey: chatKey,
    logId,
  }});
}

// ------------------------------------------------------------------ turno del entrenador

/**
 * Responde al número entrenador. Junta lo que mandó desde la última respuesta, igual
 * que con un cliente, y decide: aprobar/descartar, proponer, probar o contestar.
 */
export async function handleTrainerTurn(chatKey: string, runSimulation: (message: string) => Promise<{messages: string[]; escalateReason: string | null}>): Promise<void> {
  const lastAnswer = await db.chatbotMessageLog.findFirst({
    where: {conversationKey: chatKey, direction: 'OUTBOUND'},
    orderBy: {createdAt: 'desc'},
    select: {createdAt: true},
  });
  const pending = await db.chatbotMessageLog.findMany({
    where: {conversationKey: chatKey, direction: 'INBOUND', ...(lastAnswer ? {createdAt: {gt: lastAnswer.createdAt}} : {})},
    orderBy: {createdAt: 'asc'},
    select: {text: true, waMessageId: true},
  });
  const message = pending.map((item) => item.text).join('\n').trim();
  if (!message) return;
  const last = pending.at(-1);
  const credentials = await loadCredentials().catch(() => null);
  if (credentials && last?.waMessageId) await showTyping(credentials, last.waMessageId).catch(() => undefined);

  // "Sí" / "No" a lo último que propuse: sin IA, directo.
  const recentProposals = await db.botLearning.findMany({
    where: {status: 'PENDING', source: 'TRAINER', conversationKey: chatKey, createdAt: {gte: new Date(Date.now() - 48 * 3_600_000)}},
    orderBy: {createdAt: 'asc'},
  });
  const short = plain(message);
  if (recentProposals.length && YES.has(short)) {
    for (const proposal of recentProposals) await approveLearning(proposal.id, null).catch(() => undefined);
    await sendToTrainer(chatKey, [recentProposals.length === 1 ? 'Listo, ya lo aplico con los clientes.' : `Listo, apliqué los ${recentProposals.length} cambios.`]);
    return;
  }
  if (recentProposals.length && NO.has(short)) {
    for (const proposal of recentProposals) await rejectLearning(proposal.id, null, 'Descartada por el entrenador').catch(() => undefined);
    await sendToTrainer(chatKey, ['Dale, lo descarto. Decime cómo es y lo corrijo.']);
    return;
  }

  const row = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  const settings = settingsDto(row);
  const [history, pendingAll, questions] = await Promise.all([
    db.chatbotMessageLog.findMany({
      where: {conversationKey: chatKey, text: {not: ''}, status: {notIn: ['DISMISSED', 'SUGGESTED']}},
      orderBy: {createdAt: 'desc'},
      take: 14,
      select: {direction: true, text: true},
    }),
    db.botLearning.findMany({where: {status: 'PENDING', kind: {not: 'QUESTION'}}, orderBy: {createdAt: 'desc'}, take: 10}),
    db.botLearning.findMany({where: {status: 'PENDING', kind: 'QUESTION'}, orderBy: [{occurrences: 'desc'}, {createdAt: 'desc'}], take: 10}),
  ]);

  const service = new BotTrainerService(await aiDeps());
  const {result, metadata} = await service.handle({
    message,
    recentConversation: history.reverse().slice(0, -pending.length || undefined).map((item) => ({
      from: item.direction === 'INBOUND' ? 'TRAINER' as const : 'BOT' as const,
      text: item.text,
    })),
    pendingProposals: pendingAll.map((item) => ({id: item.id, summary: item.summary})),
    openQuestions: questions.map((item) => ({id: item.id, question: String((item.payload as any)?.question ?? item.summary), occurrences: item.occurrences})),
    knowledge: settings.responses.filter((item) => item.enabled).map((item) => ({id: item.id, temas: item.activators.slice(0, 6), informacion: item.answer})),
    guidance: parseGuidance(row.guidance).filter((item) => item.enabled).map((item) => ({id: item.id, text: item.text})),
    persona: settings.persona.slice(0, 3000),
  });
  if (!metadata.usedAi || !metadata.success) {
    await sendToTrainer(chatKey, [result.reply]);
    return;
  }

  for (const id of result.confirmIds) await approveLearning(id, null).catch(() => undefined);
  for (const id of result.rejectIds) await rejectLearning(id, null, 'Descartada por el entrenador').catch(() => undefined);
  for (const proposal of result.proposals) {
    const payload = proposal.kind === 'GUIDANCE'
      ? {text: proposal.text, answersQuestionId: proposal.answersQuestionId}
      : {
          activators: proposal.activators,
          answer: proposal.answer,
          context: proposal.context ?? '',
          replacesId: proposal.replacesId,
          answersQuestionId: proposal.answersQuestionId,
        };
    await db.botLearning.create({data: {
      source: 'TRAINER',
      kind: proposal.kind,
      summary: proposal.summary,
      payload: payload as Prisma.InputJsonValue,
      conversationKey: chatKey,
    }});
  }

  const out = [result.reply];
  if (result.intent === 'TEST' && result.testMessage) {
    const simulated = await runSimulation(result.testMessage).catch((error: unknown) => ({
      messages: [] as string[],
      escalateReason: `No pude probarlo: ${error instanceof Error ? error.message : String(error)}`,
    }));
    if (simulated.escalateReason) out.push(`Lo derivaría a una persona. Motivo: ${simulated.escalateReason}`);
    if (simulated.messages.length) out.push(simulated.messages.map((bubble) => `› ${bubble}`).join('\n'));
  }
  await sendToTrainer(chatKey, out, {intent: result.intent});
}

// ------------------------------------------------------------------ API

const trainersSchema = z.object({numbers: z.array(z.string().trim().min(6).max(30)).max(10)}).strict();
const guidanceSchema = z.object({
  items: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(2000),
    enabled: z.boolean(),
    source: z.string().trim().max(40).default('MANUAL'),
    createdAt: z.string().trim().max(40).default(() => new Date().toISOString()),
  }).strict()).max(200),
}).strict();

@Controller('training')
export class BotTrainingController {
  @Get('learnings')
  async learnings(@Query('status') status = 'PENDING') {
    const rows = await db.botLearning.findMany({
      where: status === 'ALL' ? {} : {status},
      orderBy: status === 'PENDING' ? [{occurrences: 'desc'}, {createdAt: 'desc'}] : {decidedAt: 'desc'},
      take: 200,
    });
    return jsonSafe(rows);
  }

  @Get('summary')
  async summary() {
    const [pending, questions, approved] = await Promise.all([
      db.botLearning.count({where: {status: 'PENDING', kind: {not: 'QUESTION'}}}),
      db.botLearning.count({where: {status: 'PENDING', kind: 'QUESTION'}}),
      db.botLearning.count({where: {status: 'APPROVED'}}),
    ]);
    return {pending, questions, approved};
  }

  @Post('learnings/:id/approve')
  async approve(@Param('id') id: string, @Body(new ZodPipe(learningOverrideSchema)) body: LearningOverride, @CurrentUser() user: RequestUser) {
    await approveLearning(id, user.id, body);
    return {ok: true};
  }

  @Post('learnings/:id/reject')
  async reject(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await rejectLearning(id, user.id, 'Descartada desde el CRM');
    return {ok: true};
  }

  @Get('guidance')
  async guidance() {
    const row = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}, select: {guidance: true}});
    return parseGuidance(row.guidance);
  }

  @Put('guidance')
  async setGuidance(@Body(new ZodPipe(guidanceSchema)) body: z.infer<typeof guidanceSchema>) {
    await db.chatbotSettings.update({where: {id: 'singleton'}, data: {guidance: body.items as unknown as Prisma.InputJsonValue}});
    return body.items;
  }

  @Get('trainers')
  async trainers() {
    const row = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}, select: {trainerNumbers: true}});
    return {numbers: row.trainerNumbers.map((key) => `+${key.replace(/^tel:/, '')}`)};
  }

  @Put('trainers')
  async setTrainers(@Body(new ZodPipe(trainersSchema)) body: {numbers: string[]}) {
    const keys = [...new Set(body.numbers.map(trainerChatKey).filter((key): key is string => Boolean(key)))];
    if (keys.length !== body.numbers.length) throw new BadRequestException('Algún número no es válido.');
    await db.chatbotSettings.update({where: {id: 'singleton'}, data: {trainerNumbers: keys}});
    return {numbers: keys.map((key) => `+${key.replace(/^tel:/, '')}`)};
  }
}
