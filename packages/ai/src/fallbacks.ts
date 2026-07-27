import { productSimilarity } from "@tgs/validation";
import type {
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

const COMPONENT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(procesador|cpu|ryzen|core i[3579]|i[3579]-?\d{4,5})\b/i, label: "procesador" },
  { re: /\b(mother|motherboard|placa madre|am4|am5|lga\s?\d{4})\b/i, label: "motherboard" },
  { re: /\b(ram|memoria|ddr4|ddr5)\b/i, label: "memoria RAM" },
  { re: /\b(gpu|placa de video|rtx|gtx|radeon|rx\s?\d{3,4})\b/i, label: "placa de video" },
  { re: /\b(ssd|nvme|disco|hdd|almacenamiento)\b/i, label: "almacenamiento" },
  { re: /\b(fuente|psu|80 plus)\b/i, label: "fuente de poder" },
  { re: /\b(gabinete|case)\b/i, label: "gabinete" },
  { re: /\b(cooler|refrigeraci[oó]n|watercooling|aio)\b/i, label: "refrigeración" },
];

const USAGE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(juego|gaming|gamer|fps|stream)\b/i, label: "gaming" },
  { re: /\b(oficina|office|excel|word)\b/i, label: "oficina" },
  { re: /\b(dise[ñn]o|photoshop|premiere|render|3d|blender)\b/i, label: "diseño/edición" },
  { re: /\b(estudio|universidad|clases)\b/i, label: "estudio" },
];

