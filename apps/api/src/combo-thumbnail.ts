/**
 * Miniatura de un combo de la tienda (BLOCK-10): collage con las fotos de
 * los productos (hasta 4), una banda con el título y, si hay descuento, la
 * etiqueta "−X%". Se arma con sharp, sin IA: un combo no tiene gabinete que
 * ambientar y las fotos ya vienen recortadas.
 */
import sharp from 'sharp';

const SIZE = 1200;
const PAD = 56;
const BAND = 250;

const escapeXml = (value: string) => value.replace(/[&<>'"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;'));

/** Corta el título en hasta dos líneas de ~26 caracteres, por palabras. */
function wrapTitle(title: string): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 26 && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && current) lines.push(current);
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) lines[1] = `${lines[1]!.slice(0, 24).trimEnd()}…`;
  return lines;
}

/** Celdas del collage según cuántas fotos hay (1 a 4), dentro del área sobre la banda. */
function cells(count: number): Array<{x: number; y: number; w: number; h: number}> {
  const areaW = SIZE - PAD * 2;
  const areaH = SIZE - BAND - PAD * 2;
  const gap = 32;
  if (count <= 1) return [{x: PAD, y: PAD, w: areaW, h: areaH}];
  if (count === 2) {
    const w = (areaW - gap) / 2;
    return [
      {x: PAD, y: PAD, w, h: areaH},
      {x: PAD + w + gap, y: PAD, w, h: areaH},
    ];
  }
  if (count === 3) {
    const w = (areaW - gap) / 2;
    const h = (areaH - gap) / 2;
    return [
      {x: PAD, y: PAD, w, h: areaH},
      {x: PAD + w + gap, y: PAD, w, h},
      {x: PAD + w + gap, y: PAD + h + gap, w, h},
    ];
  }
  const w = (areaW - gap) / 2;
  const h = (areaH - gap) / 2;
  return [
    {x: PAD, y: PAD, w, h},
    {x: PAD + w + gap, y: PAD, w, h},
    {x: PAD, y: PAD + h + gap, w, h},
    {x: PAD + w + gap, y: PAD + h + gap, w, h},
  ];
}

export async function renderComboThumbnail(opts: {images: Buffer[]; title: string; discountPct: number; accent: string; background: string}): Promise<Buffer> {
  const images = opts.images.slice(0, 4);
  const overlays: sharp.OverlayOptions[] = [];
  const layout = cells(images.length);
  for (let i = 0; i < images.length; i++) {
    const cell = layout[i]!;
    const buffer = await sharp(images[i], {failOn: 'none'})
      .trim({threshold: 8})
      .toBuffer()
      .catch(() => images[i]!)
      .then((trimmed) => sharp(trimmed).resize(Math.round(cell.w), Math.round(cell.h), {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer());
    overlays.push({input: buffer, left: Math.round(cell.x), top: Math.round(cell.y)});
  }
  const lines = wrapTitle(opts.title);
  const fontSize = lines.length > 1 ? 58 : 76;
  const textY = SIZE - BAND + (lines.length > 1 ? 118 : 140);
  const badge = opts.discountPct > 0
    ? `<g transform='translate(${SIZE - PAD - 150}, ${PAD})'><rect x='0' y='0' width='150' height='150' rx='75' fill='${escapeXml(opts.accent)}'/>` +
      `<text x='75' y='96' font-size='58' font-weight='800' fill='#ffffff' font-family='Arial, Helvetica, sans-serif' text-anchor='middle'>−${Math.round(opts.discountPct)}%</text></g>`
    : '';
  const svg = Buffer.from(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${SIZE}' height='${SIZE}'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${escapeXml(opts.background)}' stop-opacity='0'/><stop offset='1' stop-color='#000000' stop-opacity='.55'/></linearGradient></defs>` +
      `<rect x='0' y='${SIZE - BAND}' width='${SIZE}' height='${BAND}' fill='url(#g)'/>` +
      `<rect x='${PAD}' y='${SIZE - BAND + 10}' width='150' height='6' rx='3' fill='${escapeXml(opts.accent)}'/>` +
      `<text x='${PAD}' y='${SIZE - BAND + 52}' font-size='26' font-weight='700' fill='${escapeXml(opts.accent)}' font-family='Arial, Helvetica, sans-serif' letter-spacing='6'>COMBO</text>` +
      lines.map((line, index) => `<text x='${PAD}' y='${textY + index * (fontSize + 10)}' font-size='${fontSize}' font-weight='800' fill='#ffffff' font-family='Arial, Helvetica, sans-serif'>${escapeXml(line)}</text>`).join('') +
      badge +
      `</svg>`,
  );
  overlays.push({input: svg, left: 0, top: 0});
  return sharp({create: {width: SIZE, height: SIZE, channels: 4, background: opts.background}})
    .composite(overlays)
    .flatten({background: opts.background})
    .jpeg({quality: 92})
    .toBuffer();
}
