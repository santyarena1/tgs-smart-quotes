"use client";

import type { Dispatch, SetStateAction } from "react";
import { MoneyInput } from "../components/shared";
import { formatArs, parseArsToCents } from "../lib/money";

/** Un producto que entrega el cliente como parte de pago. */
export type TradeIn = { key: string; name: string; valueArs: string };

export const tradeInCents = (t: TradeIn): bigint => {
  try { return t.valueArs.trim() ? BigInt(parseArsToCents(t.valueArs)) : 0n; } catch { return 0n; }
};

export const newTradeIn = (): TradeIn => ({ key: crypto.randomUUID(), name: "", valueArs: "" });

/** Productos entregados por el cliente: se resta del total del presupuesto. Lo usan LITE y el editor común. */
export function TradeInModal({ items, setItems, showValues, setShowValues, total, onClose, onClear }: {
  items: TradeIn[];
  setItems: Dispatch<SetStateAction<TradeIn[]>>;
  showValues: boolean;
  setShowValues: (value: boolean) => void;
  /** Total del presupuesto antes de restar lo que entrega el cliente. */
  total: bigint;
  onClose: () => void;
  onClear: () => void;
}) {
  const tradeTotal = items.reduce((sum, t) => sum + tradeInCents(t), 0n);
  const net = total > tradeTotal ? total - tradeTotal : 0n;
  const patch = (key: string, fn: (t: TradeIn) => TradeIn) => setItems((current) => current.map((t) => (t.key === key ? fn(t) : t)));

  return (
    <div className="lt-modal" role="dialog" aria-modal="true" aria-label="Productos entregados por el cliente" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lt-card lt-modal-card lt-trade-modal" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="lt-trade-head">
          <h2>Productos entregados por el cliente</h2>
          <p>Cargá a cuánto tomás cada uno. Se resta del total y de las cuotas.</p>
        </div>

        <div className="lt-trade-rows">
          {items.map((t, i) => (
            <div className="lt-trade-row" key={t.key}>
              <input className="lt-input" autoFocus={i === items.length - 1 && !t.name} value={t.name} placeholder="Producto" onChange={(e) => patch(t.key, (x) => ({ ...x, name: e.target.value }))} aria-label="Producto del cliente" />
              <MoneyInput
                className="lt-input num"
                value={t.valueArs}
                placeholder="$ valor"
                onChange={(v) => patch(t.key, (x) => ({ ...x, valueArs: v }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  // Enter en la última fila completa abre otra; en una vacía cierra.
                  if (i === items.length - 1 && t.name.trim() && tradeInCents(t) > 0n) setItems((c) => [...c, newTradeIn()]);
                  else onClose();
                }}
                aria-label="Valor del producto del cliente"
              />
              <button type="button" className="lt-x" onClick={() => setItems((c) => c.filter((x) => x.key !== t.key))} aria-label="Quitar producto del cliente">×</button>
            </div>
          ))}
        </div>
        <button type="button" className="lt-trade-add" onClick={() => setItems((c) => [...c, newTradeIn()])}>+ Agregar otro</button>

        <label className="lt-trade-check">
          <input type="checkbox" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
          <span>Mostrar a cuánto lo tomamos en el presupuesto</span>
        </label>

        <div className={`lt-trade-summary${tradeTotal > total ? " over" : ""}`}>
          <div><span>A descontar</span><strong>− {formatArs(tradeTotal)}</strong></div>
          <div><span>{tradeTotal > total ? "Supera el total" : "Precio final"}</span><strong>{formatArs(net)}</strong></div>
        </div>

        <div className="lt-modal-foot">
          <button type="button" className="lt-trade-clear" onClick={onClear}>Quitar todo</button>
          <button type="button" className="lt-btn lt-btn-amber" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
