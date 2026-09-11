import type {
  Collection,
  Customer,
  Quote,
  QuoteRequest,
  RecontactCandidate,
  RecontactHistoryItem,
  TimelineEvent,
} from "./types";

/**
 * Por defecto usamos same-origin `/api` (proxy de Next → backend).
 * En el browser ignoramos URLs absolutas a :3001 (suelen quedar cacheadas y rompen el fetch).
 */
function resolveApiUrl(): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (typeof window !== "undefined") {
    if (!env || /:3001\b/.test(env)) return "/api";
    return env.replace(/\/$/, "");
  }
  return (env || "/api").replace(/\/$/, "");
}

const API_URL = resolveApiUrl();

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
};

function buildUrl(path: string, query?: ApiOptions["query"]) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const raw = path.startsWith("http") ? path : `${API_URL}${suffix}`;
  const url = raw.startsWith("http")
    ? new URL(raw)
    : new URL(raw, "http://localhost");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  if (raw.startsWith("http")) return url.toString();
  return `${url.pathname}${url.search}`;
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { body, query, headers, ...rest } = options;
  const init: RequestInit = {
    credentials: "include",
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const requestUrl = buildUrl(path, query);
  let response: Response;
  try {
    response = await fetch(requestUrl, init);
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
    throw new ApiError(
      `No se pudo conectar con la API (${requestUrl}). Verificá que el backend esté en marcha.${detail}`,
      0,
    );
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const payload = data as { message?: string | string[]; error?: string } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join("; ")
      : typeof payload?.message === "string"
        ? payload.message
        : `Error HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload?.error);
  }

  return data as T;
}

export function apiBaseUrl() {
  return API_URL;
}

export function getRecontactCandidates(): Promise<RecontactCandidate[]> {
  return api<RecontactCandidate[]>("/chatbot/recontacts/candidates");
}

export function getRecontactHistory(): Promise<RecontactHistoryItem[]> {
  return api<RecontactHistoryItem[]>("/chatbot/recontacts/history");
}

export function setRecontactOptOut(chatKey: string, recontactOptOut: boolean): Promise<void> {
  return api<void>(`/chatbot/conversations/${encodeURIComponent(chatKey)}`, {
    method: "PUT",
    body: { recontactOptOut },
  });
}

export type WhatsappSettings = {
  id: 'singleton';
  enabled: boolean;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  apiVersion: string;
  webhookVerifyToken: string | null;
  webhookUrl: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  lastVerifiedAt: string | null;
  /** Último POST del webhook de Meta con firma válida; null si nunca llegó uno. */
  lastWebhookAt: string | null;
  accessTokenMasked: string;
  appSecretMasked: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  updatedAt: string | null;
  qualityRating?: string | null;
};

export type WhatsappSettingsInput = {
  enabled: boolean;
  phoneNumberId?: string;
  businessAccountId?: string;
  apiVersion: string;
  accessToken?: string;
  appSecret?: string;
};

/** Estado de la ventana de 24 h de Meta para una conversación. */
export type WhatsappWindow = {
  open: boolean;
  expiresAt: string | null;
  remainingMs: number;
  description: string;
};

export type WhatsappConversation = {
  chatKey: string;
  displayName: string | null;
  waContactName: string | null;
  waId: string | null;
  lastInboundText: string | null;
  lastInboundAt: string | null;
  lastOutboundText: string | null;
  lastOutboundAt: string | null;
  unreadCount: number;
  escalatedAt: string | null;
  escalationReason: string | null;
  modeOverride: 'OFF' | 'SUGGEST' | 'AUTO' | null;
  assignedUser: {id: string; username: string; displayName: string | null} | null;
  activeRequest: {id: string; title: string; state: string} | null;
  updatedAt: string;
  window: WhatsappWindow;
};

export type WhatsappMessage = {
  id: string;
  conversationKey: string;
  direction: 'INBOUND' | 'OUTBOUND';
  actor: 'CUSTOMER' | 'BOT' | 'HUMAN' | 'SYSTEM';
  status: string;
  text: string;
  waMessageId: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  waErrorCode: number | null;
  escalationReason: string | null;
  createdAt: string;
};

export type WhatsappTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  variableCount: number;
  usageHint: string;
  useForRecontact: boolean;
  lastSyncedAt: string | null;
};

export type WhatsappConversationFilter = 'TODAS' | 'NO_LEIDAS' | 'ESCALADAS' | 'MIAS' | 'VENTANA_ABIERTA';

// ----------------------------------------------------------- Miniaturas IA

export type ThumbnailAiReference = {id: string; url: string; note: string | null; sortOrder: number; createdAt: string};

export type ThumbnailFooterBadge = {icon: 'shield' | 'star' | 'headset' | 'truck' | 'check' | 'bolt'; line1: string; line2: string};

export type ThumbnailAiSettings = {
  enabled: boolean;
  mode: 'LAYOUT' | 'AI_SCENE';
  /** Centavos, como string (BigInt en el servidor). */
  gpuHeadlineThresholdCents: string;
  logoUrl: string | null;
  accentColor: string;
  footer: ThumbnailFooterBadge[];
  caseAiMode: 'OFF' | 'ALWAYS';
  caseAiPrompt: string;
  model: string;
  quality: 'low' | 'medium' | 'high';
  size: '1024x1024' | '1536x1024' | '1024x1536';
  prompt: string;
  textMode: 'AI' | 'OVERLAY' | 'NONE';
  textTemplate: string;
  overlayPosition: 'top' | 'bottom';
  overlayColor: string;
  overlayFontSize: number;
  overlayFontFamily: string | null;
  references: ThumbnailAiReference[];
  placeholders: string[];
};

export type ThumbnailAiSettingsInput = Partial<Omit<ThumbnailAiSettings, 'references' | 'placeholders' | 'logoUrl'>>;

export function getThumbnailAiSettings(): Promise<ThumbnailAiSettings> {
  return api<ThumbnailAiSettings>('/settings/thumbnail-ai');
}

export function updateThumbnailAiSettings(body: ThumbnailAiSettingsInput): Promise<ThumbnailAiSettings> {
  return api<ThumbnailAiSettings>('/settings/thumbnail-ai', {method: 'PUT', body});
}

export function uploadThumbnailAiLogo(file: File): Promise<ThumbnailAiSettings> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<ThumbnailAiSettings>('/settings/thumbnail-ai/logo', form);
}

export function deleteThumbnailAiLogo(): Promise<ThumbnailAiSettings> {
  return api<ThumbnailAiSettings>('/settings/thumbnail-ai/logo', {method: 'DELETE'});
}

export function uploadThumbnailAiReference(file: File): Promise<ThumbnailAiReference> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<ThumbnailAiReference>('/settings/thumbnail-ai/references', form);
}

export function updateThumbnailAiReference(id: string, body: {note?: string | null; sortOrder?: number}): Promise<ThumbnailAiReference> {
  return api<ThumbnailAiReference>(`/settings/thumbnail-ai/references/${id}`, {method: 'PATCH', body});
}

export function deleteThumbnailAiReference(id: string): Promise<{ok: true}> {
  return api<{ok: true}>(`/settings/thumbnail-ai/references/${id}`, {method: 'DELETE'});
}

/** Genera (o regenera) la miniatura de una PC con IA. Cada llamada es una imagen nueva. */
export function generateFamilyThumbnailAi(familyId: string, options: {regenerateCase?: boolean} = {}): Promise<{thumbnailUrl: string; detail: string}> {
  return api<{thumbnailUrl: string; detail: string}>(`/external-module/quote-families/${familyId}/thumbnail/generate`, {method: 'POST', body: options});
}

export function getWhatsappSettings(): Promise<WhatsappSettings> {
  return api<WhatsappSettings>('/whatsapp/settings');
}

export function updateWhatsappSettings(body: WhatsappSettingsInput): Promise<WhatsappSettings> {
  return api<WhatsappSettings>('/whatsapp/settings', {method: 'PUT', body});
}

/** Verifica las credenciales contra Meta y devuelve los datos públicos del número. */
export function verifyWhatsappNumber(): Promise<WhatsappSettings> {
  return api<WhatsappSettings>('/whatsapp/settings/verify', {method: 'POST'});
}

export function listWhatsappConversations(params: {
  q?: string;
  filter?: WhatsappConversationFilter;
  limit?: number;
  cursor?: string;
}): Promise<{items: WhatsappConversation[]; nextCursor: string | null}> {
  return api('/whatsapp/conversations', {query: params});
}

export function getWhatsappConversation(chatKey: string): Promise<WhatsappConversation> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}`);
}

