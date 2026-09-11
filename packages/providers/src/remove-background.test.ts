import {describe, expect, it} from 'vitest';
import sharp from 'sharp';
import {removeBackgroundDetailed} from './remove-background.js';

/** Imagen sintética: fondo blanco, producto oscuro con un hueco blanco encerrado. */
async function synthetic(options: {holeSize: number; productSize: number; size?: number}) {
  const size = options.size ?? 200;
  const {productSize, holeSize} = options;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="${(size - productSize) / 2}" y="${(size - productSize) / 2}" width="${productSize}" height="${productSize}" fill="#202020"/>
    <rect x="${(size - holeSize) / 2}" y="${(size - holeSize) / 2}" width="${holeSize}" height="${holeSize}" fill="#ffffff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number) {
  const {data, info} = await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return data[(y * info.width + x) * info.channels + 3]!;
}

describe('quitar fondo', () => {
  it('borra el fondo exterior y deja el producto opaco', async () => {
    const {buffer} = await removeBackgroundDetailed(await synthetic({productSize: 120, holeSize: 0}));
    expect(await alphaAt(buffer, 5, 5)).toBe(0);
    expect(await alphaAt(buffer, 100, 60)).toBe(255);
  });

  it('borra también un hueco blanco chico encerrado por el producto', async () => {
    const {buffer} = await removeBackgroundDetailed(await synthetic({productSize: 120, holeSize: 30}));
    expect(await alphaAt(buffer, 100, 100)).toBe(0);
  });

  it('conserva una zona blanca grande del producto (no es un hueco)', async () => {
    // El "hueco" ocupa más del 12 % de la imagen: se asume parte del producto.
    const {buffer} = await removeBackgroundDetailed(await synthetic({productSize: 180, holeSize: 100}));
    expect(await alphaAt(buffer, 100, 100)).toBe(255);
  });
});
