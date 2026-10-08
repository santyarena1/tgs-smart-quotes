import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { addWatermark, CANVAS, WATERMARK_TEXT } from './reference-compose.js';
import { analyzeBuild, buildReferencePrompt } from './reference-prompt.js';
import { evaluateFindings, inspectInterior, type InteriorFindings } from './reference-verify.js';

const item = (name: string) => ({ name, quantity: 1, imageUrl: null });
const SIN_GPU = analyzeBuild([item('GABINETE MESH SENTEY BACKFIRE BLACK + 4 COOLERS ARGB'), item('PROCESADOR AMD RYZEN 7 5700G'), item('MOTHERBOARD MSI B550M PRO'), item('MEMORIA RAM 16GB DDR4 3200'), item('FUENTE 650W')]);
const CON_TODO = analyzeBuild([item('GABINETE SENTEY M12'), item('PROCESADOR AMD RYZEN 5 5600'), item('PLACA DE VIDEO RTX 4060 8GB'), item('MEMORIA RAM 16GB DDR4 RGB'), item('WATER COOLER DEEPCOOL LE520 240MM ARGB')]);

const seen = (over: Partial<InteriorFindings> = {}): InteriorFindings => ({ gpu_visible: false, liquid_cooler_visible: false, tower_air_cooler_visible: false, ram_with_rgb: false, ...over });

describe('verificación del resultado contra el presupuesto', () => {
  it('Ryzen 5700G sin placa de video: detecta cuando la IA agrega una', () => {
    expect(SIN_GPU.gpu).toBeNull();
    const ok = evaluateFindings(SIN_GPU, seen());
    expect(ok.issues).toEqual([]);
    const bad = evaluateFindings(SIN_GPU, seen({ gpu_visible: true }));
    expect(bad.issues).toEqual(['se ve una placa de video y el presupuesto no la incluye']);
    expect(bad.corrections[0]).toContain('ELIMINALA');
    expect(bad.corrections[0]).toContain('VACÍO');
  });

  it('cooler stock: no admite radiador ni torre grande', () => {
    expect(evaluateFindings(SIN_GPU, seen({ liquid_cooler_visible: true })).issues).toHaveLength(1);
    expect(evaluateFindings(SIN_GPU, seen({ tower_air_cooler_visible: true })).issues).toHaveLength(1);
  });

  it('PC completa: exige placa, refrigeración líquida y RAM con RGB', () => {
    expect(evaluateFindings(CON_TODO, seen({ gpu_visible: true, liquid_cooler_visible: true, ram_with_rgb: true })).issues).toEqual([]);
    const missing = evaluateFindings(CON_TODO, seen({ ram_with_rgb: false }));
    expect(missing.issues).toHaveLength(3);
    expect(missing.corrections.join(' ')).toContain('RTX 4060');
    expect(missing.corrections.join(' ')).toContain('LE520');
  });

  it('si no se ven módulos de RAM no inventa un problema', () => {
    expect(evaluateFindings(SIN_GPU, seen({ ram_with_rgb: null })).issues).toEqual([]);
  });
});

describe('inspección con el modelo de visión', () => {
  const png = () => sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const clientReturning = (content: string | null, sent: any[] = []) => ({ chat: { completions: { create: async (args: any) => { sent.push(args); return { choices: [{ message: { content } }] }; } } } });

  it('lee el JSON de respuesta y manda la imagen aplanada', async () => {
    const sent: any[] = [];
    const found = await inspectInterior(clientReturning('{"gpu_visible":true,"liquid_cooler_visible":false,"tower_air_cooler_visible":false,"ram_with_rgb":null}', sent), 'gpt-5.2', await png());
    expect(found).toEqual({ gpu_visible: true, liquid_cooler_visible: false, tower_air_cooler_visible: false, ram_with_rgb: null });
    expect(sent[0].model).toBe('gpt-5.2');
    expect(sent[0].messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('si la respuesta no sirve o el modelo falla devuelve null: no se verifica pero no se rompe nada', async () => {
    expect(await inspectInterior(clientReturning('no es json'), 'm', await png())).toBeNull();
    expect(await inspectInterior(clientReturning(null), 'm', await png())).toBeNull();
    const failing = { chat: { completions: { create: async () => { throw new Error('boom'); } } } };
    expect(await inspectInterior(failing, 'm', await png())).toBeNull();
  });
});

describe('prompt de reintento', () => {
  it('sin placa de video pide eliminar la que traiga la foto y agrega la corrección del intento anterior', () => {
    const refs = [{ role: 'gabinete' as const, name: SIN_GPU.caseName!, imageUrl: 'https://x/c.jpg' }];
    const first = buildReferencePrompt(SIN_GPU, 'gamer', refs, false, null, 'interior');
    expect(first).toContain('si la foto del gabinete muestra una placa de video montada, ELIMINALA');
    expect(first).toContain('gráficos integrados del procesador');
    expect(first).toContain('ELIMINALOS');
    expect(first).not.toContain('CORRECCIÓN OBLIGATORIA');
    const retry = buildReferencePrompt(SIN_GPU, 'gamer', refs, false, null, 'interior', ['En el intento anterior apareció una placa de video y NO corresponde']);
    expect(retry).toContain('CORRECCIÓN OBLIGATORIA');
    expect(retry).toContain('En el intento anterior apareció una placa de video');
  });
});

describe('marca de agua', () => {
  it('lleva la leyenda pedida y se aplica en la esquina inferior derecha sin tocar el resto', async () => {
    expect(WATERMARK_TEXT).toBe('IMAGEN DE REFERENCIA BASADA EN EL PRESUPUESTO CREADA POR IA DE THEGAMERSHOP');
    const base = await sharp({ create: { width: CANVAS.width, height: CANVAS.height, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer();
    const marked = await addWatermark(base);
    const meta = await sharp(marked).metadata();
    expect([meta.width, meta.height]).toEqual([CANVAS.width, CANVAS.height]);
    const region = async (buf: Buffer, left: number, top: number, width: number, height: number) => (await sharp(buf).removeAlpha().extract({ left, top, width, height }).raw().toBuffer()).reduce((a, v) => a + v, 0);
    // Arriba a la izquierda no cambia nada; abajo a la derecha sí (la leyenda).
    expect(await region(marked, 0, 0, 400, 300)).toBe(await region(base, 0, 0, 400, 300));
    expect(await region(marked, CANVAS.width - 700, CANVAS.height - 60, 690, 50)).not.toBe(await region(base, CANVAS.width - 700, CANVAS.height - 60, 690, 50));
    // La zona izquierda de la franja inferior queda intacta: la marca es chica y de una esquina.
    expect(await region(marked, 0, CANVAS.height - 60, 300, 50)).toBe(await region(base, 0, CANVAS.height - 60, 300, 50));
  }, 30_000);
});
