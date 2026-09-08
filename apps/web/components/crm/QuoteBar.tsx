"use client";

import { useEffect, useRef, useState } from "react";
import { api, createCrmQuoteVersion, type WhatsappConversation } from "../../lib/api";
import { formatArs } from "../../lib/money";
import type { Quote } from "../../lib/types";
import { errorMessage } from "../shared";
import { approveQuote, quoteAtVersion, quoteItemsPreview } from "./modals";
import {
  IconCheck,
  IconChevronDown,
  IconClock,
  IconClose,
  IconDots,
  IconExternal,
  IconPencil,
  IconSearch,
  IconSend,
} from "./icons";

/**
 * Barra del presupuesto vinculado a la conversación.
 *
 * Tres zonas alineadas —identidad, total, acciones— con una sola acción
 * principal. El resto vive en el menú: cuatro botones compitiendo hacían que la
 * fila se pisara con nombres largos y no dejaban claro qué se espera que hagas.
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
  onUnlink,
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
  onUnlink: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const selected = quoteAtVersion(quote, version);
  const state = selected.version?.state ?? "—";
  const versions = quote.versions?.length ? quote.versions : quote.version ? [quote.version] : [];
  // Aprobar solo aplica a la versión activa: las anteriores están congeladas.
  const isActiveVersion = version === quote.activeVersion;
  const windowOpen = conversation.window.open;

  async function run(action: () => Promise<unknown>, notice: string) {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
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
    <div className={`crm-quotebar${isActiveVersion ? "" : " historical"}`}>
      <div className="crm-quotebar-info">
        <div className="crm-quotebar-line">
          <span className="crm-quotebar-num">{quote.visibleNumber}</span>
          <label className="crm-quotebar-ver">
            <select
              value={version}
              onChange={(event) => onVersionChange(Number(event.target.value))}
              aria-label="Versión vigente para este chat"
            >
              {versions.map((item) => (
                <option key={item.id} value={item.version}>V{item.version}</option>
              ))}
            </select>
            <IconChevronDown size={11} />
          </label>
          <span className={`crm-tag ${isActiveVersion ? "violet" : "muted"}`}>
            {isActiveVersion ? state : "Versión anterior"}
          </span>
        </div>
        <p className="crm-quotebar-items" title={quoteItemsPreview(selected)}>
          {quoteItemsPreview(selected)}
        </p>
      </div>

      <div className="crm-quotebar-total">
        <span className="crm-quotebar-total-label">Total</span>
        <strong>{formatArs(selected.version?.totalSaleCents)}</strong>
      </div>

      <div className="crm-quotebar-actions" ref={menuRef}>
        <button
          type="button"
          className="btn-dark btn-sm crm-icon-btn"
          onClick={onSend}
          disabled={busy || !windowOpen}
          title={windowOpen ? "" : "La ventana de 24 h está cerrada"}
        >
          <IconSend size={14} /> Enviar
        </button>
        <button
          type="button"
          className={menuOpen ? "btn-dark btn-sm crm-only-icon" : "btn-ghost btn-sm crm-only-icon"}
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Más acciones del presupuesto"
          aria-expanded={menuOpen}
          disabled={busy}
        >
          <IconDots size={15} />
        </button>

        {menuOpen ? (
          <div className="crm-menu" role="menu">
            {isActiveVersion && state !== "ACEPTADO" ? (
              <button type="button" className="crm-menu-item ok" onClick={() => void run(() => approveQuote(quote), "Presupuesto marcado como aceptado.")}>
                <IconCheck size={15} /> Aprobar presupuesto
              </button>
            ) : null}
            <button
              type="button"
              className="crm-menu-item"
              onClick={() => void run(
                () => createCrmQuoteVersion(quote.id, `Nueva versión desde el CRM (base V${version})`, version),
                "Versión nueva creada en borrador.",
              )}
            >
              <IconPencil size={15} /> Crear versión nueva
            </button>
            <button type="button" className="crm-menu-item" onClick={() => { setMenuOpen(false); onHistory(); }}>
              <IconClock size={15} /> Historial de cambios
            </button>
            <button type="button" className="crm-menu-item" onClick={() => { setMenuOpen(false); onPickAnother(); }}>
              <IconSearch size={15} /> Elegir otro presupuesto
            </button>
            <div className="crm-menu-sep" />
            <a className="crm-menu-item" href={`/presupuestos?quote=${encodeURIComponent(quote.id)}`}>
              <IconExternal size={15} /> Abrir en Presupuestos
            </a>
            <button
              type="button"
              className="crm-menu-item danger"
              onClick={() => void run(onUnlink, "El presupuesto se desvinculó de la conversación.")}
            >
              <IconClose size={15} /> Desvincular del chat
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="crm-quotebar-error">{error}</p> : null}
    </div>
  );
}
