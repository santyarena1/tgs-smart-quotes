import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CANVAS, composeOnBackground, sizeForCase, transparentCase, trimCase } from './reference-compose.js';
import { analyzeBuild, buildReferencePrompt } from './reference-prompt.js';

/** Gabinete de prueba: rectángulo rojo opaco con margen transparente alrededor. */
async function fakeCase(width = 400, height = 560): Promise<Buffer> {
  const body = await sharp({ create: { width, height, channels: 4, background: { r: 220, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: width + 100, height: height + 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: body, left: 50, top: 50 }]).png().toBuffer();
}

describe('armado de la imagen sin IA', () => {
  it('un gabinete ya recortado no pasa por el quitafondo y se le sacan los márgenes', async () => {
    const original = await fakeCase();
    expect(await transparentCase(original)).toBe(original);
    const meta = await sharp(await trimCase(original)).metadata();
    expect([meta.width, meta.height]).toEqual([400, 560]);
  });

  it('elige el tamaño de salida según la forma del gabinete', () => {
    expect(sizeForCase(400, 560)).toBe('1024x1536');
    expect(sizeForCase(600, 400)).toBe('1536x1024');
    expect(sizeForCase(500, 500)).toBe('1024x1024');
  });

  it('apoya el gabinete sobre el fondo a la izquierda del centro, con el tamaño del lienzo', async () => {
    const out = await composeOnBackground(await fakeCase(), null, 'oficina');
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([CANVAS.width, CANVAS.height, 'jpeg']);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [0, 1, 2].map((i) => data[(y * info.width + x) * info.channels + i]!);
    // En el centro del gabinete (≈ 36 % del ancho, 55 % del alto) hay rojo; a la derecha, el fondo claro de oficina.
    const [r, g, b] = px(Math.round(CANVAS.width * 0.36), Math.round(CANVAS.height * 0.55));
    expect(r!).toBeGreaterThan(180);
    expect(g!).toBeLessThan(80);
    expect(b!).toBeLessThan(80);
    const [br, bg, bb] = px(Math.round(CANVAS.width * 0.85), Math.round(CANVAS.height * 0.3));
    expect(br! + bg! + bb!).toBeGreaterThan(600);
  });

  it('con fondo de IA lo usa en vez del de respaldo', async () => {
    const plate = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 200, b: 10 } } }).png().toBuffer();
    const out = await composeOnBackground(await fakeCase(), plate, 'gamer');
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const i = (Math.round(CANVAS.height * 0.3) * info.width + Math.round(CANVAS.width * 0.85)) * info.channels;
    expect(data[i + 1]!).toBeGreaterThan(150);
  });
});

describe('prompt en modo interior', () => {
  const spec = analyzeBuild([
    { name: 'GABINETE MESH SENTEY M25 WHITE + 4 COOLERS ARGB.', quantity: 1, imageUrl: 'https://x/c.jpg' },
    { name: 'PROCESADOR AMD (AM4) RYZEN 5 5600GE', quantity: 1, imageUrl: null },
    { name: 'MEMORIA RAM 16GB DDR4 2666MHZ', quantity: 1, imageUrl: null },
  ]);
  const refs = [{ role: 'gabinete' as const, name: spec.caseName!, imageUrl: 'https://x/c.jpg' }];

  it('pide devolver el mismo gabinete con fondo transparente y vaciar lo que no está en la lista', () => {
    const prompt = buildReferencePrompt(spec, 'oficina', refs, false, null, 'interior');
    expect(prompt).toContain('MODO: INTERIOR DEL GABINETE');
    expect(prompt).toContain('devolver ESA MISMA IMAGEN');
    expect(prompt).toContain('FONDO: TRANSPARENTE');
    expect(prompt).toContain('VACIÁ el interior');
    expect(prompt).toContain('NO recibís fondo');
    expect(prompt).toContain('En este modo el fondo es TRANSPARENTE');
    expect(prompt).toContain('NO SE RECIBE UNA PLACA DE VIDEO');
    expect(prompt).not.toContain('oficina moderna, limpia y profesional');
  });

  it('el modo escena sigue igual que antes', () => {
    const prompt = buildReferencePrompt(spec, 'oficina', refs, true);
    expect(prompt).not.toContain('MODO: INTERIOR');
    expect(prompt).toContain('oficina moderna, limpia y profesional');
  });
});
