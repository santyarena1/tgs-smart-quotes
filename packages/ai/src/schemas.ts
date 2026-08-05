import { z } from "zod";

export const requestAnalysisOutputSchema = z
  .object({
    usage: z.string().nullable(),
    components: z.array(z.string()),
    budgetCents: z.number().int().nonnegative().nullable(),
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

export const chatbotResponseInputSchema = z.object({
  chatKey: z.string().min(1),
  latestMessage: z.string().min(1),
  conversationSummary: z.string().optional(),
  activeRequest: z.object({
    id: z.string(),
    title: z.string(),
    state: z.string(),
  }).strict().optional(),
  recentMessages: z.array(z.object({
    direction: z.enum(["INBOUND", "OUTBOUND"]),
    text: z.string().min(1),
  }).strict()).optional(),
  config: z.object({
    persona: z.string().min(1),
    openingMessages: z.array(z.string()),
    closingMessages: z.array(z.string()),
    responses: z.array(z.object({
      id: z.string(),
      enabled: z.boolean(),
      activators: z.array(z.string()),
      similarityThreshold: z.number().int().min(0).max(100),
      answer: z.string(),
      context: z.string(),
      attachments: z.object({
        imageUrl: z.string().nullable(),
        url: z.string().nullable(),
        quote: z.object({
          familyId: z.string(),
          version: z.number().int().nullable(),
          useLatest: z.boolean(),
        }).strict().nullable(),
      }).strict(),
    }).strict()),
    escalationInstructions: z.string(),
    modelCanEscalate: z.boolean(),
    businessContext: z.string().optional(),
    responseStyle: z.record(z.string(), z.unknown()),
    multiMessage: z.object({
      maxBubbles: z.number().int().min(1).max(5),
      splitMode: z.enum(["AI_NATURAL", "AI_PLUS_FIXED", "FIXED_ONLY"]),
    }).strict().default({maxBubbles:3,splitMode:"AI_NATURAL"}),
  }).strict(),
}).strict();
export type ChatbotResponseInput = z.infer<typeof chatbotResponseInputSchema>;

export const chatbotResponseOutputSchema = z.object({
  reply: z.string(),
  messages: z.array(z.string()).default([]),
  shouldEscalate: z.boolean(),
  escalationReason: z.string().nullable(),
  updatedSummary: z.string().nullable(),
  matchedKnowledgeIds: z.array(z.string()),
  decisionReason: z.string(),
  shouldCreateRequest: z.boolean(),
  requestDraft: z.object({
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(10000),
    expectedUse: z.string().max(1000).nullable(),
    requiredComponents: z.array(z.string().min(1).max(500)).max(100),
    maximumBudgetCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  }).strict().nullable(),
}).strict();
export type ChatbotResponseOutput = z.infer<typeof chatbotResponseOutputSchema>;
