import { BadRequestException, Body, Controller, Delete, NotFoundException, Param, Post, Put, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createAiClient, describeOpenAiError, generateReferenceImage, type ImageQuality } from '@tgs/ai';
import { decryptSecret } from '@tgs/config';
import { db } from '@tgs/database';
import { loadMediaStorage, ownStorageKeyFromUrl, readMedia } from '@tgs/storage';
import { z } from 'zod';
import { CurrentUser, jsonSafe, ZodPipe, type RequestUser } from './infrastructure.js';
import { analyzeBuild, BACKGROUND_PROMPTS, buildReferencePrompt, collectReferences, type PromptFacts, type RefImage, type RefRole, type ReferenceStyle } from './reference-prompt.js';
import { lookupProductFacts, lookupProductPhoto, serperKeyOrNull } from './product-lookup.js';
import { addWatermark, composeOnBackground, sizeForCase, transparentCase, trimCase } from './reference-compose.js';
import { evaluateFindings, inspectInterior } from './reference-verify.js';

/**
 * Imagen de referencia de cómo quedaría la PC del presupuesto. La arma el modelo de imágenes de OpenAI
 * (el mismo de las miniaturas): si el gabinete elegido tiene foto parte de ella, y si no, de la descripción.
 * El usuario la mira y decide si la incluye; si la incluye, queda en el presupuesto y el PDF la muestra.
 */

/** Intentos máximos por imagen (el primero + reintentos con corrección) y tiempo a partir del cual ya no se reintenta. */
const MAX_ATTEMPTS = 3;
const RETRY_TIME_BUDGET_MS = 110_000;
/** Cuántas fotos de componentes se mandan como máximo (más el fondo). */
const MAX_COMPONENT_PHOTOS = 6;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const REFERENCE_SIZE = '1536x1024' as const;

const generateSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(300),
            quantity: z.number().int().positive().max(99).optional().default(1),
            /** Foto del producto (la que trae NODO, AcuStock o la tienda). */
            imageUrl: z.string().trim().url().max(2000).nullable().optional(),
            /** Producto del catálogo propio: si no trae foto se usa la principal que tenga cargada. */
            productId: z.string().uuid().nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    /** Fondo de la imagen: lo elige el usuario antes de generar (PC gamer o PC de oficina). */
    style: z.enum(['gamer', 'oficina']),
  })
  .strict();

const saveSchema = z
  .object({ image: z.object({ url: z.string().trim().min(1).max(2000), key: z.string().trim().min(1).max(500) }).strict().nullable() })
  .strict();

/** Solo https y hosts públicos: la foto la baja el servidor, así que no puede apuntar a la red interna. */
export function isPublicImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === '0.0.0.0') return false;
  if (/^\[/.test(host) || host.includes(':')) return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  return true;
}

async function loadPhoto(url: string): Promise<Buffer | null> {
  try {
    const key = ownStorageKeyFromUrl(url);
    if (key) return await readMedia(key);
    if (!isPublicImageUrl(url)) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_PHOTO_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > MAX_PHOTO_BYTES ? null : buffer;
  } catch {
    return null;
  }
}