export function listWhatsappMessages(
  chatKey: string,
  params: {limit?: number; before?: string} = {},
): Promise<{items: WhatsappMessage[]; nextCursor: string | null}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/messages`, {query: params});
}

export function sendWhatsappMessage(
  chatKey: string,
  body: {
    text?: string;
    templateId?: string;
    templateVariables?: string[];
    quote?: {familyId: string; version: number};
  },
): Promise<{logId: string; queued: number}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/send`, {method: 'POST', body});
}

export function markWhatsappRead(chatKey: string): Promise<{chatKey: string; unreadCount: number}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/read`, {method: 'POST'});
}

export function assignWhatsappConversation(
  chatKey: string,
  assignedUserId: string | null,
): Promise<{chatKey: string; assignedUser: WhatsappConversation['assignedUser']}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/assign`, {
    method: 'POST',
    body: {assignedUserId},
  });
}

export function sendWhatsappRecontact(
  chatKey: string,
  templateId: string,
  templateVariables: string[],
): Promise<{logId: string; template: string; preview: string}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/recontact`, {
    method: 'POST',
    body: {templateId, templateVariables},
  });
}

// ---------------------------------------------------------------------------
// Capa comercial del CRM. Reemplaza a la barra de acciones y los tabs que la
// extensión inyectaba dentro de WhatsApp Web. Los endpoints son los mismos que
// consumía el plugin: acá solo cambia desde dónde se los llama.
// ---------------------------------------------------------------------------

export type CrmCatalogProduct = {
  mpn: string;
  title: string;
  priceCents: string;
  salePriceCents: string | null;
  stockQuantity: number;
  availability: string;
  brand: string | null;
  imageUrl: string | null;
};

/** Presupuesto asociado a la conversación, o null si todavía no hay ninguno. */
export function getConversationQuote(chatKey: string): Promise<Quote | null> {
  return api(`/chatbot/conversations/${encodeURIComponent(chatKey)}/quote`);
}

export function searchCrmQuotes(params: {
  q?: string;
  phone?: string;
  customerId?: string;
}): Promise<{items: Quote[]}> {
  return api('/quotes/search', {query: params});
}

export function getCrmQuote(id: string): Promise<Quote> {
  return api(`/quotes/${encodeURIComponent(id)}`);
}

export function getCrmTimeline(id: string): Promise<{events: TimelineEvent[]}> {
  return api(`/quotes/${encodeURIComponent(id)}/timeline`);
}

export function listCrmCollections(): Promise<Collection[]> {
  return api('/collections');
}

export function changeCrmQuoteState(
  id: string,
  state: string,
  reason?: string | null,
): Promise<Quote> {
  return api(`/quotes/${encodeURIComponent(id)}/state`, {method: 'POST', body: {state, reason}});
}

export function createCrmQuoteVersion(
  id: string,
  reason?: string | null,
  sourceVersion?: number,
): Promise<Quote> {
  return api(`/quotes/${encodeURIComponent(id)}/version`, {method: 'POST', body: {reason, sourceVersion}});
}

/** Genera (o reutiliza) el PDF de una versión concreta antes de adjuntarlo. */
export function generateCrmVersionPdf(
  id: string,
  version: number,
  kind: 'SIMPLE' | 'DETALLADO' = 'SIMPLE',
): Promise<{reused?: boolean}> {
  return api(`/quotes/${encodeURIComponent(id)}/versions/${version}/pdf`, {method: 'POST', body: {kind}});
}

/** Redacta con IA el mensaje que acompaña al presupuesto, según la conversación. */
export function generateQuoteSendMessage(
  id: string,
  body: {chatKey: string; version?: number; recentMessages: Array<{direction: 'INBOUND' | 'OUTBOUND'; text: string}>},
): Promise<{text: string; usedAi: boolean}> {
  return api(`/chatbot/quotes/${encodeURIComponent(id)}/send-message`, {method: 'POST', body});
}

export function sendWhatsappQuote(
  chatKey: string,
  body: {familyId: string; version: number; kind: 'SIMPLE' | 'DETALLADO'; message: string},
): Promise<{logId: string; visibleNumber: string}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/send-quote`, {method: 'POST', body});
}

