import {BadRequestException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {mkdir, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {UPLOADS_ROOT} from './branding-storage.js';

export const CALCULATOR_DIR = path.join(UPLOADS_ROOT, 'calculator');

const MIME_TO_EXT = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
]);

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const ICON_FILE_RE = /^icon-[a-f0-9]{8,64}\.(png|jpg|webp|gif|svg)$/;

export function calculatorIconPublicUrl(filename: string): string {
  return `/api/uploads/calculator/${filename}`;
}

export function filenameFromCalculatorIconUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url;
    const match = pathname.match(/\/uploads\/calculator\/([^/?#]+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function normalizeCalculatorIconUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  const name = filenameFromCalculatorIconUrl(url);
  if (name && ICON_FILE_RE.test(name)) return calculatorIconPublicUrl(name);
  return url;
}

export function assertSafeCalculatorIconFilename(filename: string): string {
  if (!ICON_FILE_RE.test(filename)) {
    throw new BadRequestException('Nombre de archivo de icono inválido');
  }
  return filename;
}

export function calculatorIconFilePath(filename: string): string {
  return path.join(CALCULATOR_DIR, assertSafeCalculatorIconFilename(filename));
}

export function mimeForCalculatorIconFilename(filename: string): string {
  const ext = assertSafeCalculatorIconFilename(filename).split('.').pop()!;
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

export async function saveCalculatorIcon(
  buffer: Buffer,
  mime: string,
): Promise<{filename: string; url: string; mime: string}> {
  const normalized = mime.toLowerCase().split(';')[0]!.trim();
  const ext = MIME_TO_EXT.get(normalized);
  if (!ext) {
    throw new BadRequestException('Formato no permitido. Usá PNG, JPG, WEBP, GIF o SVG.');
  }
  if (buffer.byteLength === 0) {
    throw new BadRequestException('El archivo está vacío');
  }
  if (buffer.byteLength > 2 * 1024 * 1024) {
    throw new BadRequestException('El icono no puede superar 2 MB');
  }
  await mkdir(CALCULATOR_DIR, {recursive: true});
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const filename = `icon-${hash}.${ext}`;
  await writeFile(path.join(CALCULATOR_DIR, filename), buffer);
  return {filename, url: calculatorIconPublicUrl(filename), mime: EXT_TO_MIME[ext]!};
}

export async function removeManagedCalculatorIcon(url: string | null | undefined): Promise<void> {
  const name = filenameFromCalculatorIconUrl(url);
  if (!name || !ICON_FILE_RE.test(name)) return;
  await unlink(path.join(CALCULATOR_DIR, name)).catch(() => undefined);
}
