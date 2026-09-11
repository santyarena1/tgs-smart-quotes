/**
 * "Preparar y publicar": deja una PC lista para la tienda en un solo paso.
 *
 * Completa lo que falte (imágenes de componentes, foto principal, textos e
 * IA, título, miniatura) y publica. Cada paso es idempotente: si ya estaba
 * hecho se saltea, y si falla no frena a los demás. El progreso se guarda en
 * WebPublishRun para que la pantalla lo muestre paso a paso.
 *
 * Corre en la API (no en el worker) porque necesita el disco donde viven las
 * imágenes y sharp; es la misma razón por la que "quitar fondo" vive acá.
 */
import {randomUUID} from 'node:crypto';
import {Logger} from '@nestjs/common';
import {thumbnailRulesSchema, type ThumbnailRules} from '@tgs/contracts';
import {db} from '@tgs/database';
import {getSerperKey, publishQuote, removeBackgroundDetailed, searchImages, type SerperImage} from '@tgs/providers';
import {loadMediaStorage, ownStorageKeyFromUrl, readMedia} from '@tgs/storage';
import {enrichmentItemsHash, loadEnrichmentItems, runQuoteEnrichment} from './quote-enrichment.js';
import {renderThumbnail} from './thumbnail-render.js';

const logger = new Logger('PublishPipeline');

export type PublishRunStepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'SKIPPED' | 'FAILED';
export type PublishRunStep = {id: string; label: string; status: PublishRunStepStatus; detail: string | null};

const STEP_DEFS: Array<{id: string; label: string}> = [
  {id: 'images', label: 'Imágenes de componentes'},
  {id: 'hero', label: 'Foto principal'},
  {id: 'enrichment', label: 'Textos y análisis con IA'},
  {id: 'title', label: 'Título y bajada'},
  {id: 'thumbnail', label: 'Miniatura'},
  {id: 'model3d', label: 'Modelo 3D del gabinete'},
  {id: 'publish', label: 'Publicar en la tienda'},
];

/** Una corrida que lleva más que esto sin terminar quedó colgada (p. ej. la API se reinició). */
const STALE_RUN_MS = 15 * 60_000;
/** Cuántas imágenes de Serper se prueban por componente antes de rendirse. */
const CANDIDATES_PER_ITEM = 4;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CASE_PATTERN = /gabinete|case|chasis|tower/i;

export class PublishRunConflictError extends Error {
  constructor() {
    super('Ya hay una preparación en curso para este presupuesto');
    this.name = 'PublishRunConflictError';
  }
}

export async function startPublishRun(opts: {familyId: string; versionId: string; userId: string; publish: boolean}) {
  const running = await db.webPublishRun.findFirst({
    where: {quoteFamilyId: opts.familyId, status: 'RUNNING'},
    orderBy: {startedAt: 'desc'},
  });
  if (running) {
    if (Date.now() - running.startedAt.getTime() < STALE_RUN_MS) throw new PublishRunConflictError();
    await db.webPublishRun.update({where: {id: running.id}, data: {status: 'FAILED', error: 'La corrida quedó colgada', finishedAt: new Date()}});
  }
  const steps: PublishRunStep[] = STEP_DEFS.filter((step) => opts.publish || step.id !== 'publish').map((step) => ({
    ...step,
    status: 'PENDING',
    detail: null,
  }));
  const run = await db.webPublishRun.create({
    data: {quoteFamilyId: opts.familyId, quoteVersionId: opts.versionId, startedById: opts.userId, stepsJson: steps as any},
  });
  void runPipeline(run.id, opts, steps).catch((error: unknown) => {
    logger.error(JSON.stringify({event: 'publish_pipeline_crashed', runId: run.id, error: error instanceof Error ? error.message : String(error)}));
  });
  return run;
}

/** Marca como colgadas las corridas RUNNING viejas al leerlas, para que la pantalla no espere para siempre. */
export async function loadPublishRun(id: string) {
  const run = await db.webPublishRun.findUnique({where: {id}});
  if (!run) return null;
  if (run.status === 'RUNNING' && Date.now() - run.startedAt.getTime() > STALE_RUN_MS) {
    return db.webPublishRun.update({where: {id}, data: {status: 'FAILED', error: 'La corrida quedó colgada', finishedAt: new Date()}});
  }
  return run;
}

