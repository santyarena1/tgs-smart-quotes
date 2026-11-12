"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { centsToInput, formatArs, parseArsToCents, pctFromCostAndSale } from "../lib/money";
import type { NodoResult, WebResult } from "../lib/nodo";
import {
  hasWifi,
  matchWebComponent,
  quantityUnits,
  webQuoteExtras,
  wifiCents,
  WIFI_NAME,
  type FixedLines,
} from "../lib/web-quote";
import { Alert, errorMessage, MoneyInput, Modal } from "./shared";

export type WebQuoteComponent = { name: string; quantity: string; saleArs: string };

export type WebLinePrice = {
  name: string;
  costArs: string;
  saleArs: string;
  markupPct: string;
  imageUrl: string | null;
  ivaBps: number | null;
};

export type WebQuoteApply = {
  /** null = el producto no está en la tienda: se deja el ítem como estaba. */
  components: Array<WebLinePrice | null>;
  extras: WebLinePrice[];
  wifiNote: string;
  noticeSuffix: string;
};

const EMPTY_FIXED: FixedLines = { assembly: true, warranty: true, windows: true, wifi: true };

function linePrice(name: string, saleCents: bigint, costCents: bigint, imageUrl: string | null, ivaBps: number | null): WebLinePrice {
  const saleArs = centsToInput(saleCents);
  const costArs = centsToInput(costCents) || "0";
  return {
    name,
    costArs,
    saleArs,
    markupPct: pctFromCostAndSale(costArs, saleArs),
    imageUrl,
    ivaBps,
  };
}

/**
 * Modal compartido por la versión común y LITE.
 * El presupuesto que confirma este botón es el único que pide precios por componente en el PDF.
 */
