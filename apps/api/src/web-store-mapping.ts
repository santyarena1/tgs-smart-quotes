/** Conversión de productos de la tienda web (WooCommerce Store API) a lo que usa el presupuesto. Sin dependencias del servidor. */
export type WooProduct = {
  id: number;
  name: string;
  sku?: string | null;
  permalink?: string;
  is_in_stock?: boolean;
  prices?: { price?: string; currency_minor_unit?: number };
  images?: Array<{ src?: string; thumbnail?: string }>;
};

export type WebResult = {
  id: number;
  name: string;
  sku: string | null;
  /** Precio de venta publicado en la web, en centavos de peso (string). */
  priceCents: string;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Los nombres de WooCommerce vienen con entidades HTML (&amp;, &#8211;…). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

export function mapWooProduct(p: WooProduct): WebResult | null {
  const raw = p.prices?.price;
  if (!raw || !/^\d+$/.test(raw) || BigInt(raw) <= 0n) return null;
  // Los precios llegan en la unidad menor de la moneda (por defecto, 2 decimales = centavos).
  const minor = p.prices?.currency_minor_unit ?? 2;
  const priceCents = minor === 2 ? raw : String(BigInt(raw) * 10n ** 2n / 10n ** BigInt(minor));
  return {
    id: p.id,
    name: decodeEntities(p.name),
    sku: p.sku ? p.sku : null,
    priceCents,
    inStock: p.is_in_stock !== false,
    url: p.permalink ?? null,
    imageUrl: p.images?.[0]?.thumbnail ?? p.images?.[0]?.src ?? null,
  };
}
