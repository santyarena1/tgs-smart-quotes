import type { RecontactCandidate, RecontactHistoryItem } from "./types";

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
  accessTokenMasked: string;
  appSecretMasked: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  updatedAt: string | null;
};

export type WhatsappSettingsInput = {
  enabled: boolean;
  phoneNumberId?: string;
  businessAccountId?: string;
  apiVersion: string;
  accessToken?: string;
  appSecret?: string;
};

export function getWhatsappSettings(): Promise<WhatsappSettings> {
  return api<WhatsappSettings>('/whatsapp/settings');
}

export function updateWhatsappSettings(body: WhatsappSettingsInput): Promise<WhatsappSettings> {
  return api<WhatsappSettings>('/whatsapp/settings', {method: 'PUT', body});
}

export function sendWhatsappTestMessage(to: string, text: string): Promise<{id: string; waMessageId: string | null}> {
  return api('/whatsapp/send-test', {method: 'POST', body: {to, text}});
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
