import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {db} from '@tgs/database';
import {removeBackgroundDetailed} from '@tgs/providers';
import {loadMediaStorage, ownStorageKeyFromUrl, readMedia} from '@tgs/storage';

/**
 * Revisión de recortes: vuelve a quitar el fondo de las fotos de un
 * presupuesto que no fueron recortadas con el modelo de segmentación (las
 * del relleno por color viejo, las cargadas "tal cual" con fondo, o
 * anteriores a que se guardara el método). Lo usa el paso "Recortes de las
 * fotos" de "Preparar y publicar" y el botón "Revisar recortes".
 *
 * Fuente para el recorte: la foto original si la tenemos (ProductAsset.
 * sourceUrl), si no la imagen actual aplanada sobre blanco: el modelo igual
 * separa producto de fondo, y los halos/sombras del recorte viejo son
 * opacos, así que se van.
 */

export type RecutSummary = {
  /** Nombres de los componentes cuya foto se rehízo. */
  recut: string[];
  /** Fotos que ya estaban bien (recortadas con el modelo). */
  kept: number;
  /** Nombres de los componentes cuya foto no se pudo rehacer, con el motivo. */
  failed: string[];
  /** Componentes sin foto (no hay nada que recortar). */
  missing: number;
};

async function readImage(url: string): Promise<Buffer> {
  const key = ownStorageKeyFromUrl(url);
  if (key) return readMedia(key);
  const response = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0'}});
  if (!response.ok) throw new Error(`HTTP ${response.status} al bajar la foto`);
  return Buffer.from(await response.arrayBuffer());
}

/** Recorta con el modelo; si el modelo no corrió (cayó al relleno) no se toca nada. */
async function recutBuffer(source: Buffer): Promise<Buffer | null> {
  // Aplanado sobre blanco: si la entrada es un PNG ya recortado, el modelo
  // recibe una foto normal y decide de cero qué es producto.
  const flat = await sharp(source, {failOn: 'none'}).flatten({background: '#ffffff'}).png().toBuffer();
  const result = await removeBackgroundDetailed(flat);
  return result.method === 'model' ? result.buffer : null;
}

export async function recutVersionImages(versionId: string, userId: string | null, opts: {force?: boolean} = {}): Promise<RecutSummary> {
  const items = await db.quoteItem.findMany({
    where: {versionId},
    orderBy: {position: 'asc'},
    select: {
      id: true,
      frozenName: true,
      webImageUrl: true,
      webImageCut: true,
      productId: true,
      product: {
        select: {
          assets: {where: {status: 'READY', url: {not: null}}, orderBy: [{isPrimary: 'desc'}, {createdAt: 'desc'}], take: 1, select: {id: true, url: true, sourceUrl: true, storageKey: true, cutMethod: true}},
        },
      },
    },
  });
  const storage = await loadMediaStorage();
  const summary: RecutSummary = {recut: [], kept: 0, failed: [], missing: 0};

  for (const item of items) {
    const asset = item.webImageUrl ? null : (item.product?.assets[0] ?? null);
    const currentUrl = item.webImageUrl ?? asset?.url ?? null;
    if (!currentUrl) {
      summary.missing++;
      continue;
    }
    const method = item.webImageUrl ? item.webImageCut : asset?.cutMethod;
    if (method === 'model' && !opts.force) {
      summary.kept++;
      continue;
    }
    try {
      const source = await readImage(asset?.sourceUrl ?? currentUrl).catch(() => readImage(currentUrl));
      const png = await recutBuffer(source);
      if (!png) {
        summary.failed.push(`${item.frozenName} (el modelo de recorte no está disponible)`);
        continue;
      }
      if (item.webImageUrl) {
        const stored = await storage.put(`quote-items/${item.id}/${randomUUID()}.png`, png, 'image/png');
        const previousKey = ownStorageKeyFromUrl(item.webImageUrl);
        await db.quoteItem.update({where: {id: item.id}, data: {webImageUrl: stored.url, webImageCut: 'model'}});
        // Si esta foto era la principal de algún presupuesto, que siga apuntando a la nueva.
        await db.quoteFamily.updateMany({where: {heroImageUrl: item.webImageUrl}, data: {heroImageUrl: stored.url}});
        if (previousKey) await storage.delete(previousKey).catch(() => undefined);
      } else if (asset) {
        const stored = await storage.put(`product-assets/${item.productId}/${asset.id}-${randomUUID().slice(0, 8)}.png`, png, 'image/png');
        await db.productAsset.update({where: {id: asset.id}, data: {url: stored.url, storageKey: stored.key, cutMethod: 'model', lastError: null}});
        if (asset.storageKey && asset.storageKey !== stored.key) await storage.delete(asset.storageKey).catch(() => undefined);
      }
      if (userId) {
        await db.auditLog.create({
          data: {userId, entityType: item.webImageUrl ? 'QuoteItem' : 'ProductAsset', entityId: item.webImageUrl ? item.id : asset!.id, action: 'RECUT_IMAGE', next: {item: item.frozenName} as any},
        });
      }
      summary.recut.push(item.frozenName);
    } catch (error) {
      summary.failed.push(`${item.frozenName} (${error instanceof Error ? error.message : 'error'})`);
    }
  }
  return summary;
}

/**
 * Revisión en segundo plano: recortar 6–8 fotos con el modelo lleva más de
 * lo que aguanta el proxy (la petición se cortaba con "internal server
 * error"). El endpoint arranca el trabajo y devuelve un id; el front lo
 * consulta hasta que termina. En memoria: alcanza para una instancia y los
 * resultados se olvidan a la hora.
 */
export type RecutJob = {id: string; versionId: string; status: 'RUNNING' | 'DONE' | 'FAILED'; startedAt: number; summary?: RecutSummary; detail?: string; error?: string};
const jobs = new Map<string, RecutJob>();

export function startRecutJob(versionId: string, userId: string | null, opts: {force?: boolean} = {}): RecutJob {
  for (const [id, job] of jobs) if (Date.now() - job.startedAt > 3_600_000) jobs.delete(id);
  const running = [...jobs.values()].find((job) => job.versionId === versionId && job.status === 'RUNNING');
  if (running) return running;
  const job: RecutJob = {id: randomUUID(), versionId, status: 'RUNNING', startedAt: Date.now()};
  jobs.set(job.id, job);
  void recutVersionImages(versionId, userId, opts)
    .then((summary) => {
      job.status = 'DONE';
      job.summary = summary;
      job.detail = describeRecut(summary);
    })
    .catch((error) => {
      job.status = 'FAILED';
      job.error = error instanceof Error ? error.message : String(error);
    });
  return job;
}

export function getRecutJob(id: string): RecutJob | null {
  return jobs.get(id) ?? null;
}

export function describeRecut(summary: RecutSummary): string {
  const parts: string[] = [];
  if (summary.recut.length) parts.push(`${summary.recut.length} foto${summary.recut.length === 1 ? '' : 's'} recortada${summary.recut.length === 1 ? '' : 's'} de nuevo: ${summary.recut.join(', ')}`);
  if (summary.kept) parts.push(`${summary.kept} ya estaba${summary.kept === 1 ? '' : 'n'} bien`);
  if (summary.failed.length) parts.push(`no se pudo: ${summary.failed.join('; ')}`);
  if (summary.missing) parts.push(`${summary.missing} sin foto`);
  return parts.join(' · ') || 'Sin fotos que revisar';
}