export function searchCrmProducts(q: string): Promise<{items: CrmCatalogProduct[]}> {
  return api('/catalog', {query: {q, pageSize: 20, sort: 'price-asc'}});
}

export function crmProductImagePath(mpn: string): string {
  return `/api/catalog/${encodeURIComponent(mpn)}/image`;
}

export function sendWhatsappProduct(
  chatKey: string,
  body: {mpn: string; text: string},
): Promise<{logId: string; product: string}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/send-product`, {method: 'POST', body});
}

export function getStoreSearchUrl(q: string): Promise<{url: string}> {
  return api('/catalog/web-search', {query: {q}});
}

/** Pide una sugerencia del bot sobre el último mensaje del cliente. */
export function requestWhatsappSuggestion(chatKey: string): Promise<{action: string; reply?: string; logId?: string}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}/suggest`, {method: 'POST'});
}

export function listCrmRequests(): Promise<QuoteRequest[]> {
  return api('/requests');
}

export function createCrmQuickRequest(body: {
  title: string;
  originalText: string;
  detectedPhone: string | null;
}): Promise<QuoteRequest> {
  // La solicitud rápida usa el mismo POST /requests que la vista de Solicitudes.
  return api('/requests', {method: 'POST', body: {...body, state: 'PENDIENTE'}});
}

