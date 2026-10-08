import { BadRequestException, Body, Controller, Delete, NotFoundException, Param, Post, Put, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createAiClient, describeOpenAiError, generateReferenceImage, type ImageQuality } from '@tgs/ai';
import { decryptSecret } from '@tgs/config';
import { db } from '@tgs/database';
import { loadMediaStorage, ownStorageKeyFromUrl, readMedia } from '@tgs/storage';
import { z } from 'zod';
import { CurrentUser, jsonSafe, ZodPipe, type RequestUser } from './infrastructure.js';
import { analyzeBuild, BACKGROUND_PROMPTS, buildReferencePrompt, collectReferences, type RefImage, type ReferenceStyle } from './reference-prompt.js';

/**
 * Imagen de referencia de cómo quedaría la PC del presupuesto. La arma el modelo de imágenes de OpenAI
 * (el mismo de las miniaturas): si el gabinete elegido tiene foto parte de ella, y si no, de la descripción.
 * El usuario la mira y decide si la incluye; si la incluye, queda en el presupuesto y el PDF la muestra.
 */

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
  const key = `reference-backgrounds/${style}-v1.png`;
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
    const background = await getBackgroundImage(client, body.style, settings.model, quality).catch(() => null);
    const prompt = buildReferencePrompt(spec, body.style, attached, Boolean(background));
    const images = [
      ...attached.map((r, i) => ({ buffer: r.buffer, name: `${i + 1}-${r.role.replace(/\s+/g, '-')}.png`, mime: 'image/png' })),
      ...(background ? [{ buffer: background, name: `fondo-${body.style}.png`, mime: 'image/png' }] : []),
    ];
    const started = Date.now();
    let result;
    try {
      result = await generateReferenceImage(client, { prompt, model: settings.model, quality, size: REFERENCE_SIZE, images });
    } catch (error) {
      const info = describeOpenAiError(error);
      await db.aiRequest.create({ data: { task: 'THUMBNAIL_IMAGE', model: settings.model, inputHash: randomUUID(), entityType: 'ReferenceImage', entityId: actor.id, success: false, error: info.message, durationMs: Date.now() - started } });
      throw new ServiceUnavailableException(`OpenAI no pudo generar la imagen: ${info.message}`);
    }
    const jpeg = await sharp(result.buffer).jpeg({ quality: 90 }).toBuffer();
    const stored = await (await loadMediaStorage()).put(`reference-images/${randomUUID()}.jpg`, jpeg, 'image/jpeg');
    await db.aiRequest.create({
      data: { task: 'THUMBNAIL_IMAGE', model: result.model, inputHash: randomUUID(), entityType: 'ReferenceImage', entityId: actor.id, success: true, durationMs: result.durationMs, usageJson: (result.usage ?? undefined) as any, costUsdCents: result.costUsdCents, resultJson: { url: stored.url, attached: attached.map((r) => r.role), background: Boolean(background), caseItem: spec.caseName, style: body.style, gpu: spec.gpu, ramRgb: spec.ramRgb, cooling: spec.cooling.type } as any },
    });
    return jsonSafe({
      url: stored.url,
      key: stored.key,
      usedPhoto: attached.some((r) => r.role === 'gabinete'),
      attached: attached.map((r) => r.role),
      background: Boolean(background),
      caseName: spec.caseName,
      style: body.style,
      spec: { gpu: spec.gpu, ramRgb: spec.ramRgb, cooling: spec.cooling.type },
      costUsdCents: result.costUsdCents,
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
