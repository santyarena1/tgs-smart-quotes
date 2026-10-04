/**
 * Quién atiende cada chat y cuándo responde el bot.
 *
 * Reglas que garantiza este módulo (el servidor, no la pantalla):
 *  - Un chat lo atiende el bot o un vendedor, nunca los dos. Cuando un vendedor
 *    escribe o toma el chat, el bot se pausa y se cancela lo que tenía en cola.
 *  - El bot no responde mensaje por mensaje: espera a que el cliente termine de
 *    escribir (`replyDueAt`) y contesta una sola vez a todo lo que llegó.
 *  - Una respuesta generada se descarta si mientras tanto el cliente volvió a
 *    escribir o un vendedor tomó el chat. Nunca sale algo viejo.
 *  - El bot vuelve a un chat pausado solo de forma explícita, o por la regla de
 *    reanudación automática si está configurada.
 */
import {isTeamNumber} from './crm-team-alerts.js';
import {Logger} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {runChatbotResponse} from './chatbot-engine.js';
import {isOutsideBusinessHours, settingsDto} from './chatbot-core.js';
import {buildReplyItems, loadRecentMessages, matchesConfiguredAutoMessage} from './whatsapp-inbound.js';
import {enqueueOutbound} from './whatsapp-outbound.js';
import {loadCredentials, showTyping} from './whatsapp-client.js';
import {willAutoSend} from './chatbot-ads.js';
import {handleTrainerTurn} from './bot-training.js';

const logger = new Logger('WhatsappResponder');

const CYCLE_MS = 1_000;
const MAX_PER_CYCLE = 10;

/** Estados de un saliente que cuentan como "ya le contestamos". */
const ANSWERED_STATUSES = ['SEND_PENDING', 'SENT', 'DELIVERED', 'READ'] as const;

/**
 * Programa (o corre hacia adelante) la respuesta del bot y cancela lo que el bot
 * todavía no mandó: el cliente escribió de nuevo, así que esa respuesta quedó vieja.
 */
export async function scheduleReply(chatKey: string): Promise<void> {
  const settings = await db.chatbotSettings.findUnique({
    where: {id: 'singleton'},
    select: {enabled: true, replyDebounceSeconds: true, trainerNumbers: true},
  });
  await cancelPendingBotReplies(chatKey, 'El cliente escribió de nuevo antes de que saliera la respuesta.');
  // El entrenador se atiende aunque el bot esté apagado para los clientes.
  const trainer = Boolean(settings?.trainerNumbers.includes(chatKey));
  // Los vendedores que reciben avisos le escriben al número del bot: no son clientes.
  if (!trainer && await isTeamNumber(chatKey)) {
    logger.log(JSON.stringify({event: 'whatsapp_reply_skipped', chatKey, action: 'TEAM_MEMBER'}));
    return;
  }
  if (!settings?.enabled && !trainer) {
    logger.log(JSON.stringify({event: 'whatsapp_reply_skipped', chatKey, action: 'DISABLED'}));
    return;
  }
  const seconds = trainer ? 4 : Math.max(2, Math.min(60, settings?.replyDebounceSeconds ?? 10));
  logger.log(JSON.stringify({event: 'whatsapp_reply_scheduled', chatKey, trainer, inSeconds: seconds}));
  await db.chatbotConversation.update({
    where: {chatKey},
    data: {replyDueAt: new Date(Date.now() + seconds * 1000)},
  });
}

/** Cancela las burbujas del bot que siguen en cola. Las de un vendedor nunca se tocan. */
export async function cancelPendingBotReplies(chatKey: string, reason: string): Promise<number> {
  const pending = await db.$queryRaw<Array<{id: string; logId: string | null}>>(Prisma.sql`
    SELECT q.id, q."logId"
      FROM "WhatsappOutboundQueue" q
      LEFT JOIN "ChatbotMessageLog" l ON l.id = q."logId"
     WHERE q."conversationKey" = ${chatKey}
       AND q.status = 'PENDING'
       AND (l.actor IS NULL OR l.actor <> 'HUMAN')
  `);
  if (!pending.length) return 0;
  await db.whatsappOutboundQueue.updateMany({
    where: {id: {in: pending.map((row) => row.id)}, status: 'PENDING'},
    data: {status: 'CANCELLED', lastError: reason},
  });
  const logIds = [...new Set(pending.map((row) => row.logId).filter((id): id is string => Boolean(id)))];
  for (const logId of logIds) await settleCancelledLog(logId, reason);
  return pending.length;
}