async function runPipeline(runId: string, opts: {familyId: string; versionId: string; userId: string; publish: boolean}, steps: PublishRunStep[]) {
  const save = () => db.webPublishRun.update({where: {id: runId}, data: {stepsJson: steps as any}});
  const step = async (id: string, work: () => Promise<{status: 'DONE' | 'SKIPPED'; detail: string}>) => {
    const entry = steps.find((candidate) => candidate.id === id);
    if (!entry) return;
    entry.status = 'RUNNING';
    await save();
    try {
      const result = await work();
      entry.status = result.status;
      entry.detail = result.detail;
    } catch (error) {
      entry.status = 'FAILED';
      entry.detail = error instanceof Error ? error.message : String(error);
      logger.warn(JSON.stringify({event: 'publish_pipeline_step_failed', runId, step: id, error: entry.detail}));
    }
    await save();
    return entry;
  };

  await step('images', () => fillMissingImages(opts.versionId, opts.userId));
  await step('hero', () => ensureHero(opts.familyId, opts.versionId));
  await step('enrichment', () => ensureEnrichment(opts.versionId, opts.userId));
  await step('title', () => ensureTitle(opts.familyId, opts.versionId));
  await step('thumbnail', () => ensureThumbnail(opts.familyId, opts.versionId));
  await step('model3d', () => reportModel3d(opts.versionId));
  let failed = false;
  if (opts.publish) {
    const result = await step('publish', async () => {
      const {webPublication} = await publishQuote(opts.familyId, {versionId: opts.versionId});
      return {status: 'DONE', detail: webPublication.url ? `Publicada: ${webPublication.url}` : 'Publicada'};
    });
    failed = result?.status === 'FAILED';
  }
  await db.webPublishRun.update({
    where: {id: runId},
    data: {status: failed ? 'FAILED' : 'DONE', error: failed ? steps.find((entry) => entry.id === 'publish')?.detail ?? null : null, finishedAt: new Date()},
  });
}

// ------------------------------------------------------------------ imágenes

type ItemNeedingImage = {
  itemId: string;
  name: string;
  productId: string | null;
};

