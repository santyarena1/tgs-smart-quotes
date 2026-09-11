import {BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Req} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createAiClient, describeOpenAiError, generateThumbnailImage, type ImageQuality, type ImageSize} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {
  idSchema,
  thumbnailAiReferenceUpdateSchema,
  thumbnailAiSettingsUpdateSchema,
  type ThumbnailAiReferenceUpdateInput,
  type ThumbnailAiSettingsUpdateInput,
} from '@tgs/contracts';
import {db} from '@tgs/database';
import {loadMediaStorage, ownStorageKeyFromUrl, readMedia} from '@tgs/storage';
import {renderHtmlToPng} from '@tgs/pdf';
import {removeBackgroundDetailed} from '@tgs/providers';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';
import {extractSpecsFromItems, type StoreTitleSpecs} from './quote-title.js';
import {buildHeadline, buildRows, DEFAULT_CASE_AI_PROMPT, DEFAULT_FOOTER, renderThumbnailHtml, type FooterBadge} from './thumbnail-layout.js';

/**
 * Miniaturas de la tienda.
 *
 * Dos modos (Ajustes → Miniaturas):
 *  - LAYOUT: la plantilla TGS la compone el sistema en HTML/CSS y la captura
 *    Chromium (texto exacto, gratis, un segundo). Opcionalmente la foto del
 *    gabinete pasa antes por el modelo de imágenes para rellenar el interior
 *    con componentes y luces (caseAiMode), con caché por foto.
 *  - AI_SCENE: toda la imagen la genera el modelo de imágenes a partir de las
 *    miniaturas de referencia, la foto del gabinete y un prompt.
 */

const CASE_PATTERN = /gabinete|case|chasis|tower/i;
const MAX_REFERENCES = 6;

/** Placeholders disponibles en el prompt y en el texto; se documentan en la UI. */
export const THUMBNAIL_AI_PLACEHOLDERS = ['titulo', 'cpu', 'gpu', 'ram', 'disco', 'so', 'gabinete', 'componentes'] as const;

export async function loadThumbnailAiSettings() {
  return db.thumbnailAiSettings.upsert({where: {id: 'singleton'}, update: {}, create: {id: 'singleton'}});
}

function footerBadges(raw: unknown): FooterBadge[] {
  return Array.isArray(raw) && raw.length ? (raw as FooterBadge[]) : DEFAULT_FOOTER;
}

async function settingsDto() {
  const [settings, references] = await Promise.all([loadThumbnailAiSettings(), loadReferences()]);
  return jsonSafe({
    ...settings,
    footer: footerBadges(settings.footerJson),
    footerJson: undefined,
    caseAiPrompt: settings.caseAiPrompt || DEFAULT_CASE_AI_PROMPT,
    references,
    placeholders: THUMBNAIL_AI_PLACEHOLDERS,
  });
}

async function openAiClient() {
  const ai = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  const key = ai.apiKeyEncrypted ? decryptSecret(ai.apiKeyEncrypted) : process.env.OPENAI_API_KEY;
  return key ? createAiClient({apiKey: key}) : null;
}

const toDataUrl = (buffer: Buffer, mime = 'image/png') => `data:${mime};base64,${buffer.toString('base64')}`;

/**
 * El gabinete tiene que ir recortado (fondo transparente) para que en la
 * miniatura no quede un rectángulo alrededor. Si la imagen viene sin
 * transparencia en las esquinas —una foto "tal cual" o una salida de la IA
 * que ignoró el pedido de fondo transparente— se intenta el quitado de fondo
 * del sistema; si el fondo no es claro y uniforme, se deja como está.
 */
async function ensureTransparentCase(buffer: Buffer): Promise<Buffer> {
  const png = sharp(buffer).ensureAlpha();
  const {data, info} = await png.raw().toBuffer({resolveWithObject: true});
  const {width, height, channels} = info;
  if (!width || !height) return buffer;
  const alphaAt = (x: number, y: number) => data[(y * width + x) * channels + 3] ?? 255;
  const corners = [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)];
  if (corners.some((alpha) => alpha < 250)) return buffer;
  try {
    const {buffer: cut, removedRatio} = await removeBackgroundDetailed(buffer);
    return removedRatio > 0.05 ? cut : buffer;
  } catch {
    return buffer;
  }
}

