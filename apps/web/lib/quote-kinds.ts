/** Tipos de PDF de un presupuesto (Normal = SIMPLE) con sus colores: Normal rojo, Detallado amarillo, Formal azul. */
export type PdfKind = "SIMPLE" | "DETALLADO" | "FORMAL";

export const KINDS: Array<[PdfKind, string]> = [["SIMPLE", "Normal"], ["DETALLADO", "Detallado"], ["FORMAL", "Formal"]];
export const KIND_LABEL = Object.fromEntries(KINDS) as Record<PdfKind, string>;

type PdfLike = { kind: PdfKind; createdAt: string };

/** Tipo con el que se ve un presupuesto: el del último PDF que se generó; si todavía no tiene ninguno, Normal. */
export function quoteKind(pdfs: PdfLike[] | undefined | null): PdfKind {
  const latest = [...(pdfs ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest?.kind ?? "SIMPLE";
}

/** Todos los tipos de PDF que tiene generados (un mismo presupuesto puede tener normal, detallado y formal). */
export function madeKinds(pdfs: PdfLike[] | undefined | null): Array<[PdfKind, string]> {
  return KINDS.filter(([kind]) => (pdfs ?? []).some((pdf) => pdf.kind === kind));
}
