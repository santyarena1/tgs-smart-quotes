import { fallbackSemanticSimilarity } from "../fallbacks.js";
import { runAiTask } from "../runner.js";
import {
  semanticSimilarityInputSchema,
  semanticSimilarityOutputSchema,
  type SemanticSimilarityInput,
  type SemanticSimilarityOutput,
} from "../schemas.js";
import { AiTask, type AiRunOptions, type AiServiceDeps, type AiServiceResult } from "../types.js";

const SYSTEM = `Desempatás similitud semántica entre dos candidatos (productos o presupuestos) solo en zona ambigua.
Usá el score determinístico provisto como referencia, no lo ignores.
Respondé JSON: score 0-100, preferred A|B|TIE, rationale breve en español.
No inventes atributos que no estén en las etiquetas.`;

export class SemanticSimilarityService {
  constructor(private readonly deps: AiServiceDeps) {}

  async compare(
    input: SemanticSimilarityInput,
    options?: AiRunOptions,
  ): Promise<AiServiceResult<SemanticSimilarityOutput>> {
    const parsed = semanticSimilarityInputSchema.parse(input);
    return runAiTask({
      task: AiTask.SEMANTIC_SIMILARITY,
      input: parsed,
      hashPayload: {
        candidateA: {
          label: parsed.candidateA.label.trim(),
          description: parsed.candidateA.description?.trim() ?? null,
        },
        candidateB: {
          label: parsed.candidateB.label.trim(),
          description: parsed.candidateB.description?.trim() ?? null,
        },
        deterministicScore: parsed.deterministicScore ?? null,
      },
      schema: semanticSimilarityOutputSchema,
      schemaName: "semantic_similarity",
      systemPrompt: SYSTEM,
      buildUserPrompt: (value) =>
        JSON.stringify(
          {
            candidateA: value.candidateA,
            candidateB: value.candidateB,
            deterministicScore: value.deterministicScore,
          },
          null,
          2,
        ),
      fallback: fallbackSemanticSimilarity,
      deps: this.deps,
      options,
    });
  }
}
