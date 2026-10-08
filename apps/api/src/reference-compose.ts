import sharp from 'sharp';
import { removeBackgroundDetailed } from '@tgs/providers';
import { renderHtmlToPng } from '@tgs/pdf';
import type { ImageSize } from '@tgs/ai';
import type { ReferenceStyle } from './reference-prompt.js';

/**
 * Armado final de la imagen de referencia SIN IA: el gabinete (la foto real, ya con el interior armado) se recorta, se
 * achica y se apoya sobre el fondo del ambiente con una sombra. Así el fondo y el modelo del gabinete no los puede
 * reinventar el modelo de imágenes: solo se le pide que arme el interior.
 */
export const CANVAS = { width: 1536, height: 1024 } as const;

const alphaAt = (data: Buffer, width: number, channels: number, x: number, y: number) => data[(y * width + x) * channels + 3] ?? 255;

/** ¿La imagen ya viene recortada (esquinas transparentes)? */
async function hasTransparentCorners(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height) return false;
  return [alphaAt(data, width, channels, 0, 0), alphaAt(data, width, channels, width - 1, 0), alphaAt(data, width, channels, 0, height - 1), alphaAt(data, width, channels, width - 1, height - 1)].some((alpha) => alpha < 250);
}

/** Gabinete con fondo transparente: si la foto no está recortada se le quita el fondo; si no se puede, queda como está. */
export async function transparentCase(buffer: Buffer): Promise<Buffer> {
  try {
    if (await hasTransparentCorners(buffer)) return buffer;
    const { buffer: cut, removedRatio } = await removeBackgroundDetailed(buffer);
    return removedRatio > 0.05 ? cut : buffer;
  } catch {
    return buffer;
  }
}

/** Saca los márgenes transparentes para que el gabinete ocupe todo su recuadro. */
export async function trimCase(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer).ensureAlpha().trim({ threshold: 8 }).png().toBuffer();
  } catch {
    return buffer;
  }
}

/** Tamaño de salida del modelo según la forma del gabinete (alto, ancho o cuadrado). */
export function sizeForCase(width: number, height: number): ImageSize {
  const ratio = width / Math.max(1, height);
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 0.83) return '1024x1536';
  return '1024x1024';
}

/** Fondo de respaldo (sin IA) por si no hay imagen de fondo: pared, escritorio y la luz propia de cada ambiente. */
function fallbackBackground(style: ReferenceStyle): Buffer {
  const { width: W, height: H } = CANVAS;
  const deskY = Math.round(H * 0.82);
  const svg =
    style === 'gamer'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0f1a"/><stop offset="1" stop-color="#141a2e"/></linearGradient><radialGradient id="a" cx="0.2" cy="0.3" r="0.6"><stop offset="0" stop-color="#7c3aed" stop-opacity="0.55"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="0.85" cy="0.75" r="0.55"><stop offset="0" stop-color="#06b6d4" stop-opacity="0.5"/><stop offset="1" stop-color="#06b6d4" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#w)"/><rect width="${W}" height="${H}" fill="url(#a)"/><rect width="${W}" height="${H}" fill="url(#b)"/><rect y="${deskY}" width="${W}" height="${H - deskY}" fill="#0a0c14"/><rect y="${deskY}" width="${W}" height="4" fill="#22d3ee" opacity="0.7"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#w)"/><rect y="${deskY}" width="${W}" height="${H - deskY}" fill="#f1f5f9"/><rect y="${deskY}" width="${W}" height="3" fill="#cbd5e1"/></svg>`;
  return Buffer.from(svg);
}

/** Apoya el gabinete recortado sobre el fondo, a la izquierda del centro, con sombra, y devuelve un JPEG de 1536 x 1024. */
export async function composeOnBackground(caseCut: Buffer, background: Buffer | null, style: ReferenceStyle): Promise<Buffer> {
  const { width: W, height: H } = CANVAS;
  const base = await sharp(background ?? fallbackBackground(style)).resize(W, H, { fit: 'cover' }).png().toBuffer();
  const trimmed = await trimCase(caseCut);
  const meta = await sharp(trimmed).metadata();
  const srcW = meta.width ?? 1;
  const srcH = meta.height ?? 1;
  // El gabinete ocupa ~74 % del alto, sin pasar de la mitad del ancho.
  let height = Math.round(H * 0.74);
  let width = Math.round((srcW * height) / srcH);
  if (width > W * 0.5) {
    width = Math.round(W * 0.5);
    height = Math.round((srcH * width) / srcW);
  }
  const resized = await sharp(trimmed).resize({ width, height, fit: 'fill' }).png().toBuffer();
  const left = Math.round(W * 0.36 - width / 2);
  const top = Math.round(H * 0.9 - height);
  const shadow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="b" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="16"/></filter></defs><ellipse cx="${left + width / 2}" cy="${top + height - 4}" rx="${Math.round(width * 0.52)}" ry="26" fill="#000" opacity="0.6" filter="url(#b)"/></svg>`,
  );
  return sharp(base)
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: resized, left, top },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Marca de agua de toda imagen de referencia: va pegada a la imagen, así queda también en el PDF. */
export const WATERMARK_TEXT = 'IMAGEN DE REFERENCIA BASADA EN EL PRESUPUESTO CREADA POR IA DE THEGAMERSHOP';

/** Franja transparente con la leyenda, hecha con el navegador del servidor (siempre tiene tipografías); si falla, un SVG simple. */
async function watermarkStrip(width: number, height: number): Promise<Buffer> {
  const fontPx = Math.max(10, Math.round(width * 0.0082));
  const margin = Math.round(width * 0.012);
  try {
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent"><div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:flex-end;padding-right:${margin}px;box-sizing:border-box"><span style="font:600 ${fontPx}px/1.2 'Segoe UI',Arial,Helvetica,sans-serif;letter-spacing:.05em;color:rgba(255,255,255,.9);background:rgba(0,0,0,.4);padding:${Math.round(fontPx * 0.4)}px ${Math.round(fontPx * 0.9)}px;border-radius:999px;white-space:nowrap">${WATERMARK_TEXT}</span></div>`;
    return await renderHtmlToPng(html, { width, height }, { transparent: true });
  } catch {
    const textWidth = Math.round(WATERMARK_TEXT.length * fontPx * 0.66);
    const x = width - margin;
    return sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${x - textWidth - 20}" y="${Math.round(height / 2 - fontPx)}" width="${textWidth + 20}" height="${fontPx * 2}" rx="${fontPx}" fill="#000" opacity="0.4"/><text x="${x - 10}" y="${Math.round(height / 2 + fontPx * 0.35)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontPx}" font-weight="600" fill="#fff" fill-opacity="0.9">${WATERMARK_TEXT}</text></svg>`,
      ),
    )
      .png()
      .toBuffer();
  }
}

/** Pone la leyenda discreta en la esquina inferior derecha (una sola línea, chica y semitransparente). */
export async function addWatermark(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? CANVAS.width;
  const height = meta.height ?? CANVAS.height;
  const stripHeight = Math.max(30, Math.round(width * 0.026));
  const strip = await watermarkStrip(width, stripHeight);
  return sharp(image)
    .composite([{ input: strip, left: 0, top: Math.max(0, height - stripHeight - Math.round(height * 0.008)) }])
    .png()
    .toBuffer();
}
