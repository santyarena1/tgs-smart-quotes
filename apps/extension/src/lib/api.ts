import type {
  AiSuggestion,
  Collection,
  NotificationRow,
  PdfKind,
  Quote,
  QuoteRequest,
  QuoteSearchResult,
  QuoteState,
  QuoteTimeline,
  RequestState,
  SendAttempt,
  SendAttemptStatus,
  Customer,
  PcLine,
  Product,
  QuoteItemInput,
  ReplyIntent,
  ChatbotSettings,
  AcustockProductSearch,
  ChatbotConversation,
  ChatbotLog,
  ChatbotRespondResult,
  ChatbotMode,
  ChatbotChatContext,
  LatestSentQuote,
  ChatbotRecontactCandidate,
  ChatbotRecontactInput,
  ChatbotRecontactResult,
  ChatbotRecontactMarkResult,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Error desconocido";
}

type Query = Record<string, string | number | boolean | null | undefined>;
type ApiOptions = { method?: string; body?: unknown; query?: Query };

type BackgroundApiResponse = { ok: boolean; status: number; data?: unknown; error?: string };
type BackgroundDownloadResponse = { ok: boolean; error?: string };

function buildPath(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  if (!qs) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${qs}`;
}

/**
 * El content script no puede hacer fetch cross-origin de forma confiable en web.whatsapp.com
 * (CSP de la página), así que todo pasa por el service worker (`background.ts`), que sí tiene
 * `host_permissions` sobre la API.
 */
function sendToBackground<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new ApiError("La extensión no tiene acceso a chrome.runtime; recargá la página.", 0));
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(
            new ApiError(
              `No se pudo comunicar con la extensión: ${chrome.runtime.lastError.message}`,
              0,
            ),
          );
          return;
        }
        resolve(response as T);
      });
    } catch (error) {
      reject(new ApiError(`Fallo interno de mensajería de la extensión: ${String(error)}`, 0));
    }
  });
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method, body, query } = options;
  const init: RequestInit = {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const response = await sendToBackground<BackgroundApiResponse>({
    type: "API",
    path: buildPath(path, query),
    init,
  });

  if (!response) {
    throw new ApiError("Sin respuesta del background de la extensión.", 0);
  }
  if (response.status === 0) {
    throw new ApiError(
      `No se pudo conectar con la API. Verificá que el backend esté en marcha. (${response.error ?? "sin detalle"})`,
      0,
    );
  }
  if (!response.ok) {
    const payload = response.data as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join("; ")
      : typeof payload?.message === "string"
        ? payload.message
        : `Error HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return response.data as T;
}

/** Descarga un PDF disparando `chrome.downloads` desde el background (requiere permiso "downloads"). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await sendToBackground<BackgroundDownloadResponse>({
    type: "DOWNLOAD",
    path,
    filename,
  });
  if (!response?.ok) {
    throw new ApiError(response?.error ?? "No se pudo iniciar la descarga del PDF.", 0);
  }
}

export type ExtensionConnection = {
  ok: boolean;
  extensionVersion: string;
  apiBase: string;
  healthOk: boolean;
  sessionOk: boolean;
  user?: { username?: string; displayName?: string | null };
  error?: string;
};

/** Prueba API + sesión vía el service worker de la extensión. */
export function probeExtensionConnection(): Promise<ExtensionConnection> {
  return sendToBackground<ExtensionConnection>({ type: "PING" });
}

// ---- Endpoints cableados (Block 7) ----

export const searchQuotes = (params: { q?: string; phone?: string; state?: QuoteState; customerId?: string }) =>
  api<QuoteSearchResult>("/quotes/search", {
    query: { q: params.q, phone: params.phone, state: params.state, customerId: params.customerId, pageSize: 15 },
  });

export const getQuote = (id: string) => api<Quote>(`/quotes/${id}`);

export const listCollections = () => api<Collection[]>("/collections");

export const listRequests = () => api<QuoteRequest[]>("/requests");

export const createQuickRequest = (body: {
  title: string;
  originalText?: string;
  detectedPhone?: string | null;
  state?: RequestState;
}) => api<QuoteRequest>("/requests", { body });

export const generatePdf = (id: string, kind: PdfKind, force = false) =>
  api<{ id: string; kind: PdfKind; reused?: boolean; immutable?: boolean }>(`/quotes/${id}/pdf`, {
    body: { kind, force },
  });

export const pdfDownloadPath = (id: string, kind: PdfKind) => `/quotes/${id}/pdf/${kind}`;

export const createSendAttempt = (
  id: string,
  body: {
    chatPhone?: string | null;
    chatName?: string | null;
    message: string;
    pdfKind?: PdfKind | null;
    pdfName?: string | null;
    confidence?: number | null;
    internalNote?: string | null;
    version?:number;
    chatKey?:string;
  },
) => api<SendAttempt>(`/quotes/${id}/send-attempts`, { body });

