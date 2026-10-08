import { describe, expect, it } from 'vitest';
import { analyzeBuild, buildReferencePrompt, suggestStyle } from './reference-prompt.js';

const item = (name: string, imageUrl?: string) => ({ name, quantity: 1, imageUrl: imageUrl ?? null });

const GAMER = [
  item('GABINETE SENTEY M12 BLACK MESH + 3 COOLERS A-RGB', 'https://img.example.com/sentey.jpg'),
  item('PROCESADOR AMD RYZEN 5 5600 AM4'),
  item('MOTHERBOARD ASUS PRIME B550M-K'),
  item('PLACA DE VIDEO RTX 4060 8GB GIGABYTE'),
  item('MEMORIA RAM 16GB DDR4 3200 CORSAIR VENGEANCE RGB'),
  item('WATER COOLER DEEPCOOL LE520 240MM ARGB'),
  item('FUENTE 650W ASUS 80 PLUS BRONZE'),
  item('DISCO SOLIDO 512GB M.2 NVME'),
];
const OFICINA = [
  item('GABINETE KOLINK CITADEL MESH'),
  item('PROCESADOR INTEL CORE I3 12100'),
  item('MOTHERBOARD GIGABYTE H610M-K'),
  item('MEMORIA RAM 8GB DDR4 3200 KINGSTON FURY'),
  item('FUENTE 500W SENTEY'),
  item('SSD 480GB KINGSTON'),
];

describe('analizador de la configuración', () => {
  it('detecta gabinete, placa de video, RAM RGB y refrigeración líquida', () => {
    const spec = analyzeBuild(GAMER);
    expect(spec.caseName).toContain('SENTEY M12');
    expect(spec.caseImageUrl).toBe('https://img.example.com/sentey.jpg');
    expect(spec.gpu).toContain('RTX 4060');
    expect(spec.ramRgb).toBe(true);
    expect(spec.cooling).toEqual({ type: 'liquid', name: 'WATER COOLER DEEPCOOL LE520 240MM ARGB' });
    expect(spec.cpuBrand).toBe('AMD');
  });

  it('sin placa de video, RAM común y sin cooler agregado usa el de stock', () => {
    const spec = analyzeBuild(OFICINA);
    expect(spec.gpu).toBeNull();
    expect(spec.ramRgb).toBe(false);
    expect(spec.cooling).toEqual({ type: 'stock', name: null });
    expect(spec.cpuBrand).toBe('Intel');
    // El chipset H610 de la mother no se confunde con refrigeración líquida.
    expect(spec.motherboard).toContain('H610M');
  });

  it('reconoce un cooler de aire agregado y no lo confunde con un ventilador de gabinete', () => {
    const spec = analyzeBuild([item('GABINETE SENTEY M12'), item('PROCESADOR AMD RYZEN 5 5600'), item('COOLER CPU DEEPCOOL AK400')]);
    expect(spec.cooling).toEqual({ type: 'air', name: 'COOLER CPU DEEPCOOL AK400' });
  });

  it('no cuenta servicios como componentes', () => {
    const spec = analyzeBuild([...OFICINA, item('Servicio de armado y garantía')]);
    expect(spec.extras).toEqual([]);
  });

  it('sugiere fondo gamer o de oficina según lo que lleva', () => {
    expect(suggestStyle(GAMER)).toBe('gamer');
    expect(suggestStyle(OFICINA)).toBe('oficina');
  });
});

describe('prompt de la imagen de referencia', () => {
  it('PC gamer: fondo de setup gamer y todos los requisitos obligatorios', () => {
    const prompt = buildReferencePrompt(analyzeBuild(GAMER), 'gamer', true);
    expect(prompt).toContain('GAMING SETUP');
    expect(prompt).toContain('model "GABINETE SENTEY M12 BLACK MESH + 3 COOLERS A-RGB"');
    expect(prompt).toContain('Do NOT redesign it');
    expect(prompt).toContain('HAS a dedicated graphics card');
    expect(prompt).toContain('MUST have RGB lighting');
    expect(prompt).toContain('LIQUID cooler');
    expect(prompt).toContain('do NOT show an air cooler');
    expect(prompt).not.toContain('CLEAN, MINIMALIST OFFICE');
  });

  it('PC de oficina: fondo limpio, sin placa de video, RAM sin RGB y cooler de stock Intel', () => {
    const prompt = buildReferencePrompt(analyzeBuild(OFICINA), 'oficina', false);
    expect(prompt).toContain('CLEAN, MINIMALIST OFFICE');
    expect(prompt).toContain('NO dedicated graphics card');
    expect(prompt).toContain('visibly empty');
    expect(prompt).toContain('MUST NOT have any RGB lighting');
    expect(prompt).toContain('stock Intel cooler');
    expect(prompt).toContain('do NOT show liquid cooling');
    expect(prompt).not.toContain('GAMING SETUP');
    // Sin foto, el modelo del gabinete igual se exige por nombre.
    expect(prompt).toContain('model "GABINETE KOLINK CITADEL MESH"');
  });

  it('usa el cooler de stock de AMD cuando el procesador es AMD y no hay cooler agregado', () => {
    const prompt = buildReferencePrompt(analyzeBuild([item('GABINETE SENTEY M12'), item('PROCESADOR AMD RYZEN 5 5600')]), 'gamer', false);
    expect(prompt).toContain('stock AMD cooler');
  });
});
