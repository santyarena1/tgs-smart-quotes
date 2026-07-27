/**
 * Service worker MV3. Único punto que hace fetch a la API (el content script en web.whatsapp.com
 * no puede hacer fetch cross-origin confiable por CSP) y el único que puede disparar descargas.
 * Nunca automatiza el envío de WhatsApp: solo proxya la API y descarga PDFs.
 */
const API_BASE = "http://localhost:3001/api";
const EXTENSION_VERSION = "1.0.0";

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("TGS extension ready", EXTENSION_VERSION);
});

type ApiMessage = { type: "API"; path: string; init?: RequestInit };
type DownloadMessage = { type: "DOWNLOAD"; path: string; filename?: string };
type PingMessage = { type: "PING" };
type FetchBlobMessage = { type: "FETCH_BLOB"; path: string };
type OpenUrlMessage = { type: "OPEN_URL"; path: string };
type Message = ApiMessage | DownloadMessage | PingMessage | FetchBlobMessage | OpenUrlMessage;

async function probeConnection(): Promise<{
  ok: boolean;
  extensionVersion: string;
  apiBase: string;
  healthOk: boolean;
  sessionOk: boolean;
  user?: { username?: string; displayName?: string | null };
  error?: string;
}> {
  const base = {
    extensionVersion: EXTENSION_VERSION,
    apiBase: API_BASE,
  };
  try {
    const healthRes = await fetch(buildUrl("/health"), { credentials: "include" });
    const healthOk = healthRes.ok;
    if (!healthOk) {
      return { ok: false, ...base, healthOk: false, sessionOk: false, error: `Health HTTP ${healthRes.status}` };
    }
    const meRes = await fetch(buildUrl("/auth/me"), { credentials: "include" });
    if (meRes.status === 401) {
      return {
        ok: false,
        ...base,
        healthOk: true,
        sessionOk: false,
        error: "API reachable pero sin sesión. Iniciá sesión en http://localhost:3000",
      };
    }
    if (!meRes.ok) {
      return {
        ok: false,
        ...base,
        healthOk: true,
        sessionOk: false,
        error: `auth/me HTTP ${meRes.status}`,
      };
    }
    const me = (await meRes.json()) as { user?: { username?: string; displayName?: string | null } };
    return {
      ok: true,
      ...base,
      healthOk: true,
      sessionOk: true,
      user: me.user,
    };
  } catch (error) {
    return {
      ok: false,
      ...base,
      healthOk: false,
      sessionOk: false,
      error: String(error),
    };
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    void probeConnection().then(sendResponse);
    return true;
  }

  if (message?.type === "API") {
    const url = buildUrl(message.path);
    fetch(url, { ...message.init, credentials: "include" })
      .then(async (response) => {
        const text = await response.text();
        let data: unknown = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { message: text };
          }
        }
        sendResponse({ ok: response.ok, status: response.status, data });
      })
      .catch((error: unknown) => {
        sendResponse({ ok: false, status: 0, error: String(error) });
      });
    return true;
  }


  if (message?.type === "FETCH_BLOB") {
    fetch(buildUrl(message.path), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) { sendResponse({ ok: false, status: response.status, error: `PDF HTTP ${response.status}` }); return; }
        const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
        sendResponse({ ok: true, status: response.status, bytes, contentType: response.headers.get("content-type") ?? "application/pdf" });
      })
      .catch((error: unknown) => sendResponse({ ok: false, status: 0, error: String(error) }));
    return true;
  }

  if (message?.type === "OPEN_URL") {
    chrome.tabs.create({ url: buildUrl(message.path) }, () => sendResponse({ ok: !chrome.runtime.lastError, error: chrome.runtime.lastError?.message }));
    return true;
  }
  if (message?.type === "DOWNLOAD") {
    const url = buildUrl(message.path);
    try {
      chrome.downloads.download({ url, filename: message.filename, saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message ?? "No se pudo iniciar la descarga.",
          });
          return;
        }
        sendResponse({ ok: true, downloadId });
      });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
    return true;
  }

  return false;
});

/** Permite que la web TGS (localhost:3000) pregunte si el plugin está instalado y conectado. */
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TGS_PING" || message?.type === "PING") {
    void probeConnection().then(sendResponse);
    return true;
  }
  return false;
});