export const resolveSendAttempt = (
  id: string,
  attemptId: string,
  body: { status: SendAttemptStatus; internalNote?: string | null; confidence?: number | null; createDelivery?: boolean },
) => api(`/quotes/${id}/send-attempts/${attemptId}/resolve`, { body });

export const changeQuoteState = (id: string, state: QuoteState, reason?: string | null) =>
  api(`/quotes/${id}/state`, { body: { state, reason: reason || null } });

export const reactivateQuote = (id: string, reason: string) =>
  api(`/quotes/${id}/reactivate`, { body: { reason } });

export const createQuoteVersion = (id: string, reason?: string | null, sourceVersion?: number) =>
  api<Quote>(`/quotes/${id}/version`, { body: { reason, sourceVersion } });

export const getTimeline = (id: string) => api<QuoteTimeline>(`/quotes/${id}/timeline`);
export const getLatestSentQuote = (phone: string) => api<LatestSentQuote|null>("/quotes/sent/latest", {query:{phone}});
export const generateVersionPdf = (id:string,version:number,kind:PdfKind="SIMPLE") => api(`/quotes/${id}/versions/${version}/pdf`,{body:{kind}});
export const versionPdfDownloadPath = (id:string,version:number,kind:PdfKind="SIMPLE") => `/quotes/${id}/versions/${version}/pdf/${kind}`;

/** IA siempre opcional: si el endpoint falla o está deshabilitado, el llamador cae a texto vacío editable. */
export const suggestResponse = (id: string) =>
  api<AiSuggestion>(`/quotes/${id}/ai/suggest-response`, { body: {} });

export const listNotifications = (unreadOnly = false) =>
  api<NotificationRow[]>("/notifications", { query: unreadOnly ? { unread: true, limit: 30 } : { limit: 30 } });

export const markNotification = (id: string, body: { read?: boolean; acted?: boolean }) =>
  api(`/notifications/${id}/mark`, { body });

export const listCustomers=()=>api<Customer[]>("/customers");
export const createCustomer=(body:{name:string;phone?:string|null;dni?:string|null;notes?:string|null})=>api<Customer>("/customers",{body});
export const createCustomerQuick=(phone:string)=>api<Customer&{created:boolean}>("/customers/quick",{body:{phone}});
export const updateCustomer=(id:string,body:{name:string;phone?:string|null;dni?:string|null})=>api<Customer>(`/customers/${id}`,{method:"PUT",body});
export const listProducts=(q="")=>api<Product[]>("/products",{query:{q}});
export async function searchAcustockProducts(q:string):Promise<AcustockProductSearch>{
  const first=await api<AcustockProductSearch>("/catalog",{query:{q:q||undefined,sort:"price_asc",page:1,pageSize:100}});
  const pages=Math.ceil(first.total/first.pageSize);
  if(pages<=1)return first;
  const rest=await Promise.all(Array.from({length:pages-1},(_,index)=>api<AcustockProductSearch>("/catalog",{query:{q:q||undefined,sort:"price_asc",page:index+2,pageSize:100}})));
  return{...first,items:[...first.items,...rest.flatMap(page=>page.items)]};
}
export const acustockProductImagePath=(mpn:string)=>`/catalog/${encodeURIComponent(mpn)}/image`;
export const getStoreSearchUrl=(q:string)=>api<{url:string}>("/catalog/web-search",{query:{q}});
export const generateQuoteSendMessage=(id:string,body:{chatKey:string;version?:number;recentMessages:Array<{direction:"INBOUND"|"OUTBOUND";text:string}>})=>api<{text:string;usedAi:boolean}>(`/chatbot/quotes/${id}/send-message`,{body});
export const listPcLines=()=>api<PcLine[]>("/pc-lines");
export const updateQuote=(id:string,body:{customerId?:string|null;items?:QuoteItemInput[];publicObservation?:string|null;resolvedPdfConfig?:Record<string,unknown>;pdfOverrides?:Record<string,unknown>})=>api<Quote>(`/quotes/${id}`,{method:"PUT",body});
export const updateRequest=(id:string,body:Record<string,unknown>)=>api<QuoteRequest>(`/requests/${id}`,{method:"PUT",body});
export const createQuoteVersionWithChanges=(id:string,body:{reason?:string|null;items?:QuoteItemInput[];publicObservation?:string|null;resolvedPdfConfig?:Record<string,unknown>;pdfOverrides?:Record<string,unknown>})=>api<Quote>(`/quotes/${id}/version`,{body});
export const retargetQuote=(id:string,targetTotalCents:string,previewOnly=false)=>api<Quote>(`/quotes/${id}/retarget`,{body:{targetTotalCents,previewOnly}});
export const createQuoteReply=(id:string,body:{chatPhone?:string|null;text:string;intent:ReplyIntent;confidence?:number|null;source:string;applyState?:QuoteState|null})=>api(`/quotes/${id}/replies`,{body});
export async function fetchBlob(path:string,options?:{errorMessage?:string;retry429?:number}):Promise<Blob>{const retries=Math.max(0,options?.retry429??0);for(let attempt=0;;attempt+=1){const response=await sendToBackground<{ok:boolean;status:number;bytes?:number[];contentType?:string;error?:string}>({type:"FETCH_BLOB",path});if(response?.ok&&response.bytes)return new Blob([new Uint8Array(response.bytes)],{type:response.contentType??"application/octet-stream"});if(response?.status===429&&attempt<retries){await new Promise(resolve=>window.setTimeout(resolve,600*2**attempt));continue}throw new ApiError(options?.errorMessage??response?.error??"No se pudo descargar el archivo.",response?.status??0)}}
export async function openAuthenticated(path:string):Promise<void>{const response=await sendToBackground<{ok:boolean;error?:string}>({type:"OPEN_URL",path});if(!response?.ok)throw new ApiError(response?.error??"No se pudo abrir el PDF.",0)}
export const classifyIntent=(id:string,replyText:string)=>api<{result:{intent:ReplyIntent;confidence:number};metadata:{usedAi:boolean};requiresReview:boolean}>(`/quotes/${id}/ai/intent`,{body:{replyText}});

