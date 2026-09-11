import {createHmac} from 'node:crypto';
import {decryptSecret} from '@tgs/config';
import {db} from '@tgs/database';
import {normalizeMediaUrl} from '@tgs/storage';

/**
 * Publicación de presupuestos "PC armada" en la tienda WordPress/WooCommerce.
 *
 * La publicación es una por presupuesto (QuoteFamily) y el producto de
 * WordPress se identifica por el id del presupuesto (`externalId`). La versión
 * publicada queda fijada en `WebPublication.quoteVersionId`: crear una versión
 * nueva del presupuesto no cambia lo que se ve en la tienda hasta que alguien
 * publique esa versión explícitamente.
 */

type LandingLayout = {
  version: 1;
  tokens: {accent: string; bg: string; text: string; radius: number; font?: string};
  blocks: Array<{type: string; visible: boolean}>;
};

export type PublishPayload = {
  externalId: string;
  /** Ids con los que el producto pudo haber quedado etiquetado antes (ids de versión). */
  legacyExternalIds: string[];
  versionNumber: number;
  title: string;
  tagline: string | null;
  shortDescription: string | null;
  highlights: string[];
  audience: string | null;
  slug: string;
  priceListCents: string;
  priceCashCents: string;
  priceTransferCents: string;
  installments: Array<Record<string, unknown>>;
  items: Array<{name: string; imageUrl: string | null; description: string | null; specs: Record<string, unknown>}>;
  gallery: string[];
  model3dUrl: string | null;
  thumbnailUrl: string | null;
  heroImageUrl: string | null;
  descriptionHtml: string | null;
  power: {watts: number | null; psu: number | null; note: string | null};
  games: unknown[];
  compatibility: unknown[];
  layout: LandingLayout;
};

export class WordpressPublishError extends Error {
  constructor(message: string, readonly httpStatus: 400 | 404 | 502) {
    super(message);
    this.name = 'WordpressPublishError';
  }
}

const DEFAULT_LAYOUT: LandingLayout = {
  version: 1,
  tokens: {accent: '#E31B23', bg: '#080B12', text: '#F8FAFC', radius: 24, font: 'Inter, system-ui, sans-serif'},
  blocks: ['addToCartSticky', 'specs', 'description', 'games', 'compatibility', 'payment', 'recommended'].map((type) => ({type, visible: true})),
};

/** WordPress puede tardar (sideload de la miniatura); más que esto es que está colgado. */
const WORDPRESS_TIMEOUT_MS = 30_000;

const installmentTotal = (base: bigint, bps: number) => (base * BigInt(10000 + bps) + 5000n) / 10000n;
const slugify = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
const jsonSafe = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_key, current) => (typeof current === 'bigint' ? current.toString() : current)));
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];

function savedLayout(value: unknown): LandingLayout {
  if (!value || typeof value !== 'object') return DEFAULT_LAYOUT;
  const layout = value as Partial<LandingLayout>;
  return layout.version === 1 && layout.tokens && Array.isArray(layout.blocks) ? (layout as LandingLayout) : DEFAULT_LAYOUT;
}

/**
 * Qué versión se publica: la pedida, si no la que ya está en la tienda, y si
 * el presupuesto nunca se publicó, la activa.
 */
export async function resolvePublishVersionId(familyId: string, versionId?: string | null): Promise<string> {
  const family = await db.quoteFamily.findUnique({
    where: {id: familyId},
    select: {activeVersion: true, versions: {select: {id: true, version: true}}, webPublication: {select: {quoteVersionId: true}}},
  });
  if (!family) throw new WordpressPublishError('Presupuesto inexistente', 404);
  if (versionId) {
    if (!family.versions.some((version) => version.id === versionId)) throw new WordpressPublishError('Esa versión no pertenece al presupuesto', 400);
    return versionId;
  }
  if (family.webPublication?.quoteVersionId) return family.webPublication.quoteVersionId;
  const active = family.versions.find((version) => version.version === family.activeVersion) ?? family.versions[0];
  if (!active) throw new WordpressPublishError('El presupuesto no tiene versiones', 400);
  return active.id;
}

