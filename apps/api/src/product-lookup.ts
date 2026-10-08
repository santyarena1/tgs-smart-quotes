import { getSerperKey, searchImages, searchWeb, type SerperWebResult } from '@tgs/providers';
import { downloadImage, rankCandidates, searchQuery } from './publish-pipeline.js';
import type { RefRole } from './reference-prompt.js';

/**
 * Búsqueda en Google (Serper) del producto exacto para la imagen de referencia: su foto, cuando no la trae el
 * distribuidor o el catálogo, y sus medidas reales para que la IA respete el tamaño y las proporciones.
 * Todo es "mejor esfuerzo": si no hay clave de Serper o la búsqueda falla, la imagen se arma igual con lo que haya.
 */

/** Hechos del producto encontrados en la web, ya listos para ponerlos en el prompt. */
export type ProductFacts = {
  /** Medidas del gabinete en milímetros, tal como figuran (la web no siempre aclara el orden). */
  caseDimensions: string | null;
  /** Factor de forma / tamaño del gabinete: Full Tower, Mid Tower, Mini ITX… */
  caseForm: string | null;
  /** Largo máximo de placa de video que admite el gabinete, o largo de la GPU buscada. */
  gpuLength: string | null;
};

const NUM = '(\\d{2,4}(?:[.,]\\d{1,2})?)';
const DIMENSIONS = new RegExp(`${NUM}\\s*[x×X]\\s*${NUM}\\s*[x×X]\\s*${NUM}\\s*(mm|cm)\\b`);
const FORM = /\b(full[- ]tower|mid[- ]tower|mini[- ]tower|micro[- ]?atx|mini[- ]?itx|e-?atx|atx)\b/i;
const GPU_LENGTH = /(?:placa de video|gpu|vga|tarjeta gr[aá]fica|graphics card)[^.\n]{0,40}?(\d{3})\s*mm|(\d{3})\s*mm[^.\n]{0,30}?(?:gpu|vga|placa de video|tarjeta gr[aá]fica)/i;

const toMm = (value: string, unit: string) => {
  const n = Number(value.replace(',', '.'));
  return Math.round(unit.toLowerCase() === 'cm' ? n * 10 : n);
};

/** Medidas "A x B x C" en mm desde los fragmentos de los resultados. Descarta valores imposibles para una PC. */
export function parseDimensions(results: Array<Pick<SerperWebResult, 'title' | 'snippet'>>): string | null {
  for (const result of results) {
    const match = DIMENSIONS.exec(`${result.title} ${result.snippet}`);
    if (!match) continue;
    const values = [match[1]!, match[2]!, match[3]!].map((v) => toMm(v, match[4]!));
    if (values.every((v) => v >= 100 && v <= 800)) return `${values.join(' x ')} mm`;
  }
  return null;
}

export function parseFormFactor(results: Array<Pick<SerperWebResult, 'title' | 'snippet'>>): string | null {
  for (const result of results) {
    const match = FORM.exec(`${result.title} ${result.snippet}`);
    if (match) return match[1]!.replace(/[- ]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace('Atx', 'ATX').replace('Itx', 'ITX').replace('E Atx', 'E-ATX');
  }
  return null;
}

export function parseGpuLength(results: Array<Pick<SerperWebResult, 'title' | 'snippet'>>): string | null {
  for (const result of results) {
    const match = GPU_LENGTH.exec(`${result.title} ${result.snippet}`);
    const value = Number(match?.[1] ?? match?.[2]);
    if (value >= 150 && value <= 450) return `${value} mm`;
  }
  return null;
}

const ROLE_KEYWORD: Partial<Record<RefRole, string>> = {
  gabinete: 'gabinete',
  'placa de video': 'placa de video',
  refrigeración: 'cooler',
  motherboard: 'motherboard',
};

/**
 * Busca en Google Imágenes la foto del producto exacto y baja la mejor. El ranking exige que el título o la URL
 * mencionen el modelo (así no entran fotos de cualquier cosa); se prueban hasta `tries` candidatas.
 */
export async function lookupProductPhoto(name: string, role: RefRole, apiKey: string, tries = 5): Promise<{ buffer: Buffer; sourceUrl: string } | null> {
  try {
    const results = await searchImages(searchQuery(name, ROLE_KEYWORD[role] ?? role), apiKey, 30);
    for (const candidate of rankCandidates(results, name).slice(0, tries)) {
      try {
        const { buffer } = await downloadImage(candidate.url);
        return { buffer, sourceUrl: candidate.url };
      } catch {
        /* esa candidata no se pudo bajar: se prueba la siguiente */
      }
    }
  } catch {
    /* sin resultados o Serper caído */
  }
  return null;
}

/** Medidas y factor de forma del gabinete, y largo de la placa de video, leídos de los resultados de Google. */
export async function lookupProductFacts(caseName: string | null, gpuName: string | null, apiKey: string): Promise<ProductFacts> {
  const facts: ProductFacts = { caseDimensions: null, caseForm: null, gpuLength: null };
  const [caseResults, gpuResults] = await Promise.all([
    caseName ? searchWeb(`${caseName} gabinete dimensiones medidas mm especificaciones`, apiKey).catch(() => []) : Promise.resolve([]),
    gpuName ? searchWeb(`${gpuName} largo longitud mm especificaciones`, apiKey).catch(() => []) : Promise.resolve([]),
  ]);
  facts.caseDimensions = parseDimensions(caseResults);
  facts.caseForm = parseFormFactor(caseResults);
  // Del gabinete también sirve el largo máximo de GPU que admite; de la GPU, su propio largo.
  facts.gpuLength = parseGpuLength(gpuResults) ?? parseGpuLength(caseResults);
  return facts;
}

export async function serperKeyOrNull(): Promise<string | null> {
  try {
    return (await getSerperKey()) || null;
  } catch {
    return null;
  }
}
