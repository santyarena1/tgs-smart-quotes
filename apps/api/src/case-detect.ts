/**
 * Detección del gabinete entre los ítems de un presupuesto.
 *
 * Antes alcanzaba con que "gabinete" apareciera en la línea o el nombre,
 * pero en PCs con más componentes eso también matchea accesorios ("fan
 * para gabinete 120mm", "kit 3 coolers gabinete", "filtro gabinete") y
 * salía cualquier cosa como foto principal. Acá cada ítem recibe un puntaje
 * y gana el mejor: la línea "Gabinete" pesa mucho, la palabra en el nombre
 * pesa, y las palabras de accesorio restan fuerte.
 */

export type CaseCandidate = {name: string; line: string | null};

const LINE_CASE = /gabinete|case|chasis|chassis|tower/i;
const NAME_CASE = /\b(gabinete|gabinetes|case|chasis|chassis|tower|torre)\b/i;
const ACCESSORY = /\b(fan|fans|ventilador|ventiladores|cooler|coolers|kit|led|tira|filtro|panel|soporte|adaptador|cable|bracket|controlador|hub|vidrio|pata|patas|rueda|ruedas|manija|manijas)\b/i;
const CASE_BRANDS = /\b(sentey|cougar|solarmax|evolabs|aerocool|corsair|nzxt|lian li|lianli|deepcool|kolink|redragon|thermaltake|antec|cooler master|coolermaster|gamemax|montech|fractal|xpg|adata|hyte|phanteks|msi mag|be quiet|silverstone|gigabyte c|asus tuf gt|darkflash|noganet|noga|level up|levelup|xtreme|gamdias|ocelot|zalman|boreal|bitfenix|1stplayer|1st player)\b/i;

export function scoreCaseCandidate(item: CaseCandidate): number {
  const line = item.line ?? '';
  const name = item.name;
  let score = 0;
  if (LINE_CASE.test(line)) score += 10;
  if (NAME_CASE.test(name)) score += 6;
  if (CASE_BRANDS.test(name)) score += 2;
  if (ACCESSORY.test(name)) score -= 8;
  // Fuentes y coolers a veces dicen "para gabinete ATX": la línea manda.
  if (/fuente|psu|power|refriger|water|cpu/i.test(line)) score -= 12;
  return score;
}

/** El ítem que más parece el gabinete, o null si ninguno tiene puntaje positivo. */
export function pickCaseItem<T extends CaseCandidate>(items: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = scoreCaseCandidate(item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}
