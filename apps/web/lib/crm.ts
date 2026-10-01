import { api } from "./api";
import type { WhatsappConversation } from "./api";

/** Vistas de la bandeja. El orden es el de la barra lateral. */
export const CRM_VIEWS = [
  { id: "ALL", label: "Todas", hint: "Todo lo abierto" },
  { id: "HOT", label: "🔥 Calientes", hint: "Están por comprar: atendelos primero" },
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

export function setConversationAlwaysOn(chatKey: string, alwaysOn: boolean): Promise<WhatsappConversation> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/always-on`, { method: "PUT", body: { alwaysOn } });
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

// ---------------------------------------------------------------- embudo

export const STAGES = [
  { id: "NEW", label: "Nuevo", hint: "Recién escribió" },
  { id: "QUALIFYING", label: "Calificando", hint: "Ya sabemos qué quiere y su presupuesto" },
  { id: "QUOTE_SENT", label: "Presupuesto enviado", hint: "Se le mandó un presupuesto" },
  { id: "NEGOTIATION", label: "Negociación", hint: "Ajustando opciones, precio o pago" },
  { id: "DEPOSIT", label: "Seña / Pago", hint: "Señó o está por pagar" },
  { id: "WON", label: "Ganado", hint: "Compró" },
  { id: "LOST", label: "Perdido", hint: "No compró (con motivo)" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

export const LOST_REASONS = ["Precio", "Sin stock", "Compró en otro lado", "No respondió", "Solo consultaba", "Otro"] as const;

export type PipelineColumn = { stage: StageId; count: number; totalCents: string; items: WhatsappConversation[] };

export function getPipeline(params: { mine?: boolean; days?: number } = {}): Promise<{ columns: PipelineColumn[] }> {
  return api("/crm/pipeline", { query: { mine: params.mine ? "1" : "0", days: params.days ?? 60 } });
}

export type LeadUpdate = {
  stage?: StageId;
  valueCents?: number | null;
  lostReason?: string | null;
  profile?: WhatsappConversation["profile"];
};

export function updateLead(chatKey: string, body: LeadUpdate): Promise<WhatsappConversation> {
  return api(`/crm/conversations/${encodeURIComponent(chatKey)}/lead`, { method: "PUT", body });
}

export type CrmTask = {
  id: string;
  conversationKey: string | null;
  chatName?: string | null;
  title: string;
  dueAt: string | null;
  assignedToId: string | null;
  doneAt: string | null;
  createdAt: string;
};

export function listTasks(params: { chatKey?: string; mine?: boolean; open?: boolean } = {}): Promise<CrmTask[]> {
  return api("/crm/tasks", { query: { chatKey: params.chatKey, mine: params.mine ? "1" : undefined, open: params.open ? "1" : undefined } });
}

export function createTask(body: { conversationKey?: string | null; title: string; dueAt?: string | null; assignedToId?: string | null }): Promise<CrmTask> {
  return api("/crm/tasks", { method: "POST", body });
}

export function updateTask(id: string, body: { title?: string; dueAt?: string | null; assignedToId?: string | null; done?: boolean }): Promise<CrmTask> {
  return api(`/crm/tasks/${encodeURIComponent(id)}`, { method: "PUT", body });
}

export function deleteTask(id: string): Promise<{ ok: boolean }> {
  return api(`/crm/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** "$ 650.000" a partir de centavos. */
export function formatCents(cents: string | number | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "—";
  const pesos = Number(BigInt(String(cents)) / 100n);
  return `$ ${pesos.toLocaleString("es-AR")}`;
}

// ---------------------------------------------------------------- señales de venta

export const INTENT_LABEL: Record<string, string> = {
  GREETING: "Saludo",
  INFO: "Consulta general",
  PRICE: "Pregunta precio",
  PRODUCT: "Producto puntual",
  BUILD_PC: "Quiere armar una PC",
  COMPARE: "Compara opciones",
  PAYMENT: "Formas de pago",
  SHIPPING: "Envío / retiro",
  PURCHASE_READY: "Listo para comprar",
  TRADE_IN: "Parte de pago",
  SUPPORT: "Servicio técnico",
  COMPLAINT: "Reclamo",
  OTHER: "Otro",
};

/** Temperatura de la venta como etiqueta visible. */
export function temperatureBadge(value: number | null | undefined): { icon: string; label: string; tone: "hot" | "warm" | "cold" } | null {
  if (value === null || value === undefined) return null;
  if (value >= 66) return { icon: "🔥", label: `Caliente (${value})`, tone: "hot" };
  if (value >= 31) return { icon: "🌡", label: `Tibio (${value})`, tone: "warm" };
  return { icon: "❄", label: `Frío (${value})`, tone: "cold" };
}
