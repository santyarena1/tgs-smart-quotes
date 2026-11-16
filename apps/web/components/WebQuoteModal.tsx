"use client";

import { useEffect, useState } from "react";
import type { QuoteWebMeta, WebQuotePrefs } from "@tgs/contracts";
import { api } from "../lib/api";
import { centsToInput, formatArs, parseArsToCents, pctFromCostAndSale } from "../lib/money";
import type { NodoProvider, NodoResult, WebResult } from "../lib/nodo";
import {
  hasWifi,
  matchWebComponent,
  quantityUnits,
  webQuoteExtras,
  wifiCents,
} from "../lib/web-quote";
import { Alert, errorMessage, MoneyInput, Modal } from "./shared";

/** Producto de la tienda ya elegido en el buscador: no hace falta volver a buscarlo. */
export type WebPick = { id: number; name: string; sku: string | null; priceCents: string; imageUrl: string | null };

export type WebQuoteComponent = { name: string; quantity: string; saleArs: string; web?: WebPick | null };

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
  /** Datos para revalidar contra la tienda (2 días), para el bloque naranja del WiFi y para la comparación. */
  webMeta: QuoteWebMeta;
  /** Total del presupuesto común contra el del presupuesto web, en centavos. */
  compare: { originalCents: bigint; webCents: bigint };
  noticeSuffix: string;
};

/** Solo estos distribuidores dan el costo del presupuesto web. */
const COST_PROVIDER_RE = /invid|elit|new\s?-?bytes/i;

const DEFAULT_PREFS: WebQuotePrefs = { assembly: true, warranty: true, windows: true, wifi: true };

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

const sumCents = (rows: Array<{ saleArs: string }>) => rows.reduce((sum, row) => sum + BigInt(parseArsToCents(row.saleArs)), 0n);

/** "+X %" o "−X %" entre dos totales; vacío si no hay base. */
export function compareLabel(originalCents: bigint, webCents: bigint): string {
  const diff = webCents - originalCents;
  const sign = diff >= 0n ? "+" : "−";
  const abs = diff >= 0n ? diff : -diff;
  const pct = originalCents > 0n ? ` (${sign}${(Number((abs * 10_000n) / originalCents) / 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %)` : "";
  return `Presupuesto común ${formatArs(originalCents.toString())} · Presupuesto web ${formatArs(webCents.toString())} · diferencia ${sign}${formatArs(abs.toString())}${pct}`;
}

