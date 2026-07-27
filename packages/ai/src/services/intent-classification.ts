import { fallbackIntentClassification } from "../fallbacks.js";
import { runAiTask } from "../runner.js";
import {
  intentClassificationInputSchema,
  intentClassificationOutputSchema,
  type IntentClassificationInput,
  type IntentClassificationOutput,
} from "../schemas.js";
import { AiTask, type AiRunOptions, type AiServiceDeps, type AiServiceResult } from "../types.js";

const SYSTEM = `Clasificás la intención del cliente en respuestas de WhatsApp sobre presupuestos de PC.
Intents: ACEPTA, RECHAZA, PIDE_CAMBIO, CONSULTA, AMBIGUA.
confidence: 0-100. Ante duda usá AMBIGUA con baja confianza.
No cambies estados ni precios; solo clasificá.`;

export class IntentClassificationService {
  constructor(private readonly deps: AiServiceDeps) {}

  async classify(
    input: IntentClassificationInput,
    options?: AiRunOptions,
  ): Promise<AiServiceResult<IntentClassificationOutput>> {
    const parsed = intentClassificationInputSchema.parse(input);
    return runAiTask({
      task: AiTask.INTENT_CLASSIFICATION,
      input: parsed,
      hashPayload: {
        replyText: parsed.replyText.trim(),
        context: parsed.context?.trim() ?? null,
      },
      schema: intentClassificationOutputSchema,
      schemaName: "intent_classification",
      systemPrompt: SYSTEM,
      buildUserPrompt: (value) =>
        [
          `Mensaje del cliente:\n"""${value.replyText.trim()}"""`,
          value.context ? `Contexto:\n${value.context}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      fallback: fallbackIntentClassification,
      deps: this.deps,
      options,
    });
  }
}
