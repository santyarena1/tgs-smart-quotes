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
/**
 * El worker es un servicio aparte con sus propias variables: si le falta la
 * clave para descifrar el secreto de WordPress, o la URL pública de la API
 * con la que se arman las URLs de las imágenes, no puede republicar bien.
 * Antes fallaba en silencio cada hora y dejaba el error en cada publicación
 * ("SETTINGS_ENC_KEY debe contener 32 bytes"); ahora se saltea y lo dice.
 */
export function resyncEnvProblem(): string | null {
  if (!process.env.SETTINGS_ENC_KEY?.trim()) return 'Falta SETTINGS_ENC_KEY en el worker (tiene que ser la misma clave que la API)';
  if (!process.env.API_PUBLIC_URL?.trim()) return 'Falta API_PUBLIC_URL en el worker (la URL pública de la API, igual que en el servicio api)';
  return null;
}

export async function resyncStalePublications(_now = new Date()) {
  const envProblem = resyncEnvProblem();
  if (envProblem) {
    console.error(JSON.stringify({level: 'error', task: 'resync-publications', skipped: true, error: envProblem}));
    return {checked: 0, resynced: 0, failed: 0, enabled: false, skipped: envProblem};
  }
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