/**
 * Gabinete procesado con IA (interior armado, luces RGB) a partir de la foto
 * original, con caché por URL: el mismo gabinete se repite en muchas PCs.
 */
/**
 * IMPORTANTE: la entrada es SIEMPRE la foto original del gabinete
 * (`sourceBuffer`, la que tiene el producto), nunca una salida anterior de la
 * IA. Regenerar parte de cero desde la misma foto; si se encadenaran
 * resultados, cada pasada deformaría un poco más el gabinete.
 */
async function caseWithAi(sourceUrl: string, sourceBuffer: Buffer, settings: {model: string; quality: string; caseAiPrompt: string}, familyId: string, force = false): Promise<Buffer> {
  const prompt = settings.caseAiPrompt.trim() || DEFAULT_CASE_AI_PROMPT;
  const cached = await db.thumbnailCaseRender.findUnique({where: {sourceUrl}});
  if (cached && cached.prompt === prompt && !force) {
    try {
      return await readMedia(cached.key);
    } catch {
      await db.thumbnailCaseRender.delete({where: {id: cached.id}}).catch(() => undefined);
    }
  }
  const client = await openAiClient();
  if (!client) throw new ThumbnailAiUnavailable('Falta la clave de OpenAI (Ajustes → IA) para procesar el gabinete');
  const started = Date.now();
  let result;
  try {
    result = await generateThumbnailImage(client, {
      prompt,
      images: [{buffer: await normalizeInput(sourceBuffer), name: 'gabinete.png', mime: 'image/png'}],
      size: '1024x1024',
      quality: settings.quality as ImageQuality,
      model: settings.model,
      transparent: true,
    });
  } catch (error) {
    const info = describeOpenAiError(error);
    await db.aiRequest.create({data: {task: 'THUMBNAIL_IMAGE', model: settings.model, inputHash: randomUUID(), entityType: 'QuoteFamily', entityId: familyId, success: false, error: info.message, durationMs: Date.now() - started}});
    throw new Error(`OpenAI no pudo procesar el gabinete: ${info.message}`);
  }
  const rendered = await ensureTransparentCase(result.buffer);
  const stored = await (await loadMediaStorage()).put(`thumbnail-ai/cases/${randomUUID()}.png`, rendered, 'image/png');
  await db.$transaction([
    db.thumbnailCaseRender.upsert({where: {sourceUrl}, update: {url: stored.url, key: stored.key, prompt}, create: {sourceUrl, url: stored.url, key: stored.key, prompt}}),
    db.aiRequest.create({data: {task: 'THUMBNAIL_IMAGE', model: result.model, inputHash: randomUUID(), entityType: 'QuoteFamily', entityId: familyId, success: true, durationMs: result.durationMs, usageJson: (result.usage ?? undefined) as any, costUsdCents: result.costUsdCents, resultJson: {url: stored.url, kind: 'case', prompt} as any}}),
  ]);
  if (cached) {
    try {
      await (await loadMediaStorage()).delete(cached.key);
    } catch {}
  }
  return rendered;
}

