/**
 * Cola de salida de WhatsApp.
 *
 * Traslada al servidor lo que antes corría dentro del navegador con la extensión:
 * las demoras aleatorias que imitan cadencia humana, las barreras de autorización
 * revalidadas en cada paso y los reintentos.
 *
 * Invariantes conservados de la extensión (ver docs/EXTENSION-LEGACY-LOGIC.md §6):
 *  - Se revalida la autorización antes de CADA burbuja, no una vez por respuesta.
 *  - Todo fallo escribe un motivo explícito. Nunca falla en silencio.
 *  - Un adjunto fallido escala la conversación.
 *  - El modo simulación jamás envía.
 *  - Tope por ciclo para que un pico no dispare cientos de mensajes.
 *
 * Barrera nueva: la ventana de 24 h de Meta.
 */
import {Logger} from '@nestjs/common';
import {readFile} from 'node:fs/promises';
import {db, Prisma} from '@tgs/database';
import {chatbotRuleImageMime, chatbotRuleImagePath} from './chatbot-storage.js';
import {pdfStorage} from './pdf.js';
import {
  loadCredentials,
  sendDocument,
  sendImage,
  sendTemplate,
  sendText,
  uploadMedia,
  WhatsappApiError,
  type WhatsappCredentials,
} from './whatsapp-client.js';
import {windowState} from './whatsapp-window.js';
import {createEscalationNotification} from './chatbot-core.js';

const logger = new Logger('WhatsappOutbound');

/** Tope de conversaciones atendidas por ciclo; hereda el límite de lote de la extensión. */
const MAX_PER_CYCLE = 20;
const MAX_ATTEMPTS = 3;
const CYCLE_MS = 2_000;

export type QueuePayload = {
  text?: string;
  /** URL interna de una imagen de regla (`/api/uploads/chatbot-rules/...`). */
  imageUrl?: string;
  /** PDF de un presupuesto ya generado. Se lee del almacenamiento, no por HTTP. */
  quote?: {familyId: string; version: number; kind?: string};
  filename?: string;
  caption?: string;
  templateId?: string;
  variables?: string[];
  /** Etiqueta legible para los logs de adjunto (`ATTACHMENT_SENT` / `ATTACHMENT_FAILED`). */
  label?: string;
};

export type EnqueueItem = {
  kind: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'TEMPLATE';
  payload: QueuePayload;
  /** Segundos de espera adicionales respecto de la burbuja anterior. */
  delaySeconds?: number;
};

/**
 * Encola una respuesta completa. Los delays se materializan como `scheduledAt`:
 * el drenador no duerme, simplemente no toma nada antes de su horario.
 */
export async function enqueueOutbound(
  conversationKey: string,
  logId: string | null,
  items: EnqueueItem[],
  options: {initialDelaySeconds?: number; simulationRunId?: string | null} = {},
): Promise<number> {
  if (!items.length) return 0;
  let offsetMs = Math.max(0, Math.round((options.initialDelaySeconds ?? 0) * 1000));
  const now = Date.now();
  const rows = items.map((item, index) => {
    offsetMs += Math.max(0, Math.round((item.delaySeconds ?? 0) * 1000));
    return {
      conversationKey,
      logId,
      kind: item.kind,
      payload: item.payload as Prisma.InputJsonValue,
      bubbleIndex: index,
      scheduledAt: new Date(now + offsetMs),
      simulationRunId: options.simulationRunId ?? null,
    };
  });
  await db.whatsappOutboundQueue.createMany({data: rows});
  return rows.length;
}

/** Demora aleatoria acotada, igual que la de la extensión. */
export function randomDelaySeconds(minSeconds: number, maxSeconds: number): number {
  const min = Math.max(0, Math.min(30, minSeconds));
  const max = Math.max(min, Math.min(60, maxSeconds));
  return min + Math.random() * (max - min);
}

type AuthorizationResult = {ok: true; to: string; credentials: WhatsappCredentials} | {ok: false; reason: string};

/**
 * Revalida todo lo que pudo cambiar mientras la salida esperaba en la cola.
 * Es la traducción server-side de las barreras 4, 5 y 6 de la extensión.
 */