export async function buildPublishPayload(familyId: string, versionId?: string | null): Promise<PublishPayload> {
  const targetVersionId = await resolvePublishVersionId(familyId, versionId);
  const version = await db.quoteVersion.findUnique({
    where: {id: targetVersionId},
    include: {
      family: {include: {heroAsset: true, versions: {select: {id: true}}, webPublication: true}},
      enrichment: true,
      items: {
        orderBy: {position: 'asc'},
        include: {
          line: true,
          product: {
            include: {
              assets: {where: {status: 'READY', url: {not: null}}, orderBy: [{isPrimary: 'desc'}, {createdAt: 'desc'}]},
              caseModel3D: true,
            },
          },
        },
      },
    },
  });
  if (!version) throw new WordpressPublishError('Versión de presupuesto inexistente', 404);

  const family = version.family;
  const company = await db.companySettings.findUniqueOrThrow({where: {id: 'singleton'}});
  const activePlans = await db.financingPlan.findMany({where: {active: true}, orderBy: {sortOrder: 'asc'}});
  const snapshot = version.financingSnapshot;
  const plans: any[] = Array.isArray(snapshot)
    ? snapshot
    : snapshot && typeof snapshot === 'object' && Array.isArray((snapshot as any).plans)
      ? (snapshot as any).plans
      : activePlans;
  const list = installmentTotal(version.totalSaleCents, company.listInterestBps);
  const enriched = version.enrichment;

  const items = version.items.map((item) => {
    const imageUrl = normalizeMediaUrl(item.webImageUrl ?? item.product?.assets[0]?.url) ?? null;
    return {
      name: item.frozenName,
      imageUrl,
      description: item.webDescription ?? item.observation ?? item.product?.description ?? null,
      specs: {
        quantity: item.quantity,
        line: item.line?.name ?? null,
        unitPriceCents: item.frozenSalePriceCents.toString(),
        subtotalCents: item.subtotalCents.toString(),
      },
    };
  });

  const models = version.items.filter((item) => item.product?.caseModel3D?.status === 'READY' && item.product.caseModel3D.glbUrl);
  const preferredModel = models.find((item) => /gabinete|case/i.test(`${item.line?.name ?? ''} ${item.frozenName}`)) ?? models[0];
  const config = await db.externalModuleConfig.findUnique({where: {id: 'singleton'}, select: {landingLayoutJson: true}});

  const thumbnailUrl = normalizeMediaUrl(family.thumbnailUrl ?? family.webPublication?.thumbnailUrl) ?? null;
  const heroImageUrl =
    normalizeMediaUrl(family.heroImageUrl ?? family.heroAsset?.url ?? family.thumbnailUrl ?? family.webPublication?.thumbnailUrl) ?? null;
  // Galería: las fotos de los componentes, sin repetir y sin la del hero.
  const gallery = Array.from(new Set(items.map((item) => item.imageUrl).filter((url): url is string => Boolean(url) && url !== heroImageUrl)));

  const title = (family.webTitle ?? '').trim() || family.internalName || family.visibleNumber;
  const tagline = (family.webTagline ?? enriched?.tagline ?? '').trim() || null;

  return {
    externalId: family.id,
    legacyExternalIds: family.versions.map((entry) => entry.id),
    versionNumber: version.version,
    title,
    tagline,
    shortDescription: (enriched?.shortDescription ?? '').trim() || null,
    highlights: stringList(enriched?.highlightsJson),
    audience: (enriched?.audience ?? '').trim() || null,
    slug: slugify(`${title}-${family.visibleNumber}`),
    priceListCents: list.toString(),
    priceCashCents: version.totalSaleCents.toString(),
    priceTransferCents: version.totalSaleCents.toString(),
    installments: plans.map((plan: any) => {
      const total = installmentTotal(list, Number(plan.interestBps ?? 0));
      const count = BigInt(Number(plan.installments));
      return {
        bank: plan.bank ?? null,
        installments: Number(plan.installments),
        interestBps: Number(plan.interestBps ?? 0),
        totalCents: total.toString(),
        installmentCents: ((total + count / 2n) / count).toString(),
      };
    }),
    items,
    gallery,
    model3dUrl: normalizeMediaUrl(preferredModel?.product?.caseModel3D?.glbUrl) ?? null,
    thumbnailUrl,
    heroImageUrl,
    descriptionHtml: enriched?.descriptionHtml ?? null,
    power: {watts: enriched?.powerWatts ?? null, psu: enriched?.recommendedPsuWatts ?? null, note: enriched?.powerNote ?? null},
    games: Array.isArray(enriched?.gamesJson) ? enriched.gamesJson : [],
    compatibility: Array.isArray(enriched?.compatibilityJson) ? enriched.compatibilityJson : [],
    layout: savedLayout(config?.landingLayoutJson),
  };
}

