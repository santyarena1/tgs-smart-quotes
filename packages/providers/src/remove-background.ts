import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
/**
 * Huecos de fondo encerrados (el aro de un cooler, el espacio entre los
 * ventiladores de una placa): no los alcanza el flood fill desde los bordes y
 * quedaban blancos. Se borran solo si son blanco puro del mismo tono que el
 * fondo (tolerancia estricta) y chicos respecto de la imagen, para no
 * comerse un panel blanco del producto.
 */
const HOLE_TOLERANCE = 12;
const HOLE_LUMA_MIN = 238;
const HOLE_MAX_RATIO = 0.12;
/** Halo claro de compresión JPEG alrededor del producto: hasta este ancho se limpia. */
const FRINGE_WIDTH = 2;

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export type RemoveBackgroundResult = {
  buffer: Buffer;
  /** Proporción de la imagen que se volvió transparente (0 a 1). */
  removedRatio: number;
  /** 'model' = segmentación (ISNet); 'color' = relleno por color desde los bordes. */
  method: 'model' | 'color';
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

/**
 * Quitado de fondo con modelo de segmentación (ISNet, corre local en un
 * proceso hijo; ver remove-background-worker.ts). Entiende qué es el
 * producto y qué es fondo, así que no deja la sombra del piso, el halo ni
 * el fondo que se ve a través del vidrio de un gabinete, que es donde el
 * relleno por color se quedaba corto. Devuelve null si el modelo no pudo
 * correr (sin binario para esta plataforma, timeout, etc.) y el llamador
 * cae al relleno por color.
 */
async function removeBackgroundWithModel(input: Buffer): Promise<Buffer | null> {
  if (process.env.TGS_BG_MODEL === 'off') return null;
  const workerUrl = new URL('./remove-background-worker.js', import.meta.url);
  let workerPath = fileURLToPath(workerUrl);
  const isTs = !existsSync(workerPath) && existsSync(workerPath.replace(/\.js$/, '.ts'));
  if (isTs) workerPath = workerPath.replace(/\.js$/, '.ts');
  const dir = await mkdtemp(join(tmpdir(), 'tgs-bg-'));
  const inPath = join(dir, 'in.bin');
  const outPath = join(dir, 'out.png');
  try {
    await writeFile(inPath, input);
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    const mime = meta.format === 'jpeg' ? 'image/jpeg' : meta.format === 'webp' ? 'image/webp' : 'image/png';
    const args = isTs ? ['--import', 'tsx', workerPath] : [workerPath];
    const ok = await new Promise<boolean>((resolve) => {
      const child = execFile(process.execPath, [...args, inPath, outPath, mime], { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (error) {
          // Se loguea el motivo (una sola línea) para poder diagnosticarlo en producción.
          const reason = String(stderr || error.message).split('\n').filter(Boolean).slice(-3).join(' | ');
          console.warn(JSON.stringify({ event: 'remove_background_model_failed', worker: workerPath, code: (error as any).code ?? null, signal: (error as any).signal ?? null, reason: reason.slice(0, 600) }));
        }
        resolve(!error);
      });
      child.on('error', (error) => {
        console.warn(JSON.stringify({ event: 'remove_background_model_spawn_failed', worker: workerPath, reason: error.message }));
        resolve(false);
      });
    });
    if (!ok || !existsSync(outPath)) return null;
    const png = await readFile(outPath);
    return png.length ? png : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Recorte definitivo: híbrido entre el relleno por color y el modelo.
 *
 * El relleno por color decide QUÉ es fondo (solo lo que toca los bordes de
 * la foto, más huecos chicos de blanco puro): respeta los blancos internos
 * del producto (etiquetas, el interior visible por el vidrio, paneles
 * claros). Su punto flojo es el CONTORNO: deja la sombra del piso, halos y
 * escalones. Ahí entra el modelo de segmentación, pero solo en una franja
 * alrededor del fondo detectado; lejos del contorno, el modelo no opina.
 *
 * Si la foto no tiene fondo liso (ambientada), el relleno falla y se usa el
 * modelo entero. Si el modelo no corre, queda el relleno solo.
 */
export async function removeBackgroundDetailed(input: Buffer): Promise<RemoveBackgroundResult> {
  const [color, modelOutput] = await Promise.all([
    removeBackgroundByColor(input).catch(() => null),
    removeBackgroundWithModel(input),
  ]);
  if (color && modelOutput) {
    const merged = await mergeEdgesWithModel(color.buffer, modelOutput);
    if (merged) return { ...merged, method: 'model' };
    return color;
  }
  if (modelOutput) {
    const { data, info } = await sharp(modelOutput).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i]! < 128) transparent++;
    return { buffer: modelOutput, removedRatio: transparent / (info.width * info.height), method: 'model' };
  }
  if (color) return color;
  return removeBackgroundByColor(input);
}

/**
 * Aplica el alfa del modelo únicamente en la franja que rodea al fondo del
 * relleno por color (hasta ~5% del lado menor, mínimo 24 px). Devuelve null
 * si las dos imágenes no miden lo mismo.
 */
async function mergeEdgesWithModel(colorPng: Buffer, modelPng: Buffer): Promise<{ buffer: Buffer; removedRatio: number } | null> {
  const [color, model] = await Promise.all([
    sharp(colorPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(modelPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height, channels } = color.info;
  if (!width || !height || model.info.width !== width || model.info.height !== height) return null;
  const total = width * height;
  const band = Math.max(32, Math.round(Math.min(width, height) * 0.08));

  // 1) Fondo del relleno conectado al borde de la foto (el "afuera"). Los
  //    huecos encerrados que el relleno borró (blanco puro chico) no entran.
  const outside = new Uint8Array(total);
  const stack: number[] = [];
  const isBgF = (flat: number) => color.data[flat * channels + 3]! < 128;
  const seed = (flat: number) => {
    if (!outside[flat] && isBgF(flat)) {
      outside[flat] = 1;
      stack.push(flat);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const flat = stack.pop()!;
    const x = flat % width;
    const y = (flat - x) / width;
    if (x > 0) seed(flat - 1);
    if (x < width - 1) seed(flat + 1);
    if (y > 0) seed(flat - width);
    if (y < height - 1) seed(flat + width);
  }

  // 2) Distancia (4 vecinos) al "afuera", hasta `band` píxeles.
  const distance = new Int16Array(total).fill(-1);
  let frontier: number[] = [];
  for (let flat = 0; flat < total; flat++) {
    if (outside[flat]) {
      distance[flat] = 0;
      frontier.push(flat);
    }
  }
  for (let depth = 1; depth <= band && frontier.length; depth++) {
    const next: number[] = [];
    for (const flat of frontier) {
      const x = flat % width;
      const y = (flat - x) / width;
      const neighbours = [x > 0 ? flat - 1 : -1, x < width - 1 ? flat + 1 : -1, y > 0 ? flat - width : -1, y < height - 1 ? flat + width : -1];
      for (const n of neighbours) {
        if (n < 0 || distance[n] !== -1) continue;
        distance[n] = depth;
        next.push(n);
      }
    }
    frontier = next;
  }

  // 3) Combinación:
  //    - "Afuera" según el relleno: decide el modelo (recupera superficies
  //      claras del producto que el relleno se comió, como una caja plateada).
  //    - Hueco encerrado según el relleno: queda transparente (blanco puro).
  //    - Producto según el relleno: se respeta, salvo en la franja pegada al
  //      afuera, donde el modelo puede sacar sombra y halo.
  const out = Buffer.from(color.data);
  let removed = 0;
  for (let flat = 0; flat < total; flat++) {
    const index = flat * channels;
    const m = model.data[index + 3]! < 48 ? 0 : model.data[index + 3]!;
    if (outside[flat]) {
      out[index] = model.data[index]!;
      out[index + 1] = model.data[index + 1]!;
      out[index + 2] = model.data[index + 2]!;
      out[index + 3] = m;
    } else if (!isBgF(flat)) {
      const d = distance[flat]!;
      if (d > 0) {
        const weight = d <= band / 2 ? 1 : Math.max(0, 1 - (d - band / 2) / (band / 2));
        const a = out[index + 3]!;
        out[index + 3] = Math.round(Math.min(a, a + (m - a) * weight));
      }
    }
    if (out[index + 3]! < 128) removed++;
  }
  const buffer = await sharp(out, { raw: { width, height, channels: channels as 4 } }).png().toBuffer();
  return { buffer, removedRatio: removed / total };
}

/** Relleno por color desde los bordes (el método original), como respaldo del modelo. */
export async function removeBackgroundByColor(input: Buffer): Promise<RemoveBackgroundResult> {
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

  // Huecos encerrados: componentes de blanco puro que no tocan el borde.
  const isHole = (index: number) => {
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;
    if (luma(r, g, b) < HOLE_LUMA_MIN) return false;
    return Math.abs(r - refR) <= HOLE_TOLERANCE && Math.abs(g - refG) <= HOLE_TOLERANCE && Math.abs(b - refB) <= HOLE_TOLERANCE;
  };
  const visited = new Uint8Array(total);
  const maxHole = Math.floor(total * HOLE_MAX_RATIO);
  for (let seed = 0; seed < total; seed++) {
    if (background[seed] || visited[seed] || !isHole(seed * channels)) continue;
    const component: number[] = [];
    const pending = [seed];
    visited[seed] = 1;
    while (pending.length) {
      const flat = pending.pop()!;
      component.push(flat);
      const x = flat % width;
      const y = (flat - x) / width;
      const neighbors = [x > 0 ? flat - 1 : -1, x < width - 1 ? flat + 1 : -1, y > 0 ? flat - width : -1, y < height - 1 ? flat + width : -1];
      for (const next of neighbors) {
        if (next < 0 || visited[next] || background[next] || !isHole(next * channels)) continue;
        visited[next] = 1;
        pending.push(next);
      }
    }
    if (component.length <= maxHole) for (const flat of component) background[flat] = 1;
  }

  // Anillo de contorno: a qué distancia del fondo está cada píxel del producto
  // (1 = lo toca, 2 = toca a uno que lo toca). Sirve para el suavizado y para
  // limpiar el halo claro que deja el JPEG alrededor del recorte.
  const ring = new Uint8Array(total);
  let frontier: number[] = [];
  for (let flat = 0; flat < total; flat++) {
    if (background[flat]) continue;
    const x = flat % width;
    const y = (flat - x) / width;
    const touchesBackground =
      (x > 0 && background[flat - 1]) ||
      (x < width - 1 && background[flat + 1]) ||
      (y > 0 && background[flat - width]) ||
      (y < height - 1 && background[flat + width]);
    if (touchesBackground) {
      ring[flat] = 1;
      frontier.push(flat);
    }
  }
  for (let depth = 2; depth <= FRINGE_WIDTH; depth++) {
    const next: number[] = [];
    for (const flat of frontier) {
      const x = flat % width;
      const y = (flat - x) / width;
      const neighbors = [x > 0 ? flat - 1 : -1, x < width - 1 ? flat + 1 : -1, y > 0 ? flat - width : -1, y < height - 1 ? flat + width : -1];
      for (const candidate of neighbors) {
        if (candidate < 0 || background[candidate] || ring[candidate]) continue;
        ring[candidate] = depth;
        next.push(candidate);
      }
    }
    frontier = next;
  }

  const reference = luma(refR, refG, refB);
  let removed = 0;
  for (let flat = 0; flat < total; flat++) {
    const index = flat * channels;
    if (background[flat]) {
      data[index + 3] = 0;
      removed++;
      continue;
    }
    if (!ring[flat]) continue;
    // Suavizado del contorno: un píxel del producto que sea casi tan claro
    // como el fondo y esté pegado a él se vuelve semitransparente, así el
    // recorte no queda con escalones ni con un borde blanco.
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;
    const value = luma(r, g, b);
    if (value < reference - FEATHER) continue;
    const distance = Math.max(0, reference - value);
    // Más lejos del fondo, más se respeta el píxel: el anillo 2 solo se toca
    // si es casi blanco puro (halo), no si es un borde claro del producto.
    const strength = ring[flat] === 1 ? 1 : Math.max(0, 1 - distance / (FEATHER / 2));
    const alpha = Math.round((distance / FEATHER) * 255);
    data[index + 3] = Math.min(data[index + 3]!, ring[flat] === 1 ? alpha : Math.round(255 - (255 - alpha) * strength));
    // Descontaminación: el color de un píxel semitransparente trae mezclado el
    // blanco del fondo; se le quita para que al componer sobre oscuro no se
    // vea un filete blanquecino.
    const a = data[index + 3]! / 255;
    if (a > 0 && a < 1) {
      data[index] = clamp((r - (1 - a) * refR) / a);
      data[index + 1] = clamp((g - (1 - a) * refG) / a);
      data[index + 2] = clamp((b - (1 - a) * refB) / a);
    }
  }

  const removedRatio = removed / total;
  if (removedRatio < 0.02) {
    throw new Error(
      'No se encontró un fondo para quitar en esta imagen. Probá con otra foto, o guardala "tal cual".',
    );
  }

  const buffer = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();
  return { buffer, removedRatio, method: 'color' };
}
