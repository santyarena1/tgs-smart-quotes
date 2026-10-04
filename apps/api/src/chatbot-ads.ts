/**
 * Fichas de anuncios de Meta y cuándo el bot puede mostrar "escribiendo…".
 *
 * Cada chat que nace de un clic a WhatsApp trae el referral (ad id, título).
 * Si hay una ficha configurada, el motor usa ese contexto y el presupuesto
 * de ese aviso. Sin ficha, el anuncio se lista en Configuración para armarla.
 */
import {chatbotAdCampaignSchema, type ChatbotAdCampaign} from '@tgs/contracts';

export type AdOrigin = {
  source_id?: unknown;
  source_type?: unknown;
  headline?: unknown;
  body?: unknown;
  source_url?: unknown;
};

export function parseAds(raw: unknown): ChatbotAdCampaign[] {
  if (!Array.isArray(raw)) return [];
  const parsed: ChatbotAdCampaign[] = [];
  for (const item of raw) {
    const result = chatbotAdCampaignSchema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function plain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function originAdId(origin: unknown): string | null {
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) return null;
  const id = (origin as AdOrigin).source_id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export function originHeadline(origin: unknown): string | null {
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) return null;
  const headline = (origin as AdOrigin).headline;
  return typeof headline === 'string' && headline.trim() ? headline.trim() : null;
}

export function originBody(origin: unknown): string | null {
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) return null;
  const body = (origin as AdOrigin).body;
  return typeof body === 'string' && body.trim() ? body.trim() : null;
}

/** Gana el id de Meta; si no hay, el título del anuncio. Solo fichas encendidas. */
export function matchAdCampaign(ads: ChatbotAdCampaign[], origin: unknown): ChatbotAdCampaign | null {
  const adId = originAdId(origin);
  const headline = originHeadline(origin);
  const enabled = ads.filter((ad) => ad.enabled);
  if (adId) {
    const exact = enabled.find((ad) => ad.adId && ad.adId === adId);
    if (exact) return exact;
  }
  if (headline) {
    const needle = plain(headline);
    if (needle) {
      const byTitle = enabled.find((ad) => {
        const titles = [ad.headline, ad.name].map(plain).filter(Boolean);
        return titles.some((title) => title === needle || title.includes(needle) || needle.includes(title));
      });
      if (byTitle) return byTitle;
    }
  }
  return null;
}

export function pesosFromCents(cents: string | null | undefined): string | null {
  if (!cents || !/^\d+$/.test(cents)) return null;
  const pesos = (BigInt(cents) / 100n).toString();
  return pesos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Texto autoritativo que entra al prompt cuando el cliente vino de un aviso. */
export function formatAdContext(ad: ChatbotAdCampaign, origin: unknown): string {
  const price = pesosFromCents(ad.advertisedPriceCents);
  const seenHeadline = originHeadline(origin);
  const seenBody = originBody(origin);
  const lines = [
    'ANUNCIO DEL CLIENTE (información autoritativa de ese aviso; no la contradigas)',
    `Nombre interno: ${ad.name}`,
    ad.adId ? `ID de Meta: ${ad.adId}` : null,
    ad.headline || seenHeadline ? `Título que vio: ${ad.headline || seenHeadline}` : null,
    seenBody ? `Texto del anuncio: ${seenBody}` : null,
    price ? `Precio publicado: $${price}. Usá este precio. No inventes otro.` : null,
    ad.context.trim() ? `Información específica de este anuncio:\n${ad.context.trim()}` : null,
    ad.quote
      ? 'Hay un presupuesto PDF configurado para este anuncio: presentalo. shouldCreateRequest=false salvo que pida algo distinto a lo del aviso.'
      : 'Este anuncio no tiene presupuesto cargado. Si pregunta por esta PC, pedí el presupuesto al equipo (shouldCreateRequest=true) y no inventes el armado.',
    'Si el cliente pide otra cosa que no es este anuncio, atendé eso con el resto de la información.',
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

export function originStub(origin: unknown): ChatbotAdCampaign | null {
  const adId = originAdId(origin);
  const headline = originHeadline(origin);
  const body = originBody(origin);
  if (!adId && !headline) return null;
  return {
    id: `visto-${adId || plain(headline ?? 'anuncio').replace(/\s+/g, '-').slice(0, 40)}`,
    enabled: false,
    adId: adId ?? '',
    name: headline || (adId ? `Anuncio ${adId}` : 'Anuncio'),
    headline: headline ?? '',
    context: body ?? '',
    openingMessage: '',
    advertisedPriceCents: null,
    quote: null,
    seen: true,
  };
}

/** Suma a las fichas guardadas los avisos que ya llegaron por WhatsApp y todavía no se configuraron. */
export function mergeSeenAds(configured: ChatbotAdCampaign[], origins: unknown[]): ChatbotAdCampaign[] {
  const knownIds = new Set(configured.map((ad) => ad.adId).filter(Boolean));
  const knownTitles = new Set(configured.map((ad) => plain(ad.headline || ad.name)).filter(Boolean));
  const extra: ChatbotAdCampaign[] = [];
  const seenKeys = new Set<string>();
  for (const origin of origins) {
    const stub = originStub(origin);
    if (!stub) continue;
    const key = stub.adId || plain(stub.headline || stub.name);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (stub.adId && knownIds.has(stub.adId)) continue;
    if (!stub.adId && knownTitles.has(plain(stub.headline || stub.name))) continue;
    extra.push(stub);
  }
  return [...configured, ...extra];
}

/** El cliente solo ve "escribiendo…" si esa respuesta va a salir sola. */
export function willAutoSend(enabled: boolean, mode: 'OFF' | 'SUGGEST' | 'AUTO' | null | undefined): boolean {
  return Boolean(enabled && mode === 'AUTO');
}