/**
 * POST firmado a la API REST del plugin. Cualquier problema de red o
 * respuesta rara se traduce a WordpressPublishError con un mensaje legible.
 */
export async function postWordpress(pathname: 'publish' | 'unpublish', payload: unknown): Promise<any> {
  const config = await db.externalModuleConfig.findUniqueOrThrow({where: {id: 'singleton'}});
  if (!config.wpHmacSecretEnc) throw new WordpressPublishError('Configurá el secreto HMAC de WordPress', 400);
  const body = JSON.stringify(jsonSafe(payload));
  const signature = createHmac('sha256', decryptSecret(config.wpHmacSecretEnc)).update(body).digest('hex');
  let response: Response;
  try {
    response = await fetch(`${config.wpBaseUrl.replace(/\/$/, '')}/wp-json/tgs/v1/${pathname}`, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'X-TGS-Signature': signature},
      body,
      signal: AbortSignal.timeout(WORDPRESS_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new WordpressPublishError(timedOut ? 'WordPress no respondió a tiempo' : 'No se pudo conectar con WordPress', 502);
  }
  const text = await response.text();
  let wpResponse: any = {};
  try {
    wpResponse = text ? JSON.parse(text) : {};
  } catch {
    /* respuesta no JSON: se trata abajo */
  }
  if (!response.ok) throw new WordpressPublishError(wpResponse?.message ?? `WordPress respondió HTTP ${response.status}`, 502);
  if (!wpResponse?.ok) throw new WordpressPublishError('WordPress devolvió una respuesta inválida', 502);
  return wpResponse;
}

/**
 * Publica (o actualiza) el presupuesto en la tienda con la versión indicada.
 *
 * Si la publicación ya estaba en PUBLISHED y esta republicación falla, el
 * producto sigue vivo en la tienda: se conserva el estado y se registra el
 * error en `lastError`, para que el resync horario lo reintente. Solo una
 * primera publicación fallida queda en FAILED.
 */
export async function publishQuote(familyId: string, options: {versionId?: string | null} = {}) {
  const payload = await buildPublishPayload(familyId, options.versionId);
  const versionId = await resolvePublishVersionId(familyId, options.versionId);
  const previous = await db.webPublication.findUnique({where: {quoteFamilyId: familyId}});
  try {
    const wpResponse = await postWordpress('publish', payload);
    if (!wpResponse?.productId) throw new WordpressPublishError('WordPress devolvió una respuesta inválida', 502);
    const data = {
      quoteVersionId: versionId,
      status: 'PUBLISHED' as const,
      wpProductId: String(wpResponse.productId),
      url: wpResponse.url ?? null,
      thumbnailUrl: payload.thumbnailUrl,
      payloadSnapshot: payload as any,
      lastError: null,
      lastErrorAt: null,
      publishedAt: new Date(),
    };
    const webPublication = await db.webPublication.upsert({
      where: {quoteFamilyId: familyId},
      create: {quoteFamilyId: familyId, ...data},
      update: data,
    });
    return {webPublication, wpResponse};
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al publicar';
    const keepsPublished = previous?.status === 'PUBLISHED';
    await db.webPublication.upsert({
      where: {quoteFamilyId: familyId},
      create: {quoteFamilyId: familyId, quoteVersionId: versionId, status: 'FAILED', payloadSnapshot: payload as any, lastError: message, lastErrorAt: new Date()},
      update: keepsPublished
        ? {lastError: message, lastErrorAt: new Date()}
        : {quoteVersionId: versionId, status: 'FAILED', payloadSnapshot: payload as any, lastError: message, lastErrorAt: new Date()},
    });
    throw error;
  }
}

/** Pasa el producto a borrador en la tienda y marca la publicación como despublicada. */
export async function unpublishQuote(familyId: string) {
  const publication = await db.webPublication.findUnique({where: {quoteFamilyId: familyId}});
  await postWordpress('unpublish', {externalId: familyId, legacyExternalIds: publication ? [publication.quoteVersionId] : []});
  if (!publication) return null;
  // Se limpia también la `url`: al despublicar, la página deja de existir en
  // la tienda y el enlace guardado dejaría de servir.
  return db.webPublication.update({
    where: {quoteFamilyId: familyId},
    data: {status: 'UNPUBLISHED', url: null, lastError: null, lastErrorAt: null},
  });
}
