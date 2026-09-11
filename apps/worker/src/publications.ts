import {db} from '@tgs/database';
import {buildPublishPayload, publishQuote} from '@tgs/providers';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    // Las claves en undefined se omiten, igual que hace JSON al guardar el
    // snapshot: si no, un campo opcional ausente contaba como diferencia y
    // se republicaba todo cada hora.
    const keys = Object.keys(object).filter((key) => object[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Cada hora: si lo que se publicaría hoy difiere del snapshot publicado,
 * se republica. Trabaja sobre la versión fijada en la publicación (la que
 * está en la tienda), no sobre la activa del presupuesto.
 *
 * Una republicación que falla deja el producto publicado y registra el error
 * (ver publishQuote), así que en la próxima vuelta se vuelve a intentar sola.
 */
export async function resyncStalePublications(_now = new Date()) {
  const config = await db.externalModuleConfig.findUnique({where: {id: 'singleton'}, select: {autoRepublish: true}});
  if (!config?.autoRepublish) return {checked: 0, resynced: 0, failed: 0, enabled: false};
  const publications = await db.webPublication.findMany({
    where: {status: 'PUBLISHED'},
    select: {quoteFamilyId: true, quoteVersionId: true, payloadSnapshot: true},
  });
  let resynced = 0;
  let failed = 0;
  for (const publication of publications) {
    try {
      const payload = await buildPublishPayload(publication.quoteFamilyId, publication.quoteVersionId);
      if (stable(payload) === stable(publication.payloadSnapshot)) continue;
      await publishQuote(publication.quoteFamilyId, {versionId: publication.quoteVersionId});
      resynced += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({level: 'error', task: 'resync-publication', quoteFamilyId: publication.quoteFamilyId, error: String(error)}));
    }
  }
  return {checked: publications.length, resynced, failed, enabled: true};
}
