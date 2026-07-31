import OpenAI from "openai";

export const DEFAULT_AI_MODEL = "gpt-4o-mini";

export type OpenAiErrorInfo = {
  kind: "AUTH" | "PERMISSION" | "MODEL" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK" | "INVALID_REQUEST" | "INTERNAL_SCHEMA" | "UNKNOWN";
  status?: number;
  message: string;
};

/** Traduce errores del SDK a diagnósticos operativos seguros y específicos en español. */
export function describeOpenAiError(error: unknown): OpenAiErrorInfo {
  const value = error as {status?: number; code?: string; type?: string; name?: string; message?: string};
  const status = typeof value?.status === "number" ? value.status : undefined;
  const raw = `${value?.message ?? ""} ${value?.code ?? ""} ${value?.type ?? ""}`.toLowerCase();
  if (
    status === undefined
    && (
      raw.includes("zod field")
      || (raw.includes("schema") && raw.includes("optional") && raw.includes("nullable"))
      || raw.includes("invalid json schema")
    )
  ) {
    return {
      kind: "INTERNAL_SCHEMA",
      status,
      message: "Error interno del esquema de respuesta de IA. Reportá este error al equipo técnico.",
    };
  }
  if (status === 401 || raw.includes("invalid_api_key") || raw.includes("incorrect api key")) {
    return {kind: "AUTH", status, message: "La API key de OpenAI es inválida, fue revocada o no pertenece a una cuenta activa."};
  }
  if (status === 403 || raw.includes("permission")) {
    return {kind: "PERMISSION", status, message: "La API key no tiene permiso para usar este recurso o modelo."};
  }
  if (status === 404 || ((status === 400 || status === undefined) && raw.includes("model"))) {
    return {kind: "MODEL", status, message: "El modelo seleccionado no existe o no está habilitado para esta cuenta."};
  }
  if (status === 429 || raw.includes("rate limit") || raw.includes("quota")) {
    return {kind: "RATE_LIMIT", status, message: "OpenAI rechazó la solicitud por límite de uso, cuota o facturación."};
  }
  if (raw.includes("timeout") || value?.name?.toLowerCase().includes("timeout")) {
    return {kind: "TIMEOUT", status, message: "La conexión con OpenAI agotó el tiempo de espera."};
  }
  if (raw.includes("connection") || raw.includes("network") || raw.includes("fetch failed")) {
    return {kind: "NETWORK", status, message: "No se pudo establecer conexión de red con OpenAI."};
  }
  if (status === 400) {
    return {kind: "INVALID_REQUEST", status, message: "OpenAI rechazó la solicitud por parámetros inválidos."};
  }
  return {kind: "UNKNOWN", status, message: "OpenAI devolvió un error no identificado. Revisá el modelo, la cuenta y la conectividad."};
}

export type AiClientConfig = {
  apiKey?: string | null;
};

/** Factory del cliente OpenAI. Sin key válida devuelve `null` (fallback determinístico). */
export function createAiClient(config?: AiClientConfig): OpenAI | null {
  const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return null;
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

/** @deprecated Preferí `createAiClient`. Lee solo `OPENAI_API_KEY` del entorno. */
export const client = (): OpenAI | null => createAiClient();