async function authorize(conversationKey: string, kind: string): Promise<AuthorizationResult> {
  const [settings, conversation] = await Promise.all([
    db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {enabled: true, defaultMode: true}}),
    db.chatbotConversation.findUnique({
      where: {chatKey: conversationKey},
      select: {escalatedAt: true, modeOverride: true, windowExpiresAt: true, waId: true},
    }),
  ]);
  if (!settings?.enabled) return {ok: false, reason: 'Las respuestas del bot se desactivaron antes del envío.'};
  if (!conversation) return {ok: false, reason: 'La conversación ya no existe.'};
  if (conversation.escalatedAt) return {ok: false, reason: 'El chat fue escalado mientras el mensaje esperaba en la cola.'};
  if ((conversation.modeOverride ?? settings.defaultMode) === 'OFF') {
    return {ok: false, reason: 'El chat quedó en modo apagado antes del envío.'};
  }

  // Barrera nueva: fuera de la ventana de 24 h solo se puede mandar una plantilla.
  if (kind !== 'TEMPLATE' && !windowState(conversation.windowExpiresAt).open) {
    return {
      ok: false,
      reason: 'La ventana de 24 h de WhatsApp venció: Meta solo acepta plantillas aprobadas para esta conversación.',
    };
  }

  const to = conversation.waId ?? conversationKey.replace(/^tel:/, '');
  if (!to) return {ok: false, reason: 'La conversación no tiene un número al que responder.'};

  try {
    return {ok: true, to, credentials: await loadCredentials()};
  } catch (error) {
    return {ok: false, reason: error instanceof Error ? error.message : String(error)};
  }
}

/** Cancela el resto de la respuesta: si una burbuja no salió, las siguientes pierden sentido. */
async function cancelSiblings(logId: string | null, afterBubbleIndex: number, reason: string) {
  if (!logId) return;
  await db.whatsappOutboundQueue.updateMany({
    where: {logId, status: 'PENDING', bubbleIndex: {gt: afterBubbleIndex}},
    data: {status: 'CANCELLED', lastError: reason},
  });
}

async function markLogFailed(logId: string | null, reason: string) {
  if (!logId) return;
  await db.chatbotMessageLog.update({
    where: {id: logId},
    data: {status: 'SEND_FAILED', failedAt: new Date(), error: reason},
  }).catch(() => undefined);
}

/** Un adjunto que no llegó es peor que un texto que no llegó: escala la conversación. */
async function escalateForAttachment(conversationKey: string, logId: string | null, label: string, reason: string) {
  const detail = `Falló un adjunto automático: ${label}. ${reason}`.trim();
  await db.chatbotConversation.update({
    where: {chatKey: conversationKey},
    data: {escalatedAt: new Date(), escalationReason: detail},
  }).catch(() => undefined);
  if (logId) await createEscalationNotification(db, conversationKey, detail, logId).catch(() => undefined);
}

/**
 * Resuelve el binario de un adjunto leyendo el disco, sin pedirse a sí mismo por HTTP.
 * Es más rápido y no depende de que la URL pública esté bien configurada.
 */
async function resolveAttachmentBytes(payload: QueuePayload): Promise<{bytes: Buffer; mimeType: string; filename: string}> {
  if (payload.imageUrl) {
    const filename = payload.imageUrl.split('/').pop() ?? '';
    const filePath = chatbotRuleImagePath(filename);
    return {bytes: await readFile(filePath), mimeType: chatbotRuleImageMime(filename), filename};
  }
  if (payload.quote) {
    const pdf = await db.quotePdf.findFirst({
      where: {
        kind: (payload.quote.kind ?? 'SIMPLE') as any,
        version: {familyId: payload.quote.familyId, version: payload.quote.version},
      },
      include: {version: {include: {family: {select: {visibleNumber: true}}}}},
    });
    // No se genera al vuelo: generar un PDF requiere saber desde qué local se imprime,
    // y adivinarlo cambiaría el encabezado del documento. Se pide explícitamente.
    if (!pdf) throw new Error('El PDF de ese presupuesto todavía no fue generado. Generalo antes de enviarlo.');
    const bytes = await pdfStorage.get(pdf.storageKey).catch(() => null);
    if (!bytes) throw new Error('No se pudo leer el PDF almacenado del presupuesto.');
    return {
      bytes,
      mimeType: 'application/pdf',
      filename: payload.filename
        ?? `${pdf.version.family.visibleNumber}-V${payload.quote.version}.pdf`,
    };
  }
  throw new Error('El adjunto no indica ningún archivo.');
}

