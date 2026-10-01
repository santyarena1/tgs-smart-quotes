import { api } from "./api";
import type { WhatsappConversation } from "./api";

/** Vistas de la bandeja. El orden es el de la barra lateral. */
export const CRM_VIEWS = [
  { id: "ALL", label: "Todas", hint: "Todo lo abierto" },
  { id: "MINE", label: "Mías", hint: "Asignadas a vos" },
  { id: "UNASSIGNED", label: "Sin asignar", hint: "Necesitan un vendedor y nadie las tomó" },
  { id: "NEEDS_HUMAN", label: "Derivadas", hint: "El bot las pasó a una persona" },
  { id: "BOT", label: "Con el bot", hint: "Las está atendiendo el bot" },
  { id: "UNREAD", label: "Sin leer", hint: "Con mensajes sin leer" },
  { id: "WAITING", label: "Esperando al cliente", hint: "Le contestamos y falta que responda" },
  { id: "SNOOZED", label: "Pospuestas", hint: "Vuelven solas en la fecha o si el cliente escribe" },
  { id: "RESOLVED", label: "Resueltas", hint: "Cerradas; se reabren si el cliente escribe" },
] as const;

export type CrmViewId = (typeof CRM_VIEWS)[number]["id"];

export type CrmInboxResult = {
  items: WhatsappConversation[];
  nextCursor: string | null;
  counts: Record<CrmViewId, number>;
};

export function getCrmInbox(params: { view: CrmViewId; q?: string; tag?: string; cursor?: string; limit?: number }): Promise<CrmInboxResult> {
  return api("/crm/inbox", { query: params });
}

export function resolveConversation(chatKey: string): Promise<WhatsappConversation> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/resolve`, { method: "POST" });
}

export function reopenConversation(chatKey: string): Promise<WhatsappConversation> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/reopen`, { method: "POST" });
}

export function snoozeConversation(chatKey: string, until: Date): Promise<WhatsappConversation> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/snooze`, { method: "POST", body: { until: until.toISOString() } });
}

export function setConversationTags(chatKey: string, tags: string[]): Promise<WhatsappConversation> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/tags`, { method: "PUT", body: { tags } });
}

export function renameConversation(chatKey: string, displayName: string | null): Promise<WhatsappConversation> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/name`, { method: "PUT", body: { displayName } });
}

export function listCrmTags(): Promise<Array<{ tag: string; total: number }>> {
  return api("/crm/tags");
}

export type CrmNote = {
  id: string;
  conversationKey: string;
  authorId: string | null;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: string;
};

export function listNotes(chatKey: string): Promise<CrmNote[]> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/notes`);
}

export function addNote(chatKey: string, body: string, mentions: string[]): Promise<CrmNote> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/notes`, { method: "POST", body: { body, mentions } });
}

export function deleteNote(chatKey: string, id: string): Promise<{ ok: boolean }> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type QuickReply = { id: string; shortcut: string; title: string; body: string };

export function listQuickReplies(): Promise<QuickReply[]> {
  return api("/crm/quick-replies");
}

export function saveQuickReply(body: Omit<QuickReply, "id">, id?: string): Promise<QuickReply> {
  return id
    ? api(`/crm/quick-replies/${encodeURIComponent(id)}`, { method: "PUT", body })
    : api("/crm/quick-replies", { method: "POST", body });
}

export function deleteQuickReply(id: string): Promise<{ ok: boolean }> {
  return api(`/crm/quick-replies/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type TeamMember = { id: string; name: string; username: string; role: string };

export function listTeam(): Promise<TeamMember[]> {
  return api("/crm/team");
}

export type ThemeChoice = "light" | "dark" | "system";

export function getCrmPreferences(): Promise<{ theme: ThemeChoice }> {
  return api("/crm/me/preferences");
}

export function setCrmTheme(theme: ThemeChoice): Promise<{ theme: ThemeChoice }> {
  return api("/crm/me/preferences", { method: "PUT", body: { theme } });
}

/** URL del archivo que mandó el cliente (foto, audio, documento). */
export function mediaUrl(logId: string): string {
  return `/api/crm/media/${encodeURIComponent(logId)}`;
}
