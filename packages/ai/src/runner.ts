import type OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType, z } from "zod";
import { DEFAULT_AI_MODEL, describeOpenAiError } from "./client.js";
import { inputHash } from "./hash.js";
import type {
  AiEntityRef,
  AiRunOptions,
  AiServiceDeps,
  AiServiceMetadata,
  AiServiceResult,
  AiTask,
  AiTokenUsage,
} from "./types.js";

type RunAiTaskParams<TInput, TOutput> = {
  task: AiTask;
  input: TInput;
  hashPayload: unknown;
  schema: ZodType<TOutput>;
  schemaName: string;
  systemPrompt: string;
  buildUserPrompt: (input: TInput) => string;
  fallback: (input: TInput) => TOutput;
  deps: AiServiceDeps;
  options?: AiRunOptions;
};

function extractUsage(
  raw: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
): AiTokenUsage | undefined {
  if (!raw) {
    return undefined;
  }
  return {
    promptTokens: raw.prompt_tokens,
    completionTokens: raw.completion_tokens,
    totalTokens: raw.total_tokens,
  };
}

function buildMetadata(
  partial: Omit<AiServiceMetadata, "costUsdCents"> & { costUsdCents?: bigint },
): AiServiceMetadata {
  return {
    ...partial,
    costUsdCents: partial.costUsdCents ?? 0n,
  };
}

export async function runAiTask<TInput, TOutput>(
  params: RunAiTaskParams<TInput, TOutput>,
): Promise<AiServiceResult<TOutput>> {
  const started = Date.now();
  const model = params.deps.model ?? DEFAULT_AI_MODEL;
  const cacheRepo = params.options?.cache ?? params.deps.cache;
  const hash = inputHash(params.hashPayload);
  const entity: AiEntityRef = params.options?.entity ?? {};

  if (!params.options?.regenerate && cacheRepo?.findCached) {
    const cached = await cacheRepo.findCached(params.task, hash);
    if (cached?.resultJson != null) {
      const parsed = params.schema.safeParse(cached.resultJson);
      if (parsed.success) {
        const durationMs = Date.now() - started;
        return {
          result: parsed.data,
          metadata: buildMetadata({
            task: params.task,
            inputHash: hash,
            model: cached.model,
            usedAi: true,
            cacheHit: true,
            durationMs,
            success: true,
          }),
        };
      }
    }
  }

  const openai = params.deps.client;
  if (!openai) {
    const result = params.fallback(params.input);
    const durationMs = Date.now() - started;
    const metadata = buildMetadata({
      task: params.task,
      inputHash: hash,
      model: "fallback",
      usedAi: false,
      cacheHit: false,
      durationMs,
      success: true,
    });
    await persist(cacheRepo, {
      task: params.task,
      model: metadata.model,
      inputHash: hash,
      success: true,
      durationMs,
      resultJson: result,
      ...entity,
    });
    return { result, metadata };
  }

  try {
    const completion = await openai.chat.completions.parse({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.buildUserPrompt(params.input) },
      ],
      response_format: zodResponseFormat(params.schema, params.schemaName),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error("La respuesta del modelo no pudo parsearse.");
    }

    const usage = extractUsage(completion.usage);
    const durationMs = Date.now() - started;
    const metadata = buildMetadata({
      task: params.task,
      inputHash: hash,
      model,
      usedAi: true,
      cacheHit: false,
      durationMs,
      success: true,
      usage,
    });

    await persist(cacheRepo, {
      task: params.task,
      model,
      inputHash: hash,
      success: true,
      durationMs,
      usageJson: usage,
      resultJson: parsed,
      ...entity,
    });

    return { result: parsed, metadata };
  } catch (error) {
    const result = params.fallback(params.input);
    const durationMs = Date.now() - started;
    const message = describeOpenAiError(error).message;
    const metadata = buildMetadata({
      task: params.task,
      inputHash: hash,
      model: "fallback",
      usedAi: false,
      cacheHit: false,
      durationMs,
      success: false,
      error: message,
    });

    await persist(cacheRepo, {
      task: params.task,
      model: metadata.model,
      inputHash: hash,
      success: false,
      error: message,
      durationMs,
      resultJson: result,
      ...entity,
    });

    return { result, metadata };
  }
}

async function persist(
  cacheRepo: AiRunOptions["cache"] | undefined,
  record: Parameters<NonNullable<NonNullable<AiRunOptions["cache"]>["save"]>>[0],
): Promise<void> {
  if (cacheRepo?.save) {
    await cacheRepo.save(record);
  }
}

export type { z };
