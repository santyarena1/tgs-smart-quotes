import { z } from "zod";

export const requestAnalysisOutputSchema = z
  .object({
    usage: z.string().optional(),
    components: z.array(z.string()),
    budgetCents: z.number().int().nonnegative().nullable().optional(),
    notes: z.string(),
    confidence: z.number().int().min(0).max(100),
  })
  .strict();

export type RequestAnalysisOutput = z.infer<typeof requestAnalysisOutputSchema>;

export const requestAnalysisInputSchema = z
  .object({
    text: z.string().min(1),
  })
  .strict();

export type RequestAnalysisInput = z.infer<typeof requestAnalysisInputSchema>;

export const compatibilityItemSchema = z
  .object({
    name: z.string().min(1),
    line: z.string().optional(),
    quantity: z.number().int().positive(),
  })
  .strict();

export const compatibilityFeedbackInputSchema = z
  .object({
    items: z.array(compatibilityItemSchema).min(1),
    requestText: z.string().optional(),
    expectedUse: z.string().optional(),
  })
  .strict();

export type CompatibilityFeedbackInput = z.infer<
  typeof compatibilityFeedbackInputSchema
>;

export const compatibilityFeedbackOutputSchema = z
  .object({
    observations: z.array(z.string()),
    warnings: z.array(z.string()),
    certainty: z.number().int().min(0).max(100),
    manualChecks: z.array(z.string()),
    summary: z.string(),
  })
  .strict();

export type CompatibilityFeedbackOutput = z.infer<
  typeof compatibilityFeedbackOutputSchema
>;

export const suggestionToneSchema = z.enum([
  "AMIGABLE",
  "INTERMEDIO",
  "TECNICO",
]);

export const responseSuggestionInputSchema = z
  .object({
    tone: suggestionToneSchema,
    originalMessage: z.string().optional(),
    expectedUse: z.string().optional(),
    maxBudgetCents: z.number().int().nonnegative().nullable().optional(),
    components: z.array(z.string()).optional(),
    totalSaleCents: z.number().int().nonnegative().nullable().optional(),
    internalAnalysis: z.string().optional(),
    commercialTexts: z.array(z.string()).optional(),
  })
  .strict();

export type ResponseSuggestionInput = z.infer<
  typeof responseSuggestionInputSchema
>;

export const responseSuggestionOutputSchema = z
  .object({
    text: z.string().min(1),
  })
  .strict();

export type ResponseSuggestionOutput = z.infer<
  typeof responseSuggestionOutputSchema
>;

export const replyIntentSchema = z.enum([
  "ACEPTA",
  "RECHAZA",
  "PIDE_CAMBIO",
  "CONSULTA",
  "AMBIGUA",
]);

export const intentClassificationInputSchema = z
  .object({
    replyText: z.string().min(1),
    context: z.string().optional(),
  })
  .strict();

export type IntentClassificationInput = z.infer<
  typeof intentClassificationInputSchema
>;

export const intentClassificationOutputSchema = z
  .object({
    intent: replyIntentSchema,
    confidence: z.number().int().min(0).max(100),
  })
  .strict();

export type IntentClassificationOutput = z.infer<
  typeof intentClassificationOutputSchema
>;

export const semanticCandidateSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

export const semanticSimilarityInputSchema = z
  .object({
    candidateA: semanticCandidateSchema,
    candidateB: semanticCandidateSchema,
    deterministicScore: z.number().min(0).max(100).optional(),
  })
  .strict();

export type SemanticSimilarityInput = z.infer<
  typeof semanticSimilarityInputSchema
>;

export const semanticSimilarityOutputSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    preferred: z.enum(["A", "B", "TIE"]),
    rationale: z.string(),
  })
  .strict();

export type SemanticSimilarityOutput = z.infer<
  typeof semanticSimilarityOutputSchema
>;