async function deliver(row: {
  id: string;
  conversationKey: string;
  logId: string | null;
  kind: string;
  payload: unknown;
  to: string;
  credentials: WhatsappCredentials;
}): Promise<string> {
  const payload = (row.payload ?? {}) as QueuePayload;
  if (row.kind === 'TEXT') {
    if (!payload.text?.trim()) throw new Error('La salida de texto llegó vacía.');
    return (await sendText(row.credentials, row.to, payload.text)).waMessageId;
  }
  if (row.kind === 'TEMPLATE') {
    if (!payload.templateId) throw new Error('La salida de plantilla no indica cuál usar.');
    const template = await db.whatsappTemplate.findUnique({where: {id: payload.templateId}});
    if (!template) throw new Error('La plantilla configurada ya no existe.');
    if (template.status !== 'APPROVED') throw new Error(`La plantilla "${template.name}" no está aprobada por Meta.`);
    const variables = payload.variables ?? [];
    if (variables.length !== template.variableCount) {
      throw new Error(`La plantilla "${template.name}" espera ${template.variableCount} variables y llegaron ${variables.length}.`);
    }
    return (await sendTemplate(row.credentials, row.to, template.name, template.language, variables)).waMessageId;
  }
  const file = await resolveAttachmentBytes(payload);
  const mediaId = await uploadMedia(row.credentials, file.bytes, file.mimeType, file.filename);
  return row.kind === 'IMAGE'
    ? (await sendImage(row.credentials, row.to, mediaId, payload.caption)).waMessageId
    : (await sendDocument(row.credentials, row.to, mediaId, file.filename, payload.caption)).waMessageId;
}

/**
 * Toma trabajo pendiente y lo envía.
 *
 * Reclama como máximo una fila por conversación y siempre la de menor `bubbleIndex`,
 * para que las burbujas salgan en orden. El UPDATE revalida `status = 'PENDING'` bajo
 * lock, así que dos instancias de la API nunca mandan el mismo mensaje dos veces.
 */
/**
 * Devuelve a PENDING las salidas que quedaron en SENDING.
 *
 * Si el proceso muere entre el claim y el envío, esa fila quedaría trabada para
 * siempre y el resto de la respuesta nunca saldría. Se recuperan las que llevan
 * más de dos minutos tomadas: un envío real nunca tarda tanto (el cliente HTTP
 * corta a los 15 s).
 */
async function recoverStalledRows(): Promise<void> {
  const cutoff = new Date(Date.now() - 120_000);
  await db.whatsappOutboundQueue.updateMany({
    where: {status: 'SENDING', updatedAt: {lt: cutoff}},
    data: {status: 'PENDING', lastError: 'Se reintenta: quedó tomada por un proceso que se cortó.'},
  });
}

