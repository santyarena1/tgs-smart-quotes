import { formatArs } from "./money";
import type { QuoteVersion } from "./types";

export type WebAlertRow = { type: "OUT_OF_STOCK" | "PRICE_CHANGED" | "NOT_FOUND"; itemName: string; message: string; at: string };

export type WebQuoteStatus = {
  alerts: WebAlertRow[];
  expiresAt: Date | null;
  checkedAt: Date | null;
  expired: boolean;
  /** Total del presupuesto común contra el web, para el detalle. */
  compareSaleCents: string | null;
  compareText: string;
};

const asDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Estado del presupuesto web de una versión; null si no es un presupuesto web. */
export function webQuoteStatus(version: QuoteVersion | null | undefined, now = new Date()): WebQuoteStatus | null {
  if (!version?.webMeta) return null;
  const alerts = Array.isArray(version.alertsJson) ? version.alertsJson : [];
  const expiresAt = asDate(version.expiresAt);
  const compare = version.webMeta.compareSaleCents ?? null;
  let compareText = "";
  if (compare) {
    const original = BigInt(compare);
    const web = BigInt(version.totalSaleCents);
    const diff = web - original;
    const sign = diff >= 0n ? "+" : "−";
    const abs = diff >= 0n ? diff : -diff;
    const pct = original > 0n ? ` (${sign}${(Number((abs * 10_000n) / original) / 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %)` : "";
    compareText = `Comparación: presupuesto común ${formatArs(original.toString())} · presupuesto web ${formatArs(web.toString())} · diferencia ${sign}${formatArs(abs.toString())}${pct}`;
  }
  return {
    alerts,
    expiresAt,
    checkedAt: asDate(version.checkedAt),
    expired: Boolean(expiresAt && expiresAt.getTime() <= now.getTime()),
    compareSaleCents: compare,
    compareText,
  };
}