export const getChatbotSettings=()=>api<ChatbotSettings>("/chatbot/settings");
export const updateChatbotSettings=(body:Omit<ChatbotSettings,"id"|"updatedAt">)=>api<ChatbotSettings>("/chatbot/settings",{method:"PUT",body});
export const setChatbotEnabled=(enabled:boolean)=>api<ChatbotSettings>("/chatbot/settings/enabled",{method:"PUT",body:{enabled}});
export const listChatbotConversations=()=>api<ChatbotConversation[]>("/chatbot/conversations");
export const getChatbotContext=(chatKey:string,phone?:string|null)=>api<ChatbotChatContext>(`/chatbot/context/${encodeURIComponent(chatKey)}`,{query:{phone}});
export const getChatbotConversation=(chatKey:string)=>api<ChatbotConversation>(`/chatbot/conversations/${encodeURIComponent(chatKey)}`);
export const getChatbotConversationQuote=(chatKey:string)=>api<Quote|null>(`/chatbot/conversations/${encodeURIComponent(chatKey)}/quote`);
export const updateChatbotConversation=(chatKey:string,body:{displayName?:string|null;modeOverride?:ChatbotMode|null;clearEscalation?:boolean;lastQuoteFamilyId?:string|null})=>api<ChatbotConversation>(`/chatbot/conversations/${encodeURIComponent(chatKey)}`,{method:"PUT",body});
export const queueChatbotRecontact=(chatKey:string,body:{requestId:string;displayName?:string})=>api<{action:"QUEUED";queuedAt:string}>(`/chatbot/conversations/${encodeURIComponent(chatKey)}/queue-recontact`,{body});
export const respondChatbot=(body:{chatKey:string;displayName?:string;detectedPhone?:string|null;message:string;messageType?:"TEXT"|"AUDIO";messageFingerprint:string;manualSuggestion?:boolean;simulation?:boolean;recentMessages?:Array<{direction:"INBOUND"|"OUTBOUND";text:string}>})=>api<ChatbotRespondResult>("/chatbot/respond",{body});
export const listChatbotLogs=(chatKey?:string,limit=40)=>api<ChatbotLog[]>("/chatbot/logs",{query:{chatKey,limit}});
export const actOnChatbotLog=(id:string,body:{action:"SENT"|"SEND_FAILED"|"HUMAN_SENT"|"DISMISSED"|"ATTACHMENT_SENT"|"ATTACHMENT_FAILED";text?:string;error?:string;attachment?:string})=>api<ChatbotLog>(`/chatbot/logs/${id}/action`,{body});
export const createRequestFromChatbotSuggestion=(id:string)=>api<{id:string;title:string;state:string;created:boolean}>(`/chatbot/logs/${id}/create-request`,{body:{}});
export const getRecontactCandidates=()=>api<ChatbotRecontactCandidate[]>("/chatbot/recontacts/candidates");
export const generateRecontact=(body:ChatbotRecontactInput)=>api<ChatbotRecontactResult>("/chatbot/recontact",{body});
export const markRecontactSent=(chatKey:string)=>api<ChatbotRecontactMarkResult>(`/chatbot/recontact/${encodeURIComponent(chatKey)}/mark-sent`,{body:{}});
