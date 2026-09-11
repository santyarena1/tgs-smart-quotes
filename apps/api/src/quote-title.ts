/**
 * Título de la tienda con formato fijo de specs:
 *
 *   PC GAMER | RYZEN 5 7600X - RAM 16GB - 512GB M.2 - RTX 3070 8GB | WINDOWS 11
 *
 * Se arma con reglas a partir de los nombres de los componentes (línea +
 * nombre). La IA solo completa lo que las reglas no pudieron leer, nunca lo
 * pisa: el nombre del ítem es la fuente de verdad.
 */

export type StoreTitleSpecs = {
  cpu: string | null;
  gpu: string | null;
  ramGb: number | null;
  storage: string | null;
  os: string | null;
};

export type TitleItem = {name: string; quantity: number; line: string | null};

const EMPTY: StoreTitleSpecs = {cpu: null, gpu: null, ramGb: null, storage: null, os: null};

const clean = (value: string) => value.replace(/\s+/g, ' ').trim().toUpperCase();

function parseCpu(text: string): string | null {
  const ryzen = /ryzen\s*(\d)\s*(?:pro\s*)?(\d{4}[a-z0-9]*)/i.exec(text);
  if (ryzen) return clean(`RYZEN ${ryzen[1]} ${ryzen[2]}`);
  const ultra = /core\s*ultra\s*(\d)\s*(\d{3}[a-z]*)/i.exec(text);
  if (ultra) return clean(`CORE ULTRA ${ultra[1]} ${ultra[2]}`);
  const intel = /\b(i[3579])\s*-?\s*(\d{4,5}[a-z]{0,2})\b/i.exec(text);
  if (intel) return clean(`INTEL ${intel[1]} ${intel[2]}`);
  const athlon = /athlon\s*(?:silver|gold)?\s*(\d{3,4}[a-z]*)/i.exec(text);
  if (athlon) return clean(`ATHLON ${athlon[1]}`);
  const basic = /\b(pentium|celeron)\s*(?:gold|silver)?\s*([a-z]?\d{3,5}[a-z]?)/i.exec(text);
  if (basic) return clean(`${basic[1]} ${basic[2]}`);
  return null;
}

function parseGpu(text: string): string | null {
  const vram = /(\d{1,2})\s*gb/i.exec(text);
  const nvidia = /\b(rtx|gtx)\s*(\d{3,4})\s*(ti\s*super|ti|super)?/i.exec(text);
  if (nvidia) return clean(`${nvidia[1]} ${nvidia[2]}${nvidia[3] ? ` ${nvidia[3]}` : ''}${vram ? ` ${vram[1]}GB` : ''}`);
  const radeon = /\brx\s*(\d{3,4})\s*(xtx|xt|gre)?/i.exec(text);
  if (radeon) return clean(`RX ${radeon[1]}${radeon[2] ? ` ${radeon[2]}` : ''}${vram ? ` ${vram[1]}GB` : ''}`);
  const arc = /\barc\s*([ab]\d{3})/i.exec(text);
  if (arc) return clean(`ARC ${arc[1]}${vram ? ` ${vram[1]}GB` : ''}`);
  return null;
}

/** Capacidad en GB de una memoria; entiende kits ("2x8GB" = 16). */
function parseRamGb(text: string): number | null {
  const kit = /(\d)\s*x\s*(\d{1,3})\s*gb/i.exec(text);
  if (kit) return Number(kit[1]) * Number(kit[2]);
  const single = /(\d{1,3})\s*gb/i.exec(text);
  return single ? Number(single[1]) : null;
}

function parseStorage(text: string): string | null {
  const size = /(\d+(?:[.,]\d+)?)\s*(tb|gb)/i.exec(text);
  if (!size) return null;
  const amount = `${(size[1] ?? '').replace(',', '.')}${(size[2] ?? '').toUpperCase()}`;
  const type = /m\.?2|nvme/i.test(text) ? 'M.2' : /ssd/i.test(text) ? 'SSD' : /hdd|r[ií]gido|mec[aá]nico/i.test(text) ? 'HDD' : '';
  return clean(`${amount}${type ? ` ${type}` : ''}`);
}

