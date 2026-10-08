import { categoryFor, normalizeForCategory } from './iva-categories.js';
import { pickCaseItem } from './case-detect.js';

/**
 * Imagen de referencia de una PC: analiza los ítems del presupuesto y arma el prompt que recibe la API de imágenes.
 * Los componentes recibidos son la fuente de verdad: gabinete exacto, con o sin placa de video, RAM con o sin RGB y
 * refrigeración (líquida / cooler de aire / cooler de stock AMD o Intel). El fondo lo elige el usuario antes de generar.
 */
export type ReferenceStyle = 'gamer' | 'oficina';
export type ReferenceInputItem = { name: string; quantity?: number; imageUrl?: string | null };

/** Qué componente es cada foto que se manda como referencia. */
export type RefRole = 'gabinete' | 'placa de video' | 'refrigeración' | 'memoria RAM' | 'motherboard' | 'procesador' | 'fuente';
/** `source: 'google'` = la foto no venía del distribuidor ni del catálogo: se buscó en Google para ese modelo exacto. */
export type RefImage = { role: RefRole; name: string; imageUrl: string; source?: 'google' };

/** Datos reales del producto encontrados en la web (medidas del gabinete, factor de forma, largo de la placa de video). */
export type PromptFacts = { caseDimensions: string | null; caseForm: string | null; gpuLength: string | null };

export type CoolingSpec = { type: 'liquid' | 'air' | 'stock'; name: string | null };