export function updateCrmRequest(id: string, body: Record<string, unknown>): Promise<QuoteRequest> {
  return api(`/requests/${encodeURIComponent(id)}`, {method: 'PUT', body});
}

export function createCustomerQuick(phone: string): Promise<Customer & {created: boolean}> {
  return api('/customers/quick', {method: 'POST', body: {phone}});
}

export function createCrmCustomer(body: {
  name: string;
  phone?: string | null;
  dni?: string | null;
}): Promise<Customer> {
  return api('/customers', {method: 'POST', body});
}

/** Borra una conversación con todo su historial. Irreversible. */
export function deleteWhatsappConversation(chatKey: string): Promise<{
  chatKey: string;
  deleted: {messages: number; notifications: number};
}> {
  return api(`/whatsapp/conversations/${encodeURIComponent(chatKey)}`, {method: 'DELETE'});
}

/** Limpieza masiva. Solo ADMIN y con la frase de confirmación exacta. */
export function purgeWhatsappConversations(confirm: string): Promise<{
  deleted: {conversations: number; messages: number; notifications: number};
}> {
  return api('/whatsapp/conversations/purge', {method: 'POST', body: {confirm}});
}

/** Desvincula el presupuesto asociado a la conversación. */
export function unlinkConversationQuote(chatKey: string): Promise<unknown> {
  return api(`/chatbot/conversations/${encodeURIComponent(chatKey)}`, {
    method: 'PUT',
    body: {lastQuoteFamilyId: null, lastQuoteVersion: null},
  });
}

/** Aprueba una sugerencia del bot (opcionalmente editada) y la envía. */
export function sendWhatsappSuggestion(logId: string, text?: string): Promise<{logId: string; text: string}> {
  return api(`/whatsapp/suggestions/${encodeURIComponent(logId)}/send`, {
    method: 'POST',
    body: text ? {text} : {},
  });
}

export function dismissWhatsappSuggestion(logId: string): Promise<{logId: string; status: string}> {
  return api(`/whatsapp/suggestions/${encodeURIComponent(logId)}/dismiss`, {method: 'POST'});
}

export function listWhatsappTemplates(): Promise<WhatsappTemplate[]> {
  return api('/whatsapp/templates');
}

export function saveWhatsappTemplate(body: {
  name: string;
  language: string;
  category: string;
  body: string;
  usageHint: string;
  useForRecontact: boolean;
}): Promise<WhatsappTemplate> {
  return api('/whatsapp/templates', {method: 'POST', body});
}

