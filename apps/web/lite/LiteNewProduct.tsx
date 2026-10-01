"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { parseArsToCents, pctToBps } from "../lib/money";
import { applyDraftCost, applyDraftMarkup, applyDraftSale, itemPricePayload } from "../lib/quote-item-pricing";
import type { Product } from "../lib/types";
import { errorMessage, MoneyInput } from "../components/shared";

/** Alta rápida de un producto del catálogo desde el creador (nombre, costo y margen o precio de venta). */
export function LiteNewProduct({ initialName, lineId, onCreated, onCancel }: {
  initialName: string;
  lineId: string;
  onCreated: (product: Product) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState({ costArs: "", markupPct: "30", saleArs: "", priceMode: "markup" as "markup" | "sale" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) { setError("Poné un nombre."); return; }
    if (!price.costArs.trim()) { setError("Poné el costo."); return; }
    setBusy(true);
    setError(null);
    try {
      const pricing = itemPricePayload(price);
      const created = await api<Product>("/products", {
        method: "POST",
        body: {
          name: name.trim(),
          costCents: parseArsToCents(price.costArs),
          markupBps: price.priceMode === "sale" ? 0 : pctToBps(price.markupPct),
          ...(pricing.salePriceCents !== undefined ? { salePriceCents: pricing.salePriceCents } : {}),
          usesGeneralMarkup: false,
          defaultLineId: lineId || null,
          active: true,
        },
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="lt-modal" role="dialog" aria-modal="true" aria-label="Producto nuevo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="lt-card lt-modal-card" onSubmit={(e) => void submit(e)} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
        <h2>Producto nuevo</h2>
        <p className="lt-muted">Se guarda en el catálogo y se agrega al presupuesto.</p>
        {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
        <label className="lt-field">Nombre
          <input className="lt-input" autoFocus={!initialName} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="lt-modal-grid">
          <label className="lt-field">Costo
            <MoneyInput className="lt-input num" autoFocus={Boolean(initialName)} value={price.costArs} onChange={(v) => setPrice((p) => applyDraftCost(p, v))} placeholder="0" />
          </label>
          <label className="lt-field">Margen %
            <input className="lt-input num" inputMode="decimal" value={price.markupPct} onChange={(e) => setPrice((p) => applyDraftMarkup(p, e.target.value))} />
          </label>
          <label className="lt-field">Precio de venta
            <MoneyInput className="lt-input num" value={price.saleArs} onChange={(v) => setPrice((p) => applyDraftSale(p, v))} placeholder="0" />
          </label>
        </div>
        <div className="lt-modal-foot">
          <button type="button" className="lt-btn ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="lt-btn" disabled={busy}>{busy ? "Guardando…" : "Crear y agregar"}</button>
        </div>
      </form>
    </div>
  );
}
