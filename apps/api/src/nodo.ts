import { BadGatewayException, Body, Controller, Get, Post, Put, Query, ServiceUnavailableException } from "@nestjs/common";
import { db } from "@tgs/database";
import { z } from "zod";
import { CurrentUser, ZodPipe, type RequestUser } from "./infrastructure.js";
import { effectiveProviderIds, mapOffer, resolveNodoCredentials, type NodoOffer, type NodoResult } from "./nodo-mapping.js";

/** Cliente de la API de catálogo de NODO (distribuidores). Las credenciales viven solo en el servidor. */
const NODO_BASE = "https://api.nodohub.app";
const PROVIDERS_TTL_MS = 5 * 60_000;
const FX_TTL_MS = 10 * 60_000;
/** Hasta cuántos distribuidores se consultan de a uno; con más se hace una sola consulta amplia. */
const MAX_FANOUT = 4;
const MAX_RESULTS = 40;

export type NodoProvider = { id: string; name: string; offers: number; stale: boolean; status: string; lastSyncedAt: string | null };

function credentials(): { key: string; secret: string } {
  const creds = resolveNodoCredentials(process.env);
  if (!creds) throw new ServiceUnavailableException("NODO no está configurado: faltan NODO_API_KEY y NODO_API_SECRET en el servicio de la API.");
  return creds;
}

async function nodoGet<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const { key, secret } = credentials();
  const url = new URL(`${NODO_BASE}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-Api-Key": key, "X-Api-Secret": secret }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new BadGatewayException("No se pudo conectar con NODO.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new BadGatewayException(`NODO respondió ${res.status}${body?.error?.message ? `: ${body.error.message}` : ""}`);
  }
  return (await res.json()) as T;
}

let providersCache: { at: number; data: NodoProvider[] } | null = null;
let fxCache: { at: number; rate: number } | null = null;

async function loadProviders(): Promise<NodoProvider[]> {
  if (providersCache && Date.now() - providersCache.at < PROVIDERS_TTL_MS) return providersCache.data;
  const res = await nodoGet<{ data: Array<{ id: string; name: string; offers: number; status: string; stale: boolean; lastSyncedAt?: string | null }> }>("/v1/providers");
  const data = res.data.map((p) => ({ id: p.id, name: p.name, offers: p.offers, stale: p.stale, status: p.status, lastSyncedAt: p.lastSyncedAt ?? null }));
  providersCache = { at: Date.now(), data };
  return data;
}

/** Cotización del dólar que usa la key en NODO (configurable allá: oficial, blue, MEP, tarjeta). */
async function loadFx(): Promise<number> {
  if (fxCache && Date.now() - fxCache.at < FX_TTL_MS) return fxCache.rate;
  const res = await nodoGet<{ key?: { rate?: number } }>("/v1/fx");
  const rate = res.key?.rate;
  if (!rate || !Number.isFinite(rate)) throw new BadGatewayException("NODO no devolvió la cotización del dólar.");
  fxCache = { at: Date.now(), rate };
  return rate;
}

const searchSchema = z
  .object({
    q: z.string().trim().min(2).max(120),
    /** Un id de distribuidor o varios separados por coma; vacío = todos. */
    provider: z.string().trim().max(1200).optional(),
    inStock: z.enum(["true", "false"]).optional(),
  })
  .strict();

/** Ids de distribuidores que este usuario apagó en Configuración. */
async function loadDisabled(userId: string): Promise<Set<string>> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { nodoOffProviders: true } });
  return new Set(row?.nodoOffProviders ?? []);
}

const settingsSchema = z.object({ ids: z.array(z.string().trim().min(1).max(80)).min(1).max(100), enabled: z.boolean() }).strict();

@Controller("nodo")
export class NodoController {
  /** Todos los distribuidores con su estado para este usuario (prendido o apagado), para la barra de fuentes del presupuesto. */
  @Get("providers")
  async providers(@CurrentUser() actor: RequestUser) {
    const [providers, disabled] = await Promise.all([loadProviders(), loadDisabled(actor.id)]);
    return { items: providers.map((p) => ({ ...p, enabled: !disabled.has(p.id) })) };
  }

  /** Todos los distribuidores con su estado para este usuario (pantalla de Configuración). */
  @Get("settings")
  async settings(@CurrentUser() actor: RequestUser) {
    const [providers, disabled] = await Promise.all([loadProviders(), loadDisabled(actor.id)]);
    return { items: providers.map((p) => ({ ...p, enabled: !disabled.has(p.id) })) };
  }

  /**
   * "Sincronizar ahora": NODO ya sincroniza solo y de forma continua (no tiene un disparador manual en su API),
   * así que esto descarta lo guardado en memoria y vuelve a leer al instante el estado de cada distribuidor y la cotización.
   */
  @Post("refresh")
  async refresh(@CurrentUser() actor: RequestUser) {
    providersCache = null;
    fxCache = null;
    return this.settings(actor);
  }

  /** Activa o desactiva uno o varios distribuidores solo para este usuario. */
  @Put("settings")
  async setEnabled(@Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>, @CurrentUser() actor: RequestUser) {
    const known = new Set((await loadProviders()).map((p) => p.id));
    const ids = body.ids.filter((id) => known.has(id));
    const off = await loadDisabled(actor.id);
    for (const id of ids) {
      if (body.enabled) off.delete(id);
      else off.add(id);
    }
    await db.user.update({ where: { id: actor.id }, data: { nodoOffProviders: [...off] } });
    return { ok: true, updated: ids.length };
  }

  @Get("search")
  async search(@Query(new ZodPipe(searchSchema)) query: z.infer<typeof searchSchema>, @CurrentUser() actor: RequestUser) {
    const requested = [...new Set((query.provider ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
    const [providers, disabled] = await Promise.all([loadProviders(), loadDisabled(actor.id)]);
    const effective = effectiveProviderIds(requested, providers.map((p) => p.id), disabled);
    if (effective && effective.length === 0) return { items: [], fxRate: 0 };
    const ids = effective ?? [];
    const base = { q: query.q, inStock: query.inStock ?? "true", sort: "price" } as const;
    // NODO solo filtra bien por un distribuidor a la vez (con varios separados por coma devuelve vacío).
    const fetchOffers = async (): Promise<NodoOffer[]> => {
      if (ids.length === 0) return (await nodoGet<{ data: NodoOffer[] }>("/v1/offers", { ...base, limit: 30 })).data;
      if (ids.length === 1) return (await nodoGet<{ data: NodoOffer[] }>("/v1/offers", { ...base, provider: ids[0], limit: 30 })).data;
      if (ids.length <= MAX_FANOUT) {
        const parts = await Promise.all(ids.map((id) => nodoGet<{ data: NodoOffer[] }>("/v1/offers", { ...base, provider: id, limit: 15 })));
        return parts.flatMap((p) => p.data);
      }
      // Muchos prendidos: una sola consulta amplia y se queda con los elegidos.
      const wanted = new Set(ids);
      return (await nodoGet<{ data: NodoOffer[] }>("/v1/offers", { ...base, limit: 200 })).data.filter((o) => wanted.has(o.provider.id));
    };
    const [offers, fx] = await Promise.all([fetchOffers(), loadFx()]);
    const items = offers
      .map((offer) => mapOffer(offer, fx))
      .filter((r): r is NodoResult => r !== null)
      .sort((a, b) => Number(BigInt(a.costIvaCents) - BigInt(b.costIvaCents)))
      .slice(0, MAX_RESULTS);
    return { items, fxRate: fx };
  }
}
