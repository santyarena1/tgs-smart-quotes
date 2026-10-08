import { categoryFor, normalizeForCategory } from './iva-categories.js';
import { pickCaseItem } from './case-detect.js';

/**
 * Arma el prompt de la imagen de referencia de una PC. Lo que lleva el presupuesto se convierte en requisitos
 * OBLIGATORIOS (gabinete exacto, con o sin placa de video, RAM con o sin RGB, refrigeración líquida / cooler de aire /
 * cooler de stock) para que el modelo no tenga margen de inventar. El fondo lo elige el usuario antes de generar.
 */
export type ReferenceStyle = 'gamer' | 'oficina';
export type ReferenceInputItem = { name: string; quantity?: number; imageUrl?: string | null };

export type CoolingSpec = { type: 'liquid' | 'air' | 'stock'; name: string | null };

export type BuildSpec = {
  caseName: string | null;
  caseImageUrl: string | null;
  cpuName: string | null;
  cpuBrand: 'AMD' | 'Intel' | null;
  gpu: string | null;
  motherboard: string | null;
  ram: string[];
  ramRgb: boolean;
  cooling: CoolingSpec;
  psu: string | null;
  storage: string[];
  /** Todo lo demás que se vea en el equipo (ventiladores extra, etc.). */
  extras: string[];
};

const LIQUID = /\b(water ?cool(er|ing)?|liquid|liquida|refrigeracion liquida|aio|masterliquid|kraken|ryujin|galahad|nautilus)\b|\b(120|240|280|360|420)\s?mm\b.*\b(radiador|aio|liquid)/;
const AIR_COOLER = /\b(cooler (de )?(cpu|procesador)|cpu cooler|disipador(es)?|heatsink|hyper 212|ak\d{3}|assassin|dark rock|noctua|nh-[a-z0-9]+|fuma|peerless|freezer)\b/;
const RGB = /\b(rgb|argb|a-rgb|led|iluminacion|iluminada|rainbow|aura sync)\b/;
const GAMER_HINT = /\b(gamer|gaming|rgb|argb|rtx|gtx|geforce|radeon|rx ?\d{3,4}|water ?cool|liquid)\b/;

const norm = normalizeForCategory;

/** Descompone los ítems del presupuesto en lo que se tiene que ver en la imagen. */
export function analyzeBuild(items: ReferenceInputItem[]): BuildSpec {
  const usable = items.filter((item) => !/\b(garantia|servicio|armado|instalacion|flete|envio|windows|licencia)\b/.test(norm(item.name)));
  // Un gabinete que viene con ventiladores en el nombre ("… + 3 COOLERS A-RGB") pierde puntos en pickCaseItem: si no gana
  // nadie, el primer ítem cuya palabra de tipo es gabinete lo es igual.
  const caseItem =
    pickCaseItem(usable.map((item) => ({ ...item, line: null as string | null }))) ??
    usable.find((item) => categoryFor(item.name, null)?.key === 'gabinete') ??
    null;
  const others = usable.filter((item) => item !== caseItem);

  let cpu: ReferenceInputItem | null = null;
  let gpu: ReferenceInputItem | null = null;
  let motherboard: ReferenceInputItem | null = null;
  let psu: ReferenceInputItem | null = null;
  let liquid: ReferenceInputItem | null = null;
  let air: ReferenceInputItem | null = null;
  const ram: ReferenceInputItem[] = [];
  const storage: ReferenceInputItem[] = [];
  const extras: ReferenceInputItem[] = [];

  for (const item of others) {
    const text = norm(item.name);
    const category = categoryFor(item.name, null)?.key ?? '';
    // La refrigeración se mira por el texto: "cooler" suelto es un ventilador, "water cooler" es líquida.
    if (LIQUID.test(text) && category !== 'gabinete') { liquid ??= item; continue; }
    if (category === 'cooler-cpu' || AIR_COOLER.test(text)) { air ??= item; continue; }
    switch (category) {
      case 'procesador': cpu ??= item; break;
      case 'placa-de-video': gpu ??= item; break;
      case 'mother': motherboard ??= item; break;
      case 'fuente': psu ??= item; break;
      case 'memoria-ram': ram.push(item); break;
      case 'almacenamiento': storage.push(item); break;
      case 'ventiladores': extras.push(item); break;
      default: break;
    }
  }

  const cpuText = cpu ? norm(cpu.name) : '';
  const cpuBrand: BuildSpec['cpuBrand'] = /\b(amd|ryzen|athlon|threadripper|epyc)\b/.test(cpuText) ? 'AMD' : /\b(intel|core|pentium|celeron|xeon)\b/.test(cpuText) ? 'Intel' : null;
  const cooling: CoolingSpec = liquid ? { type: 'liquid', name: liquid.name } : air ? { type: 'air', name: air.name } : { type: 'stock', name: null };

  return {
    caseName: caseItem?.name ?? null,
    caseImageUrl: caseItem?.imageUrl ?? null,
    cpuName: cpu?.name ?? null,
    cpuBrand,
    gpu: gpu?.name ?? null,
    motherboard: motherboard?.name ?? null,
    ram: ram.map((r) => r.name),
    ramRgb: ram.some((r) => RGB.test(norm(r.name))),
    cooling,
    psu: psu?.name ?? null,
    storage: storage.map((s) => s.name),
    extras: extras.map((e) => e.name),
  };
}

/** Estilo que se sugiere según lo que lleva el presupuesto (el usuario igual lo elige). */
export function suggestStyle(items: ReferenceInputItem[]): ReferenceStyle {
  return items.some((item) => GAMER_HINT.test(norm(item.name))) ? 'gamer' : 'oficina';
}