/**
 * Deja el log de una respuesta cortada en un estado honesto: si alguna burbuja ya
 * salió queda como enviada (parcial); si no salió ninguna, se descarta.
 */
export async function settleCancelledLog(logId: string, reason: string): Promise<void> {
  const rows = await db.whatsappOutboundQueue.findMany({
    where: {logId},
    select: {status: true, waMessageId: true, bubbleIndex: true},
    orderBy: {bubbleIndex: 'asc'},
  });
  if (rows.some((row) => row.status === 'PENDING' || row.status === 'SENDING')) return;
  const sent = rows.filter((row) => row.status === 'SENT');
  const log = await db.chatbotMessageLog.findUnique({where: {id: logId}, select: {status: true, decisionMetadata: true}});
  if (!log || !['SEND_PENDING', 'SUGGESTED'].includes(log.status)) return;
  const metadata = (log.decisionMetadata ?? {}) as Record<string, unknown>;
  await db.chatbotMessageLog.update({
    where: {id: logId},
    data: sent.length
      ? {
          status: 'SENT',
          sentAt: new Date(),
          waMessageId: sent.at(-1)?.waMessageId ?? null,
          decisionMetadata: {...metadata, partial: true, cutReason: reason} as Prisma.InputJsonValue,
        }
      : {status: 'DISMISSED', error: reason},
  });
}

/** Un vendedor toma el chat: el bot se calla ahí hasta que se lo devuelvan. */
export async function pauseBot(chatKey: string, userId: string | null, reason: string): Promise<void> {
  await db.chatbotConversation.update({
    where: {chatKey},
    data: {botPausedAt: new Date(), botPausedById: userId, botPausedReason: reason, replyDueAt: null},
  });
  await cancelPendingBotReplies(chatKey, `Se canceló porque ${reason.toLocaleLowerCase('es-AR')}.`);
  // Una sugerencia pendiente quedó superada por lo que haga el vendedor.
  await db.chatbotMessageLog.updateMany({
    where: {conversationKey: chatKey, status: 'SUGGESTED', direction: 'OUTBOUND'},
    data: {status: 'DISMISSED', error: 'Superada: un vendedor tomó el chat.'},
  });
}

/** Devuelve el chat al bot. No responde mensajes viejos: retoma con el próximo del cliente. */
export async function resumeBot(chatKey: string): Promise<void> {
  await db.chatbotConversation.update({
    where: {chatKey},
    data: {
      botPausedAt: null,
      botPausedById: null,
      botPausedReason: null,
      escalatedAt: null,
      escalationReason: null,
    },
  });
}

/** Con la reanudación automática activa, un chat sin mensajes del vendedor por X horas vuelve al bot. */
async function shouldAutoResume(chatKey: string, pausedAt: Date, hours: number): Promise<boolean> {
  if (hours <= 0) return false;
  const lastHuman = await db.chatbotMessageLog.findFirst({
    where: {conversationKey: chatKey, direction: 'OUTBOUND', actor: 'HUMAN'},
    orderBy: {createdAt: 'desc'},
    select: {createdAt: true},
  });
  const since = lastHuman && lastHuman.createdAt > pausedAt ? lastHuman.createdAt : pausedAt;
  return Date.now() - since.getTime() >= hours * 3_600_000;
}

/** Identidad con la que el bot registra lo que hace (solicitudes, auditoría). */
async function botActorId(): Promise<string> {
  const admin = await db.user.findFirst({where: {role: 'ADMIN', active: true}, select: {id: true}, orderBy: {createdAt: 'asc'}});
  return admin?.id ?? 'system';
}

/**
 * Responde todo lo que el cliente mandó desde nuestra última respuesta, en un solo turno.
 * Exportado para los tests y para forzar una respuesta desde el CRM.
 */