async function fillMissingImages(versionId: string, userId: string): Promise<{status: 'DONE' | 'SKIPPED'; detail: string}> {
  const items = await db.quoteItem.findMany({
    where: {versionId},
    orderBy: {position: 'asc'},
    select: {
      id: true,
      frozenName: true,
      webImageUrl: true,
      productId: true,
      product: {select: {assets: {where: {status: 'READY', url: {not: null}}, select: {id: true}, take: 1}}},
    },
  });
  const missing: ItemNeedingImage[] = items
    .filter((item) => !item.webImageUrl && !(item.product?.assets.length))
    .map((item) => ({itemId: item.id, name: item.frozenName, productId: item.productId}));
  if (!missing.length) return {status: 'SKIPPED', detail: 'Todos los componentes ya tienen imagen'};

  const apiKey = await getSerperKey();
  const storage = await loadMediaStorage();
  const found: string[] = [];
  const notFound: string[] = [];
  for (const item of missing) {
    try {
      const picked = await findProductImage(item.name, apiKey);
      if (!picked) {
        notFound.push(item.name);
        continue;
      }
      const extension = picked.transparent ? 'png' : picked.contentType === 'image/webp' ? 'webp' : 'jpg';
      const contentType = picked.transparent ? 'image/png' : picked.contentType;
      if (item.productId) {
        const source = await storage.put(`product-assets/${item.productId}/source-${randomUUID()}.${picked.sourceExtension}`, picked.source, picked.contentType);
        const existing = await db.productAsset.count({where: {productId: item.productId}});
        const asset = await db.productAsset.create({
          data: {productId: item.productId, origin: 'SERPER', sourceUrl: source.url, approved: true, isPrimary: existing === 0, status: 'PENDING'},
        });
        const stored = await storage.put(`product-assets/${item.productId}/${asset.id}.${extension}`, picked.bytes, contentType);
        await db.productAsset.update({where: {id: asset.id}, data: {url: stored.url, storageKey: stored.key, status: 'READY'}});
        await db.auditLog.create({data: {userId, entityType: 'ProductAsset', entityId: asset.id, action: 'AUTO_FROM_SERPER', next: {sourceUrl: picked.sourceUrl, transparent: picked.transparent} as any}});
      } else {
        const stored = await storage.put(`quote-items/${item.itemId}/${randomUUID()}.${extension}`, picked.bytes, contentType);
        await db.quoteItem.update({where: {id: item.itemId}, data: {webImageUrl: stored.url}});
        await db.auditLog.create({data: {userId, entityType: 'QuoteItem', entityId: item.itemId, action: 'AUTO_IMAGE_FROM_SERPER', next: {sourceUrl: picked.sourceUrl, transparent: picked.transparent} as any}});
      }
      found.push(`${item.name}${picked.transparent ? '' : ' (con fondo)'}`);
    } catch (error) {
      logger.warn(JSON.stringify({event: 'publish_pipeline_image_failed', item: item.name, error: error instanceof Error ? error.message : String(error)}));
      notFound.push(item.name);
    }
  }
  const detail = [
    found.length ? `Se agregaron ${found.length}: ${found.join(', ')}` : null,
    notFound.length ? `Sin imagen (revisar a mano): ${notFound.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('. ');
  if (!found.length) throw new Error(detail || 'No se encontraron imágenes');
  return {status: 'DONE', detail};
}

type PickedImage = {
  bytes: Buffer;
  source: Buffer;
  sourceUrl: string;
  contentType: string;
  sourceExtension: string;
  transparent: boolean;
};

/**
 * Busca en Serper y devuelve la primera imagen que se pudo bajar y recortar.
 * Si ninguna candidata tiene fondo liso (fotos ambientadas), se queda con la
 * mejor que se pudo bajar, con fondo: es preferible a no tener foto.
 */
async function findProductImage(name: string, apiKey: string): Promise<PickedImage | null> {
  const results = await searchImages(`${name} png`, apiKey, 20);
  const candidates = rankCandidates(results).slice(0, CANDIDATES_PER_ITEM);
  let fallback: PickedImage | null = null;
  for (const candidate of candidates) {
    let downloaded: {buffer: Buffer; contentType: string};
    try {
      downloaded = await downloadImage(candidate.url);
    } catch {
      continue;
    }
    const sourceExtension = downloaded.contentType === 'image/png' ? 'png' : downloaded.contentType === 'image/webp' ? 'webp' : 'jpg';
    try {
      const {buffer} = await removeBackgroundDetailed(downloaded.buffer);
      return {bytes: buffer, source: downloaded.buffer, sourceUrl: candidate.url, contentType: downloaded.contentType, sourceExtension, transparent: true};
    } catch {
      fallback ??= {bytes: downloaded.buffer, source: downloaded.buffer, sourceUrl: candidate.url, contentType: downloaded.contentType, sourceExtension, transparent: false};
    }
  }
  return fallback;
}

/**
 * Orden de preferencia: PNG (suelen ser recortes de producto), tamaño
 * razonable (ni miniaturas ni banners) y proporción cercana al cuadrado.
 */
export function rankCandidates(results: SerperImage[]): SerperImage[] {
  const score = (image: SerperImage) => {
    const width = image.width ?? 0;
    const height = image.height ?? 0;
    if (width && height && (width < 250 || height < 250)) return -1;
    const ratio = width && height ? Math.max(width, height) / Math.min(width, height) : 1.5;
    if (ratio > 2.5) return -1;
    let value = 0;
    if (/\.png(\?|$)/i.test(image.url)) value += 3;
    if (width >= 600 && height >= 600) value += 2;
    value += Math.max(0, 2 - (ratio - 1));
    return value;
  };
  return results
    .map((image) => ({image, value: score(image)}))
    .filter((entry) => entry.value >= 0)
    .sort((a, b) => b.value - a.value)
    .map((entry) => entry.image);
}

async function downloadImage(url: string): Promise<{buffer: Buffer; contentType: string}> {
  const response = await fetch(url, {
    headers: {'user-agent': BROWSER_UA, accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8'},
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('no es una imagen');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('tamaño inválido');
  return {buffer, contentType};
}

// ---------------------------------------------------------------------- hero

async function ensureHero(familyId: string, versionId: string): Promise<{status: 'DONE' | 'SKIPPED'; detail: string}> {
  const family = await db.quoteFamily.findUniqueOrThrow({where: {id: familyId}, select: {heroAssetId: true, heroImageUrl: true}});
  if (family.heroAssetId || family.heroImageUrl) return {status: 'SKIPPED', detail: 'Ya había una foto principal elegida'};
  const caseItem = await findCaseItem(versionId);
  if (!caseItem) return {status: 'SKIPPED', detail: 'No hay gabinete con foto; la ficha usa la miniatura'};
  if (caseItem.assetId) {
    await db.quoteFamily.update({where: {id: familyId}, data: {heroAssetId: caseItem.assetId, heroImageUrl: null}});
  } else {
    await db.quoteFamily.update({where: {id: familyId}, data: {heroImageUrl: caseItem.imageUrl, heroAssetId: null}});
  }
  return {status: 'DONE', detail: `Se usa la foto de ${caseItem.name}`};
}

async function findCaseItem(versionId: string) {
  const items = await db.quoteItem.findMany({
    where: {versionId},
    orderBy: {position: 'asc'},
    select: {
      frozenName: true,
      webImageUrl: true,
      line: {select: {name: true}},
      product: {select: {assets: {where: {status: 'READY', url: {not: null}}, orderBy: [{isPrimary: 'desc'}, {createdAt: 'desc'}], take: 1, select: {id: true, url: true}}}},
    },
  });
  for (const item of items) {
    if (!CASE_PATTERN.test(`${item.line?.name ?? ''} ${item.frozenName}`)) continue;
    const asset = item.product?.assets[0];
    if (asset?.url) return {name: item.frozenName, assetId: asset.id, imageUrl: asset.url};
    if (item.webImageUrl) return {name: item.frozenName, assetId: null, imageUrl: item.webImageUrl};
  }
  return null;
}

// -------------------------------------------------------------- enriquecimiento

async function ensureEnrichment(versionId: string, userId: string): Promise<{status: 'DONE' | 'SKIPPED'; detail: string}> {
  const items = await loadEnrichmentItems(versionId);
  if (!items.length) throw new Error('El presupuesto no tiene ítems');
  const current = await db.quoteEnrichment.findUnique({where: {quoteVersionId: versionId}});
  const hash = enrichmentItemsHash(items);
  if (current?.descriptionHtml && current.itemsHash === hash && current.title) {
    return {status: 'SKIPPED', detail: 'Los textos ya estaban generados para estos componentes'};
  }
  const {enrichment, ai} = await runQuoteEnrichment(versionId, userId);
  const games = Array.isArray(enrichment.gamesJson) ? enrichment.gamesJson.length : 0;
  if (!ai.usedAi) return {status: 'DONE', detail: 'La IA está desactivada: se generó un texto básico. Activala en Ajustes → IA para el análisis completo'};
  return {status: 'DONE', detail: `${current ? 'Regenerados' : 'Generados'}: descripción, ${games} juegos analizados, programas y compatibilidad${ai.cacheHit ? ' (desde caché)' : ''}`};
}

async function ensureTitle(familyId: string, versionId: string): Promise<{status: 'DONE' | 'SKIPPED'; detail: string}> {
  const family = await db.quoteFamily.findUniqueOrThrow({where: {id: familyId}, select: {webTitle: true, webTagline: true}});
  const enrichment = await db.quoteEnrichment.findUnique({where: {quoteVersionId: versionId}, select: {title: true, tagline: true}});
  const data: {webTitle?: string; webTagline?: string} = {};
  if (!family.webTitle?.trim() && enrichment?.title) data.webTitle = enrichment.title;
  if (!family.webTagline?.trim() && enrichment?.tagline) data.webTagline = enrichment.tagline;
  if (!Object.keys(data).length) {
    return family.webTitle?.trim()
      ? {status: 'SKIPPED', detail: `Se mantiene "${family.webTitle.trim()}"`}
      : {status: 'SKIPPED', detail: 'La IA no propuso título; se publica con el nombre interno'};
  }
  await db.quoteFamily.update({where: {id: familyId}, data});
  return {status: 'DONE', detail: data.webTitle ? `Título propuesto: "${data.webTitle}"` : 'Bajada propuesta por la IA'};
}

// ----------------------------------------------------------------- miniatura

async function ensureThumbnail(familyId: string, versionId: string): Promise<{status: 'DONE' | 'SKIPPED'; detail: string}> {
  const family = await db.quoteFamily.findUniqueOrThrow({
    where: {id: familyId},
    select: {thumbnailUrl: true, webTitle: true, internalName: true, heroImageUrl: true, heroAsset: {select: {url: true}}},
  });
  if (family.thumbnailUrl) return {status: 'SKIPPED', detail: 'Ya había miniatura'};
  const template = await db.thumbnailTemplate.findFirst({where: {active: true}, orderBy: {createdAt: 'desc'}});
  if (!template) return {status: 'SKIPPED', detail: 'No hay plantilla de miniatura activa (Conexiones → Plantillas)'};
  const parsed = thumbnailRulesSchema.safeParse(template.rulesJson);
  if (!parsed.success) throw new Error(`La plantilla "${template.name}" tiene reglas inválidas`);
  const rules: ThumbnailRules = parsed.data;

  const productUrl = family.heroImageUrl ?? family.heroAsset?.url ?? (await findCaseItem(versionId))?.imageUrl ?? null;
  if (!productUrl) return {status: 'SKIPPED', detail: 'No hay foto del gabinete para componer la miniatura'};
  const productBuffer = await readOwnOrRemote(productUrl);
  const backgroundBuffer = rules.background.type === 'template' && template.templateImageUrl ? await readOwnOrRemote(template.templateImageUrl) : null;
  const title = family.webTitle?.trim() || family.internalName;
  const texts = rules.texts.map((text) => ({
    value: text.source === 'title' ? title : text.value ?? '',
    x: text.x,
    y: text.y,
    fontSize: text.fontSize,
    color: text.color,
    ...(text.fontFamily ? {fontFamily: text.fontFamily} : {}),
    ...(text.align ? {align: text.align} : {}),
  }));
  const output = await renderThumbnail({rules, backgroundBuffer, productBuffer, texts});
  const stored = await (await loadMediaStorage()).put(`quote-thumbnails/${familyId}/${randomUUID()}.jpg`, output, 'image/jpeg');
  await db.quoteFamily.update({where: {id: familyId}, data: {thumbnailUrl: stored.url}});
  return {status: 'DONE', detail: `Generada con la plantilla "${template.name}"`};
}

async function readOwnOrRemote(url: string): Promise<Buffer> {
  const key = ownStorageKeyFromUrl(url);
  if (key) return readMedia(key);
  return (await downloadImage(url)).buffer;
}

// ------------------------------------------------------------------------ 3D

async function reportModel3d(versionId: string): Promise<{status: 'DONE' | 'SKIPPED'; detail: string}> {
  const items = await db.quoteItem.findMany({
    where: {versionId},
    select: {frozenName: true, product: {select: {caseModel3D: {select: {status: true, glbUrl: true}}}}},
  });
  const withModel = items.find((item) => item.product?.caseModel3D?.status === 'READY' && item.product.caseModel3D.glbUrl);
  if (withModel) return {status: 'DONE', detail: `Se muestra el modelo de ${withModel.frozenName}`};
  return {status: 'SKIPPED', detail: 'El gabinete no tiene modelo 3D (opcional; se carga desde Catálogo → producto)'};
}
