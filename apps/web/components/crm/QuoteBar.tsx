"use client";

import { useState } from "react";
import { createCrmQuoteVersion, type WhatsappConversation } from "../../lib/api";
import { formatArs } from "../../lib/money";
import type { Quote } from "../../lib/types";
import { errorMessage } from "../shared";
import { approveQuote, quoteAtVersion, quoteItemsPreview } from "./modals";

/**
 * Barra del presupuesto asociado a la conversación.
 *
 * Es el equivalente a la franja que la extensión dibujaba sobre WhatsApp Web:
 * número, versión vigente, estado, total y las acciones de siempre.
 */
export function QuoteBar({
  quote,
  version,
  conversation,
  onVersionChange,
  onSend,
  onHistory,
  onPickAnother,
  onChanged,
  onNotice,
}: {
  quote: Quote;
  version: number;
  conversation: WhatsappConversation;
  onVersionChange: (version: number) => void;
  onSend: () => void;
  onHistory: () => void;
  onPickAnother: () => void;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = quoteAtVersion(quote, version);
  const state = selected.version?.state ?? "—";
  const versions = quote.versions?.length ? quote.versions : quote.version ? [quote.version] : [];
  // Aprobar solo tiene sentido sobre la versión activa: las anteriores están congeladas.
  const isActiveVersion = version === quote.activeVersion;

  async function run(action: () => Promise<unknown>, notice: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      onNotice(notice);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-quotebar">
      <div className="crm-quotebar-main">
        <span className="crm-quotebar-num">{quote.visibleNumber}</span>
        <select
          className="crm-select crm-quotebar-ver"
          value={version}
          onChange={(event) => onVersionChange(Number(event.target.value))}
          aria-label="Versión vigente para este chat"
        >
          {versions.map((item) => (
            <option key={item.id} value={item.version}>V{item.version} · {item.state}</option>
          ))}
        </select>
        <span className="crm-tag">{state}</span>
        <strong className="crm-quotebar-total">{formatArs(selected.version?.totalSaleCents)}</strong>
      </div>

      <p className="crm-hint crm-quotebar-items" title={quoteItemsPreview(selected)}>
        {quoteItemsPreview(selected)}
      </p>

      <div className="crm-quotebar-actions">
        <button
          type="button"
          className="btn-dark btn-sm"
          onClick={onSend}
          disabled={busy || !conversation.window.open}
          title={conversation.window.open ? "" : "La ventana de 24 h está cerrada"}
        >
          📤 Enviar
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy || state === "ACEPTADO" || !isActiveVersion}
          title={isActiveVersion ? "" : "Solo se puede aprobar la versión activa"}
          onClick={() => void run(() => approveQuote(quote), "Presupuesto marcado como aceptado.")}
        >
          ✓ Aprobar
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy}
          onClick={() => void run(
            () => createCrmQuoteVersion(quote.id, `Nueva versión desde el CRM (base V${version})`, version),
            "Versión nueva creada en borrador.",
          )}
        >
          ✏️ Nueva versión
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onHistory} disabled={busy}>
          🕘 Historial
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onPickAnother} disabled={busy}>
          🔍 Elegir otro
        </button>
        <a className="crm-link" href={`/presupuestos?quote=${encodeURIComponent(quote.id)}`}>
          Abrir completo →
        </a>
      </div>

      {error ? <p className="crm-quotebar-error">{error}</p> : null}
    </div>
  );
}
