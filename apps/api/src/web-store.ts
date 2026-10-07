import { BadGatewayException, Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "./infrastructure.js";
import { mapWooProduct, type WebResult, type WooProduct } from "./web-store-mapping.js";

/** Productos publicados en la tienda web (WooCommerce Store API, pública). */
const STORE_URL = "https://thegamershop.com.ar";
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 100;
const MAX_RESULTS = 20;
// La tienda rechaza (403) las consultas sin un User-Agent de navegador.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 TGS-Presupuestos";

const cache = new Map<string, { at: number; items: WebResult[] }>();

async function searchStore(q: string): Promise<WebResult[]> {
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  const url = new URL(`${STORE_URL}/wp-json/wc/store/v1/products`);
  url.searchParams.set("search", q);
  url.searchParams.set("per_page", String(MAX_RESULTS));
  url.searchParams.set("stock_status", "instock");
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new BadGatewayException("No se pudo conectar con la tienda web.");
  }
  if (!res.ok) throw new BadGatewayException(`La tienda web respondió ${res.status}.`);
  const rows = (await res.json()) as WooProduct[];
  const items = rows.map(mapWooProduct).filter((r): r is WebResult => r !== null).sort((a, b) => Number(BigInt(a.priceCents) - BigInt(b.priceCents)));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), items });
  return items;
}

const searchSchema = z.object({ q: z.string().trim().min(2).max(120) }).strict();

@Controller("web-products")
export class WebStoreController {
  @Get("search")
  async search(@Query(new ZodPipe(searchSchema)) query: z.infer<typeof searchSchema>) {
    return { items: await searchStore(query.q) };
  }
}
