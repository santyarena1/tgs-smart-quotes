/**
 * Procesamiento del webhook de WhatsApp Cloud API.
 *
 * Reemplaza al loop de escaneo del DOM de la extensión. Donde antes había una
 * cascada de heurísticas para adivinar quién escribió y qué decía, ahora Meta lo
 * entrega estructurado: `wa_id`, `id`, `type`, `text.body` y el nombre del perfil.
 *
 * Lo que se conserva de la extensión:
 *  - Deduplicación estricta (ahora por `message.id` de Meta, globalmente único).
 *  - El filtro `ignoredAutoMessages` de respuestas automáticas.
 *  - Nunca responder si el último mensaje de la conversación es nuestro.
 *  - Los audios escalan en vez de intentar responderlos.
 */
import {Logger} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {normalizePhone} from '@tgs/validation';
import {runChatbotResponse} from './chatbot-engine.js';
import {settingsDto} from './chatbot-core.js';
import {enqueueOutbound, randomDelaySeconds, type EnqueueItem} from './whatsapp-outbound.js';
import {windowFromInbound} from './whatsapp-window.js';

const logger = new Logger('WhatsappInbound');

type MetaProfile = {name?: string};
type MetaContact = {wa_id?: string; profile?: MetaProfile};
type MetaMessage = {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string;
  text?: {body?: string};
  image?: {id?: string; mime_type?: string; caption?: string};
  document?: {id?: string; mime_type?: string; filename?: string; caption?: string};
  audio?: {id?: string; mime_type?: string};
  video?: {id?: string; mime_type?: string};
  sticker?: {id?: string; mime_type?: string};
  /** Presente cuando el chat se originó en un anuncio de Facebook o Instagram. */
  referral?: Record<string, unknown>;
};
type MetaStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{code?: number; title?: string; message?: string}>;
};
export type MetaValue = {
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
};

