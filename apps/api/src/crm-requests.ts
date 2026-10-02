/**
 * Solicitudes que eleva el bot: cuando no tiene un producto o una PC publicada que
 * encaje, en vez de seguir preguntando pide el presupuesto al equipo. Este módulo
 *  - avisa al equipo (campana del CRM y WhatsApp desde el número del bot a cada vendedor),
 *  - cuenta la cola para que el bot prometa "ya te mando" / "en un ratito",
 *  - y apenas el vendedor guarda el presupuesto (solicitud LISTA) se lo manda al cliente.
 */
import {Logger} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {settingsDto} from './chatbot-core.js';
import {ChatbotController} from './chatbot.js';
import {loadCredentials, sendTemplate, sendText} from './whatsapp-client.js';
import {enqueueOutbound} from './whatsapp-outbound.js';
import {windowState} from './whatsapp-window.js';
import {advanceStage} from './crm-pipeline.js';
import {parseTeamAlerts} from './crm-team-alerts.js';

const logger = new Logger('CrmRequests');

/** Solicitudes que el equipo todavía tiene que armar. */
export async function pendingRequestsCount(): Promise<number> {
  return db.quoteRequest.count({where: {state: {in: ['PENDIENTE', 'EN_PREPARACION']}}});
}

const money = (cents: bigint | number | null | undefined) =>
  cents ? `$${Number(BigInt(cents) / 100n).toLocaleString('es-AR')}` : null;

const webOrigin = () => (process.env.APP_ORIGIN ?? '').split(',')[0]?.trim().replace(/\/$/, '') || '';

/** Una línea sin saltos: las variables de plantilla de Meta no admiten saltos de línea. */
const oneLine = (text: string, max = 300) => text.replace(/\s+/g, ' ').trim().slice(0, max);

/** Aviso al equipo de una solicitud nueva que elevó el bot. Nunca rompe la respuesta al cliente. */
export async function alertTeamNewRequest(requestId: string, chatKey: string): Promise<void> {
  const [request, conversation, settingsRow, queue] = await Promise.all([
    db.quoteRequest.findUnique({where: {id: requestId}}),
    db.chatbotConversation.findUnique({where: {chatKey}, select: {displayName: true, waContactName: true}}),
    db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {teamAlerts: true}}),
    pendingRequestsCount(),
  ]);
  if (!request) return;
  const alerts = parseTeamAlerts(settingsRow?.teamAlerts);
  const customer = conversation?.displayName || conversation?.waContactName || chatKey.replace(/^tel:/, '+');
  const budget = money(request.maximumBudgetCents);
  const link = webOrigin() ? `${webOrigin()}/solicitudes?id=${request.id}` : '';
  const chatLink = webOrigin() ? `${webOrigin()}/crm?chat=${encodeURIComponent(chatKey)}` : '';

  // Campana del CRM: siempre.
  await db.notification.create({data: {
    chatPhone: chatKey,
    type: 'SOLICITUD_BOT',
    title: `Armar presupuesto para ${customer}`,
    body: [request.title, budget ? `Presupuesto: ${budget}` : null, request.expectedUse ? `Uso: ${request.expectedUse}` : null, `En cola: ${queue}`]
      .filter(Boolean).join(' · '),
    entityType: 'QuoteRequest',
    entityId: request.id,
    metadata: {chatKey, queue} as Prisma.InputJsonValue,
  }});

  if (!alerts.enabled || !alerts.numbers.length) return;
  const text = [
    '🛠 Nuevo presupuesto para armar',
    `Cliente: ${customer}`,
    `Busca: ${request.title}`,
    request.expectedUse ? `Uso: ${request.expectedUse}` : null,
    budget ? `Presupuesto: ${budget}` : null,
    request.requiredComponents.length ? `Pidió: ${request.requiredComponents.join(', ')}` : null,
    `En cola: ${queue}`,
    link ? `Solicitud: ${link}` : null,
    chatLink ? `Chat: ${chatLink}` : null,
  ].filter(Boolean).join('\n');

  let credentials;
  try {
    credentials = await loadCredentials();
  } catch {
    return;
  }
  const template = alerts.templateId
    ? await db.whatsappTemplate.findUnique({where: {id: alerts.templateId}})
    : null;
  const windows = await db.chatbotConversation.findMany({
    where: {chatKey: {in: alerts.numbers}},
    select: {chatKey: true, windowExpiresAt: true, waId: true},
  });
  for (const number of alerts.numbers) {
    const known = windows.find((row) => row.chatKey === number);
    // Celulares de Argentina: WhatsApp los identifica como 549 + área + número.
    const to = known?.waId ?? `549${number.replace(/^tel:54/, '')}`;
    const open = windowState(known?.windowExpiresAt).open;
    try {
      if (open) {
        await sendText(credentials, to, text);
      } else if (template && template.status === 'APPROVED') {
        const values = [customer, `${request.title}${budget ? ` (hasta ${budget})` : ''}`, link || chatLink || 'el CRM'];
        await sendTemplate(credentials, to, template.name, template.language, values.slice(0, template.variableCount).map((value) => oneLine(value)));
      } else {
        logger.warn(JSON.stringify({event: 'team_alert_skipped', to: number, reason: 'Ventana de 24 h cerrada y sin plantilla aprobada'}));
        continue;
      }
      logger.log(JSON.stringify({event: 'team_alert_sent', to: number, requestId}));
    } catch (error) {
      logger.warn(JSON.stringify({event: 'team_alert_failed', to: number, error: error instanceof Error ? error.message : String(error)}));
    }
  }
}

