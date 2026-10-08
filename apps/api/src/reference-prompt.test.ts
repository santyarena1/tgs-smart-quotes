import { describe, expect, it } from 'vitest';
import { analyzeBuild, buildReferencePrompt, collectReferences, suggestStyle } from './reference-prompt.js';

const item = (name: string, imageUrl?: string) => ({ name, quantity: 1, imageUrl: imageUrl ?? null });

const GAMER = [
  item('GABINETE SENTEY M12 BLACK MESH + 3 COOLERS A-RGB', 'https://img.example.com/sentey.jpg'),
  item('PROCESADOR AMD RYZEN 5 5600 AM4'),
  item('MOTHERBOARD ASUS PRIME B550M-K', 'https://img.example.com/mother.jpg'),
  item('PLACA DE VIDEO RTX 4060 8GB GIGABYTE', 'https://img.example.com/rtx.jpg'),
  item('MEMORIA RAM 16GB DDR4 3200 CORSAIR VENGEANCE RGB'),
  item('WATER COOLER DEEPCOOL LE520 240MM ARGB', 'https://img.example.com/aio.jpg'),
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

describe('fotos de referencia', () => {
  it('manda primero el gabinete y solo los componentes que tienen foto', () => {
    const refs = collectReferences(analyzeBuild(GAMER));
    expect(refs.map((r) => r.role)).toEqual(['gabinete', 'placa de video', 'refrigeración', 'motherboard']);
    expect(refs[0]!.imageUrl).toBe('https://img.example.com/sentey.jpg');
  });

  it('sin fotos no hay referencias y respeta el máximo', () => {
    expect(collectReferences(analyzeBuild(OFICINA))).toEqual([]);
    expect(collectReferences(analyzeBuild(GAMER), 2).map((r) => r.role)).toEqual(['gabinete', 'placa de video']);
  });
});

describe('prompt de la imagen de referencia', () => {
  it('sigue la estructura de 12 secciones, con el orden de prioridades y el objetivo final', () => {
    const prompt = buildReferencePrompt(analyzeBuild(GAMER), 'gamer');
    for (const title of ['TAREA PRINCIPAL', '1. GABINETE — PRIORIDAD MÁXIMA', '2. PLACA DE VIDEO / GPU', '3. SISTEMA DE REFRIGERACIÓN DEL CPU', '4. PROCESADOR', '5. MEMORIA RAM', '6. MOTHERBOARD', '7. RGB E ILUMINACIÓN', '9. FONDO / AMBIENTE', '10. REALISMO Y COMPOSICIÓN', '11. REGLA DE NO INVENCIÓN', '12. PRIORIDAD DE LAS INSTRUCCIONES', 'OBJETIVO FINAL']) {
      expect(prompt, title).toContain(title);
    }
    expect(prompt).toContain('LOS COMPONENTES RECIBIDOS SON LA FUENTE DE VERDAD.');
    expect(prompt).toContain('SI EXISTE UNA DUDA SOBRE SI UN COMPONENTE ESTÁ PRESENTE: NO INVENTARLO.');
  });

  it('PC gamer completa: GPU, RAM con RGB, watercooler y gabinete exacto, con las imágenes numeradas', () => {
    const spec = analyzeBuild(GAMER);
    const attached = collectReferences(spec);
    const prompt = buildReferencePrompt(spec, 'gamer', attached, true);
    expect(prompt).toContain('Imagen 1: GABINETE — GABINETE SENTEY M12 BLACK MESH + 3 COOLERS A-RGB');
    expect(prompt).toContain('Imagen 2: PLACA DE VIDEO');
    expect(prompt).toContain(`Imagen ${attached.length + 1}: FONDO / AMBIENTE GAMER`);
    expect(prompt).toContain('(ver Imagen 1)');
    expect(prompt).toContain('EN ESTE PEDIDO SE RECIBE UNA PLACA DE VIDEO');
    expect(prompt).toContain('LA RAM RECIBIDA TIENE RGB');
    expect(prompt).toContain('WATERCOOLER / REFRIGERACIÓN LÍQUIDA');
    expect(prompt).toContain('NO lo reemplaces por un cooler de aire.');
    expect(prompt).toContain('escena gamer');
    expect(prompt).not.toContain('EN ESTE PEDIDO NO SE RECIBE UNA PLACA DE VIDEO');
  });

  it('PC de oficina sin GPU: slot vacío, RAM sin RGB, cooler stock Intel y ambiente sobrio', () => {
    const prompt = buildReferencePrompt(analyzeBuild(OFICINA), 'oficina');
    expect(prompt).toContain('EN ESTE PEDIDO NO SE RECIBE UNA PLACA DE VIDEO');
    expect(prompt).toContain('NO DEBES MOSTRAR NINGUNA PLACA DE VIDEO');
    expect(prompt).toContain('visiblemente vacío');
    expect(prompt).toContain('NO AGREGUES RGB');
    expect(prompt).toContain('cooler stock Intel');
    expect(prompt).toContain('NO inventes un cooler premium');
    expect(prompt).toContain('oficina moderna, limpia y profesional');
    expect(prompt).not.toContain('escena gamer');
    // Sin foto del gabinete igual se exige por nombre.
    expect(prompt).toContain('GABINETE KOLINK CITADEL MESH (sin foto: reproducilo por su nombre y modelo)');
  });

  it('usa el cooler stock de AMD cuando el procesador es AMD y no hay cooler agregado', () => {
    const prompt = buildReferencePrompt(analyzeBuild([item('GABINETE SENTEY M12'), item('PROCESADOR AMD RYZEN 5 5600')]), 'gamer');
    expect(prompt).toContain('cooler stock AMD');
  });

  it('con un cooler de aire agregado exige ese cooler y no el stock', () => {
    const prompt = buildReferencePrompt(analyzeBuild([item('GABINETE SENTEY M12'), item('PROCESADOR AMD RYZEN 5 5600'), item('COOLER CPU DEEPCOOL AK400')]), 'gamer');
    expect(prompt).toContain('CPU COOLER DE AIRE');
    expect(prompt).toContain('NO lo reemplaces por refrigeración líquida ni por el cooler stock');
  });
});
