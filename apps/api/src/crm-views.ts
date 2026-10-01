/**
 * Cómo se ve un chat hacia la web. Una sola definición para la bandeja vieja
 * (/whatsapp) y el CRM nuevo (/crm), así nunca se contradicen.
 */
import {db} from '@tgs/database';
import {describeWindow, windowState} from './whatsapp-window.js';

export const conversationInclude = {
  assignedUser: {select: {id: true, username: true, displayName: true}},
  activeRequest: {select: {id: true, title: true, state: true}},
} as const;

/** Nombre de quien tomó cada chat ("Bot pausado por Lucas"). */
export async function pauserNames(rows: Array<{botPausedById?: string | null}>): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((row) => row.botPausedById).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const users = await db.user.findMany({where: {id: {in: ids}}, select: {id: true, username: true, displayName: true}});
  return new Map(users.map((user) => [user.id, user.displayName || user.username]));
}

/** Números que entrenan al bot: su chat no es de un cliente. */
export async function trainerKeys(): Promise<Set<string>> {
  const row = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {trainerNumbers: true}});
  return new Set(row?.trainerNumbers ?? []);
}

export function conversationView(row: any, now: Date, pausers: Map<string, string> = new Map(), trainers: Set<string> = new Set()) {
  const state = windowState(row.windowExpiresAt, now);
  const lastInbound = row.lastInboundAt ? new Date(row.lastInboundAt).getTime() : 0;
  const lastOutbound = row.lastOutboundAt ? new Date(row.lastOutboundAt).getTime() : 0;
  const snoozed = row.snoozedUntil && new Date(row.snoozedUntil) > now;
  return {
    chatKey: row.chatKey,
    isTrainer: trainers.has(row.chatKey),
    displayName: row.displayName,
    waContactName: row.waContactName,
    waId: row.waId,
    bot: {
      paused: Boolean(row.botPausedAt),
      pausedAt: row.botPausedAt ?? null,
      pausedBy: row.botPausedById ? pausers.get(row.botPausedById) ?? null : null,
      pausedReason: row.botPausedReason ?? null,
      replying: Boolean(row.replyDueAt),
    },
    /** Estado para la bandeja: resuelto, pospuesto, derivado (necesita persona), de un vendedor o del bot. */
    status: row.resolvedAt
      ? 'RESOLVED'
      : snoozed
        ? 'SNOOZED'
        : row.escalatedAt
          ? 'NEEDS_HUMAN'
          : row.botPausedAt
            ? 'HUMAN'
            : 'BOT',
    resolvedAt: row.resolvedAt ?? null,
    snoozedUntil: snoozed ? row.snoozedUntil : null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    /** Quién habló último: CUSTOMER = esperando que le contestemos. */
    lastSpeaker: lastInbound === 0 && lastOutbound === 0 ? null : lastInbound >= lastOutbound ? 'CUSTOMER' : 'US',
    lastMessageAt: row.lastMessageAt ?? null,
    lastInboundText: row.lastInboundText,
    lastInboundAt: row.lastInboundAt,
    lastOutboundText: row.lastOutboundText,
    lastOutboundAt: row.lastOutboundAt,
    unreadCount: row.unreadCount,
    escalatedAt: row.escalatedAt,
    escalationReason: row.escalationReason,
    modeOverride: row.modeOverride,
    assignedUser: row.assignedUser ?? null,
    activeRequest: row.activeRequest ?? null,
    lastQuoteFamilyId: row.lastQuoteFamilyId ?? null,
    updatedAt: row.updatedAt,
    window: {
      open: state.open,
      expiresAt: state.expiresAt,
      remainingMs: state.remainingMs,
      description: describeWindow(state),
    },
  };
}
