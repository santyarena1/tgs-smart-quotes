/**
 * Flujo del Presupuesto Web compartido por la versión común y LITE: busca cada componente en thegamershop.com.ar,
 * arma las líneas fijas (armado, garantía, Windows) y los ítems libres, y devuelve los borradores listos para guardar.
 * No toca el editor: el llamador crea el presupuesto aparte.
 */
import { api } from "./api";
import { centsToInput, pctFromCostAndSale, parseArsToCents, bpsToPct, saleFromCostAndPct } from "./money";
import { DEFAULT_IVA_PCT, ivaPctFromBps } from "./iva";
import { WEB_COLOR, type WebResult } from "./nodo";
import { getQuoteItems, type Quote } from "./types";
import { hasWifi, isExtraLine, pickWebMatch, searchQueries, webQuoteExtras, wifiCents, WIFI_NAME, type FixedLines } from "./web-quote";

/** Lo que tienen en común los ítems del editor común (ItemDraft) y los de LITE (Line). */
export type WebDraft = {
  key: string;
  productId: string;
  lineId: string;
  name: string;
  quantity: string;
  costArs: string;
  markupPct: string;
  saleArs: string;
  priceMode: "markup" | "sale";
  ivaPct: string;
  ivaAuto: boolean;
  imageUrl?: string | null;
  source?: { label: string; color: string };
};

export type WebFreeRow = { key: string; name: string; priceArs: string };

export const DEFAULT_WEB_FIXED: FixedLines = { assembly: true, warranty: true, windows: true, wifi: true };

export type WebQuoteResult<T> = {
  items: T[];
  /** Placa WiFi opcional: no suma al total, el PDF la muestra chica bajo el total. */
  wifiAddon: { name: string; priceCents: string } | null;
  /** Componentes que no se encontraron en la web (conservan su precio). */
  noWeb: string[];
};

const isFilled = (i: WebDraft) => Boolean(i.productId || i.name.trim() || i.costArs.trim());

/** Ítems de un presupuesto guardado como borradores (precio guardado manda: modo "sale"). */
export function webDraftsFromQuote(quote: Quote): Array<WebDraft & { observation: string }> {
  return getQuoteItems(quote).map((item) => ({
    key: crypto.randomUUID(),
    productId: item.productId ?? "",
    name: item.name,
    lineId: item.lineId ?? "",
    quantity: String(item.quantity),
    costArs: centsToInput(item.costCents),
    markupPct: bpsToPct(item.markupBps),
    saleArs: centsToInput(item.salePriceCents ?? "0"),
    observation: item.observation ?? "",
    priceMode: "sale" as const,
    ivaPct: item.ivaBps != null ? ivaPctFromBps(item.ivaBps) : DEFAULT_IVA_PCT,
    ivaAuto: item.ivaBps == null,
  }));
}

/** Venta de un borrador en centavos (en modo "markup" sale de costo + margen). */
function saleCentsOf(item: WebDraft): bigint {
  const sale = item.priceMode === "sale" ? item.saleArs : saleFromCostAndPct(item.costArs, item.markupPct);
  return BigInt(parseArsToCents(sale || "0"));
}

/**
 * Convierte los componentes a precio web y suma las líneas fijas tildadas y los ítems libres.
 * `blank` crea un ítem vacío del tipo del llamador. Lanza Error con un mensaje para mostrar si algo no sirve.
 */
export async function buildWebQuote<T extends WebDraft>(
  base: T[],
  blank: () => T,
  options: { fixed: FixedLines; free: WebFreeRow[] },
): Promise<WebQuoteResult<T>> {
  // Si ya traía armado / garantía / Windows se descartan: se vuelven a calcular (o se quitan si se destildaron).
  const components = base.filter(isFilled).filter((i) => !isExtraLine(i.name));
  if (components.length === 0) throw new Error("Agregá al menos un componente al presupuesto.");
  const freeRows = options.free.filter((f) => f.name.trim() || f.priceArs.trim());
  for (const f of freeRows) {
    let ok = f.name.trim().length > 0;
    try { ok = ok && BigInt(parseArsToCents(f.priceArs)) > 0n; } catch { ok = false; }
    if (!ok) throw new Error("Cada ítem libre necesita un nombre y un precio válido.");
  }

  const noWeb: string[] = [];
  // En paralelo para que sea rápido; cada ítem prueba sus consultas de la más específica a la más amplia.
  const priced = await Promise.all(components.map(async (item): Promise<T> => {
    let match: WebResult | null = null;
    for (const q of searchQueries(item.name)) {
      const found = await api<{ items: WebResult[] }>("/web-products/search", { query: { q } }).catch(() => ({ items: [] as WebResult[] }));
      match = pickWebMatch(item.name, found.items);
      if (match) break;
    }
    if (!match) {
      noWeb.push(item.name.trim());
      return item;
    }
    const price = centsToInput(match.priceCents);
    // Sin productId: el precio de la tienda no debe pisar el costo del producto en la base.
    return {
      ...item,
      productId: "",
      name: match.name.toLocaleUpperCase("es-AR"),
      costArs: price,
      saleArs: price,
      markupPct: "0",
      priceMode: "markup",
      source: { label: "Web", color: WEB_COLOR },
      imageUrl: match.imageUrl ?? item.imageUrl ?? null,
    } as T;
  }));

  const extras = webQuoteExtras(priced.map((i) => ({ name: i.name, totalCents: saleCentsOf(i) * BigInt(Number(i.quantity) || 1) })), options.fixed);
  const lineItem = (name: string, priceArs: string, costArs = priceArs): T => ({
    ...blank(), name, costArs, saleArs: priceArs, markupPct: pctFromCostAndSale(costArs, priceArs), priceMode: "sale", quantity: "1", lineId: "", productId: "",
  });
  const extraItems = [
    // Servicios a costo $0, Windows a $8.500: el costo real de cada línea fija.
    ...extras.map((x) => lineItem(x.name, centsToInput(x.priceCents), centsToInput(x.costCents) || "0")),
    ...freeRows.map((f) => lineItem(f.name.trim().toLocaleUpperCase("es-AR"), f.priceArs)),
  ];
  const wifiAddon = options.fixed.wifi && !hasWifi(priced)
    ? { name: WIFI_NAME, priceCents: wifiCents(priced).toString() }
    : null;
  return { items: [...priced, ...extraItems], wifiAddon, noWeb };
}

export const webNoticeSuffix = (noWeb: string[]) =>
  noWeb.length ? ` No encontré en la web (se dejó el precio cargado): ${noWeb.join("; ")}.` : "";