function normalizeForMatch(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractBudgetCents(text: string): number | null {
  const normalized = normalizeForMatch(text);
  const patterns = [
    /(?:presupuesto|budget|hasta|maximo|m[aá]ximo|tengo|dispongo)\s*(?:de|:)?\s*\$?\s*([\d.,]+)\s*(mil|k|millones?|m)?/i,
    /\$\s*([\d.,]+)\s*(mil|k|millones?|m)?/i,
    /([\d.,]+)\s*(?:mil|k)\s*(?:pesos|ars|\$)?/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const raw = match[1].replace(/\./g, "").replace(",", ".");
    const base = Number.parseFloat(raw);
    if (!Number.isFinite(base) || base <= 0) {
      continue;
    }
    const unit = match[2]?.toLowerCase();
    const multiplier =
      unit === "mil" || unit === "k"
        ? 1_000
        : unit?.startsWith("millon") || unit === "m"
          ? 1_000_000
          : base < 10_000
            ? 1_000
            : 1;
    const pesos = unit ? base * multiplier : base;
    return Math.round(pesos * 100);
  }
  return null;
}

export function fallbackRequestAnalysis(
  input: RequestAnalysisInput,
): RequestAnalysisOutput {
  const text = input.text;
  const normalized = normalizeForMatch(text);
  const components = COMPONENT_PATTERNS.filter(({ re }) => re.test(text)).map(
    ({ label }) => label,
  );
  const usage = USAGE_PATTERNS.find(({ re }) => re.test(text))?.label;
  const budgetCents = extractBudgetCents(text);
  const notes: string[] = [];
  if (!usage) {
    notes.push("No se detectó un uso claro; confirmar con el cliente.");
  }
  if (components.length === 0) {
    notes.push("Sin componentes explícitos en el texto.");
  }
  if (budgetCents === null) {
    notes.push("Presupuesto no mencionado o ambiguo.");
  }
  return {
    usage,
    components,
    budgetCents,
    notes: notes.length
      ? notes.join(" ")
      : "Análisis heurístico sin IA. Revisar manualmente.",
    confidence: usage || components.length || budgetCents !== null ? 45 : 25,
  };
}

const LINE_HINTS: Array<{ line: RegExp; key: string }> = [
  { line: /\b(cpu|procesador)\b/i, key: "procesador" },
  { line: /\b(mother|motherboard|placa madre)\b/i, key: "motherboard" },
  { line: /\b(ram|memoria)\b/i, key: "memoria" },
  { line: /\b(gpu|video|rtx|gtx|radeon)\b/i, key: "gpu" },
  { line: /\b(ssd|nvme|disco|hdd|almacenamiento)\b/i, key: "almacenamiento" },
  { line: /\b(fuente|psu)\b/i, key: "fuente" },
  { line: /\b(gabinete)\b/i, key: "gabinete" },
];

function itemBlob(item: { name: string; line?: string }): string {
  return `${item.line ?? ""} ${item.name}`.trim();
}

export function fallbackCompatibilityFeedback(
  input: CompatibilityFeedbackInput,
): CompatibilityFeedbackOutput {
  const observations: string[] = [];
  const warnings: string[] = [];
  const manualChecks: string[] = [];

  const blobs = input.items.map(itemBlob);
  const allText = blobs.join(" ").toLowerCase();

  const hasDdr4 = /\bddr4\b/i.test(allText);
  const hasDdr5 = /\bddr5\b/i.test(allText);
  if (hasDdr4 && hasDdr5) {
    warnings.push("Hay referencias mixtas a DDR4 y DDR5; verificar socket y memoria.");
    manualChecks.push("Confirmar tipo de RAM compatible con la motherboard.");
  }

  const present = new Set<string>();
  for (const item of input.items) {
    const blob = itemBlob(item);
    for (const hint of LINE_HINTS) {
      if (hint.line.test(blob) || (item.line && hint.line.test(item.line))) {
        present.add(hint.key);
      }
    }
  }
  for (const required of ["procesador", "motherboard", "memoria", "almacenamiento", "fuente"]) {
    if (!present.has(required)) {
      warnings.push(`No se detectó ${required} en la lista de ítems.`);
    }
  }
  if (!present.has("gpu") && input.expectedUse?.match(/gaming|juego|stream/i)) {
    observations.push(
      "Uso orientado a gaming sin GPU explícita; puede ser APU o componente omitido.",
    );
    manualChecks.push("Confirmar si lleva placa de video dedicada.");
  }

  if (/\b(rtx 40|rx 7)\b/i.test(allText) && /\b(i3|ryzen 3|celeron|pentium)\b/i.test(allText)) {
    observations.push(
      "GPU de gama media/alta con CPU de entrada: posible cuello de botella en CPU.",
    );
  }

  if (/\b(550w|500w|450w|400w)\b/i.test(allText) && /\b(4080|4090|7900 xtx|7950)\b/i.test(allText)) {
    warnings.push("Fuente de bajo wattaje declarada con GPU exigente; verificar margen.");
    manualChecks.push("Validar wattaje real recomendado de la GPU.");
  }

  manualChecks.push("Verificar socket CPU/motherboard y clearances físicos.");

  const summary =
    warnings.length > 0
      ? "Revisión heurística: hay puntos a confirmar antes de confirmar la configuración."
      : "Revisión heurística sin alertas graves; igualmente verificar manualmente.";

  return {
    observations,
    warnings,
    certainty: warnings.length ? 40 : 55,
    manualChecks,
    summary,
  };
}

function formatMoney(cents: number | null | undefined): string | null {
  if (cents == null) {
    return null;
  }
  const pesos = cents / 100;
  return `$${pesos.toLocaleString("es-AR")}`;
}

export function fallbackResponseSuggestion(
  input: ResponseSuggestionInput,
): ResponseSuggestionOutput {
  const use = input.expectedUse ?? "tu uso";
  const budget = formatMoney(input.maxBudgetCents ?? undefined);
  const components =
    input.components?.length ? input.components.join(", ") : "los componentes cotizados";
  const price = formatMoney(input.totalSaleCents ?? undefined);

  const intro: Record<ResponseSuggestionInput["tone"], string> = {
    AMIGABLE: "¡Hola! Te paso la propuesta armada para vos.",
    INTERMEDIO: "Hola, te comparto la configuración cotizada.",
    TECNICO: "Buenas. Detallo la configuración evaluada según tu pedido.",
  };

  const body: Record<ResponseSuggestionInput["tone"], string> = {
    AMIGABLE: `Pensamos esta PC para ${use}. Incluye ${components}.`,
    INTERMEDIO: `La PC está orientada a ${use}, con ${components}.`,
    TECNICO: `Configuración seleccionada para ${use}: ${components}.`,
  };

  const parts = [intro[input.tone], body[input.tone]];
  if (price) {
    parts.push(`El total cotizado es ${price}.`);
  }
  if (budget) {
    parts.push(`Tenemos en cuenta tu presupuesto de referencia (${budget}).`);
  }
  parts.push(
    "Es un análisis orientativo; cualquier duda técnica la revisamos juntos antes de cerrar.",
  );
  if (input.commercialTexts?.length) {
    parts.push(input.commercialTexts[0]!);
  }

  return { text: parts.join(" ") };
}

const ACCEPT = /\b(dale|ok|acepto|aceptar|confirmo|confirmar|si\b|s[ií]\s*gracias|perfecto|de acuerdo|vamos)\b/i;
const REJECT = /\b(no\b|rechazo|rechazar|paso|caro|no me cierra|no gracias|no quiero)\b/i;
const CHANGE = /\b(cambiar|modificar|otra|distinto|ajustar|subir|bajar|mejor|alternativa)\b/i;
const CONSULT = /\?|(\b(cuanto|cuánto|como|cómo|cuando|cuándo|precio|stock|disponible|consulta)\b)/i;

export function fallbackIntentClassification(
  input: IntentClassificationInput,
): IntentClassificationOutput {
  const text = normalizeForMatch(input.replyText);
  if (ACCEPT.test(text) && !REJECT.test(text)) {
    return { intent: "ACEPTA", confidence: 60 };
  }
  if (REJECT.test(text)) {
    return { intent: "RECHAZA", confidence: 60 };
  }
  if (CHANGE.test(text)) {
    return { intent: "PIDE_CAMBIO", confidence: 55 };
  }
  if (CONSULT.test(text)) {
    return { intent: "CONSULTA", confidence: 50 };
  }
  return { intent: "AMBIGUA", confidence: 30 };
}

export function fallbackSemanticSimilarity(
  input: SemanticSimilarityInput,
): SemanticSimilarityOutput {
  const score = productSimilarity(input.candidateA.label, input.candidateB.label);
  const preferred: SemanticSimilarityOutput["preferred"] =
    score >= 60 ? "A" : score <= 40 ? "B" : "TIE";
  return {
    score,
    preferred,
    rationale:
      "Similitud determinística por tokens y modelos (fallback sin IA). Solo para desempate ambiguo.",
  };
}