/** Modo LAYOUT: plantilla TGS compuesta por el sistema. */
async function generateLayoutThumbnail(opts: {familyId: string; versionId: string; userId: string | null; regenerateCase?: boolean}): Promise<{url: string; detail: string}> {
  const settings = await loadThumbnailAiSettings();
  const [family, version] = await Promise.all([
    db.quoteFamily.findUniqueOrThrow({where: {id: opts.familyId}, select: {webTitle: true, internalName: true, heroImageUrl: true, heroAsset: {select: {url: true}}}}),
    db.quoteVersion.findUniqueOrThrow({where: {id: opts.versionId}, select: {totalSaleCents: true}}),
  ]);
  const items = await db.quoteItem.findMany({where: {versionId: opts.versionId}, orderBy: {position: 'asc'}, select: {frozenName: true, quantity: true, line: {select: {name: true}}}});
  const caseItem = await findCaseItem(opts.versionId);
  const caseUrl = family.heroImageUrl ?? family.heroAsset?.url ?? caseItem?.imageUrl ?? null;
  if (!caseUrl) throw new ThumbnailAiUnavailable('No hay foto del gabinete para armar la miniatura');

  const rowItems = items.map((item) => ({name: item.frozenName, quantity: item.quantity, line: item.line?.name ?? null}));
  const specs = extractSpecsFromItems(rowItems);
  const useGpu = Boolean(specs.gpu) && version.totalSaleCents > settings.gpuHeadlineThresholdCents;
  const headline = buildHeadline(specs, useGpu, family.webTitle?.trim() || family.internalName);
  const rows = buildRows(rowItems, specs);

  let caseBuffer = await ensureTransparentCase((await readOwnOrRemote(caseUrl)).buffer);
  let caseDetail = 'foto original';
  if (settings.caseAiMode === 'ALWAYS') {
    caseBuffer = await caseWithAi(caseUrl, caseBuffer, settings, opts.familyId, Boolean(opts.regenerateCase));
    caseDetail = 'gabinete procesado con IA';
  }
  const logo = settings.logoUrl ? await readOwnOrRemote(settings.logoUrl).catch(() => null) : null;
  const [width, height] = settings.size.split('x').map(Number) as [number, number];
  // Sin los márgenes transparentes de la foto el gabinete ocupa todo su
  // recuadro; si no, una foto con mucho aire alrededor sale chica. Y si la
  // foto es chica, se agranda con lanczos para que el navegador no la
  // pixele al estirarla.
  const trimmed = await sharp(caseBuffer)
    .png()
    .trim({threshold: 8})
    .toBuffer()
    .then((buffer) => sharp(buffer).resize({height: 1100, kernel: 'lanczos3', fit: 'inside', withoutEnlargement: false}).png().toBuffer())
    .catch(() => caseBuffer);
  const html = renderThumbnailHtml({
    width,
    height,
    accent: settings.accentColor,
    logoDataUrl: logo ? toDataUrl(logo.buffer, logo.mime) : null,
    caseDataUrl: toDataUrl(trimmed),
    headline,
    rows,
    footer: footerBadges(settings.footerJson),
  });
  const png = await renderHtmlToPng(html, {width, height});
  const jpeg = await sharp(png).jpeg({quality: 92}).toBuffer();
  const stored = await (await loadMediaStorage()).put(`quote-thumbnails/${opts.familyId}/${randomUUID()}.jpg`, jpeg, 'image/jpeg');
  await db.$transaction([
    db.quoteFamily.update({where: {id: opts.familyId}, data: {thumbnailUrl: stored.url}}),
    ...(opts.userId ? [db.auditLog.create({data: {userId: opts.userId, entityType: 'QuoteFamily', entityId: opts.familyId, action: 'GENERATE_THUMBNAIL_LAYOUT', next: {url: stored.url, headline}}})] : []),
  ]);
  return {url: stored.url, detail: `Plantilla TGS: título ${useGpu ? 'con la placa de video' : 'con el procesador'}, ${rows.length} filas, ${caseDetail}`};
}

async function loadReferences() {
  return db.thumbnailAiReference.findMany({orderBy: [{sortOrder: 'asc'}, {createdAt: 'asc'}]});
}

async function readOwnOrRemote(url: string): Promise<{buffer: Buffer; mime: string}> {
  const key = ownStorageKeyFromUrl(url);
  if (key) {
    const buffer = await readMedia(key);
    return {buffer, mime: sniffMime(buffer)};
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {buffer, mime: response.headers.get('content-type')?.split(';')[0] || sniffMime(buffer)};
}

function sniffMime(buffer: Buffer): string {
  if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer.length > 12 && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'image/jpeg';
}

/**
 * El modelo acepta PNG/JPEG/WEBP de hasta 50 MB; las fotos propias pueden
 * venir enormes, así que se acotan a 1536 px y se normalizan a PNG (conserva
 * la transparencia del gabinete recortado).
 */
async function normalizeInput(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).resize(1536, 1536, {fit: 'inside', withoutEnlargement: true}).png().toBuffer();
}