export async function drainOutboundQueue(): Promise<number> {
  await recoverStalledRows();
  const candidates = await db.$queryRaw<Array<{id: string}>>(Prisma.sql`
    SELECT DISTINCT ON ("conversationKey") id
      FROM "WhatsappOutboundQueue"
     WHERE status = 'PENDING'
       AND "scheduledAt" <= now()
     ORDER BY "conversationKey", "bubbleIndex" ASC, "scheduledAt" ASC
     LIMIT ${MAX_PER_CYCLE}
  `);
  if (!candidates.length) return 0;

  const claimed = await db.$queryRaw<Array<{
    id: string;
    conversationKey: string;
    logId: string | null;
    kind: string;
    payload: unknown;
    bubbleIndex: number;
    attempts: number;
    simulationRunId: string | null;
  }>>(Prisma.sql`
    UPDATE "WhatsappOutboundQueue"
       SET status = 'SENDING', attempts = attempts + 1, "updatedAt" = now()
     WHERE id IN (${Prisma.join(candidates.map((row) => row.id))})
       AND status = 'PENDING'
    RETURNING id, "conversationKey", "logId", kind, payload, "bubbleIndex", attempts, "simulationRunId"
  `);

  let sent = 0;
  for (const row of claimed) {
    // Una salida simulada nunca llega a Meta: es la barrera equivalente al guard de la extensión.
    if (row.simulationRunId) {
      await db.whatsappOutboundQueue.update({
        where: {id: row.id},
        data: {status: 'CANCELLED', lastError: 'Simulación: el mensaje no se envía.'},
      });
      continue;
    }

    const auth = await authorize(row.conversationKey, row.kind);
    if (!auth.ok) {
      await db.whatsappOutboundQueue.update({
        where: {id: row.id},
        data: {status: 'FAILED', lastError: auth.reason},
      });
      await cancelSiblings(row.logId, row.bubbleIndex, auth.reason);
      await markLogFailed(row.logId, auth.reason);
      logger.warn(JSON.stringify({event: 'whatsapp_send_blocked', chatKey: row.conversationKey, reason: auth.reason}));
      continue;
    }

    try {
      const waMessageId = await deliver({...row, to: auth.to, credentials: auth.credentials});
      await db.whatsappOutboundQueue.update({
        where: {id: row.id},
        data: {status: 'SENT', waMessageId, lastError: null},
      });
      await finishLogIfComplete(row.logId, waMessageId);
      sent += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Solo se reintenta lo reintentable: un rechazo 4xx de Meta repetido solo repite el error.
      const retryable = error instanceof WhatsappApiError
        ? error.httpStatus === 0 || error.httpStatus >= 500
        : true;
      const exhausted = row.attempts >= MAX_ATTEMPTS;
      if (retryable && !exhausted) {
        await db.whatsappOutboundQueue.update({
          where: {id: row.id},
          data: {
            status: 'PENDING',
            lastError: reason,
            // Backoff exponencial: 4 s, 16 s, 64 s.
            scheduledAt: new Date(Date.now() + 4 ** row.attempts * 1000),
          },
        });
        continue;
      }
      await db.whatsappOutboundQueue.update({where: {id: row.id}, data: {status: 'FAILED', lastError: reason}});
      await cancelSiblings(row.logId, row.bubbleIndex, reason);
      await markLogFailed(row.logId, reason);
      const payload = (row.payload ?? {}) as QueuePayload;
      if (row.kind === 'IMAGE' || row.kind === 'DOCUMENT') {
        await escalateForAttachment(row.conversationKey, row.logId, payload.label ?? payload.filename ?? 'archivo', reason);
      }
      logger.error(JSON.stringify({event: 'whatsapp_send_failed', chatKey: row.conversationKey, reason}));
    }
  }
  return sent;
}

/** Marca el log como enviado recién cuando ya no quedan burbujas pendientes de esa respuesta. */
async function finishLogIfComplete(logId: string | null, waMessageId: string) {
  if (!logId) return;
  const pending = await db.whatsappOutboundQueue.count({
    where: {logId, status: {in: ['PENDING', 'SENDING']}},
  });
  if (pending > 0) return;
  await db.chatbotMessageLog.update({
    where: {id: logId},
    data: {status: 'SENT', sentAt: new Date(), waMessageId},
  }).catch(() => undefined);
  const log = await db.chatbotMessageLog.findUnique({where: {id: logId}, select: {conversationKey: true, text: true}});
  if (log) {
    await db.chatbotConversation.update({
      where: {chatKey: log.conversationKey},
      data: {lastOutboundText: log.text, lastOutboundAt: new Date()},
    }).catch(() => undefined);
  }
}

let timer: NodeJS.Timeout | null = null;

/**
 * Arranca el drenador dentro del proceso de la API.
 *
 * Vive acá y no en el worker a propósito: la API es el proceso que con seguridad
 * está desplegado (sirve el webhook), y una cola que no drena es un fallo silencioso
 * inaceptable. La toma de trabajo es segura ante múltiples instancias.
 */
export function startOutboundWorker(): void {
  if (timer) return;
  const tick = async () => {
    try {
      await drainOutboundQueue();
    } catch (error) {
      logger.error(JSON.stringify({
        event: 'whatsapp_queue_tick_failed',
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      timer = setTimeout(() => void tick(), CYCLE_MS);
    }
  };
  timer = setTimeout(() => void tick(), CYCLE_MS);
  logger.log(JSON.stringify({event: 'whatsapp_queue_worker_started', cycleMs: CYCLE_MS}));
}

export function stopOutboundWorker(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
