import type { PdfCustomBlock, PdfFlowSection } from "./types";

/** Secciones fijas del documento, en orden. No se mueven: los campos propios se intercalan entre ellas. */
export const PDF_SECTIONS: Array<{ key: Exclude<PdfFlowSection, "end">; label: string }> = [
  { key: "header", label: "Encabezado (logo y título)" },
  { key: "cards", label: "Datos del presupuesto y fiscales" },
  { key: "services", label: "Servicios incluidos" },
  { key: "items", label: "Tabla de artículos" },
  { key: "totals", label: "Totales y financiación" },
  { key: "observation", label: "Observación" },
  { key: "rma", label: "Políticas de RMA" },
  { key: "footer", label: "Pie de página" },
];

export type PdfLayer =
  | { kind: "section"; key: Exclude<PdfFlowSection, "end">; label: string }
  | { kind: "custom"; block: PdfCustomBlock };

/** Capas en orden de arriba hacia abajo: cada campo propio con `before` va justo antes de su sección. */
export function buildLayers(blocks: PdfCustomBlock[] = []): PdfLayer[] {
  const layers: PdfLayer[] = [];
  for (const section of PDF_SECTIONS) {
    for (const block of blocks) if (block.before === section.key) layers.push({ kind: "custom", block });
    layers.push({ kind: "section", ...section });
  }
  for (const block of blocks) if (block.before === "end") layers.push({ kind: "custom", block });
  return layers;
}

/** Vuelve a calcular `before` y el orden del arreglo a partir del orden de las capas. Los libres (sin `before`) no se tocan. */
export function applyLayers(blocks: PdfCustomBlock[], layers: PdfLayer[]): PdfCustomBlock[] {
  const placed: PdfCustomBlock[] = [];
  let pending: PdfCustomBlock[] = [];
  for (const layer of layers) {
    if (layer.kind === "custom") { pending.push(layer.block); continue; }
    placed.push(...pending.map((block) => ({ ...block, before: layer.key })));
    pending = [];
  }
  placed.push(...pending.map((block) => ({ ...block, before: "end" as const })));
  return [...placed, ...blocks.filter((block) => !block.before)];
}

/** Sube (-1) o baja (+1) un campo propio una capa. Un campo puede cruzar otros campos y secciones. */
export function moveCustomLayer(blocks: PdfCustomBlock[], id: string, delta: -1 | 1): PdfCustomBlock[] {
  const layers = buildLayers(blocks);
  const from = layers.findIndex((layer) => layer.kind === "custom" && layer.block.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layers.length) return blocks;
  const next = [...layers];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return applyLayers(blocks, next);
}