async function findCaseItem(versionId: string) {
  const items = await db.quoteItem.findMany({
    where: {versionId},
    orderBy: {position: 'asc'},
    select: {
      frozenName: true,
      webImageUrl: true,
      line: {select: {name: true}},
      product: {select: {assets: {where: {status: 'READY', url: {not: null}}, orderBy: [{isPrimary: 'desc'}, {createdAt: 'desc'}], take: 1, select: {url: true}}}},
    },
  });
  for (const item of items) {
    if (!CASE_PATTERN.test(`${item.line?.name ?? ''} ${item.frozenName}`)) continue;
    const url = item.product?.assets[0]?.url ?? item.webImageUrl ?? null;
    return {name: item.frozenName, imageUrl: url};
  }
  return null;
}

type PlaceholderValues = Record<(typeof THUMBNAIL_AI_PLACEHOLDERS)[number], string>;

function placeholderValues(title: string, specs: StoreTitleSpecs, caseName: string | null, items: {name: string; quantity: number}[]): PlaceholderValues {
  return {
    titulo: title,
    cpu: specs.cpu ?? '',
    gpu: specs.gpu ?? '',
    ram: specs.ramGb ? `${specs.ramGb}GB` : '',
    disco: specs.storage ?? '',
    so: specs.os ?? '',
    gabinete: caseName ?? '',
    componentes: items.map((item) => `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name}`).join(', '),
  };
}

export function fillPlaceholders(template: string, values: PlaceholderValues): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase() as keyof PlaceholderValues];
    return value === undefined ? match : value;
  });
}

/** Texto por defecto cuando no hay `textTemplate`: las specs separadas por " · ". */
function defaultText(values: PlaceholderValues): string {
  const parts = [values.cpu, values.gpu, values.ram, values.disco].filter(Boolean);
  return parts.length ? parts.join(' · ') : values.titulo;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;'));
}

