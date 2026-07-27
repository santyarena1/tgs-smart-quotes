import OpenAI from "openai";

export const DEFAULT_AI_MODEL = "gpt-4o-mini";

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
