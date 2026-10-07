import { api, downloadAuthenticated } from "../lib/api";

export type PdfKind = "SIMPLE" | "DETALLADO" | "FORMAL";

/** Genera (si hace falta) y descarga el PDF de la versión activa de un presupuesto. */
export async function downloadQuotePdf(quoteId: string, visibleNumber: string, kind: PdfKind): Promise<void> {
  await api(`/quotes/${quoteId}/pdf`, { method: "POST", body: { kind } });
  await downloadAuthenticated(`/quotes/${quoteId}/pdf/${kind}`, `${visibleNumber}-${kind}.pdf`);
}

/** Genera el PDF y lo abre en otra pestaña (el visor permite imprimir). La pestaña se abre antes para evitar el bloqueo de popups. */
export async function printQuotePdf(quoteId: string, kind: PdfKind): Promise<void> {
  const tab = window.open("about:blank", "_blank");
  try {
    await api(`/quotes/${quoteId}/pdf`, { method: "POST", body: { kind } });
    const url = `/api/quotes/${quoteId}/pdf/${kind}`;
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener");
  } catch (err) {
    tab?.close();
    throw err;
  }
}