const FALLBACK_QUOTE_MESSAGE = 'Listo, te paso el presupuesto que te armamos 👇 Cualquier cosa que quieras cambiar decime';

/**
 * Manda al cliente el presupuesto de una solicitud que quedó LISTA, si el chat lo sigue
 * atendiendo el bot. Si no se puede (chat tomado, ventana cerrada, bot apagado), avisa
 * en la campana para que lo mande un vendedor.
 */
async function deliverReadyRequest(requestId: string): Promise<void> {
  const request = await db.quoteRequest.findUnique({
    where: {id: requestId},
    include: {
      families: {select: {id: true, visibleNumber: true, activeVersion: true, updatedAt: true}, orderBy: {updatedAt: 'desc'}, take: 1},
      chatbotConversations: true,
    },
  });
  const conversation = request?.chatbotConversations[0];
  const family = request?.families[0];
  if (!request || !conversation || !family) return;
  const settings = settingsDto(await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}}));
  const mode = conversation.modeOverride ?? settings.defaultMode;
  const blocked = !settings.enabled ? 'el bot está apagado'
    : mode !== 'AUTO' ? 'el chat no está en automático'
    : conversation.botPausedAt ? 'un vendedor tomó el chat'
    : !windowState(conversation.windowExpiresAt).open ? 'pasaron más de 24 h desde el último mensaje del cliente'
    : null;
  if (blocked) {
    await db.notification.create({data: {
      chatPhone: conversation.chatKey,
      type: 'SOLICITUD_LISTA_ENVIAR',
      title: `Presupuesto ${family.visibleNumber} listo para mandar`,
      body: `No salió solo porque ${blocked}. Mandalo desde el chat.`,
      entityType: 'QuoteRequest',
      entityId: request.id,
    }});
    logger.log(JSON.stringify({event: 'quote_autosend_skipped', requestId, reason: blocked}));
    return;
  }

  const recent = await db.chatbotMessageLog.findMany({
    where: {conversationKey: conversation.chatKey, status: {notIn: ['SUGGESTED', 'DISMISSED']}, text: {not: ''}},
    orderBy: {createdAt: 'desc'},
    take: 5,
    select: {direction: true, text: true},
  });
  let message = FALLBACK_QUOTE_MESSAGE;
  try {
    const generated = await new ChatbotController().quoteSendMessage(family.id, {
      chatKey: conversation.chatKey,
      version: family.activeVersion,
      recentMessages: recent.reverse().map((row) => ({direction: row.direction as 'INBOUND' | 'OUTBOUND', text: row.text.slice(0, 10000)})),
    });
    if (generated?.text?.trim()) message = generated.text.trim();
  } catch (error) {
    logger.warn(JSON.stringify({event: 'quote_autosend_ai_failed', requestId, error: error instanceof Error ? error.message : String(error)}));
  }

  const quote = {familyId: family.id, version: family.activeVersion, kind: 'SIMPLE' as const};
  const log = await db.chatbotMessageLog.create({data: {
    conversationKey: conversation.chatKey,
    direction: 'OUTBOUND',
    actor: 'BOT',
    mode: 'AUTO',
    status: 'SEND_PENDING',
    channel: 'CLOUD_API',
    text: message,
    decisionMetadata: {quote, autoSentFromRequest: request.id, bubbles: [message]} as Prisma.InputJsonValue,
  }});
  await enqueueOutbound(conversation.chatKey, log.id, [
    {kind: 'TEXT', payload: {text: message}},
    {
      kind: 'DOCUMENT',
      payload: {quote, filename: `${family.visibleNumber}-V${family.activeVersion}.pdf`, label: `presupuesto ${family.visibleNumber} V${family.activeVersion}`},
      delaySeconds: 1,
    },
  ], {initialDelaySeconds: 2});

  const version = await db.quoteVersion.findFirst({where: {familyId: family.id, version: family.activeVersion}, select: {totalSaleCents: true}});
  await db.chatbotConversation.update({
    where: {chatKey: conversation.chatKey},
    data: {
      lastQuoteFamilyId: family.id,
      lastQuoteVersion: family.activeVersion,
      ...(version?.totalSaleCents ? {leadValueCents: BigInt(version.totalSaleCents)} : {}),
    },
  });
  await advanceStage(conversation.chatKey, 'QUOTE_SENT', ['NEW', 'QUALIFYING']);
  await db.quoteRequest.update({where: {id: request.id}, data: {state: 'ENVIADA'}});
  logger.log(JSON.stringify({event: 'quote_autosent', requestId, chatKey: conversation.chatKey, family: family.visibleNumber}));
}

