import { api, downloadAuthenticated } from "../lib/api";

export type PdfKind = "SIMPLE" | "DETALLADO";

/** Genera (si hace falta) y descarga el PDF de la versión activa de un presupuesto. */
export async function downloadQuotePdf(quoteId: string, visibleNumber: string, kind: PdfKind): Promise<void> {
  await api(`/quotes/${quoteId}/pdf`, { method: "POST", body: { kind } });
  await downloadAuthenticated(`/quotes/${quoteId}/pdf/${kind}`, `${visibleNumber}-${kind}.pdf`);
}
