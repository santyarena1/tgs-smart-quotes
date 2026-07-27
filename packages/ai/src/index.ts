export { createAiClient, client, DEFAULT_AI_MODEL } from "./client.js";
export { canonicalize, inputHash } from "./hash.js";
export { runAiTask } from "./runner.js";
export {
  fallbackCompatibilityFeedback,
  fallbackIntentClassification,
  fallbackRequestAnalysis,
  fallbackResponseSuggestion,
  fallbackSemanticSimilarity,
} from "./fallbacks.js";
export {
  compatibilityFeedbackInputSchema,
  compatibilityFeedbackOutputSchema,
  intentClassificationInputSchema,
  intentClassificationOutputSchema,
  requestAnalysisInputSchema,
  requestAnalysisOutputSchema,
  responseSuggestionInputSchema,
  responseSuggestionOutputSchema,
  semanticSimilarityInputSchema,
  semanticSimilarityOutputSchema,
  suggestionToneSchema,
  replyIntentSchema,
} from "./schemas.js";
export type {
  CompatibilityFeedbackInput,
  CompatibilityFeedbackOutput,
  IntentClassificationInput,
  IntentClassificationOutput,
  RequestAnalysisInput,
  RequestAnalysisOutput,
  ResponseSuggestionInput,
  ResponseSuggestionOutput,
  SemanticSimilarityInput,
  SemanticSimilarityOutput,
} from "./schemas.js";
export {
  AiTask,
  type AiCacheRecord,
  type AiCacheRepo,
  type AiEntityRef,
  type AiRunOptions,
  type AiServiceDeps,
  type AiServiceMetadata,
  type AiServiceResult,
  type AiTokenUsage,
  type ReplyIntent,
  type SuggestionTone,
} from "./types.js";
export type { AiClientConfig } from "./client.js";
export { RequestAnalysisService } from "./services/request-analysis.js";
export { CompatibilityFeedbackService } from "./services/compatibility-feedback.js";
export { ResponseSuggestionService } from "./services/response-suggestion.js";
export { IntentClassificationService } from "./services/intent-classification.js";
export { SemanticSimilarityService } from "./services/semantic-similarity.js";

import { CompatibilityFeedbackService } from "./services/compatibility-feedback.js";
import { IntentClassificationService } from "./services/intent-classification.js";
import { RequestAnalysisService } from "./services/request-analysis.js";
import { ResponseSuggestionService } from "./services/response-suggestion.js";
import { SemanticSimilarityService } from "./services/semantic-similarity.js";
import type { AiServiceDeps } from "./types.js";

/** Agrupa servicios con dependencias compartidas (cliente + modelo + cache por defecto). */
export function createAiServices(deps: AiServiceDeps) {
  return {
    requestAnalysis: new RequestAnalysisService(deps),
    compatibility: new CompatibilityFeedbackService(deps),
    responseSuggestion: new ResponseSuggestionService(deps),
    intentClassification: new IntentClassificationService(deps),
    semanticSimilarity: new SemanticSimilarityService(deps),
  };
}