/** Reclama solicitudes recién LISTAS (una sola vez cada una) y las entrega. */
export async function deliverReadyRequests(): Promise<number> {
  const settingsRow = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {teamAlerts: true}});
  if (!parseTeamAlerts(settingsRow?.teamAlerts).autoSendQuote) return 0;
  const ready = await db.quoteRequest.findMany({
    where: {
      state: 'LISTA',
      botDeliveredAt: null,
      updatedAt: {gte: new Date(Date.now() - 2 * 86_400_000)},
      chatbotConversations: {some: {}},
    },
    select: {id: true},
    take: 10,
  });
  let delivered = 0;
  for (const {id} of ready) {
    const claimed = await db.quoteRequest.updateMany({where: {id, botDeliveredAt: null}, data: {botDeliveredAt: new Date()}});
    if (!claimed.count) continue;
    try {
      await deliverReadyRequest(id);
      delivered += 1;
    } catch (error) {
      logger.error(JSON.stringify({event: 'quote_autosend_failed', requestId: id, error: error instanceof Error ? error.message : String(error)}));
    }
  }
  return delivered;
}

let timer: NodeJS.Timeout | null = null;

export function startQuoteDelivery(): void {
  if (timer) return;
  const tick = async () => {
    try {
      await deliverReadyRequests();
    } catch (error) {
      logger.error(JSON.stringify({event: 'quote_delivery_tick_failed', error: error instanceof Error ? error.message : String(error)}));
    } finally {
      timer = setTimeout(() => void tick(), 10_000);
    }
  };
  timer = setTimeout(() => void tick(), 10_000);
  logger.log(JSON.stringify({event: 'quote_delivery_started', cycleMs: 10_000}));
}
