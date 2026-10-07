/** Conversión de ofertas de NODO a lo que usa el presupuesto. Sin dependencias del servidor. */
export type NodoTax = { type: string; amount?: number };
export type NodoOffer = {
  id: string;
  provider: { id: string; name: string };
  sku?: string | null;
  stock?: { quantity?: number | null; status?: string };
  price?: {
    currency: "USD" | "ARS";
    cost?: { net?: number; taxes?: NodoTax[]; gross?: number };
  };
  freshness?: { stale?: boolean };
  product?: { name: string; brand?: { name: string } | null; partNumber?: string | null; ean?: string | null; imageUrl?: string | null };
};

export type NodoResult = {
  offerId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  providerId: string;
  providerName: string;
  stock: number | null;
  inStock: boolean;
  stale: boolean;
  /** Costo + IVA en pesos (centavos, string). */
  costIvaCents: string;
  /** Costo sin impuestos en pesos (centavos, string). */
  costNetCents: string;
  /** Costo + IVA en la moneda original de la key (para mostrar). */
  originalCurrency: "USD" | "ARS";
  originalCostIva: number;
  /** Cotización usada para pasar USD a ARS (1 si ya viene en pesos). */
  fxRate: number;
};

/** Costo + IVA de una oferta: neto más el IVA; las percepciones no se suman. */
export function costWithIva(cost: { net?: number; taxes?: NodoTax[]; gross?: number } | undefined): { net: number; withIva: number } | null {
  if (!cost || typeof cost.net !== "number") return null;
  const iva = (cost.taxes ?? []).filter((t) => t.type === "iva").reduce((sum, t) => sum + (t.amount ?? 0), 0);
  return { net: cost.net, withIva: cost.net + iva };
}

const toCents = (pesos: number) => String(Math.round(pesos * 100));

export function mapOffer(offer: NodoOffer, fxRate: number): NodoResult | null {
  const cost = costWithIva(offer.price?.cost);
  if (!cost || !offer.product) return null;
  const currency = offer.price?.currency === "ARS" ? "ARS" : "USD";
  const rate = currency === "USD" ? fxRate : 1;
  return {
    offerId: offer.id,
    name: offer.product.name,
    brand: offer.product.brand?.name ?? null,
    sku: offer.sku ?? offer.product.partNumber ?? null,
    providerId: offer.provider.id,
    providerName: offer.provider.name,
    stock: offer.stock?.quantity ?? null,
    inStock: offer.stock?.status ? offer.stock.status === "in_stock" : (offer.stock?.quantity ?? 0) > 0,
    stale: Boolean(offer.freshness?.stale),
    costIvaCents: toCents(cost.withIva * rate),
    costNetCents: toCents(cost.net * rate),
    originalCurrency: currency,
    originalCostIva: Math.round(cost.withIva * 100) / 100,
    fxRate: rate,
  };
}

/** Credenciales de NODO desde el entorno. Acepta NODO_API_KEY / NODO_API_SECRET y también API_KEY_NODO / API_SECRET_NODO y NODO_API_SECRETO. */
export function resolveNodoCredentials(env: Record<string, string | undefined>): { key: string; secret: string } | null {
  const key = (env.NODO_API_KEY ?? env.API_KEY_NODO)?.trim();
  const secret = (env.NODO_API_SECRET ?? env.NODO_API_SECRETO ?? env.API_SECRET_NODO)?.trim();
  return key && secret ? { key, secret } : null;
}

/**
 * En qué distribuidores se busca: lo pedido (o todos) sin los que se desactivaron en Configuración.
 * `null` = sin restricción (no se pidió ninguno y no hay nada desactivado); `[]` = no hay dónde buscar.
 */
export function effectiveProviderIds(requested: string[], allIds: string[], disabled: ReadonlySet<string>): string[] | null {
  const enabled = allIds.filter((id) => !disabled.has(id));
  if (requested.length) return requested.filter((id) => enabled.includes(id));
  return enabled.length === allIds.length ? null : enabled;
}
