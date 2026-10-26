"use client";

import { useMemo, useState } from "react";
import {
  providerColor,
  useNodoProviders,
  useNodoSearch,
  useSourceSelection,
  useWebSearch,
  WEB_COLOR,
  type NodoResult,
  type WebResult,
} from "../lib/nodo";
import { providerLogo, WEB_LOGO } from "../lib/nodo-logos";
import type { Product } from "../lib/types";
import { ProductBrowserModal, type BrowserItem } from "./ProductBrowserModal";
import { SourceBar } from "./SourceBar";

export type ReplacePick =
  | { kind: "own"; p: Product }
  | { kind: "web"; w: WebResult }
  | { kind: "nodo"; r: NodoResult; color: string };

const norm = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * "Cambiar X por…": busca en los productos propios, la web y los distribuidores y devuelve el elegido,
 * para reemplazar un ítem del presupuesto sin cancelar y volver a buscar.
 */
export function ReplaceProductModal({ currentName, products, onPick, onClose }: {
  currentName: string;
  products: Product[];
  onPick: (pick: ReplacePick) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { providers, error: providersError, setEnabled } = useNodoProviders();
  const sel = useSourceSelection(providers, setEnabled);
  const nodo = useNodoSearch(query, sel.activeIds, providers.length);
  const web = useWebSearch(query, sel.web);

  const own = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return [...products].sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "")).slice(0, 12);
    return products.filter((p) => { const n = norm(p.name); return tokens.every((t) => n.includes(t)); }).slice(0, 60);
  }, [products, query]);

  const items = useMemo<BrowserItem<ReplacePick>[]>(() => [
    ...(sel.own ? own.map((p): BrowserItem<ReplacePick> => ({
      key: `own-${p.id}`, source: "Propios", color: "#64748b", name: p.name, priceCents: p.salePriceCents, priceLabel: "precio de venta", raw: { kind: "own", p },
    })) : []),
    ...web.items.map((w): BrowserItem<ReplacePick> => ({
      key: `web-${w.id}`, source: "Web", color: WEB_COLOR, logo: WEB_LOGO, name: w.name, sku: w.sku, imageUrl: w.imageUrl, inStock: w.inStock, priceCents: w.priceCents, priceLabel: "precio de venta", raw: { kind: "web", w },
    })),
    ...nodo.items.map((r): BrowserItem<ReplacePick> => {
      const color = providerColor(providers, r.providerId);
      return { key: `nodo-${r.offerId}`, source: r.providerName, color, logo: providerLogo(r.providerName), name: r.name, brand: r.brand, imageUrl: r.imageUrl, url: r.nodoUrl, stock: r.stock, inStock: r.inStock, stale: r.stale, priceCents: r.costIvaCents, priceLabel: "costo + IVA", raw: { kind: "nodo", r, color } };
    }),
  ], [sel.own, own, web.items, nodo.items, providers]);

  return (
    <ProductBrowserModal
      items={items}
      loading={nodo.loading || web.loading}
      query={query}
      onQueryChange={setQuery}
      single
      title={`Cambiar ${currentName.trim() || "el producto"} por`}
      sourceBar={<SourceBar providers={providers} sel={sel} error={providersError} />}
      onConfirm={(picked) => { const first = picked[0]; if (first) onPick(first.raw); }}
      onClose={onClose}
    />
  );
}
