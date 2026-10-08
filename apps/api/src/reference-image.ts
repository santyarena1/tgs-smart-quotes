import { BadRequestException, Body, Controller, Delete, NotFoundException, Param, Post, Put, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createAiClient, describeOpenAiError, generateReferenceImage, type ImageQuality } from '@tgs/ai';
import { decryptSecret } from '@tgs/config';
import { db } from '@tgs/database';
import { loadMediaStorage, ownStorageKeyFromUrl, readMedia } from '@tgs/storage';
import { z } from 'zod';
import { CurrentUser, jsonSafe, ZodPipe, type RequestUser } from './infrastructure.js';
import { analyzeBuild, buildReferencePrompt } from './reference-prompt.js';

/**
 * Imagen de referencia de cómo quedaría la PC del presupuesto. La arma el modelo de imágenes de OpenAI
 * (el mismo de las miniaturas): si el gabinete elegido tiene foto parte de ella, y si no, de la descripción.
 * El usuario la mira y decide si la incluye; si la incluye, queda en el presupuesto y el PDF la muestra.
 */

const MAX_COMPONENTS = 14;
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
            /** Foto del producto (la que trae NODO o la tienda). Solo se usa la del gabinete. */
            imageUrl: z.string().trim().url().max(2000).nullable().optional(),
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

    // Lo que lleva el presupuesto se vuelve requisitos obligatorios del prompt (gabinete, placa de video, RAM, refrigeración).
    const spec = analyzeBuild(body.items);
    const photo = spec.caseImageUrl ? await loadPhoto(spec.caseImageUrl) : null;
    const prompt = buildReferencePrompt(spec, body.style, Boolean(photo));
    const quality = (settings.quality || 'medium') as ImageQuality;
    const started = Date.now();
    let result;
    try {
      result = await generateReferenceImage(client, {
        prompt,
        model: settings.model,
        quality,
        size: REFERENCE_SIZE,
        photo: photo ? { buffer: await sharp(photo).resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).png().toBuffer(), name: 'gabinete.png', mime: 'image/png' } : null,
      });
    } catch (error) {
      const info = describeOpenAiError(error);
      await db.aiRequest.create({ data: { task: 'THUMBNAIL_IMAGE', model: settings.model, inputHash: randomUUID(), entityType: 'ReferenceImage', entityId: actor.id, success: false, error: info.message, durationMs: Date.now() - started } });
      throw new ServiceUnavailableException(`OpenAI no pudo generar la imagen: ${info.message}`);
    }
    const jpeg = await sharp(result.buffer).jpeg({ quality: 90 }).toBuffer();
    const stored = await (await loadMediaStorage()).put(`reference-images/${randomUUID()}.jpg`, jpeg, 'image/jpeg');
    await db.aiRequest.create({
      data: { task: 'THUMBNAIL_IMAGE', model: result.model, inputHash: randomUUID(), entityType: 'ReferenceImage', entityId: actor.id, success: true, durationMs: result.durationMs, usageJson: (result.usage ?? undefined) as any, costUsdCents: result.costUsdCents, resultJson: { url: stored.url, usedPhoto: Boolean(photo), caseItem: spec.caseName, style: body.style, gpu: spec.gpu, ramRgb: spec.ramRgb, cooling: spec.cooling.type } as any },
    });
    return jsonSafe({ url: stored.url, key: stored.key, usedPhoto: Boolean(photo), caseName: spec.caseName, style: body.style, spec: { gpu: spec.gpu, ramRgb: spec.ramRgb, cooling: spec.cooling.type }, costUsdCents: result.costUsdCents });
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