/** Normaliza igual que `matchesConfiguredAutoMessage` de la extensión. */
function normalizeAutoMessage(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Se conserva textualmente el criterio de la extensión: coincidencia por prefijo
 * bidireccional, o cobertura de palabras >= 85 % exigiendo al menos 3 palabras.
 */
export function matchesConfiguredAutoMessage(text: string, patterns: string[]): boolean {
  const normalized = normalizeAutoMessage(text);
  if (!normalized) return false;
  return patterns.some((pattern) => {
    const candidate = normalizeAutoMessage(pattern);
    if (candidate.length < 4) return false;
    if (normalized.startsWith(candidate) || candidate.startsWith(normalized)) return true;
    const words = candidate.split(' ').filter(Boolean);
    if (words.length < 3) return false;
    return words.filter((word) => normalized.includes(word)).length / words.length >= 0.85;
  });
}

type ExtractedMessage = {
  text: string;
  messageType: 'TEXT' | 'AUDIO';
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  supported: boolean;
};

function extractContent(message: MetaMessage): ExtractedMessage {
  const base = {mediaId: null, mediaMimeType: null, mediaFilename: null};
  switch (message.type) {
    case 'text':
      return {
        ...base,
        text: message.text?.body?.trim() ?? '',
        messageType: 'TEXT',
        supported: true,
      };
    case 'audio':
      // El motor ya escala los audios: no hay transcripción, así que no se responde solo.
      return {
        ...base,
        text: '[Mensaje de audio sin transcripción]',
        messageType: 'AUDIO',
        mediaId: message.audio?.id ?? null,
        mediaMimeType: message.audio?.mime_type ?? null,
        supported: true,
      };
    case 'image':
      return {
        text: message.image?.caption?.trim() || '[Imagen recibida]',
        messageType: 'TEXT',
        mediaId: message.image?.id ?? null,
        mediaMimeType: message.image?.mime_type ?? null,
        mediaFilename: null,
        supported: false,
      };
    case 'document':
      return {
        text: message.document?.caption?.trim() || `[Documento recibido: ${message.document?.filename ?? 'archivo'}]`,
        messageType: 'TEXT',
        mediaId: message.document?.id ?? null,
        mediaMimeType: message.document?.mime_type ?? null,
        mediaFilename: message.document?.filename ?? null,
        supported: false,
      };
    default:
      return {
        ...base,
        text: `[tipo_no_soportado: ${message.type ?? 'desconocido'}]`,
        messageType: 'TEXT',
        supported: false,
      };
  }
}

/** `chatKey` canónico. Con Cloud API siempre hay teléfono: el prefijo `name:` deja de existir. */
export function chatKeyFromWaId(waId: string | undefined): string | null {
  const normalized = normalizePhone(waId);
  return normalized ? `tel:${normalized}` : null;
}

/**
 * Persiste un entrante y, si corresponde, dispara el motor del chatbot.
 * Devuelve el `chatKey` cuando el mensaje se guardó, o null si se descartó.
 */
export async function handleInboundMessage(value: MetaValue, message: MetaMessage): Promise<string | null> {
  const chatKey = chatKeyFromWaId(message.from);
  if (!chatKey) {
    logger.warn(JSON.stringify({event: 'whatsapp_invalid_phone', from: message.from, waMessageId: message.id}));
    return null;
  }
  if (!message.id) {
    logger.warn(JSON.stringify({event: 'whatsapp_missing_message_id', from: message.from}));
    return null;
  }

  const content = extractContent(message);
  const profileName = value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name?.trim() || null;
  const now = new Date();
  const windowExpiresAt = windowFromInbound(now);

  const existing = await db.chatbotConversation.findUnique({
    where: {chatKey},
    select: {displayName: true},
  });

  await db.chatbotConversation.upsert({
    where: {chatKey},
    create: {
      chatKey,
      displayName: profileName,
      waContactName: profileName,
      waId: message.from ?? null,
      lastInboundText: content.text,
      lastInboundAt: now,
      lastInboundFingerprint: message.id,
      windowExpiresAt,
      unreadCount: 1,
    },
    update: {
      lastInboundText: content.text,
      lastInboundAt: now,
      lastInboundFingerprint: message.id,
      windowExpiresAt,
      unreadCount: {increment: 1},
      waId: message.from ?? undefined,
      ...(profileName ? {waContactName: profileName} : {}),
      // `displayName` lo puede editar el equipo: solo se completa si estaba vacío.
      ...(!existing?.displayName && profileName ? {displayName: profileName} : {}),
    },
  });

  try {
    await db.chatbotMessageLog.create({data: {
      conversationKey: chatKey,
      direction: 'INBOUND',
      actor: 'CUSTOMER',
      status: 'OBSERVED',
      channel: 'CLOUD_API',
      text: content.text,
      waMessageId: message.id,
      inboundFingerprint: message.id,
      mediaId: content.mediaId,
      mediaMimeType: content.mediaMimeType,
      mediaFilename: content.mediaFilename,
      decisionMetadata: {
        messageType: content.messageType,
        metaType: message.type ?? null,
        supported: content.supported,
        // `referral` llega cuando el chat nació de un anuncio: reemplaza a la
        // heurística de "tarjeta de anuncio" que tenía que adivinarlo del DOM.
        ...(message.referral ? {referral: message.referral} : {}),
      } as Prisma.InputJsonValue,
    }});
  } catch (error) {
    // Meta reintenta los webhooks: un duplicado es esperable y no es un error.
    if (typeof error === 'object' && error !== null && 'code' in error && (error as {code?: string}).code === 'P2002') {
      return chatKey;
    }
    throw error;
  }

  await maybeRespond(chatKey, content, message.id);
  return chatKey;
}

/** Decide si corresponde generar una respuesta y, si sale automática, la encola. */
async function maybeRespond(chatKey: string, content: ExtractedMessage, waMessageId: string): Promise<void> {
  const settingsRow = await db.chatbotSettings.findUnique({where: {id: 'singleton'}});
  if (!settingsRow?.enabled) return;
  const settings = settingsDto(settingsRow);

  // Los tipos que el motor no sabe leer (imagen, documento, video) se registran
  // pero no se contestan solos: quedan visibles en el CRM para respuesta humana.
  if (!content.supported) return;
  if (matchesConfiguredAutoMessage(content.text, settings.ignoredAutoMessages)) return;

  // Se conserva el invariante nº 1: nunca responder si el último mensaje es nuestro.
  const last = await db.chatbotMessageLog.findFirst({
    where: {conversationKey: chatKey},
    orderBy: {createdAt: 'desc'},
    select: {direction: true},
  });
  if (last?.direction === 'OUTBOUND') return;

  const recentMessages = await loadRecentMessages(chatKey, settings.maxRecentSnippets, waMessageId);
  const systemUser = await db.user.findFirst({where: {role: 'ADMIN', active: true}, select: {id: true}});

  let result: any;
  try {
    result = await runChatbotResponse({
      chatKey,
      message: content.text,
      messageType: content.messageType,
      messageFingerprint: waMessageId,
      manualSuggestion: false,
      simulation: false,
      recentMessages,
    }, systemUser?.id ?? 'system');
  } catch (error) {
    logger.error(JSON.stringify({
      event: 'whatsapp_respond_failed',
      chatKey,
      error: error instanceof Error ? error.message : String(error),
    }));
    return;
  }

  if (result?.action !== 'AUTO_REPLY' || !result.logId) return;
  await enqueueAutoReply(chatKey, result, settings);
}

/**
 * Contexto conversacional leído del log, no del DOM.
 * Es más fiable que la extensión: el log tiene todo el historial, el DOM solo lo renderizado.
 */
export async function loadRecentMessages(
  chatKey: string,
  limit: number,
  excludeWaMessageId?: string,
): Promise<Array<{direction: 'INBOUND' | 'OUTBOUND'; text: string}>> {
  if (limit <= 0) return [];
  const rows = await db.chatbotMessageLog.findMany({
    where: {
      conversationKey: chatKey,
      status: {in: ['OBSERVED', 'SENT', 'DELIVERED', 'READ']},
      text: {not: ''},
      ...(excludeWaMessageId ? {waMessageId: {not: excludeWaMessageId}} : {}),
    },
    orderBy: {createdAt: 'desc'},
    take: limit,
    select: {direction: true, text: true},
  });
  return rows
    .reverse()
    .map((row) => ({direction: row.direction, text: row.text}))
    .filter((row) => Boolean(row.text));
}

/**
 * Encola una respuesta automática respetando las demoras que imitan cadencia humana:
 * una espera inicial aleatoria y otra entre burbujas.
 */
async function enqueueAutoReply(chatKey: string, result: any, settings: ReturnType<typeof settingsDto>): Promise<void> {
  const bubbles: string[] = Array.isArray(result.messages) && result.messages.length
    ? result.messages.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof result.reply === 'string' && result.reply.trim()
      ? [result.reply]
      : [];
  if (!bubbles.length) return;

  const items: EnqueueItem[] = bubbles.map((text, index) => ({
    kind: 'TEXT' as const,
    payload: {text},
    delaySeconds: index === 0
      ? 0
      : randomDelaySeconds(settings.multiMessage.betweenDelayMinSeconds, settings.multiMessage.betweenDelayMaxSeconds),
  }));

  for (const attachment of (result.attachments ?? []) as any[]) {
    if (attachment?.image?.url) {
      items.push({
        kind: 'IMAGE',
        payload: {imageUrl: attachment.image.url, filename: attachment.image.filename, label: `imagen ${attachment.image.filename}`},
        delaySeconds: 1,
      });
    }
    if (attachment?.quote) {
      items.push({
        kind: 'DOCUMENT',
        payload: {
          quote: {familyId: attachment.quote.familyId, version: attachment.quote.version},
          filename: attachment.quote.filename,
          label: `presupuesto ${attachment.quote.visibleNumber} V${attachment.quote.version}`,
        },
        delaySeconds: 1,
      });
    }
  }

  if (result.quoteFollowupMessage) {
    items.push({kind: 'TEXT', payload: {text: result.quoteFollowupMessage}, delaySeconds: 2});
  }

  await enqueueOutbound(chatKey, result.logId, items, {
    initialDelaySeconds: Math.random() * Math.max(0, Math.min(120, settings.autoDelayMaxSeconds)),
  });
}

/**
 * Actualiza el estado de entrega de un saliente.
 * Es información que la extensión no tenía: solo podía inferirla del DOM con una
 * heurística de confianza.
 */
export async function handleStatusUpdate(status: MetaStatus): Promise<void> {
  if (!status.id || !status.status) return;
  const log = await db.chatbotMessageLog.findFirst({
    where: {waMessageId: status.id},
    orderBy: {createdAt: 'desc'},
    select: {id: true, conversationKey: true, status: true},
  });
  if (!log) return;

  const at = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
  if (status.status === 'delivered') {
    await db.chatbotMessageLog.update({
      where: {id: log.id},
      // READ es posterior a DELIVERED: un evento fuera de orden no debe retroceder el estado.
      data: {deliveredAt: at, ...(log.status === 'READ' ? {} : {status: 'DELIVERED'})},
    });
    return;
  }
  if (status.status === 'read') {
    await db.chatbotMessageLog.update({where: {id: log.id}, data: {readAt: at, status: 'READ'}});
    return;
  }
  if (status.status === 'failed') {
    const error = status.errors?.[0];
    const reason = error?.message || error?.title || 'Meta rechazó el mensaje.';
    await db.chatbotMessageLog.update({
      where: {id: log.id},
      data: {status: 'SEND_FAILED', failedAt: at, waErrorCode: error?.code ?? null, error: reason},
    });
    logger.warn(JSON.stringify({
      event: 'whatsapp_message_failed',
      chatKey: log.conversationKey,
      code: error?.code ?? null,
      reason,
    }));
  }
}