function parseOs(text: string): string | null {
  const windows = /windows\s*(\d{1,2})/i.exec(text);
  if (windows) return `WINDOWS ${windows[1]}`;
  if (/\bwindows\b/i.test(text)) return 'WINDOWS';
  return null;
}

const isCpuLine = (line: string) => /procesador|cpu|micro/i.test(line);
const isGpuLine = (line: string) => /placa de video|video|gpu|gr[aá]fica/i.test(line);
const isRamLine = (line: string) => /memoria|ram/i.test(line);
const isStorageLine = (line: string) => /disco|almacenamiento|ssd|nvme|storage/i.test(line);
const isOsLine = (line: string) => /sistema|software|windows|licencia/i.test(line);

/** Lee las specs de los ítems del presupuesto. Devuelve null en lo que no pudo leer. */
export function extractSpecsFromItems(items: TitleItem[]): StoreTitleSpecs {
  const specs: StoreTitleSpecs = {...EMPTY};
  let ramTotal = 0;
  const storages: string[] = [];
  for (const item of items) {
    const line = item.line ?? '';
    const name = item.name;
    // El nombre manda: un procesador con gráficos integrados no es una GPU
    // aunque diga "Radeon" en el nombre, por eso se decide primero por línea
    // y recién después por el nombre cuando la línea no dice nada.
    if (isCpuLine(line) || (!line && parseCpu(name))) {
      specs.cpu ??= parseCpu(name);
      continue;
    }
    if (isGpuLine(line) || (!line && parseGpu(name))) {
      specs.gpu ??= parseGpu(name);
      continue;
    }
    if (isRamLine(line) || (!line && /ddr[345]/i.test(name))) {
      const gb = parseRamGb(name);
      if (gb) ramTotal += gb * Math.max(1, item.quantity);
      continue;
    }
    if (isStorageLine(line) || (!line && /ssd|nvme|m\.2|hdd/i.test(name))) {
      const storage = parseStorage(name);
      if (storage) storages.push(storage);
      continue;
    }
    if (isOsLine(line) || /windows/i.test(name)) {
      specs.os ??= parseOs(name);
    }
  }
  if (ramTotal) specs.ramGb = ramTotal;
  if (storages.length) specs.storage = storages.slice(0, 2).join(' + ');
  return specs;
}

/** Lo que leyeron las reglas gana; la IA solo rellena huecos. */
export function mergeSpecs(primary: StoreTitleSpecs, fallback: Partial<StoreTitleSpecs> | null | undefined): StoreTitleSpecs {
  if (!fallback) return primary;
  const pick = <K extends keyof StoreTitleSpecs>(key: K): StoreTitleSpecs[K] => {
    const value = primary[key];
    if (value !== null && value !== undefined && value !== '') return value;
    const alt = fallback[key];
    if (alt === undefined || alt === null || alt === '') return null as StoreTitleSpecs[K];
    return (typeof alt === 'string' ? clean(alt) : alt) as StoreTitleSpecs[K];
  };
  return {cpu: pick('cpu'), gpu: pick('gpu'), ramGb: pick('ramGb'), storage: pick('storage'), os: pick('os')};
}

/** Todas las PC salen con Windows 11 instalado, figure o no como ítem. */
const DEFAULT_OS = 'WINDOWS 11';

/**
 * Compone el título. Sin CPU no hay título (devuelve null): mejor caer al
 * nombre interno que publicar "PC GAMER | RAM 16GB". El sistema operativo
 * va siempre: si un ítem dice otra versión de Windows se respeta, si no
 * se usa el fijo.
 */
export function composeStoreTitle(specs: StoreTitleSpecs): string | null {
  if (!specs.cpu) return null;
  const middle = [specs.cpu, specs.ramGb ? `RAM ${specs.ramGb}GB` : null, specs.storage, specs.gpu].filter(Boolean).join(' - ');
  const os = specs.os && specs.os !== 'WINDOWS' ? specs.os : DEFAULT_OS;
  return `PC GAMER | ${middle} | ${os}`;
}

export function buildStoreTitle(items: TitleItem[], aiSpecs?: Partial<StoreTitleSpecs> | null): string | null {
  return composeStoreTitle(mergeSpecs(extractSpecsFromItems(items), aiSpecs));
}
