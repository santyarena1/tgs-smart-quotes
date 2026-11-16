"use client";

import type { QuoteVersion } from "../lib/types";
import { webQuoteStatus } from "../lib/web-quote-status";

/** Ícono de aviso para los listados: sin stock, ya no publicado, cambió el precio o presupuesto web vencido. Vacío si no hay nada que avisar. */
export function WebQuoteWarning({ version }: { version: QuoteVersion | null | undefined }) {
  const status = webQuoteStatus(version);
  if (!status || (status.alerts.length === 0 && !status.expired)) return null;
  const lines = [...status.alerts.map((a) => a.message), ...(status.expired ? ["Presupuesto web vencido: se revisa solo cada 15 minutos."] : [])];
  return (
    <span
      className={`web-warn${status.alerts.length === 0 ? " expired" : ""}`}
      title={lines.join("\n")}
      role="img"
      aria-label={`Aviso: ${lines.join(" ")}`}
    >
      !
    </span>
  );
}

/** Explicación completa de los avisos, para el detalle del presupuesto. */
export function WebQuoteAlerts({ version, onCheck, checking }: { version: QuoteVersion | null | undefined; onCheck?: () => void; checking?: boolean }) {
  const status = webQuoteStatus(version);
  // Sin avisos y sin vencer no hay nada que mostrar: el recuadro ocupaba lugar para decir que todo está bien.
  if (!status || (status.alerts.length === 0 && !status.expired)) return null;
  const fmt = (date: Date) => date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="web-alerts" role="status">
      <strong>Presupuesto web</strong>
      {status.expiresAt ? <span> · {status.expired ? "venció" : "vence"} el {fmt(status.expiresAt)}</span> : null}
      {status.checkedAt ? <span> · última revisión {fmt(status.checkedAt)}</span> : null}
      {status.alerts.length > 0 ? (
        <ul>
          {status.alerts.map((alert, index) => (
            <li key={`${alert.type}-${alert.itemName}-${index}`}>{alert.message}</li>
          ))}
        </ul>
      ) : null}
      {onCheck ? (
        <button type="button" className="btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={onCheck} disabled={checking}>
          {checking ? "Revisando…" : "Revisar precios y stock ahora"}
        </button>
      ) : null}
    </div>
  );
}
