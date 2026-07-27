import { fallbackCompatibilityFeedback } from "../fallbacks.js";
import { runAiTask } from "../runner.js";
import {
  compatibilityFeedbackInputSchema,
  compatibilityFeedbackOutputSchema,
  type CompatibilityFeedbackInput,
  type CompatibilityFeedbackOutput,
} from "../schemas.js";
import { AiTask, type AiRunOptions, type AiServiceDeps, type AiServiceResult } from "../types.js";

const SYSTEM = `Sos un revisor técnico interno de PCs en The Gamer Shop.
Dá feedback conciso sobre compatibilidad orientativa de una lista de componentes.
Reglas estrictas:
- Nunca garantices compatibilidad absoluta.
- No inventes FPS ni benchmarks.
- Señalá cuellos de botella plausibles solo si hay evidencia en los nombres.
- Indicá verificaciones manuales (socket, RAM, wattaje, clearances).
Respondé JSON con observations, warnings, certainty (0-100), manualChecks y summary breve.`;

export class CompatibilityFeedbackService {
  constructor(private readonly deps: AiServiceDeps) {}

  async evaluate(
    input: CompatibilityFeedbackInput,
    options?: AiRunOptions,
  ): Promise<AiServiceResult<CompatibilityFeedbackOutput>> {
    const parsed = compatibilityFeedbackInputSchema.parse(input);
    return runAiTask({
      task: AiTask.COMPATIBILITY,
      input: parsed,
      hashPayload: {
        items: parsed.items.map((item) => ({
          name: item.name.trim(),
          line: item.line?.trim() ?? null,
          quantity: item.quantity,
        })),
        requestText: parsed.requestText?.trim() ?? null,
        expectedUse: parsed.expectedUse?.trim() ?? null,
      },
      schema: compatibilityFeedbackOutputSchema,
      schemaName: "compatibility_feedback",
      systemPrompt: SYSTEM,
      buildUserPrompt: (value) => {
        const lines = value.items
          .map((item) => `- ${item.quantity}x ${item.line ? `[${item.line}] ` : ""}${item.name}`)
          .join("\n");
        return [
          "Componentes:",
          lines,
          value.expectedUse ? `Uso esperado: ${value.expectedUse}` : "",
          value.requestText ? `Solicitud original: ${value.requestText}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      },
      fallback: fallbackCompatibilityFeedback,
      deps: this.deps,
      options,
    });
  }
}
