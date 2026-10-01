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
import {settingsDto} from './chatbot-core.js';
import {randomDelaySeconds, type EnqueueItem} from './whatsapp-outbound.js';
import {scheduleReply, typingSeconds} from './whatsapp-responder.js';
import {enrichInboundMedia} from './whatsapp-media-ai.js';
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
  metadata?: {phone_number_id?: string; display_phone_number?: string};
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

/**
 * Primer precio en pesos que aparezca en un texto ("$650.000", "$ 1.500.000"), en centavos.
 * Se usa como valor estimado del lead que llega desde un anuncio.
 */
export function priceFromText(text: string): bigint | null {
  const match = text.match(/\$\s?(\d{1,3}(?:\.\d{3})+|\d{4,})(?![\d.])/);
  if (!match?.[1]) return null;
  const pesos = Number(match[1].replace(/\./g, ''));
  if (!Number.isFinite(pesos) || pesos < 10_000 || pesos > 100_000_000) return null;
  return BigInt(pesos) * 100n;
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
    select: {displayName: true, origin: true, leadValueCents: true},
  });
  // El primer mensaje de un anuncio trae de qué anuncio vino: queda como origen del lead,
  // y si el anuncio o el mensaje dicen un precio ("PC Completa por $650.000"), es su valor.
  const origin = !existing?.origin && message.referral ? message.referral : null;
  const valueFromText = !existing?.leadValueCents ? priceFromText([
    content.text,
    typeof message.referral?.headline === 'string' ? message.referral.headline : '',
    typeof message.referral?.body === 'string' ? message.referral.body : '',
  ].join(' ')) : null;
  const leadData = {
    ...(origin ? {origin: origin as Prisma.InputJsonValue} : {}),
    ...(valueFromText ? {leadValueCents: valueFromText} : {}),
  };

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
      lastMessageAt: now,
      windowExpiresAt,
      unreadCount: 1,
      stageChangedAt: now,
      ...leadData,
    },
    update: {
      lastInboundText: content.text,
      lastInboundAt: now,
      lastInboundFingerprint: message.id,
      lastMessageAt: now,
      // El cliente volvió a escribir: un chat resuelto o pospuesto se reabre solo.
      resolvedAt: null,
      snoozedUntil: null,
      windowExpiresAt,
      unreadCount: {increment: 1},
      ...leadData,
      waId: message.from ?? undefined,
      ...(profileName ? {waContactName: profileName} : {}),
      // `displayName` lo puede editar el equipo: solo se completa si estaba vacío.
      ...(!existing?.displayName && profileName ? {displayName: profileName} : {}),
    },
  });

  let inboundLogId: string;
  try {
    ({id: inboundLogId} = await db.chatbotMessageLog.create({data: {
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
    }, select: {id: true}}));
  } catch (error) {
    // Meta reintenta los webhooks: un duplicado es esperable y no es un error.
    if (typeof error === 'object' && error !== null && 'code' in error && (error as {code?: string}).code === 'P2002') {
      return chatKey;
    }
    throw error;
  }

  // Audio o imagen: se transcribe o describe antes de responder, así el bot lo entiende.
  if (content.mediaId && (message.type === 'audio' || message.type === 'image')) {
    await enrichInboundMedia(inboundLogId);
  }

  // No se responde acá: se espera a que el cliente termine de escribir
  // (ver whatsapp-responder.ts). Lo que el bot tenía en cola queda cancelado.
  await scheduleReply(chatKey);
  return chatKey;
}

/**
 * Contexto conversacional leído del log, no del DOM.
 * Es más fiable que la extensión: el log tiene todo el historial, el DOM solo lo renderizado.
 */
export async function loadRecentMessages(
  chatKey: string,
  limit: number,
  excludeWaMessageId?: string,
  before?: Date,
): Promise<Array<{direction: 'INBOUND' | 'OUTBOUND'; text: string}>> {
  if (limit <= 0) return [];
  const rows = await db.chatbotMessageLog.findMany({
    where: {
      conversationKey: chatKey,
      status: {in: ['OBSERVED', 'SENT', 'DELIVERED', 'READ']},
      text: {not: ''},
      ...(excludeWaMessageId ? {waMessageId: {not: excludeWaMessageId}} : {}),
      ...(before ? {createdAt: {lt: before}} : {}),
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
 * Arma la respuesta del bot tal como sale por WhatsApp: una burbuja por mensaje con
 * la demora configurada entre cada una, después los adjuntos de la respuesta
 * configurada y el seguimiento del presupuesto. Lo usan AUTO y la aprobación de
 * sugerencias, para que las dos salgan igual.
 */
export function buildReplyItems(
  bubbles: string[],
  attachments: unknown,
  quoteFollowupMessage: unknown,
  settings: ReturnType<typeof settingsDto>,
): EnqueueItem[] {
  // Entre burbujas, el tiempo que tardaría una persona en tipear la siguiente,
  // dentro del rango configurado y con algo de variación para que no sea exacto.
  const min = settings.multiMessage.betweenDelayMinSeconds;
  const max = Math.max(min, settings.multiMessage.betweenDelayMaxSeconds);
  const items: EnqueueItem[] = bubbles.map((text, index) => ({
    kind: 'TEXT' as const,
    payload: {text},
    delaySeconds: index === 0
      ? 0
      : Math.min(max, typingSeconds(text, min, max) * 0.8 + randomDelaySeconds(0, Math.max(0.5, (max - min) * 0.25))),
  }));

  for (const attachment of (Array.isArray(attachments) ? attachments : []) as any[]) {
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

  if (typeof quoteFollowupMessage === 'string' && quoteFollowupMessage.trim()) {
    items.push({kind: 'TEXT', payload: {text: quoteFollowupMessage.trim()}, delaySeconds: 2});
  }
  return items;
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
