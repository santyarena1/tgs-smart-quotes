import { describe, expect, it } from 'vitest';
import { parseDimensions, parseFormFactor, parseGpuLength } from './product-lookup.js';
import { analyzeBuild, buildReferencePrompt } from './reference-prompt.js';

const r = (title: string, snippet: string) => ({ title, snippet });

describe('lectura de resultados de Google', () => {
  it('toma las medidas del gabinete en mm, también si vienen en cm', () => {
    expect(parseDimensions([r('Sentey M12', 'Dimensiones: 420 x 205 x 450 mm. Vidrio templado')])).toBe('420 x 205 x 450 mm');
    expect(parseDimensions([r('Gabinete', 'Medidas 45 x 20.5 x 42 cm')])).toBe('450 x 205 x 420 mm');
    expect(parseDimensions([r('otro', 'sin medidas')])).toBeNull();
  });

  it('descarta números que no son medidas de una PC (resolución, versiones)', () => {
    expect(parseDimensions([r('Monitor', 'Resolución 1920 x 1080 x 60 mm')])).toBeNull();
    expect(parseDimensions([r('algo', '10 x 20 x 30 mm')])).toBeNull();
  });

  it('reconoce el tamaño del gabinete', () => {
    expect(parseFormFactor([r('Gabinete Mid Tower ATX', '')])).toBe('Mid Tower');
    expect(parseFormFactor([r('Cubo', 'Gabinete Mini-ITX compacto')])).toBe('Mini ITX');
    expect(parseFormFactor([r('nada', 'sin datos')])).toBeNull();
  });

  it('lee el largo máximo de placa de video o el largo de la placa', () => {
    expect(parseGpuLength([r('Gabinete', 'Soporta placa de video de hasta 360 mm de largo')])).toBe('360 mm');
    expect(parseGpuLength([r('RTX 4060', 'Longitud 242 mm, 2 ventiladores')])).toBeNull();
    expect(parseGpuLength([r('RTX 4060', 'La GPU mide 242 mm')])).toBe('242 mm');
  });
});

describe('prompt con datos de Google', () => {
  const spec = analyzeBuild([
    { name: 'GABINETE SENTEY M12 BLACK MESH + 3 COOLERS A-RGB', quantity: 1, imageUrl: null },
    { name: 'PLACA DE VIDEO RTX 4060 8GB', quantity: 1, imageUrl: null },
    { name: 'PROCESADOR AMD RYZEN 5 5600', quantity: 1, imageUrl: null },
  ]);

  it('incluye las medidas reales, el tamaño y la escala de la placa, y avisa qué fotos salieron de Google', () => {
    const attached = [{ role: 'gabinete' as const, name: 'GABINETE SENTEY M12 BLACK MESH + 3 COOLERS A-RGB', imageUrl: 'https://img/c.jpg', source: 'google' as const }];
    const prompt = buildReferencePrompt(spec, 'gamer', attached, false, { caseDimensions: '420 x 205 x 450 mm', caseForm: 'Mid Tower', gpuLength: '242 mm' });
    expect(prompt).toContain('foto de ESTE modelo exacto, buscada en Google');
    expect(prompt).toContain('medidas 420 x 205 x 450 mm, tamaño Mid Tower');
    expect(prompt).toContain('a escala real');
    expect(prompt).toContain('Largo real aproximado de la placa (buscado en Google): 242 mm');
  });

  it('sin datos de Google el prompt no menciona medidas', () => {
    const prompt = buildReferencePrompt(spec, 'gamer');
    expect(prompt).not.toContain('DATOS REALES DEL GABINETE');
    expect(prompt).not.toContain('buscada en Google');
  });
});