export async function respondNow(chatKey: string): Promise<void> {
  const startedAt = new Date();
  const settingsRow = await db.chatbotSettings.findUnique({where: {id: 'singleton'}});
  if (settingsRow?.trainerNumbers.includes(chatKey)) {
    await handleTrainerTurn(chatKey, async (message) => {
      // Prueba "como si fuera un cliente", en un chat simulado que no toca a nadie.
      const result: any = await runChatbotResponse({
        chatKey: `sim:trainer:${Date.now()}`,
        message,
        messageType: 'TEXT',
        messageFingerprint: `sim:trainer:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        manualSuggestion: false,
        simulation: true,
        recentMessages: [],
      }, await botActorId());
      return {
        messages: Array.isArray(result?.messages) ? result.messages : [],
        escalateReason: result?.wouldEscalate ? result.wouldEscalate.reason ?? 'sin motivo' : null,
      };
    });
    return;
  }
  if (!settingsRow?.enabled) {
    logger.log(JSON.stringify({event: 'whatsapp_reply_skipped', chatKey, action: 'DISABLED'}));
    return;
  }
  const settings = settingsDto(settingsRow);

  const conversation = await db.chatbotConversation.findUnique({
    where: {chatKey},
    select: {botPausedAt: true, escalatedAt: true, modeOverride: true, alwaysOn: true},
  });
  if (!conversation) return;
  if (conversation.botPausedAt) {
    if (!(await shouldAutoResume(chatKey, conversation.botPausedAt, settingsRow.autoResumeHours))) {
      logger.log(JSON.stringify({event: 'whatsapp_reply_skipped', chatKey, action: 'PAUSED'}));
      return;
    }
    await resumeBot(chatKey);
    logger.log(JSON.stringify({event: 'bot_auto_resumed', chatKey}));
  }

  const lastAnswer = await db.chatbotMessageLog.findFirst({
    where: {conversationKey: chatKey, direction: 'OUTBOUND', status: {in: [...ANSWERED_STATUSES]}},
    orderBy: {createdAt: 'desc'},
    select: {createdAt: true},
  });
  const pending = await db.chatbotMessageLog.findMany({
    where: {
      conversationKey: chatKey,
      direction: 'INBOUND',
      ...(lastAnswer ? {createdAt: {gt: lastAnswer.createdAt}} : {}),
    },
    orderBy: {createdAt: 'asc'},
    select: {id: true, text: true, waMessageId: true, inboundFingerprint: true, createdAt: true, decisionMetadata: true},
  });
  const usable = pending.filter((message) => {
    const metadata = (message.decisionMetadata ?? {}) as Record<string, unknown>;
    if (metadata.supported === false) return false;
    return !matchesConfiguredAutoMessage(message.text, settings.ignoredAutoMessages);
  });
  const last = usable.at(-1);
  if (!last) {
    logger.log(JSON.stringify({event: 'whatsapp_reply_skipped', chatKey, action: 'NOTHING_TO_ANSWER', pending: pending.length}));
    return;
  }

  const hasAudio = usable.some((message) => ((message.decisionMetadata ?? {}) as Record<string, unknown>).messageType === 'AUDIO');
  const liveMode = conversation.modeOverride ?? settings.defaultMode;
  const outsideHours = !conversation.alwaysOn && isOutsideBusinessHours(settings.businessHours);
  const credentials = await loadCredentials().catch(() => null);
  // El cliente ve "escribiendo…" en WhatsApp: solo si esa respuesta va a salir sola.
  if (willAutoSend(settings.enabled, liveMode) && !(outsideHours && settings.outsideHoursBehavior.mode === 'OFF') && credentials && last.waMessageId) {
    await showTyping(credentials, last.waMessageId).catch((error: unknown) => {
      logger.warn(JSON.stringify({event: 'whatsapp_typing_failed', chatKey, error: error instanceof Error ? error.message : String(error)}));
    });
  }

  const firstPending = usable[0] ?? last;
  let result: any;
  try {
    result = await runChatbotResponse({
      chatKey,
      message: usable.map((message) => message.text).join('\n'),
      messageType: hasAudio ? 'AUDIO' : 'TEXT',
      messageFingerprint: last.inboundFingerprint ?? last.waMessageId ?? last.id,
      manualSuggestion: false,
      simulation: false,
      recentMessages: await loadRecentMessages(chatKey, settings.maxRecentSnippets, undefined, firstPending.createdAt),
    }, await botActorId(), last.id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(JSON.stringify({event: 'whatsapp_respond_failed', chatKey, error: reason}));
    // Que se vea en el chat: un fallo de la IA no puede pasar desapercibido.
    await db.chatbotMessageLog.create({data: {
      conversationKey: chatKey,
      direction: 'OUTBOUND',
      actor: 'SYSTEM',
      status: 'SEND_FAILED',
      channel: 'CLOUD_API',
      text: '',
      error: `El bot no pudo responder: ${reason}`,
      failedAt: new Date(),
    }}).catch(() => undefined);
    return;
  }

  if (result?.action !== 'AUTO_REPLY' || !result.logId) {
    // Que siempre quede por qué no contestó (derivado, tomado, fuera de horario, sugerencia…).
    logger.log(JSON.stringify({event: 'whatsapp_reply_skipped', chatKey, action: result?.action ?? null, mode: result?.effectiveMode ?? null}));
    return;
  }

  // Última barrera antes de encolar: si algo cambió mientras la IA redactaba, se descarta.
  const fresh = await db.chatbotConversation.findUnique({
    where: {chatKey},
    select: {botPausedAt: true, lastInboundAt: true},
  });
  const superseded = Boolean(fresh?.lastInboundAt && fresh.lastInboundAt > startedAt);
  if (!fresh || fresh.botPausedAt || superseded) {
    await db.chatbotMessageLog.update({
      where: {id: result.logId},
      data: {
        status: 'DISMISSED',
        error: fresh?.botPausedAt ? 'Descartada: un vendedor tomó el chat.' : 'Descartada: el cliente escribió de nuevo mientras se redactaba.',
      },
    });
    return;
  }

  const bubbles: string[] = Array.isArray(result.messages) && result.messages.length
    ? result.messages.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof result.reply === 'string' && result.reply.trim() ? [result.reply] : [];
  if (!bubbles.length) return;
  const items = buildReplyItems(bubbles, result.attachments, result.quoteFollowupMessage, settings);
  // Arranca como alguien que termina de tipear la primera burbuja (ya se ve "escribiendo…").
  const firstDelay = typingSeconds(bubbles[0] ?? '', 1.5, Math.max(1.5, Math.min(8, settings.autoDelayMaxSeconds)));
  await enqueueOutbound(chatKey, result.logId, items, {initialDelaySeconds: firstDelay});
}

/** Tiempo que tarda una persona en tipear un texto en el celular, acotado. */
export function typingSeconds(text: string, min: number, max: number): number {
  const seconds = text.trim().length / 18;
  return Math.max(min, Math.min(max, seconds));
}

/** Chats con una respuesta en curso en esta instancia: nunca dos a la vez para el mismo chat. */
const running = new Set<string>();

/** Reclama los chats cuya espera venció. Seguro con varias instancias (SKIP LOCKED). */
export async function respondDueConversations(): Promise<number> {
  const due = await db.$queryRaw<Array<{chatKey: string}>>(Prisma.sql`
    UPDATE "ChatbotConversation"
       SET "replyDueAt" = NULL
     WHERE "chatKey" IN (
       SELECT "chatKey" FROM "ChatbotConversation"
        WHERE "replyDueAt" IS NOT NULL AND "replyDueAt" <= now()
        ORDER BY "replyDueAt"
        LIMIT ${MAX_PER_CYCLE}
        FOR UPDATE SKIP LOCKED)
    RETURNING "chatKey"
  `);
  // Sin esperar: la IA de un chat no debe demorar la respuesta de otro.
  for (const {chatKey} of due) {
    if (running.has(chatKey)) {
      // Ya hay una respuesta en curso: se reintenta enseguida con todo lo nuevo junto.
      await db.chatbotConversation.update({where: {chatKey}, data: {replyDueAt: new Date(Date.now() + 2_000)}}).catch(() => undefined);
      continue;
    }
    running.add(chatKey);
    void respondNow(chatKey)
      .catch((error: unknown) => {
        logger.error(JSON.stringify({event: 'whatsapp_responder_failed', chatKey, error: error instanceof Error ? error.message : String(error)}));
      })
      .finally(() => running.delete(chatKey));
  }
  return due.length;
}

let timer: NodeJS.Timeout | null = null;

export function startResponder(): void {
  if (timer) return;
  const tick = async () => {
    try {
      await respondDueConversations();
    } catch (error) {
      logger.error(JSON.stringify({event: 'whatsapp_responder_tick_failed', error: error instanceof Error ? error.message : String(error)}));
    } finally {
      timer = setTimeout(() => void tick(), CYCLE_MS);
    }
  };
  timer = setTimeout(() => void tick(), CYCLE_MS);
  logger.log(JSON.stringify({event: 'whatsapp_responder_started', cycleMs: CYCLE_MS}));
}

export function stopResponder(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
