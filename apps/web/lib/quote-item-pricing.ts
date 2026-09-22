import {parseArsToCents, pctFromCostAndSale, pctToBps, saleFromCostAndPct} from "./money";

export type QuoteItemPriceDraft = {
  costArs: string;
  markupPct: string;
  saleArs: string;
  priceMode: "markup" | "sale";
};

/**
 * Al editar el costo el margen se mantiene y se recalcula la venta.
 * El modo pasa a "markup" para que un guardado posterior no mande el precio
 * viejo (los ítems se cargan en modo "sale" para no perder redondeos).
 */
export function applyDraftCost<T extends QuoteItemPriceDraft>(item: T, costArs: string): T {
  return {
    ...item,
    costArs,
    saleArs: saleFromCostAndPct(costArs, item.markupPct),
    priceMode: "markup",
  };
}

/** Al editar el % de ganancia se recalcula la venta. */
export function applyDraftMarkup<T extends QuoteItemPriceDraft>(item: T, markupPct: string): T {
  return {
    ...item,
    markupPct,
    priceMode: "markup",
    saleArs: saleFromCostAndPct(item.costArs, markupPct),
  };
}

/** Al editar la venta (o redondear / total objetivo) el margen se deriva. */
export function applyDraftSale<T extends QuoteItemPriceDraft>(item: T, saleArs: string): T {
  return {
    ...item,
    saleArs,
    priceMode: "sale",
    markupPct: pctFromCostAndSale(item.costArs, saleArs),
  };
}

export function itemPricePayload(item: QuoteItemPriceDraft): {
  markupBps: number;
  salePriceCents?: string;
} {
  if (item.priceMode === "sale") {
    return {markupBps: 0, salePriceCents: parseArsToCents(item.saleArs)};
  }
  return {markupBps: pctToBps(item.markupPct)};
}
