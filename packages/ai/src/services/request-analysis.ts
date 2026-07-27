import { fallbackRequestAnalysis } from "../fallbacks.js";
import { runAiTask } from "../runner.js";
import {
  requestAnalysisInputSchema,
  requestAnalysisOutputSchema,
  type RequestAnalysisInput,
  type RequestAnalysisOutput,
} from "../schemas.js";
import { AiTask, type AiRunOptions, type AiServiceDeps, type AiServiceResult } from "../types.js";

const SYSTEM = `Sos un asistente de The Gamer Shop (Argentina). Analizá solicitudes de presupuesto de PC.
Extraé uso, componentes pedidos, presupuesto en centavos ARS si aparece, y notas breves.
Nunca inventes precios ni generes presupuestos. Respondé solo JSON estructurado.
confidence: 0-100 según claridad del texto.`;

export class RequestAnalysisService {
  constructor(private readonly deps: AiServiceDeps) {}

  async analyze(
    input: RequestAnalysisInput,
    options?: AiRunOptions,
  ): Promise<AiServiceResult<RequestAnalysisOutput>> {
    const parsed = requestAnalysisInputSchema.parse(input);
    return runAiTask({
      task: AiTask.REQUEST_ANALYSIS,
      input: parsed,
      hashPayload: { text: parsed.text.trim() },
      schema: requestAnalysisOutputSchema,
      schemaName: "request_analysis",
      systemPrompt: SYSTEM,
      buildUserPrompt: (value) =>
        `Texto de solicitud:\n"""${value.text.trim()}"""\n\nExtraé usage, components (lista), budgetCents (entero centavos ARS o null), notes y confidence.`,
      fallback: fallbackRequestAnalysis,
      deps: this.deps,
      options,
    });
  }
}
