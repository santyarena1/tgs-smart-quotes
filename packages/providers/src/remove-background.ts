import sharp from 'sharp';

/**
 * Quitado de fondo sin servicios externos.
 *
 * Reemplaza a Photoroom (API paga). Está pensado para el caso real del
 * catálogo: fotos de producto sobre fondo blanco o casi blanco, que es como
 * vienen las imágenes oficiales de fabricantes y las que se sacan de Google.
 *
 * Cómo funciona: se recorre la imagen desde los bordes hacia adentro
 * (flood fill de 4 vecinos) marcando como fondo todo píxel claro y parecido
 * al color de las esquinas. Al arrancar SOLO desde los bordes, un fondo
 * blanco se borra entero pero un blanco interno del producto (una etiqueta,
 * un LED, un logo) se conserva, que es justo lo que rompía cuando se borraba
 * "todo lo blanco" de una.
 *
 * Los píxeles del contorno quedan con alfa intermedio para que el recorte no
 * salga dentado.
 */

/** Qué tan claro tiene que ser un píxel para considerarse fondo (0-255). */
const LUMA_MIN = 205;
/** Cuánto puede alejarse del color del borde para seguir siendo fondo. */
const TOLERANCE = 32;
/** Margen de suavizado del borde del recorte. */
const FEATHER = 26;

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export type RemoveBackgroundResult = {
  buffer: Buffer;
  /** Proporción de la imagen que se volvió transparente (0 a 1). */
  removedRatio: number;
};

/**
 * Devuelve el PNG con el fondo transparente. Si la imagen no tiene un fondo
 * claro uniforme (por ejemplo una foto ambientada), se detecta y se lanza un
 * error explicando qué pasó, en vez de devolver una imagen recortada mal.
 */
export async function removeBackground(input: Buffer): Promise<Buffer> {
  const { buffer } = await removeBackgroundDetailed(input);
  return buffer;
}

export async function removeBackgroundDetailed(input: Buffer): Promise<RemoveBackgroundResult> {
  const image = sharp(input, { failOn: 'none' }).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height) throw new Error('No se pudo leer la imagen');

  const total = width * height;
  const at = (x: number, y: number) => (y * width + x) * channels;

  // Color de referencia del fondo: promedio de las cuatro esquinas.
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  let refR = 0;
  let refG = 0;
  let refB = 0;
  for (const corner of corners) {
    refR += data[corner]!;
    refG += data[corner + 1]!;
    refB += data[corner + 2]!;
  }
  refR /= corners.length;
  refG /= corners.length;
  refB /= corners.length;

  if (luma(refR, refG, refB) < LUMA_MIN) {
    throw new Error(
      'La imagen no tiene fondo claro uniforme, así que no se puede recortar automáticamente. Usá una foto con fondo blanco, o guardala "tal cual".',
    );
  }

  const isBackground = (index: number) => {
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;
    if (luma(r, g, b) < LUMA_MIN) return false;
    return Math.abs(r - refR) <= TOLERANCE && Math.abs(g - refG) <= TOLERANCE && Math.abs(b - refB) <= TOLERANCE;
  };

  // Flood fill desde los bordes. Se usa una pila explícita (no recursión) para
  // no reventar el stack con imágenes grandes.
  const background = new Uint8Array(total);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const flat = y * width + x;
    if (background[flat]) return;
    if (!isBackground(flat * channels)) return;
    background[flat] = 1;
    stack.push(flat);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const flat = stack.pop()!;
    const x = flat % width;
    const y = (flat - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  let removed = 0;
  for (let flat = 0; flat < total; flat++) {
    const index = flat * channels;
    if (background[flat]) {
      data[index + 3] = 0;
      removed++;
      continue;
    }
    // Suavizado del contorno: un píxel del producto que sea casi tan claro
    // como el fondo y toque el fondo se vuelve semitransparente, así el
    // recorte no queda con escalones.
    const x = flat % width;
    const y = (flat - x) / width;
    const touchesBackground =
      (x > 0 && background[flat - 1]) ||
      (x < width - 1 && background[flat + 1]) ||
      (y > 0 && background[flat - width]) ||
      (y < height - 1 && background[flat + width]);
    if (!touchesBackground) continue;
    const value = luma(data[index]!, data[index + 1]!, data[index + 2]!);
    const reference = luma(refR, refG, refB);
    if (value >= reference - FEATHER) {
      const distance = Math.max(0, reference - value);
      data[index + 3] = Math.round((distance / FEATHER) * 255);
    }
  }

  const removedRatio = removed / total;
  if (removedRatio < 0.02) {
    throw new Error(
      'No se encontró un fondo para quitar en esta imagen. Probá con otra foto, o guardala "tal cual".',
    );
  }

  const buffer = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();
  return { buffer, removedRatio };
}
