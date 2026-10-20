/**
 * Destino del rewrite `/api → backend`.
 *
 * En Railway el hostname interno (`*.railway.internal`) está bien: el web
 * y la API viven en la misma red. En Vercel ese DNS es privado y el rewrite
 * revienta con `DNS_HOSTNAME_RESOLVED_PRIVATE` (login, health, todo).
 */
export const PUBLIC_RAILWAY_API = "https://api-production-a604.up.railway.app/api";

const LOCAL_API = "http://127.0.0.1:3001/api";

export function isUnusableOnVercel(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".railway.internal")) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
    return true;
  }
  return false;
}

export type ProxyEnv = {
  API_PROXY_TARGET?: string;
  API_PUBLIC_URL?: string;
  VERCEL?: string;
};

export function resolveApiProxyTarget(env: ProxyEnv): string {
  const onVercel = Boolean(env.VERCEL);
  const candidates = [
    env.API_PROXY_TARGET,
    env.API_PUBLIC_URL,
    onVercel ? PUBLIC_RAILWAY_API : LOCAL_API,
  ];
  for (const raw of candidates) {
    const cleaned = raw?.trim().replace(/\/$/, "") ?? "";
    if (!cleaned) continue;
    if (onVercel && isUnusableOnVercel(cleaned)) continue;
    return cleaned;
  }
  return onVercel ? PUBLIC_RAILWAY_API : LOCAL_API;
}