const BACKGROUNDS: Record<ReferenceStyle, string> = {
  gamer:
    'BACKGROUND (mandatory): a dark GAMING SETUP. The PC sits on a gaming desk next to one or two monitors showing colorful game scenes, a mechanical RGB keyboard, a gaming mouse and mousepad, a headset and moody RGB/neon ambient lighting on the wall. Dark room, cinematic contrast.',
  oficina:
    'BACKGROUND (mandatory): a CLEAN, MINIMALIST OFFICE. A tidy light-colored desk, plain white or light-gray wall, soft natural daylight, at most a monitor and a keyboard in neutral colors. No RGB lighting in the room, no neon, no gaming decoration, no clutter.',
};

/** Prompt final: requisitos obligatorios y prohibiciones explícitas. `hasPhoto` = el gabinete viene como foto de referencia. */
export function buildReferencePrompt(spec: BuildSpec, style: ReferenceStyle, hasPhoto: boolean): string {
  const lines: string[] = [];
  lines.push('Create a photorealistic product image of ONE complete desktop PC built exactly to the specification below. Three-quarter front view, the PC is the clear hero of the image, the side tempered glass panel is transparent so the internal components are visible. Accuracy matters more than creativity.');
  lines.push('');
  lines.push(BACKGROUNDS[style]);
  lines.push('');
  lines.push('MANDATORY REQUIREMENTS — follow every item exactly, do not improvise or substitute anything:');

  // Gabinete
  if (spec.caseName) {
    lines.push(
      hasPhoto
        ? `1. CASE: the PC case MUST be exactly the one in the reference photo, which is the model "${spec.caseName}". Keep its exact model, shape, proportions, color, front panel, vents and glass panel. Do NOT redesign it, do NOT replace it with a different case.`
        : `1. CASE: the PC case MUST be the model "${spec.caseName}". Reproduce that exact model as faithfully as you can (shape, front panel, glass side panel, color). Do NOT substitute a generic or different case.`,
    );
  } else {
    lines.push('1. CASE: a modern ATX mid-tower with a tempered glass side panel.');
  }

  // Placa de video
  lines.push(
    spec.gpu
      ? `2. GRAPHICS CARD: the PC HAS a dedicated graphics card, the "${spec.gpu}". It MUST be clearly visible mounted in the main PCIe slot, with its fans facing the glass panel.`
      : '2. GRAPHICS CARD: this PC has NO dedicated graphics card (it uses the processor\'s integrated graphics). Do NOT draw any graphics card. The main PCIe x16 slot MUST be visibly empty.',
  );

  // RAM
  if (spec.ram.length) {
    lines.push(
      spec.ramRgb
        ? `3. MEMORY (RAM): "${spec.ram.join('" + "')}". The memory modules MUST have RGB lighting, visibly lit.`
        : `3. MEMORY (RAM): "${spec.ram.join('" + "')}". The memory modules MUST NOT have any RGB lighting: plain heat spreaders or bare modules, no light on them.`,
    );
  } else {
    lines.push('3. MEMORY (RAM): standard DDR modules without RGB lighting.');
  }

  // Refrigeración
  if (spec.cooling.type === 'liquid') {
    lines.push(`4. CPU COOLING: the PC has a LIQUID cooler (all-in-one water cooling), the "${spec.cooling.name}". Show its radiator mounted in the case with fans, tubes going to the pump block on the CPU. It is mandatory, do NOT show an air cooler.`);
  } else if (spec.cooling.type === 'air') {
    lines.push(`4. CPU COOLING: the PC has an aftermarket CPU air cooler, the "${spec.cooling.name}". Show a tower heatsink with its fan on the CPU. It is mandatory, do NOT show liquid cooling and do NOT show the stock cooler.`);
  } else {
    const stock = spec.cpuBrand === 'AMD' ? 'the small stock AMD cooler that comes with the processor (Wraith-style, low profile, round fan)' : spec.cpuBrand === 'Intel' ? 'the small stock Intel cooler that comes with the processor (compact, black fan with aluminum heatsink)' : 'the small stock cooler that comes with the processor';
    lines.push(`4. CPU COOLING: no aftermarket cooler was purchased, so the CPU uses ${stock}. Do NOT show a big tower heatsink and do NOT show liquid cooling or any radiator.`);
  }

  // Resto de componentes
  if (spec.cpuName) lines.push(`5. PROCESSOR: ${spec.cpuName}${spec.cpuBrand ? ` (${spec.cpuBrand})` : ''}.`);
  if (spec.motherboard) lines.push(`6. MOTHERBOARD: ${spec.motherboard}.`);
  if (spec.psu) lines.push(`7. POWER SUPPLY: ${spec.psu} (visible only if the case design shows it; keep cables tidy).`);
  if (spec.storage.length) lines.push(`8. STORAGE: ${spec.storage.join(' + ')} (M.2 drives sit flat on the motherboard; 2.5"/3.5" drives are not necessarily visible).`);
  if (spec.extras.length) lines.push(`9. EXTRA FANS / PARTS: ${spec.extras.join(' + ')}.`);

  lines.push('');
  lines.push('FORBIDDEN: any text, letters, logos or watermarks overlaid on the image; a second PC; people; hands; components that are not in the specification above; changing the case model; adding RGB to memory that has none; adding a graphics card when the specification has none; adding liquid cooling or a big air cooler when the specification does not list one.');
  return lines.join('\n');
}

