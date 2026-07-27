import { fallbackResponseSuggestion } from "../fallbacks.js";
import { runAiTask } from "../runner.js";
import {
  responseSuggestionInputSchema,
  responseSuggestionOutputSchema,
  type ResponseSuggestionInput,
  type ResponseSuggestionOutput,
} from "../schemas.js";
import { AiTask, type AiRunOptions, type AiServiceDeps, type AiServiceResult } from "../types.js";

const SYSTEM = `Redactás mensajes comerciales de WhatsApp para The Gamer Shop (Argentina).
El vendedor editará el texto; no envíes por tu cuenta.
Reglas:
- Explicá por qué la PC encaja con el pedido.
- Respetá el tono indicado (AMIGABLE, INTERMEDIO, TECNICO).
- No inventes FPS, stock, descuentos ni compatibilidad garantizada.
- No cambies condiciones comerciales ni precios (solo mencioná totales provistos).
Respondé JSON con campo text (mensaje editable, español rioplatense).`;

export class ResponseSuggestionService {
  constructor(private readonly deps: AiServiceDeps) {}

  async suggest(
    input: ResponseSuggestionInput,
    options?: AiRunOptions,
  ): Promise<AiServiceResult<ResponseSuggestionOutput>> {
    const parsed = responseSuggestionInputSchema.parse(input);
    return runAiTask({
      task: AiTask.RESPONSE_SUGGESTION,
      input: parsed,
      hashPayload: {
        tone: parsed.tone,
        originalMessage: parsed.originalMessage?.trim() ?? null,
        expectedUse: parsed.expectedUse?.trim() ?? null,
        maxBudgetCents: parsed.maxBudgetCents ?? null,
        components: parsed.components?.map((c) => c.trim()) ?? [],
        totalSaleCents: parsed.totalSaleCents ?? null,
        internalAnalysis: parsed.internalAnalysis?.trim() ?? null,
        commercialTexts: parsed.commercialTexts ?? [],
      },
      schema: responseSuggestionOutputSchema,
      schemaName: "response_suggestion",
      systemPrompt: SYSTEM,
      buildUserPrompt: (value) =>
        JSON.stringify(
          {
            tone: value.tone,
            originalMessage: value.originalMessage,
            expectedUse: value.expectedUse,
            maxBudgetCents: value.maxBudgetCents,
            components: value.components,
            totalSaleCents: value.totalSaleCents,
            internalAnalysis: value.internalAnalysis,
            commercialTexts: value.commercialTexts,
          },
          null,
          2,
        ),
      fallback: fallbackResponseSuggestion,
      deps: this.deps,
      options,
    });
  }
}
