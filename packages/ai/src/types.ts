import type OpenAI from "openai";

/** Tareas persistidas en Prisma (`AiTaskType`) + clasificación de intención. */
export const AiTask = {
  REQUEST_ANALYSIS: "REQUEST_ANALYSIS",
  COMPATIBILITY: "COMPATIBILITY",
  RESPONSE_SUGGESTION: "RESPONSE_SUGGESTION",
  SEMANTIC_SIMILARITY: "SEMANTIC_SIMILARITY",
  INTENT_CLASSIFICATION: "INTENT_CLASSIFICATION",
  CHATBOT_RESPONSE: "CHATBOT_RESPONSE",
} as const;

export type AiTask = (typeof AiTask)[keyof typeof AiTask];

export type SuggestionTone = "AMIGABLE" | "INTERMEDIO" | "TECNICO";

export type ReplyIntent =
  | "ACEPTA"
  | "RECHAZA"
  | "PIDE_CAMBIO"
  | "CONSULTA"
  | "AMBIGUA";

export type AiTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AiServiceMetadata = {
  task: AiTask;
  inputHash: string;
  model: string;
  usedAi: boolean;
  cacheHit: boolean;
  durationMs: number;
  success: boolean;
  error?: string;
  usage?: AiTokenUsage;
  costUsdCents: bigint;
};

export type AiServiceResult<T> = {
  result: T;
  metadata: AiServiceMetadata;
};

export type AiEntityRef = {
  entityType?: string;
  entityId?: string;
  requestId?: string;
};

export type AiCacheRecord = {
  task: AiTask;
  model: string;
  inputHash: string;
  success: boolean;
  error?: string;
  durationMs?: number;
  usageJson?: AiTokenUsage;
  costUsdCents?: bigint;
  resultJson: unknown;
  cacheHit?: boolean;
} & AiEntityRef;

/** Callback opcional para leer/escribir cache (`AiRequest` / `SimilarityCache`) desde la API. */
export type AiCacheRepo = {
  findCached?: (
    task: AiTask,
    inputHash: string,
  ) => Promise<{ resultJson: unknown; model: string } | null>;
  save?: (record: AiCacheRecord) => Promise<void>;
};

export type AiRunOptions = {
  cache?: AiCacheRepo;
  entity?: AiEntityRef;
  /** Si es true, ignora cache existente. */
  regenerate?: boolean;
};

export type AiServiceDeps = {
  client: OpenAI | null;
  model?: string;
  cache?: AiCacheRepo;
};