/** Foto en PNG de hasta 1024 px: alcanza para que el modelo reconozca el componente y mantiene liviano el pedido. */
const toReferencePng = (buffer: Buffer) => sharp(buffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();

/** Ítems del catálogo propio (con productId) que no traen foto: se completa con la foto principal del producto. */
async function withCatalogPhotos(items: z.infer<typeof generateSchema>['items']): Promise<Array<{ name: string; quantity: number; imageUrl: string | null }>> {
  const missing = [...new Set(items.filter((i) => !i.imageUrl && i.productId).map((i) => i.productId as string))];
  const assets = missing.length
    ? await db.productAsset.findMany({
        where: { productId: { in: missing }, status: 'READY', url: { not: null } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        select: { productId: true, url: true },
      })
    : [];
  const photoByProduct = new Map<string, string>();
  for (const asset of assets) if (asset.url && !photoByProduct.has(asset.productId)) photoByProduct.set(asset.productId, asset.url);
  return items.map((i) => ({ name: i.name, quantity: i.quantity, imageUrl: i.imageUrl ?? (i.productId ? photoByProduct.get(i.productId) ?? null : null) }));
}

/**
 * Imagen de fondo del ambiente (gamer u oficina) que se manda como referencia. Se genera una sola vez por estilo, se guarda y
 * se reutiliza en todas las imágenes siguientes. Si no se puede generar, la imagen se arma igual con el ambiente descripto en el prompt.
 */
async function getBackgroundImage(client: NonNullable<Awaited<ReturnType<typeof openAiClient>>>, style: ReferenceStyle, model: string, quality: ImageQuality): Promise<Buffer | null> {
  const key = `reference-backgrounds/${style}-v2.png`;
  try {
    return await readMedia(key);
  } catch {
    /* todavía no existe: se genera */
  }
  const result = await generateReferenceImage(client, { prompt: BACKGROUND_PROMPTS[style], model, quality, size: REFERENCE_SIZE });
  const png = await sharp(result.buffer).resize(1536, 1024, { fit: 'inside' }).png().toBuffer();
  await (await loadMediaStorage()).put(key, png, 'image/png');
  await db.aiRequest.create({ data: { task: 'THUMBNAIL_IMAGE', model: result.model, inputHash: randomUUID(), entityType: 'ReferenceBackground', entityId: style, success: true, durationMs: result.durationMs, usageJson: (result.usage ?? undefined) as any, costUsdCents: result.costUsdCents, resultJson: { key, style } as any } });
  return png;
}

async function openAiClient() {
  const ai = await db.aiSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
  const key = ai.apiKeyEncrypted ? decryptSecret(ai.apiKeyEncrypted) : process.env.OPENAI_API_KEY;
  return key ? createAiClient({ apiKey: key }) : null;
}

@Controller('quote-reference-image')
export class QuoteReferenceImageController {
  /** Genera una imagen de referencia con los ítems del formulario (todavía sin guardar) y la deja lista para previsualizar. */
  @Post('generate')
  async generate(@Body(new ZodPipe(generateSchema)) body: z.infer<typeof generateSchema>, @CurrentUser() actor: RequestUser) {
    const client = await openAiClient();
    if (!client) throw new ServiceUnavailableException('Falta la clave de OpenAI para generar la imagen (Configuración → IA).');
    const settings = await db.thumbnailAiSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });

    const quality = (settings.quality || 'medium') as ImageQuality;
    // Productos del catálogo propio sin foto en el formulario: se usa la foto principal que tengan cargada.
    const items = await withCatalogPhotos(body.items);
    // Lo que lleva el presupuesto se vuelve la fuente de verdad del prompt (gabinete, placa de video, RAM, refrigeración).
    const spec = analyzeBuild(items);
    // Fotos de los componentes + una imagen de fondo del ambiente elegido: todas se mandan como imágenes de referencia.
    const attached: Array<RefImage & { buffer: Buffer }> = [];
    for (const reference of collectReferences(spec, MAX_COMPONENT_PHOTOS + 2)) {
      if (attached.length >= MAX_COMPONENT_PHOTOS) break;
      const buffer = await loadPhoto(reference.imageUrl);
      if (buffer) attached.push({ ...reference, buffer: await toReferencePng(buffer) });
    }
    // Búsqueda en Google (Serper) del producto exacto: la foto de los componentes que no la traen (sobre todo el gabinete)
    // y sus medidas reales, para que la IA respete el modelo y la escala en vez de inventar.
    const googled: RefRole[] = [];
    let facts: PromptFacts | null = null;
    const serperKey = await serperKeyOrNull();
    if (serperKey) {
      const have = new Set(attached.map((r) => r.role));
      const wanted = ([['gabinete', spec.caseName], ['placa de video', spec.gpu], ['refrigeración', spec.cooling.name], ['motherboard', spec.motherboard]] as Array<[RefRole, string | null]>)
        .filter(([role, name]) => name && !have.has(role));
      const [found, looked] = await Promise.all([
        Promise.all(wanted.map(async ([role, name]) => {
          const hit = await lookupProductPhoto(name as string, role, serperKey);
          if (!hit) return null;
          try {
            return { role, name: name as string, imageUrl: hit.sourceUrl, source: 'google' as const, buffer: await toReferencePng(hit.buffer) };
          } catch {
            return null; // formato que no se puede leer: se ignora esa candidata
          }
        })),
        lookupProductFacts(spec.caseName, spec.gpu, serperKey).catch(() => null),
      ]);
      for (const hit of found) if (hit) { attached.push(hit); googled.push(hit.role); }
      // El gabinete siempre primero, después el resto en el orden de importancia de siempre.
      const order: RefRole[] = ['gabinete', 'placa de video', 'refrigeración', 'memoria RAM', 'motherboard', 'procesador', 'fuente'];
      attached.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
      attached.splice(MAX_COMPONENT_PHOTOS);
      facts = looked;
    }
    const background = await getBackgroundImage(client, body.style, settings.model, quality).catch(() => null);

    // Con la foto del gabinete el método es otro: el gabinete REAL (recortado) se conserva y la IA solo arma su interior con los
    // componentes del pedido; el fondo y la composición los hace el sistema, sin IA. Así el modelo no puede cambiar el gabinete
    // ni el ambiente. Sin foto del gabinete no hay nada que conservar y se genera la escena completa como antes.
    const caseRef = attached.find((r) => r.role === 'gabinete');
    const ai = await db.aiSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    const started = Date.now();
    let result: Awaited<ReturnType<typeof generateReferenceImage>> | null = null;
    let finalBuffer: Buffer;
    let mode: 'interior' | 'escena' = 'escena';
    let totalCost = 0n;
    let attempts = 0;
    let issues: string[] = [];
    let verified = false;
    try {
      if (caseRef) {
        mode = 'interior';
        const caseCut = await trimCase(await transparentCase(caseRef.buffer));
        const caseMeta = await sharp(caseCut).metadata();
        const refs = [{ ...caseRef, buffer: caseCut }, ...attached.filter((r) => r !== caseRef)];
        const size = sizeForCase(caseMeta.width ?? 1, caseMeta.height ?? 1);
        let corrections: string[] = [];
        let best: { cut: Buffer; issues: string[] } | null = null;
        // Después de cada intento un modelo de visión mira el resultado y lo compara con el presupuesto (placa de video, refrigeración,
        // RAM con RGB). Si no coincide se regenera con la corrección explícita, siempre desde la foto original del gabinete.
        while (attempts < MAX_ATTEMPTS) {
          attempts += 1;
          const prompt = buildReferencePrompt(spec, body.style, refs, false, facts, 'interior', corrections);
          result = await generateReferenceImage(client, {
            prompt,
            model: settings.model,
            quality,
            size,
            images: refs.map((r, i) => ({ buffer: r.buffer, name: `${i + 1}-${r.role.replace(/\s+/g, '-')}.png`, mime: 'image/png' })),
            transparent: true,
          });
          totalCost += result.costUsdCents;
          // Si el modelo ignoró el fondo transparente se vuelve a recortar.
          const cut = await transparentCase(result.buffer);
          const findings = await inspectInterior(client, ai.model, cut);
          const evaluation = findings ? evaluateFindings(spec, findings) : { issues: [] as string[], corrections: [] as string[] };
          verified = Boolean(findings);
          if (!best || evaluation.issues.length < best.issues.length) best = { cut, issues: evaluation.issues };
          if (!findings || evaluation.issues.length === 0) break;
          if (Date.now() - started > RETRY_TIME_BUDGET_MS) break;
          corrections = evaluation.corrections;
        }
        issues = best!.issues;
        finalBuffer = await composeOnBackground(best!.cut, background, body.style);
      } else {
        attempts = 1;
        const prompt = buildReferencePrompt(spec, body.style, attached, Boolean(background), facts);
        const images = [
          ...attached.map((r, i) => ({ buffer: r.buffer, name: `${i + 1}-${r.role.replace(/\s+/g, '-')}.png`, mime: 'image/png' })),
          ...(background ? [{ buffer: background, name: `fondo-${body.style}.png`, mime: 'image/png' }] : []),
        ];
        result = await generateReferenceImage(client, { prompt, model: settings.model, quality, size: REFERENCE_SIZE, images });
        totalCost = result.costUsdCents;
        finalBuffer = result.buffer;
        const findings = await inspectInterior(client, ai.model, finalBuffer);
        verified = Boolean(findings);
        issues = findings ? evaluateFindings(spec, findings).issues : [];
      }
    } catch (error) {
      const info = describeOpenAiError(error);
      // Además del mensaje traducido se deja el original de OpenAI: distingue un límite por minuto de una cuota agotada.
      const raw = (error as { message?: string })?.message?.replace(/\s+/g, ' ').slice(0, 240);
      await db.aiRequest.create({ data: { task: 'THUMBNAIL_IMAGE', model: settings.model, inputHash: randomUUID(), entityType: 'ReferenceImage', entityId: actor.id, success: false, error: raw ? `${info.message} ${raw}` : info.message, costUsdCents: totalCost, durationMs: Date.now() - started } });
      throw new ServiceUnavailableException(`OpenAI no pudo generar la imagen: ${info.message}${raw ? ` (${raw})` : ''}`);
    }
    // Marca de agua discreta en la esquina: queda pegada a la imagen, así también sale en el PDF.
    finalBuffer = await addWatermark(finalBuffer);
    const jpeg = await sharp(finalBuffer).jpeg({ quality: 90 }).toBuffer();
    const stored = await (await loadMediaStorage()).put(`reference-images/${randomUUID()}.jpg`, jpeg, 'image/jpeg');
    await db.aiRequest.create({
      data: { task: 'THUMBNAIL_IMAGE', model: result!.model, inputHash: randomUUID(), entityType: 'ReferenceImage', entityId: actor.id, success: true, durationMs: Date.now() - started, usageJson: (result!.usage ?? undefined) as any, costUsdCents: totalCost, resultJson: { url: stored.url, attempts, verified, issues, attached: attached.map((r) => r.role), googled, facts, background: Boolean(background), mode, caseItem: spec.caseName, style: body.style, gpu: spec.gpu, ramRgb: spec.ramRgb, cooling: spec.cooling.type } as any },
    });
    return jsonSafe({
      url: stored.url,
      key: stored.key,
      usedPhoto: attached.some((r) => r.role === 'gabinete'),
      attached: attached.map((r) => r.role),
      googled: googled.filter((role) => attached.some((r) => r.role === role)),
      facts,
      mode,
      verification: { verified, attempts, issues },
      background: Boolean(background),
      caseName: spec.caseName,
      style: body.style,
      spec: { gpu: spec.gpu, ramRgb: spec.ramRgb, cooling: spec.cooling.type },
      costUsdCents: totalCost,
    });
  }

  /** Deja la imagen elegida en el presupuesto (o la quita con `image: null`). El PDF la muestra mientras esté. */
  @Put(':familyId')
  async save(@Param('familyId', new ZodPipe(z.string().uuid())) familyId: string, @Body(new ZodPipe(saveSchema)) body: z.infer<typeof saveSchema>) {
    const family = await db.quoteFamily.findUnique({ where: { id: familyId }, select: { referenceImageKey: true } });
    if (!family) throw new NotFoundException('Presupuesto inexistente');
    if (body.image && (!body.image.key.startsWith('reference-images/') || ownStorageKeyFromUrl(body.image.url) !== body.image.key)) {
      throw new BadRequestException('La imagen no es una imagen de referencia generada por el sistema.');
    }
    await db.quoteFamily.update({ where: { id: familyId }, data: { referenceImageUrl: body.image?.url ?? null, referenceImageKey: body.image?.key ?? null } });
    // Los PDF ya generados quedan viejos: el hash del PDF incluye la imagen, así que se regeneran solos.
    if (family.referenceImageKey && family.referenceImageKey !== body.image?.key) {
      await (await loadMediaStorage()).delete(family.referenceImageKey).catch(() => undefined);
    }
    return { ok: true };
  }

  /** Descarta una imagen generada que no se llegó a incluir en ningún presupuesto. */
  @Delete()
  async discard(@Body(new ZodPipe(z.object({ key: z.string().trim().min(1).max(500) }).strict())) body: { key: string }) {
    if (!body.key.startsWith('reference-images/')) throw new BadRequestException('Archivo inválido');
    const inUse = await db.quoteFamily.count({ where: { referenceImageKey: body.key } });
    if (!inUse) await (await loadMediaStorage()).delete(body.key).catch(() => undefined);
    return { ok: true };
  }
}
