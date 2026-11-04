"use client";

import { useMemo, useState } from "react";
import type { FinancingPlan } from "../lib/types";
import type { PdfQuickOptions } from "./lite-pdf";

type Kind = "DETALLADO" | "FORMAL";

type Resolved = Required<PdfQuickOptions>;

const DEFAULTS: Resolved = { showTotal: true, itemInstallments: [], showFinancing: true, showCashTransfer: true, showIvaBreakdown: true, showObservation: true };

const storageKey = (kind: Kind) => `tgs-lite-pdf-options-${kind}`;

/** Lo último que se eligió para ese tipo de PDF (si el navegador no deja guardar, arranca con todo visible). */
function loadSaved(kind: Kind): Resolved {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) return DEFAULTS;
    const d = JSON.parse(raw) as Partial<Resolved>;
    return {
      showTotal: d.showTotal !== false,
      itemInstallments: Array.isArray(d.itemInstallments) ? d.itemInstallments.filter((n) => Number.isInteger(n) && n > 0) : [],
      showFinancing: d.showFinancing !== false,
      showCashTransfer: d.showCashTransfer !== false,
      showIvaBreakdown: d.showIvaBreakdown !== false,
      showObservation: d.showObservation !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Ajustes rápidos del PDF detallado / formal: qué se muestra y qué no, solo para este presupuesto. */
export function PdfOptionsModal({ kind, plans, busy, onConfirm, onCancel }: {
  kind: Kind;
  plans: FinancingPlan[];
  busy?: boolean;
  onConfirm: (options: PdfQuickOptions) => void;
  onCancel: () => void;
}) {
  const formal = kind === "FORMAL";
  const [opts, setOpts] = useState<Resolved>(() => loadSaved(kind));
  const counts = useMemo(() => [...new Set(plans.map((p) => p.installments))].filter((n) => n > 1).sort((a, b) => a - b), [plans]);
  // Las cuotas guardadas que ya no existen en Configuración se descartan.
  const chosen = opts.itemInstallments.filter((n) => counts.includes(n));
  const perItem = chosen.length > 0;
  const set = <K extends keyof Resolved>(key: K, value: Resolved[K]) => setOpts((o) => ({ ...o, [key]: value }));
  const toggleCount = (n: number) => set("itemInstallments", chosen.includes(n) ? chosen.filter((x) => x !== n) : [...chosen, n].sort((a, b) => a - b));

  function confirm() {
    const final: Resolved = { ...opts, itemInstallments: chosen };
    try { window.localStorage.setItem(storageKey(kind), JSON.stringify(final)); } catch { /* sin almacenamiento: no pasa nada */ }
    onConfirm(final);
  }

  const row = (label: string, hint: string | null, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className={`lt-po-row${disabled ? " off" : ""}`}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );

  return (
    <div className="lt-modal" role="dialog" aria-modal="true" aria-label="Ajustes rápidos del PDF" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="lt-card lt-modal-card lt-po-modal" onKeyDown={(e) => { if (e.key === "Escape" && !busy) onCancel(); }}>
        <div className="lt-trade-head">
          <h2>{formal ? "Presupuesto formal" : "PDF detallado"} · ajustes rápidos</h2>
          <p>Elegí qué se muestra en este PDF. Solo vale para este presupuesto.</p>
        </div>

        <div className="lt-po-list">
          {row("Mostrar el precio total", perItem ? "Se oculta porque mostrás cuotas por producto." : "El precio de lista al pie del presupuesto.", opts.showTotal, (v) => set("showTotal", v), perItem)}

          {counts.length ? (
            <div className="lt-po-block">
              <div className="lt-po-label">
                <b>Mostrar cuotas debajo del precio de cada producto</b>
                <small>Elegí cuáles. Si marcás alguna, el precio total no se muestra.</small>
              </div>
              <div className="lt-po-chips">
                {counts.map((n) => (
                  <button key={n} type="button" className={`lt-po-chip${chosen.includes(n) ? " on" : ""}`} aria-pressed={chosen.includes(n)} onClick={() => toggleCount(n)}>{n} cuotas</button>
                ))}
              </div>
            </div>
          ) : null}

          {formal
            ? row("Mostrar efectivo / transferencia y cheque", "Los otros medios de pago al pie del presupuesto.", opts.showCashTransfer, (v) => set("showCashTransfer", v))
            : (
              <>
                {row("Mostrar efectivo / transferencia", "El precio con descuento por pagar al contado.", opts.showCashTransfer, (v) => set("showCashTransfer", v))}
                {row("Mostrar información de cuotas y bancos", "El bloque de financiación con BBVA, otros bancos, Mercado Pago, etc.", opts.showFinancing, (v) => set("showFinancing", v))}
                {row("Mostrar la observación", "El texto de observación del presupuesto, si tiene.", opts.showObservation, (v) => set("showObservation", v))}
              </>
            )}
          {row("Desglosar el IVA por producto", "Precio sin IVA, IVA y precio con IVA. Apagado queda solo el precio unitario.", opts.showIvaBreakdown, (v) => set("showIvaBreakdown", v))}
        </div>

        <div className="lt-modal-foot">
          <button type="button" className="lt-trade-clear" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="lt-btn lt-btn-amber" onClick={confirm} disabled={busy} autoFocus>Crear y descargar PDF</button>
        </div>
      </div>
    </div>
  );
}
