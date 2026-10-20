import {centsToInput, parseArsToCents, pctFromCostAndSale, pctToBps, saleFromCostAndPct} from "./money";

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

/** Venta por debajo del costo: se marca en rojo para no mandar un presupuesto con pérdida. */
export function sellsBelowCost(item: Pick<QuoteItemPriceDraft, "saleArs" | "costArs">): boolean {
  try {
    return BigInt(parseArsToCents(item.saleArs)) < BigInt(parseArsToCents(item.costArs));
  } catch {
    return false;
  }
}

type SaleLine = QuoteItemPriceDraft & {quantity: string};

/**
 * Lleva el total de la venta a `targetCents` escalando los precios de venta en proporción.
 * El residuo de redondeo se absorbe en un ítem de cantidad 1 (el de mayor importe).
 * Misma cuenta que LITE.
 */
export function retargetSaleLines<T extends SaleLine>(
  lines: T[],
  targetCents: bigint,
): {lines: T[]; reached: bigint} | null {
  const priced = lines.map((l) => {
    let unit = 0n;
    try {
      unit = BigInt(parseArsToCents(l.saleArs));
    } catch {
      /* ítem incompleto */
    }
    return {l, unit, qty: BigInt(Math.max(0, Math.trunc(Number(l.quantity) || 0)))};
  });
  const current = priced.reduce((sum, x) => sum + x.unit * x.qty, 0n);
  if (current <= 0n) return null;
  const next = priced.map((x) => ({...x, unit: (x.unit * targetCents + current / 2n) / current}));
  let residue = targetCents - next.reduce((sum, x) => sum + x.unit * x.qty, 0n);
  if (residue !== 0n) {
    const candidates = next.filter((x) => x.qty === 1n && x.unit + residue >= 0n).sort((x, y) => (y.unit > x.unit ? 1 : -1));
    if (candidates[0]) {
      candidates[0].unit += residue;
      residue = 0n;
    }
  }
  const reached = next.reduce((sum, x) => sum + x.unit * x.qty, 0n);
  return {lines: next.map((x) => applyDraftSale(x.l, centsToInput(x.unit.toString()))), reached};
}