/**
 * Modal compartido por la versión común y LITE: la lista de líneas que lleva el presupuesto web.
 * Lo que el usuario tilda queda guardado en su cuenta para los próximos presupuestos.
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
  const [prefs, setPrefs] = useState<WebQuotePrefs>(DEFAULT_PREFS);
  const [free, setFree] = useState<Array<{ key: string; name: string; priceArs: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pcHasWifi = hasWifi(components);
  const locked = busy || searching;

  useEffect(() => {
    if (!open) return;
    setFree([]);
    setLocalError(null);
    let cancelled = false;
    api<WebQuotePrefs>("/me/web-quote-preferences")
      .then((saved) => { if (!cancelled) setPrefs({ ...DEFAULT_PREFS, ...saved }); })
      .catch(() => { /* si no se puede leer, quedan todas tildadas */ });
    return () => { cancelled = true; };
  }, [open]);

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
      // El costo sale solo de INVID, ELIT y NEW BYTES.
      let providerIds = "";
      try {
        const providers = await api<{ items: NodoProvider[] }>("/nodo/providers");
        providerIds = providers.items.filter((p) => COST_PROVIDER_RE.test(p.name)).map((p) => p.id).join(",");
      } catch {
        /* sin lista de distribuidores se busca en todos */
      }
      const searchNodo = async (q: string) =>
        (await api<{ items: NodoResult[] }>("/nodo/search", { query: { q, ...(providerIds ? { provider: providerIds } : {}) } })).items;

      const noWeb: string[] = [];
      const noNodo: string[] = [];
      const priced: Array<WebLinePrice | null> = [];
      const names: Array<{ name: string; totalCents: bigint }> = [];
      const metaItems: QuoteWebMeta["items"] = [];
      for (const item of components) {
        const qty = quantityUnits(item.quantity);
        const found = item.web
          ? await matchWebComponent(
              item.name,
              async () => [{ id: item.web!.id, name: item.web!.name, sku: item.web!.sku, priceCents: item.web!.priceCents, imageUrl: item.web!.imageUrl }],
              searchNodo,
            )
          : await matchWebComponent(
              item.name,
              async (q) => (await api<{ items: WebResult[] }>("/web-products/search", { query: { q } })).items,
              searchNodo,
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
        metaItems.push({ name, webProductId: found.web.id, sku: found.web.sku, priceCents: found.web.priceCents, quantity: Number(qty) });
      }
      const extras = webQuoteExtras(names, { assembly: true, warranty: prefs.warranty, windows: prefs.windows }).map((line) =>
        linePrice(line.name, line.priceCents, line.costCents, null, null),
      );
      const freeLines = freeRows.map((row) => {
        const sale = BigInt(parseArsToCents(row.priceArs));
        return linePrice(row.name.trim().toLocaleUpperCase("es-AR"), sale, sale, null, null);
      });
      const offerWifi = prefs.wifi && !hasWifi(names);

      const originalCents = components.reduce((sum, c) => sum + BigInt(parseArsToCents(c.saleArs)) * quantityUnits(c.quantity), 0n);
      const webCents = names.reduce((sum, c) => sum + c.totalCents, 0n) + sumCents(extras) + sumCents(freeLines);
      const webMeta: QuoteWebMeta = {
        wifiCents: offerWifi ? wifiCents(names).toString() : null,
        compareSaleCents: originalCents.toString(),
        items: metaItems,
      };
      const noticeSuffix =
        ` ${compareLabel(originalCents, webCents)}.` +
        (noWeb.length ? ` No encontré en la web (se dejó el precio cargado): ${noWeb.join("; ")}.` : "") +
        (noNodo.length ? ` Sin costo en INVID, ELIT ni NEW BYTES (costo = precio web): ${noNodo.join("; ")}.` : "") +
        (prefs.wifi && hasWifi(names) ? " La PC ya incluye WiFi, no se ofreció la placa." : "");
      const failure = await onConfirm({
        components: priced,
        extras: [...extras, ...freeLines],
        webMeta,
        compare: { originalCents, webCents },
        noticeSuffix,
      });
      if (failure) {
        setLocalError(failure);
      } else {
        // Se recuerda lo que tildó para los próximos presupuestos.
        void api("/me/web-quote-preferences", { method: "PUT", body: { ...prefs, assembly: true } }).catch(() => undefined);
        onClose();
      }
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <Modal
      open={open}
      title="CREAR PRESUPUESTO WEB"
      onClose={() => { if (!locked) onClose(); }}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={locked}>
            Cancelar
          </button>
          <button type="button" className="btn-web" onClick={() => void confirm()} disabled={locked}>
            {searching ? "Buscando precios web…" : busy ? "Creando…" : "CREAR PRESUPUESTO WEB"}
          </button>
        </>
      }
    >
      {localError ? <Alert>{localError}</Alert> : null}
      <p>
        Cada componente pasa al precio de thegamershop.com.ar, con el costo de INVID, ELIT o NEW BYTES. El presupuesto vence a los 2 días: después se revisan precios y stock. Elegí qué lleva:
      </p>
      <div className="form-grid web-checklist">
        <div className="check-row check-locked">
          <input type="checkbox" checked readOnly disabled />
          <span>Armado, configuración y pruebas de rendimiento <small>($ 45.000 básica · $ 75.000 con placa de video · $ 90.000 con placa de video y refrigeración líquida; siempre va)</small></span>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={prefs.windows} onChange={(e) => setPrefs((current) => ({ ...current, windows: e.target.checked }))} />
          <span>Licencia Windows 11 Pro <small>($ 65.000, sale como línea chica en azul)</small></span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={prefs.warranty} onChange={(e) => setPrefs((current) => ({ ...current, warranty: e.target.checked }))} />
          <span>TGS Garantía Extendida <small>(7 % del total de los componentes, sin armado ni licencia; línea chica en gris)</small></span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={prefs.wifi} onChange={(e) => setPrefs((current) => ({ ...current, wifi: e.target.checked }))} />
          <span>
            Placa WiFi PCIe <small>($ 18.200 en la PC básica · $ 47.400 en las demás; se ofrece en un bloque naranja y no suma al total)</small>
            {pcHasWifi ? <small> — Esta PC ya incluye WiFi: no se ofrece.</small> : null}
          </span>
        </label>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>Lo que tildes queda guardado para tus próximos presupuestos.</p>
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