export function deleteWhatsappTemplate(id: string): Promise<{ok: boolean}> {
  return api(`/whatsapp/templates/${encodeURIComponent(id)}`, {method: 'DELETE'});
}

export function syncWhatsappTemplates(): Promise<{synced: number}> {
  return api('/whatsapp/templates/sync', {method: 'POST'});
}

/** ID fijo de la extensión TGS (manifest key). */
export const TGS_EXTENSION_ID = "edfnidnbmlepdddpofocidojlfphjdkc";

export type ExtensionPingResult = {
  ok: boolean;
  installed: boolean;
  extensionVersion?: string;
  apiBase?: string;
  healthOk?: boolean;
  sessionOk?: boolean;
  user?: { username?: string; displayName?: string | null };
  error?: string;
};

/**
 * Pregunta al plugin instalado (chrome.runtime) si ve la API y la sesión.
 * Requiere extensión cargada + externally_connectable hacia localhost:3000.
 */
export function pingChromeExtension(): Promise<ExtensionPingResult> {
  return new Promise((resolve) => {
    const chromeApi = (globalThis as { chrome?: { runtime?: {
      sendMessage: (
        extensionId: string,
        message: unknown,
        responseCallback?: (response: unknown) => void,
      ) => void;
      lastError?: { message?: string };
    } } }).chrome;

    if (!chromeApi?.runtime?.sendMessage) {
      resolve({
        ok: false,
        installed: false,
        error: "Este navegador no expone chrome.runtime (usá Chrome/Edge).",
      });
      return;
    }

    try {
      chromeApi.runtime.sendMessage(TGS_EXTENSION_ID, { type: "TGS_PING" }, (response) => {
        const lastError = chromeApi.runtime?.lastError;
        if (lastError) {
          resolve({
            ok: false,
            installed: false,
            error:
              lastError.message?.includes("Receiving end does not exist")
                ? "Plugin no detectado. Instalá/activá TGS Presupuestos Pro en chrome://extensions."
                : lastError.message ?? "No se pudo contactar al plugin.",
          });
          return;
        }
        const data = response as {
          ok?: boolean;
          extensionVersion?: string;
          apiBase?: string;
          healthOk?: boolean;
          sessionOk?: boolean;
          user?: { username?: string; displayName?: string | null };
          error?: string;
        } | null;
        if (!data) {
          resolve({ ok: false, installed: true, error: "El plugin no respondió." });
          return;
        }
        resolve({
          ok: Boolean(data.ok),
          installed: true,
          extensionVersion: data.extensionVersion,
          apiBase: data.apiBase,
          healthOk: data.healthOk,
          sessionOk: data.sessionOk,
          user: data.user,
          error: data.error,
        });
      });
    } catch (error) {
      resolve({
        ok: false,
        installed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/** Subida multipart (FormData). No setear Content-Type: el browser agrega el boundary. */
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const requestUrl = buildUrl(path);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      credentials: "include",
      body: formData,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
    throw new ApiError(
      `No se pudo conectar con la API (${requestUrl}). Verificá que el backend esté en marcha.${detail}`,
      0,
    );
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const payload = data as { message?: string | string[]; error?: string } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join("; ")
      : typeof payload?.message === "string"
        ? payload.message
        : `Error HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload?.error);
  }

  return data as T;
}

/** Descarga un binario autenticado (p. ej. PDF) y dispara el save del navegador. */
export async function downloadAuthenticated(
  path: string,
  filename: string,
  query?: ApiOptions["query"],
): Promise<void> {
  const requestUrl = buildUrl(path, query);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      credentials: "include",
      headers: { Accept: "application/pdf,application/octet-stream,*/*" },
    });
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
    throw new ApiError(
      `No se pudo conectar con la API (${requestUrl}). Verificá que el backend esté en marcha.${detail}`,
      0,
    );
  }
  if (!response.ok) {
    const text = await response.text();
    let message = `Error HTTP ${response.status}`;
    try {
      const payload = JSON.parse(text) as { message?: string };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