export type BuildSpec = {
  caseName: string | null;
  caseImageUrl: string | null;
  /** Foto de cada componente, si el producto la tiene (NODO, AcuStock o el catálogo propio). */
  images: { gpu: string | null; cooling: string | null; ram: string | null; motherboard: string | null; cpu: string | null; psu: string | null };
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
    images: {
      gpu: gpu?.imageUrl ?? null,
      cooling: (liquid ?? air)?.imageUrl ?? null,
      ram: ram.find((r) => r.imageUrl)?.imageUrl ?? null,
      motherboard: motherboard?.imageUrl ?? null,
      cpu: cpu?.imageUrl ?? null,
      psu: psu?.imageUrl ?? null,
    },
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

/** Fotos de componentes para mandar como referencia, en orden de importancia (el gabinete siempre primero). Máximo `limit`. */
export function collectReferences(spec: BuildSpec, limit = 6): RefImage[] {
  const all: Array<RefImage | null> = [
    spec.caseName && spec.caseImageUrl ? { role: 'gabinete', name: spec.caseName, imageUrl: spec.caseImageUrl } : null,
    spec.gpu && spec.images.gpu ? { role: 'placa de video', name: spec.gpu, imageUrl: spec.images.gpu } : null,
    spec.cooling.name && spec.images.cooling ? { role: 'refrigeración', name: spec.cooling.name, imageUrl: spec.images.cooling } : null,
    spec.ram[0] && spec.images.ram ? { role: 'memoria RAM', name: spec.ram[0], imageUrl: spec.images.ram } : null,
    spec.motherboard && spec.images.motherboard ? { role: 'motherboard', name: spec.motherboard, imageUrl: spec.images.motherboard } : null,
    spec.cpuName && spec.images.cpu ? { role: 'procesador', name: spec.cpuName, imageUrl: spec.images.cpu } : null,
    spec.psu && spec.images.psu ? { role: 'fuente', name: spec.psu, imageUrl: spec.images.psu } : null,
  ];
  return all.filter((r): r is RefImage => r !== null).slice(0, limit);
}

/** Prompt del fondo que se genera una sola vez por estilo y se reutiliza como imagen de referencia de ambiente. */
export const BACKGROUND_PROMPTS: Record<ReferenceStyle, string> = {
  gamer:
    'Photorealistic empty gaming room setup used as a background plate: a dark room, a wide gaming desk with two monitors showing colorful game scenes, an RGB mechanical keyboard, a gaming mouse and mousepad, a headset, neon and RGB ambient wall lighting. Leave the entire left-center third of the image completely EMPTY: just a clean desk surface and the wall behind it, with no objects at all there (a PC tower will be placed there later). Put the monitors and peripherals only in the right third. Do NOT include any PC tower or computer case. No text, no logos, no people.',
  oficina:
    'Photorealistic empty modern minimalist office used as a background plate: a clean light-colored desk, a plain white wall, soft natural daylight from a window, a monitor and a keyboard in neutral colors, a tidy, professional atmosphere with no RGB lighting. Leave the entire left-center third of the image completely EMPTY: just a clean desk surface and the wall behind it, with no objects at all there (a PC tower will be placed there later). Put the monitor and keyboard only in the right third. Do NOT include any PC tower or computer case. No text, no logos, no people.',
};

const ESTILO_LABEL: Record<ReferenceStyle, string> = { gamer: 'GAMER', oficina: 'OFICINA' };
const RULE = '==================================================';

/**
 * Prompt que recibe la API de imágenes. Sigue siempre la misma estructura: los componentes recibidos son la fuente de verdad,
 * con presencia/ausencia de GPU, refrigeración, RGB y fondo resueltos para este pedido, y un orden de prioridades explícito.
 * `attached` = las fotos de componentes que se mandan (en ese orden: Imagen 1, 2…); `hasBackground` = la última imagen es el fondo.
 */
export function buildReferencePrompt(spec: BuildSpec, style: ReferenceStyle, attached: RefImage[] = [], hasBackground = false, facts: PromptFacts | null = null, mode: 'scene' | 'interior' = 'scene'): string {
  const photoOf = (role: RefRole) => {
    const index = attached.findIndex((r) => r.role === role);
    return index >= 0 ? index + 1 : null;
  };
  const interior = mode === 'interior';
  const bgImg = hasBackground && !interior ? attached.length + 1 : null;
  const ref = (n: number | null) => (n ? ` (ver Imagen ${n})` : ' (sin foto: reproducilo por su nombre y modelo)');
  const section = (title: string) => ['', RULE, title, RULE, ''];
  const L: string[] = [];

  L.push('TAREA PRINCIPAL', '');
  if (interior) {
    L.push('MODO: INTERIOR DEL GABINETE.');
    L.push('La Imagen 1 es la foto REAL del gabinete de este pedido. Debes devolver ESA MISMA IMAGEN: el mismo gabinete, el mismo ángulo, el mismo encuadre, la misma forma, colores, paneles, vidrio, ventiladores y detalles EXTERIORES, sin ningún cambio.');
    L.push('Lo único que cambia es el INTERIOR visible a través del vidrio y los paneles: debe quedar armado EXACTAMENTE con los componentes de este pedido. Primero VACIÁ el interior de la foto (si muestra componentes que NO están en la lista —placa de video, watercooler, RAM con RGB, tiras LED, cables o cualquier otro— ELIMINALOS) y después colocá solo lo que está en la lista.');
    L.push('FONDO: TRANSPARENTE. No agregues escritorio, pared, piso, sombras proyectadas ni ambiente: solo el gabinete. El sistema lo apoya después sobre el fondo. No escribas texto ni logos nuevos en ningún lado.');
    L.push('');
  }
  L.push('Vas a recibir:');
  L.push(`1. ${attached.length ? `${attached.length === 1 ? 'UNA IMAGEN' : `${attached.length} IMÁGENES`} DE COMPONENTES DE UNA PC (Imagen 1${attached.length > 1 ? ` a Imagen ${attached.length}` : ''})` : 'LA LISTA DE COMPONENTES DE UNA PC (no hay fotos de componentes)'}.`);
  L.push(`2. ${bgImg ? `UNA IMAGEN DE FONDO / REFERENCIA DE AMBIENTE ${ESTILO_LABEL[style]} (Imagen ${bgImg})` : interior ? 'NO recibís fondo: el sistema lo agrega después (fondo transparente)' : `UN AMBIENTE ${ESTILO_LABEL[style]}, descripto en la sección 9`}.`);
  L.push('');
  L.push('Tu tarea es crear UNA ÚNICA IMAGEN REALISTA Y PROFESIONAL de una PC ARMADA utilizando EXACTAMENTE los componentes recibidos.');
  L.push('');
  L.push('REGLA ABSOLUTA:');
  L.push('LOS COMPONENTES RECIBIDOS SON LA FUENTE DE VERDAD.');
  L.push('NO DEBES INVENTAR, REEMPLAZAR, AGREGAR NI ELIMINAR COMPONENTES.');
  L.push('');
  if (attached.length) {
    L.push('IMÁGENES RECIBIDAS (en este orden):');
    attached.forEach((r, i) => L.push(`- Imagen ${i + 1}: ${r.role.toUpperCase()} — ${r.name}${r.source === 'google' ? ' (foto de ESTE modelo exacto, buscada en Google)' : ''}`));
    if (bgImg) L.push(`- Imagen ${bgImg}: FONDO / AMBIENTE ${ESTILO_LABEL[style]} (solo define el ambiente, NO los componentes)`);
    L.push('');
  }

  L.push('COMPONENTES DE ESTE PEDIDO (lista completa y definitiva):');
  L.push(`- Gabinete: ${spec.caseName ?? 'no especificado (usar un gabinete ATX mid-tower con vidrio templado)'}`);
  L.push(`- Procesador: ${spec.cpuName ?? 'no especificado'}${spec.cpuBrand ? ` (${spec.cpuBrand})` : ''}`);
  L.push(`- Motherboard: ${spec.motherboard ?? 'no especificada'}`);
  L.push(`- Placa de video: ${spec.gpu ?? 'NINGUNA (no se recibe placa de video)'}`);
  L.push(`- Memoria RAM: ${spec.ram.length ? `${spec.ram.join(' + ')} — ${spec.ramRgb ? 'CON RGB' : 'SIN RGB'}` : 'no especificada'}`);
  L.push(`- Refrigeración del CPU: ${spec.cooling.type === 'liquid' ? `WATERCOOLER / refrigeración líquida — ${spec.cooling.name}` : spec.cooling.type === 'air' ? `CPU COOLER DE AIRE — ${spec.cooling.name}` : `NINGUNA recibida → cooler STOCK ${spec.cpuBrand ?? 'del procesador'}`}`);
  if (spec.psu) L.push(`- Fuente: ${spec.psu}`);
  if (spec.storage.length) L.push(`- Almacenamiento: ${spec.storage.join(' + ')}`);
  if (spec.extras.length) L.push(`- Ventiladores / extras: ${spec.extras.join(' + ')}`);

  L.push(...section('1. GABINETE — PRIORIDAD MÁXIMA'));
  L.push(`El gabinete de este pedido es: ${spec.caseName ?? 'ATX mid-tower con vidrio templado'}${ref(photoOf('gabinete'))}.`);
  if (facts?.caseDimensions || facts?.caseForm) {
    L.push(`DATOS REALES DEL GABINETE (buscados en Google para este modelo): ${[facts.caseDimensions ? `medidas ${facts.caseDimensions}` : null, facts.caseForm ? `tamaño ${facts.caseForm}` : null].filter(Boolean).join(', ')}.`);
    L.push('Respeta esas proporciones: el gabinete tiene ese tamaño real, así que la motherboard, la placa de video, la fuente y los módulos de RAM deben verse a escala real dentro de él (ni gigantes ni diminutos).');
  }
  L.push('El gabinete recibido DEBE SER UTILIZADO EXACTAMENTE COMO REFERENCIA.');
  L.push('- Debes mostrar EL MISMO MODELO DE GABINETE recibido.');
  L.push('- Respeta su diseño, estructura, tamaño, forma, panel lateral, vidrio, panel frontal, ventiladores, distribución y apariencia.');
  L.push('- NO reemplaces el gabinete por uno parecido. NO uses un gabinete genérico. NO cambies el modelo por uno "más gamer".');
  L.push('- NO agregues elementos que el gabinete original no tenga. NO elimines elementos que el gabinete original tenga.');
  L.push('- Si el gabinete tiene vidrio templado, debe conservarse. Si tiene ventiladores visibles, deben conservarse, con su disposición específica.');
  L.push('- Conserva exactamente el color del gabinete (blanco, negro, gris u otro).');
  L.push('EL GABINETE RECIBIDO TIENE PRIORIDAD SOBRE CUALQUIER ESTILO VISUAL DEL FONDO.');

  L.push(...section('2. PLACA DE VIDEO / GPU'));
  L.push('La presencia o ausencia de GPU es OBLIGATORIA.');
  if (spec.gpu) {
    L.push(`EN ESTE PEDIDO SE RECIBE UNA PLACA DE VIDEO: ${spec.gpu}${ref(photoOf('placa de video'))}.`);
    if (facts?.gpuLength) L.push(`- Largo real aproximado de la placa (buscado en Google): ${facts.gpuLength}. Respeta esa escala frente al gabinete.`);
    L.push('- DEBES MOSTRARLA DENTRO DEL GABINETE, visible y reconocible.');
    L.push('- Respeta su modelo, tamaño, color, diseño, cantidad de ventiladores y estética.');
    L.push('- Debe estar instalada en posición horizontal en el slot PCIe, salvo que la referencia indique otra posición.');
  } else {
    L.push('EN ESTE PEDIDO NO SE RECIBE UNA PLACA DE VIDEO:');
    L.push('- NO DEBES INVENTAR UNA. NO DEBES AGREGAR UNA GPU genérica. NO DEBES MOSTRAR NINGUNA PLACA DE VIDEO.');
    L.push('- La PC debe verse como una PC sin GPU dedicada: el slot PCIe x16 principal queda visiblemente vacío.');
  }
  L.push('ESTA REGLA ES OBLIGATORIA.');

  L.push(...section('3. SISTEMA DE REFRIGERACIÓN DEL CPU'));
  if (spec.cooling.type === 'liquid') {
    L.push(`EN ESTE PEDIDO SE RECIBE UN WATERCOOLER / REFRIGERACIÓN LÍQUIDA: ${spec.cooling.name}${ref(photoOf('refrigeración'))}.`);
    L.push('- DEBES MOSTRAR EXACTAMENTE ESE SISTEMA. Respeta radiador, cantidad de ventiladores, bomba/bloque, tubos, colores y ubicación.');
    L.push('- NO lo reemplaces por un cooler de aire.');
  } else if (spec.cooling.type === 'air') {
    L.push(`EN ESTE PEDIDO SE RECIBE UN CPU COOLER DE AIRE: ${spec.cooling.name}${ref(photoOf('refrigeración'))}.`);
    L.push('- DEBES MOSTRAR ESE COOLER. Respeta tamaño, forma, ventilador, torre, color y diseño.');
    L.push('- NO lo reemplaces por refrigeración líquida ni por el cooler stock.');
  } else {
    L.push('EN ESTE PEDIDO NO SE RECIBE NINGÚN COOLER:');
    if (spec.cpuBrand === 'AMD') L.push('- El procesador es AMD: UTILIZA un cooler stock AMD visualmente apropiado (compacto, ventilador redondo, estilo Wraith).');
    else if (spec.cpuBrand === 'Intel') L.push('- El procesador es Intel: UTILIZA un cooler stock Intel visualmente apropiado (compacto, ventilador negro con disipador de aluminio).');
    else L.push('- UTILIZA el cooler stock correspondiente al procesador.');
    L.push('- NO inventes un cooler premium, ni refrigeración líquida, ni un disipador de torre grande.');
  }

  L.push(...section('4. PROCESADOR'));
  L.push(`El procesador de este pedido es: ${spec.cpuName ?? 'no especificado'}.`);
  L.push('- NO reemplazar el procesador por otro modelo. NO cambiar AMD por Intel ni Intel por AMD.');
  L.push('- La plataforma debe ser coherente con el procesador recibido.');
  L.push('- Si el CPU no es visualmente visible, representa correctamente el sistema de refrigeración correspondiente.');

  L.push(...section('5. MEMORIA RAM'));
  if (spec.ram.length) {
    L.push(`La RAM de este pedido es: ${spec.ram.join(' + ')}${ref(photoOf('memoria RAM'))}.`);
    L.push('Utiliza EXACTAMENTE la cantidad y el tipo de módulos recibidos (respeta cantidad, forma, disipadores, color y diseño).');
    L.push(spec.ramRgb ? 'LA RAM RECIBIDA TIENE RGB: DEBES MOSTRAR RGB en los módulos.' : 'LA RAM RECIBIDA NO TIENE RGB: NO AGREGUES RGB. NO conviertas RAM normal en RAM RGB.');
  } else {
    L.push('No se recibió RAM específica: módulos DDR estándar SIN RGB.');
  }

  L.push(...section('6. MOTHERBOARD'));
  L.push(`La motherboard de este pedido es: ${spec.motherboard ?? 'no especificada'}${ref(photoOf('motherboard'))}.`);
  L.push('- Respeta formato, tamaño, color, diseño general, heatsinks y elementos visuales característicos.');
  L.push('- No reemplazarla por una motherboard genérica. No agregar características que no estén presentes en la referencia.');

  L.push(...section('7. RGB E ILUMINACIÓN'));
  L.push('La iluminación debe representar ÚNICAMENTE el RGB que realmente existe en los componentes recibidos.');
  L.push('SI UN COMPONENTE TIENE RGB → mostrar RGB. SI UN COMPONENTE NO TIENE RGB → NO agregar RGB.');
  L.push('Esto aplica a: RAM, ventiladores, watercooler, gabinete, motherboard, GPU, tiras LED y cualquier otro componente.');
  L.push(`En este pedido: la RAM ${spec.ram.length && spec.ramRgb ? 'TIENE' : 'NO tiene'} RGB.`);
  L.push('NO agregar RGB simplemente porque la PC tenga estética gamer.');

  L.push(...section('8. FUENTE DE ALIMENTACIÓN, ALMACENAMIENTO Y OTROS COMPONENTES'));
  L.push('Si alguno de estos componentes es recibido como referencia visual, debe respetarse. NO inventar componentes adicionales.');
  L.push('Los componentes que normalmente no sean visibles desde el exterior pueden quedar parcialmente ocultos de manera natural, pero NO deben convertirse en otros componentes.');

  L.push(...section('9. FONDO / AMBIENTE'));
  if (interior) {
    L.push('En este modo el fondo es TRANSPARENTE: no generes ningún ambiente, escritorio ni pared. Solo el gabinete con su interior.');
  } else {
  L.push(bgImg ? `La imagen de fondo recibida (Imagen ${bgImg}) determina el ambiente general: ${ESTILO_LABEL[style]}.` : `El ambiente de este pedido es ${ESTILO_LABEL[style]}.`);
  if (style === 'gamer') {
    L.push('- Crear una escena gamer moderna, tecnológica y atractiva (escritorio oscuro, monitores, periféricos, iluminación ambiental).');
    L.push('- Mantener la PC como protagonista. La iluminación ambiental debe complementar la PC.');
  } else {
    L.push('- Crear una escena de oficina moderna, limpia y profesional, con iluminación sobria.');
    L.push('- NO convertirla en una habitación gamer: sin neón, sin decoración gamer, sin desorden.');
  }
  L.push('IMPORTANTE: el fondo determina EL AMBIENTE, NO LOS COMPONENTES. No modificar los componentes para adaptarlos al fondo.');
  }

  L.push(...section('10. REALISMO Y COMPOSICIÓN'));
  L.push('La PC debe verse físicamente armada y funcional.');
  L.push('- Todos los componentes correctamente instalados, con proporciones realistas.');
  L.push('- Cables correctamente conectados o gestionados.');
  L.push('- No mostrar componentes flotando ni atravesándose entre sí.');
  L.push('- No colocar GPU donde iría la RAM. No colocar radiadores en posiciones físicamente imposibles.');
  L.push('La PC debe ser el elemento principal de la imagen. Iluminación, reflejos, sombras y materiales fotorealistas.');

  L.push(...section('11. REGLA DE NO INVENCIÓN'));
  L.push('ESTÁ PROHIBIDO: inventar una GPU; inventar RGB; inventar un watercooler; inventar ventiladores; cambiar el gabinete; cambiar la motherboard; cambiar la RAM; cambiar el modelo de GPU; agregar componentes que no fueron proporcionados; eliminar componentes proporcionados; sustituir componentes por modelos "parecidos"; agregar elementos únicamente porque sean habituales en una PC gamer.');
  L.push('SI UN COMPONENTE NO FUE PROPORCIONADO → NO LO AGREGUES, SALVO EL COOLER STOCK DE AMD/INTEL CUANDO NO SE PROPORCIONE NINGÚN SISTEMA DE REFRIGERACIÓN.');
  L.push('Tampoco agregues texto, letras, logos ni marcas de agua sobre la imagen, ni personas, ni una segunda PC.');

  L.push(...section('12. PRIORIDAD DE LAS INSTRUCCIONES'));
  L.push('En caso de conflicto, aplicar este orden:');
  L.push('1. COMPONENTES RECIBIDOS.', '2. PRESENCIA/AUSENCIA DE GPU.', '3. GABINETE RECIBIDO.', '4. SISTEMA DE REFRIGERACIÓN RECIBIDO.', '5. RGB REAL DE LOS COMPONENTES.', '6. PROPORCIONES Y ARMADO FÍSICAMENTE CORRECTO.', '7. FONDO Y AMBIENTE.', '8. ESTILO ARTÍSTICO.');
  L.push('NUNCA sacrificar la fidelidad de los componentes para mejorar la estética de la imagen.');

  L.push(...section('OBJETIVO FINAL'));
  L.push('Generar una fotografía publicitaria hiperrealista de una PC armada, que parezca una PC real construida con EXACTAMENTE los componentes proporcionados.');
  L.push('La imagen debe permitir identificar visualmente: el gabinete correcto, la presencia o ausencia de GPU, el sistema de refrigeración correcto, la cantidad de RAM, el RGB real de los componentes y la estética general de la PC.');
  L.push('NO INTERPRETAR LIBREMENTE LOS COMPONENTES. ANALIZAR LAS IMÁGENES DE REFERENCIA Y REPRODUCIRLAS FIELMENTE.');
  L.push('SI EXISTE UNA DUDA SOBRE SI UN COMPONENTE ESTÁ PRESENTE: NO INVENTARLO.');
  return L.join('\n');
}