export function WebQuoteModal({
  open,
  busy,
  components,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  components: WebQuoteComponent[];
  onClose: () => void;
  /** Vacío si el presupuesto se creó. Un texto si hay que seguir en el modal. */
  onConfirm: (result: WebQuoteApply) => Promise<string | null>;
}) {
  const [fixed, setFixed] = useState<FixedLines>(EMPTY_FIXED);
  const [free, setFree] = useState<Array<{ key: string; name: string; priceArs: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pcHasWifi = hasWifi(components);
  const locked = busy || searching;

  useEffect(() => {
    if (!open) return;
    setFixed({ ...EMPTY_FIXED, wifi: !pcHasWifi });
    setFree([]);
    setLocalError(null);
  }, [open, pcHasWifi]);

  async function confirm() {
    if (locked) return;
    setLocalError(null);
    const freeRows = free.filter((row) => row.name.trim() || row.priceArs.trim());
    for (const row of freeRows) {
      try {
        if (!row.name.trim() || BigInt(parseArsToCents(row.priceArs)) <= 0n) throw new Error();
      } catch {
        setLocalError("Cada ítem libre necesita un nombre y un precio válido.");
        return;
      }
    }
    setSearching(true);
    try {
      const noWeb: string[] = [];
      const noNodo: string[] = [];
      const priced: Array<WebLinePrice | null> = [];
      const names: Array<{ name: string; totalCents: bigint }> = [];
      for (const item of components) {
        const qty = quantityUnits(item.quantity);
        const found = await matchWebComponent(
          item.name,
          async (q) => (await api<{ items: WebResult[] }>("/web-products/search", { query: { q } })).items,
          async (q) => (await api<{ items: NodoResult[] }>("/nodo/search", { query: { q } })).items,
        );
        if (!found.web) {
          noWeb.push(item.name.trim());
          priced.push(null);
          names.push({ name: item.name, totalCents: BigInt(parseArsToCents(item.saleArs)) * qty });
          continue;
        }
        const saleCents = BigInt(found.web.priceCents);
        const imageUrl = found.web.imageUrl ?? found.nodo?.imageUrl ?? null;
        const name = found.web.name.toLocaleUpperCase("es-AR");
        if (!found.nodo) {
          noNodo.push(found.web.name);
          priced.push(linePrice(name, saleCents, saleCents, imageUrl, null));
        } else {
          priced.push(linePrice(name, saleCents, BigInt(found.nodo.costIvaCents), imageUrl, found.nodo.ivaBps ?? null));
        }
        names.push({ name, totalCents: saleCents * qty });
      }
      const extras = webQuoteExtras(names, fixed).map((line) => linePrice(line.name, line.priceCents, line.costCents, null, null));
      const freeLines = freeRows.map((row) => {
        const sale = BigInt(parseArsToCents(row.priceArs));
        return linePrice(row.name.trim().toLocaleUpperCase("es-AR"), sale, sale, null, null);
      });
      const wifiNote = fixed.wifi && !hasWifi(names)
        ? `Agregado opcional (no incluido en el total): ${WIFI_NAME} - ${formatArs(wifiCents(names).toString())}.`
        : "";
      const noticeSuffix =
        (noWeb.length ? ` No encontré en la web (se dejó el precio cargado): ${noWeb.join("; ")}.` : "") +
        (noNodo.length ? ` Sin costo en NODO (costo = precio web): ${noNodo.join("; ")}.` : "") +
        (fixed.wifi && hasWifi(names) ? " La PC ya incluye WiFi, no se agregó el opcional." : "");
      const failure = await onConfirm({
        components: priced,
        extras: [...extras, ...freeLines],
        wifiNote,
        noticeSuffix,
      });
      if (failure) setLocalError(failure);
      else onClose();
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Crear Presupuesto Web"
      onClose={() => { if (!locked) onClose(); }}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={locked}>
            Cancelar
          </button>
          <button type="button" className="btn-web" onClick={() => void confirm()} disabled={locked}>
            {searching ? "Buscando precios web…" : busy ? "Creando…" : "Crear Presupuesto Web"}
          </button>
        </>
      }
    >
      {localError ? <Alert>{localError}</Alert> : null}
      <p>
        Cada componente pasa al precio final de thegamershop.com.ar con su costo de NODO. En este presupuesto el PDF muestra el precio de cada componente. Tildá las líneas fijas que querés sumar:
      </p>
      <div className="form-grid">
        <label className="check-row">
          <input type="checkbox" checked={fixed.assembly} onChange={(e) => setFixed((current) => ({ ...current, assembly: e.target.checked }))} />
          <span>Armado ($ 45.000 básico · $ 75.000 con placa de video · $ 90.000 con placa de video y refrigeración líquida)</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={fixed.warranty} onChange={(e) => setFixed((current) => ({ ...current, warranty: e.target.checked }))} />
          <span>Garantía extendida TGS (7 % del total de los componentes, sin armado ni licencias)</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={fixed.windows} onChange={(e) => setFixed((current) => ({ ...current, windows: e.target.checked }))} />
          <span>Licencia Windows 11 Pro ($ 65.000, costo $ 8.500)</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={fixed.wifi}
            disabled={pcHasWifi}
            onChange={(e) => setFixed((current) => ({ ...current, wifi: e.target.checked }))}
          />
          <span>
            Agregar placa WiFi PCIe como opcional ($ 18.200 en la PC básica, $ 47.400 si tiene placa de video o refrigeración líquida). No suma al total: sale en las observaciones del PDF.
            {pcHasWifi ? " Esta PC ya incluye WiFi." : ""}
          </span>
        </label>
      </div>
      <h4 style={{ margin: "1rem 0 0.4rem" }}>Ítems libres</h4>
      {free.map((row) => (
        <div key={row.key} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input
            style={{ flex: 1 }}
            placeholder="Descripción (ej. Cable HDMI, Mouse pad)"
            value={row.name}
            onChange={(e) => setFree((current) => current.map((item) => (item.key === row.key ? { ...item, name: e.target.value } : item)))}
          />
          <MoneyInput
            className="money-input"
            placeholder="Precio"
            value={row.priceArs}
            onChange={(value) => setFree((current) => current.map((item) => (item.key === row.key ? { ...item, priceArs: value } : item)))}
          />
          <button type="button" className="btn-danger btn-sm" onClick={() => setFree((current) => current.filter((item) => item.key !== row.key))}>
            Quitar
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={() => setFree((current) => [...current, { key: crypto.randomUUID(), name: "", priceArs: "" }])}>
        + Agregar ítem libre
      </button>
    </Modal>
  );
}