/** Estampa el texto exacto sobre la imagen generada (modo OVERLAY). */
async function overlayText(image: Buffer, text: string, opts: {position: string; color: string; fontSize: number; fontFamily: string | null}): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;
  const fontSize = Math.max(12, Math.min(opts.fontSize, Math.floor(width / 8)));
  const y = opts.position === 'top' ? fontSize * 1.6 : height - fontSize * 0.9;
  const bandTop = opts.position === 'top' ? 0 : height - fontSize * 2.4;
  // Banda translúcida atrás del texto para que se lea sobre cualquier fondo.
  const svg = Buffer.from(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>` +
      `<rect x='0' y='${bandTop}' width='${width}' height='${fontSize * 2.4}' fill='rgba(0,0,0,0.55)'/>` +
      `<text x='${width / 2}' y='${y}' font-size='${fontSize}' font-weight='700' fill='${escapeXml(opts.color)}' font-family='${escapeXml(opts.fontFamily ?? 'Arial, Helvetica, sans-serif')}' text-anchor='middle'>${escapeXml(text)}</text>` +
      `</svg>`,
  );
  return sharp(image).composite([{input: svg, left: 0, top: 0}]).png().toBuffer();
}

export class ThumbnailAiUnavailable extends Error {}

/**
 * Genera la miniatura con IA para un presupuesto y la guarda como
 * `thumbnailUrl` de la familia. Lanza ThumbnailAiUnavailable si la función
 * está apagada o falta algo configurable (para que el pipeline caiga a la
 * plantilla clásica con un mensaje claro); cualquier otro error es de la
 * generación en sí.
 */
export async function generateAiThumbnail(opts: {familyId: string; versionId: string; userId: string | null; regenerateCase?: boolean}): Promise<{url: string; detail: string}> {
  const settings = await loadThumbnailAiSettings();
  if (!settings.enabled) throw new ThumbnailAiUnavailable('Generación de miniaturas desactivada (Ajustes → Miniaturas)');
  if (settings.mode !== 'AI_SCENE') return generateLayoutThumbnail(opts);
  const client = await openAiClient();
  if (!client) throw new ThumbnailAiUnavailable('Falta la clave de OpenAI (Ajustes → IA)');
  const references = await loadReferences();
  if (!references.length) throw new ThumbnailAiUnavailable('No hay imágenes de referencia cargadas (Ajustes → Miniaturas IA)');
  if (!settings.prompt.trim()) throw new ThumbnailAiUnavailable('El prompt de miniaturas está vacío (Ajustes → Miniaturas IA)');

  const family = await db.quoteFamily.findUniqueOrThrow({
    where: {id: opts.familyId},
    select: {webTitle: true, internalName: true, heroImageUrl: true, heroAsset: {select: {url: true}}},
  });
  const items = await db.quoteItem.findMany({
    where: {versionId: opts.versionId},
    orderBy: {position: 'asc'},
    select: {frozenName: true, quantity: true, line: {select: {name: true}}},
  });
  const caseItem = await findCaseItem(opts.versionId);
  const caseUrl = family.heroImageUrl ?? family.heroAsset?.url ?? caseItem?.imageUrl ?? null;
  if (!caseUrl) throw new ThumbnailAiUnavailable('No hay foto del gabinete para generar la miniatura');

  const specs = extractSpecsFromItems(items.map((item) => ({name: item.frozenName, quantity: item.quantity, line: item.line?.name ?? null})));
  const values = placeholderValues(family.webTitle?.trim() || family.internalName, specs, caseItem?.name ?? null, items.map((item) => ({name: item.frozenName, quantity: item.quantity})));
  const text = (settings.textTemplate.trim() ? fillPlaceholders(settings.textTemplate, values) : defaultText(values)).trim();

  // Orden de las imágenes: primero el gabinete, después las referencias. El
  // encabezado fijo se lo explica al modelo para que no confunda cuál es cuál.
  const [caseImage, ...refImages] = await Promise.all([
    readOwnOrRemote(caseUrl).then((r) => normalizeInput(r.buffer)),
    ...references.slice(0, MAX_REFERENCES).map((ref) => readOwnOrRemote(ref.url).then((r) => normalizeInput(r.buffer))),
  ]);
  const refNotes = references
    .slice(0, MAX_REFERENCES)
    .map((ref, index) => `Imagen ${index + 2}: miniatura de referencia${ref.note?.trim() ? ` (${ref.note.trim()})` : ''}.`)
    .join('\n');
  const textInstruction =
    settings.textMode === 'AI'
      ? `Escribí en la imagen, con tipografía grande, legible y bien contrastada, EXACTAMENTE este texto (sin cambiar ni una letra ni un número): "${text}".`
      : settings.textMode === 'OVERLAY'
        ? `No escribas ningún texto en la imagen: dejá una franja libre y sin elementos importantes en la parte ${settings.overlayPosition === 'top' ? 'superior' : 'inferior'}, donde después se va a estampar el texto.`
        : 'No escribas ningún texto en la imagen.';
  const prompt = [
    'Imagen 1: la foto del gabinete de esta PC. Tiene que aparecer en la miniatura exactamente este gabinete (mismo modelo, forma, colores y luces), como protagonista.',
    refNotes,
    'Generá una miniatura NUEVA para esta PC copiando el estilo de las referencias (composición, fondo, iluminación, paleta, tipografía) pero con el gabinete de la Imagen 1.',
    fillPlaceholders(settings.prompt, values).trim(),
    textInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');

  const started = Date.now();
  let result;
  try {
    result = await generateThumbnailImage(client, {
      prompt,
      images: [
        {buffer: caseImage, name: 'gabinete.png', mime: 'image/png'},
        ...refImages.map((buffer, index) => ({buffer, name: `referencia-${index + 1}.png`, mime: 'image/png'})),
      ],
      size: settings.size as ImageSize,
      quality: settings.quality as ImageQuality,
      model: settings.model,
    });
  } catch (error) {
    const info = describeOpenAiError(error);
    await db.aiRequest.create({
      data: {
        task: 'THUMBNAIL_IMAGE',
        model: settings.model,
        inputHash: randomUUID(),
        entityType: 'QuoteFamily',
        entityId: opts.familyId,
        success: false,
        error: info.message,
        durationMs: Date.now() - started,
      },
    });
    throw new Error(`OpenAI no pudo generar la miniatura: ${info.message}`);
  }

  let output = result.buffer;
  if (settings.textMode === 'OVERLAY' && text) {
    output = await overlayText(output, text, {
      position: settings.overlayPosition,
      color: settings.overlayColor,
      fontSize: settings.overlayFontSize,
      fontFamily: settings.overlayFontFamily,
    });
  }
  const jpeg = await sharp(output).flatten({background: '#ffffff'}).jpeg({quality: 92}).toBuffer();
  const stored = await (await loadMediaStorage()).put(`quote-thumbnails/${opts.familyId}/${randomUUID()}.jpg`, jpeg, 'image/jpeg');
  await db.$transaction([
    db.quoteFamily.update({where: {id: opts.familyId}, data: {thumbnailUrl: stored.url}}),
    db.aiRequest.create({
      data: {
        task: 'THUMBNAIL_IMAGE',
        model: result.model,
        inputHash: randomUUID(),
        entityType: 'QuoteFamily',
        entityId: opts.familyId,
        success: true,
        durationMs: result.durationMs,
        usageJson: (result.usage ?? undefined) as any,
        costUsdCents: result.costUsdCents,
        resultJson: {url: stored.url, textMode: settings.textMode, text, prompt} as any,
      },
    }),
    ...(opts.userId
      ? [db.auditLog.create({data: {userId: opts.userId, entityType: 'QuoteFamily', entityId: opts.familyId, action: 'GENERATE_THUMBNAIL_AI', next: {url: stored.url}}})]
      : []),
  ]);
  return {url: stored.url, detail: `Generada con IA (${result.model}, ${settings.quality}, ${references.length} referencia${references.length === 1 ? '' : 's'})`};
}

@Controller('settings/thumbnail-ai')
export class ThumbnailAiController {
  @Get()
  async get() {
    return settingsDto();
  }

  @Put()
  async put(@Body(new ZodPipe(thumbnailAiSettingsUpdateSchema)) body: ThumbnailAiSettingsUpdateInput, @CurrentUser() user: RequestUser) {
    const previous = await loadThumbnailAiSettings();
    const {footer, gpuHeadlineThresholdCents, ...rest} = body;
    const data = {
      ...rest,
      ...(footer !== undefined ? {footerJson: footer as any} : {}),
      ...(gpuHeadlineThresholdCents !== undefined ? {gpuHeadlineThresholdCents: BigInt(gpuHeadlineThresholdCents)} : {}),
    };
    await db.$transaction(async (tx) => {
      const saved = await tx.thumbnailAiSettings.update({where: {id: 'singleton'}, data});
      await tx.auditLog.create({data: {userId: user.id, entityType: 'ThumbnailAiSettings', entityId: 'singleton', action: 'UPDATE', previous: jsonSafe(previous), next: jsonSafe(saved)}});
    });
    return settingsDto();
  }

  /** Logo de la plantilla TGS (PNG con fondo transparente, idealmente). */
  @Post('logo')
  async uploadLogo(@Req() req: any, @CurrentUser() user: RequestUser) {
    if (typeof req.file !== 'function') throw new BadRequestException('Upload multipart no disponible en el servidor');
    const part = await req.file();
    if (!part) throw new BadRequestException('Seleccioná una imagen');
    const mimetype = String(part.mimetype ?? '');
    if (!mimetype.startsWith('image/')) throw new BadRequestException('El archivo debe ser una imagen');
    const buffer = await part.toBuffer();
    if (!buffer.length) throw new BadRequestException('La imagen está vacía');
    const extension = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : mimetype === 'image/svg+xml' ? 'svg' : 'jpg';
    const storage = await loadMediaStorage();
    const previous = await loadThumbnailAiSettings();
    const stored = await storage.put(`thumbnail-ai/logo/${randomUUID()}.${extension}`, buffer, mimetype);
    await db.thumbnailAiSettings.update({where: {id: 'singleton'}, data: {logoUrl: stored.url, logoKey: stored.key}});
    await db.auditLog.create({data: {userId: user.id, entityType: 'ThumbnailAiSettings', entityId: 'singleton', action: 'UPLOAD_LOGO', next: {url: stored.url}}});
    if (previous.logoKey) {
      try {
        await storage.delete(previous.logoKey);
      } catch {}
    }
    return settingsDto();
  }

  @Delete('logo')
  async deleteLogo(@CurrentUser() user: RequestUser) {
    const previous = await loadThumbnailAiSettings();
    await db.thumbnailAiSettings.update({where: {id: 'singleton'}, data: {logoUrl: null, logoKey: null}});
    await db.auditLog.create({data: {userId: user.id, entityType: 'ThumbnailAiSettings', entityId: 'singleton', action: 'DELETE_LOGO', previous: {url: previous.logoUrl}}});
    if (previous.logoKey) {
      try {
        await (await loadMediaStorage()).delete(previous.logoKey);
      } catch {}
    }
    return settingsDto();
  }

  @Post('references')
  async uploadReference(@Req() req: any, @CurrentUser() user: RequestUser) {
    if ((await db.thumbnailAiReference.count()) >= MAX_REFERENCES) throw new BadRequestException(`Se pueden cargar hasta ${MAX_REFERENCES} imágenes de referencia`);
    if (typeof req.file !== 'function') throw new BadRequestException('Upload multipart no disponible en el servidor');
    const part = await req.file();
    if (!part) throw new BadRequestException('Seleccioná una imagen');
    const mimetype = String(part.mimetype ?? '');
    if (!mimetype.startsWith('image/')) throw new BadRequestException('El archivo debe ser una imagen');
    const buffer = await part.toBuffer();
    if (!buffer.length) throw new BadRequestException('La imagen está vacía');
    const extension = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
    const stored = await (await loadMediaStorage()).put(`thumbnail-ai/references/${randomUUID()}.${extension}`, buffer, mimetype);
    const last = await db.thumbnailAiReference.findFirst({orderBy: {sortOrder: 'desc'}, select: {sortOrder: true}});
    const created = await db.thumbnailAiReference.create({data: {url: stored.url, key: stored.key, sortOrder: (last?.sortOrder ?? -1) + 1}});
    await db.auditLog.create({data: {userId: user.id, entityType: 'ThumbnailAiReference', entityId: created.id, action: 'CREATE', next: jsonSafe(created)}});
    return jsonSafe(created);
  }

  @Patch('references/:id')
  async updateReference(@Param('id', new ZodPipe(idSchema)) id: string, @Body(new ZodPipe(thumbnailAiReferenceUpdateSchema)) body: ThumbnailAiReferenceUpdateInput) {
    const existing = await db.thumbnailAiReference.findUnique({where: {id}});
    if (!existing) throw new NotFoundException('Referencia inexistente');
    return jsonSafe(await db.thumbnailAiReference.update({where: {id}, data: body}));
  }

  @Delete('references/:id')
  async deleteReference(@Param('id', new ZodPipe(idSchema)) id: string, @CurrentUser() user: RequestUser) {
    const existing = await db.thumbnailAiReference.findUnique({where: {id}});
    if (!existing) throw new NotFoundException('Referencia inexistente');
    await db.$transaction([
      db.thumbnailAiReference.delete({where: {id}}),
      db.auditLog.create({data: {userId: user.id, entityType: 'ThumbnailAiReference', entityId: id, action: 'DELETE', previous: jsonSafe(existing)}}),
    ]);
    try {
      await (await loadMediaStorage()).delete(existing.key);
    } catch {}
    return {ok: true};
  }
}
