/**
 * Presupuesto Web: precios finales de la tienda (thegamershop.com.ar) + armado, garantía extendida TGS y Windows.
 * Funciones puras (sin red ni React) para poder probarlas; la búsqueda en la tienda la hace quien las llama.
 */

/** Armado según la complejidad de la PC, en centavos. */
export const ASSEMBLY_BASIC_CENTS = 4_500_000n;
export const ASSEMBLY_GPU_CENTS = 7_500_000n;
export const ASSEMBLY_GPU_LIQUID_CENTS = 9_000_000n;
/** Licencia de Windows 11 Pro, en centavos. */
export const WINDOWS_LICENSE_CENTS = 6_500_000n;
/** Garantía extendida TGS: 7 % del total de los componentes (sin armado ni licencias). */
export const EXTENDED_WARRANTY_BPS = 700n;

export const ASSEMBLY_NAME = "ARMADO Y TESTEO DE PC";
export const WARRANTY_NAME = "GARANTÍA EXTENDIDA TGS";
export const WINDOWS_NAME = "LICENCIA WINDOWS 11 PRO";

const GPU_RE = /placa de video|tarjeta de video|tarjeta gr[aá]fica|\bgpu\b|\bvga\b|geforce|\brtx\b|\bgtx\b|radeon|\brx\s?\d{3,4}\b|\barc\s?[ab]\d{3}\b/i;
const MOTHERBOARD_RE = /motherboard|placa madre|mother\b|mainboard/i;
const LIQUID_RE = /refrigeraci[oó]n l[ií]quida|l[ií]quid|\baio\b|water\s?cool|watercool|kraken/i;
/** Ítems que agrega este mismo botón: no cuentan como componentes y se reemplazan si ya estaban. */
const EXTRA_RE = /^\s*(armado\b|garant[ií]a extendida|licencia\b.*windows|windows\s?11)/i;

export type ComponentLike = { name: string };

export const isExtraLine = (name: string) => EXTRA_RE.test(name);
export const hasGpu = (items: ComponentLike[]) => items.some((i) => GPU_RE.test(i.name) && !MOTHERBOARD_RE.test(i.name));
export const hasLiquidCooling = (items: ComponentLike[]) => items.some((i) => LIQUID_RE.test(i.name));

/**
 * Valor del armado: $45.000 básico (sin placa de video), $75.000 con placa de video,
 * $90.000 con placa de video y refrigeración líquida. La líquida sola no sube el armado.
 */
export function assemblyCents(items: ComponentLike[]): bigint {
  const gpu = hasGpu(items);
  const liquid = hasLiquidCooling(items);
  if (gpu && liquid) return ASSEMBLY_GPU_LIQUID_CENTS;
  if (gpu) return ASSEMBLY_GPU_CENTS;
  return ASSEMBLY_BASIC_CENTS;
}

/** 7 % del total de componentes, redondeado al peso. */
export function warrantyCents(componentsTotalCents: bigint): bigint {
  const raw = (componentsTotalCents * EXTENDED_WARRANTY_BPS + 5_000n) / 10_000n;
  return ((raw + 50n) / 100n) * 100n;
}

/** Costo de las líneas fijas: los servicios (armado, garantía) cuestan $0 y la licencia de Windows $8.500. */
export const WINDOWS_LICENSE_COST_CENTS = 850_000n;

/** Placa WiFi PCIe: agregado opcional que NO suma al total; va en las observaciones del PDF. */
export const WIFI_NAME = "PLACA WIFI PCIE";
export const WIFI_BASIC_CENTS = 1_820_000n;
export const WIFI_OTHER_CENTS = 4_740_000n;

/** Precio de la placa WiFi: $18.200 en la PC básica (sin placa de video ni refrigeración líquida) y $47.400 en las demás. */
export function wifiCents(items: ComponentLike[]): bigint {
  return hasGpu(items) || hasLiquidCooling(items) ? WIFI_OTHER_CENTS : WIFI_BASIC_CENTS;
}

/** Cantidad entera de un ítem. Rechaza decimales para no perder unidades al pasarlas a centavos. */
export function quantityUnits(quantity: string): bigint {
  const raw = quantity.trim();
  if (!/^\d+$/.test(raw)) throw new Error("Cantidad inválida");
  const qty = BigInt(raw);
  if (qty < 1n) throw new Error("Cantidad inválida");
  return qty;
}

export type ExtraLine = { name: string; priceCents: bigint; costCents: bigint };

/** Líneas FIJAS (armado, garantía extendida sobre los componentes, Windows 11 Pro) y el agregado WiFi (no suma). */
export type FixedLines = { assembly: boolean; warranty: boolean; windows: boolean; wifi: boolean };

/** Cada línea FIJA se puede destildar; las que quedan tildadas se calculan igual. El WiFi no es una línea: ver `wifiCents`. */
export function webQuoteExtras(
  components: Array<ComponentLike & { totalCents: bigint }>,
  include: Omit<FixedLines, "wifi"> = { assembly: true, warranty: true, windows: true },
): ExtraLine[] {
  const componentsTotal = components.reduce((sum, c) => sum + c.totalCents, 0n);
  const lines: ExtraLine[] = [];
  if (include.assembly) lines.push({ name: ASSEMBLY_NAME, priceCents: assemblyCents(components), costCents: 0n });
  if (include.warranty) lines.push({ name: WARRANTY_NAME, priceCents: warrantyCents(componentsTotal), costCents: 0n });
  if (include.windows) lines.push({ name: WINDOWS_NAME, priceCents: WINDOWS_LICENSE_CENTS, costCents: WINDOWS_LICENSE_COST_CENTS });
  return lines;
}

/* ————— matching contra la tienda ————— */

export type WebCandidate = { id: number; name: string; sku: string | null; priceCents: string };

const STOP = new Set(["de", "del", "la", "el", "para", "con", "y", "en", "por", "gb", "tb", "mhz", "mm"]);

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 0 && (t.length > 1 || /[a-z]/.test(t)) && !STOP.has(t));
}

/** Capacidad, velocidad o potencia: 16gb, 2tb, 750w, 6000mhz. Tiene que coincidir tal cual. */
const SPEC_RE = /^\d+(ghz|mhz|hz|gb|tb|mb|w|v|mm|cm|rpm)$/;
/** Tokens que identifican el modelo (mezclan letras y números: "5600x", "b550m", "4060"). */
const modelTokens = (list: string[]) => list.filter((t) => /\d/.test(t) && t.length >= 3 && !SPEC_RE.test(t));
/** Sufijos que cambian el producto: 4060 Ti, 5600X, 7800 XT, 5700G. */
const VARIANT_RE = /^(ti|super|xt|xtx|gre)$/;
const variantTokens = (list: string[]) => list.filter((t) => VARIANT_RE.test(t) || (t.length === 1 && /[a-z]/.test(t)));

/** Consultas para la tienda, de la más específica a la más amplia (WooCommerce busca por texto exacto). */
export function searchQueries(name: string): string[] {
  const list = tokens(name);
  const out = [list.slice(0, 7).join(" "), list.slice(0, 4).join(" "), modelTokens(list).slice(0, 2).join(" ")];
  return [...new Set(out.filter((q) => q.length >= 2))];
}

/**
 * Puntaje 0..1 de qué tanto se parece un producto de la tienda al ítem.
 * 0 si no es el mismo modelo, la misma capacidad o la misma variante (Ti, XT, X, G).
 */
export function matchScore(itemName: string, candidate: Pick<WebCandidate, "name" | "sku">): number {
  const item = tokens(itemName);
  const candName = tokens(candidate.name);
  const cand = new Set([...candName, ...tokens(candidate.sku ?? "")]);
  if (item.length === 0 || cand.size === 0) return 0;
  const models = modelTokens(item);
  // El modelo manda: si el ítem dice "5600x" y el producto de la tienda no, no es el mismo.
  if (models.length > 0 && !models.every((m) => cand.has(m))) return 0;
  // 16GB no es 32GB, y 750W no es 850W. La velocidad (GHz, MHz) no se exige: la tienda y NODO no la escriben igual.
  const specs = item.filter((t) => /^\d+(gb|tb|mb|w)$/.test(t));
  if (specs.some((s) => !cand.has(s))) return 0;
  // Una 4060 no es una 4060 Ti, ni un 5600 es un 5600X.
  const itemVariants = variantTokens(item);
  const candVariants = variantTokens(candName);
  if (itemVariants.some((v) => !cand.has(v)) || candVariants.some((v) => !itemVariants.includes(v))) return 0;
  const hit = item.filter((t) => cand.has(t)).length;
  return hit / item.length;
}

const MIN_SCORE = 0.6;

/** El producto de la tienda que corresponde al ítem (el más parecido; a igualdad, el más barato), o null. */
export function pickWebMatch<T extends WebCandidate>(itemName: string, candidates: T[]): T | null {
  let best: { c: T; score: number } | null = null;
  for (const c of candidates) {
    const score = matchScore(itemName, c);
    if (score < MIN_SCORE) continue;
    if (!best || score > best.score || (score === best.score && BigInt(c.priceCents) < BigInt(best.c.priceCents))) best = { c, score };
  }
  return best?.c ?? null;
}

/* ————— costo desde NODO ————— */

export type NodoCandidate = { name: string; sku: string | null; costIvaCents: string; inStock: boolean };

const skuKey = (sku: string | null | undefined) => normalize(sku ?? "").replace(/ /g, "");

function compareOffers<T extends NodoCandidate>(a: T, b: T): number {
  if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
  const costA = BigInt(a.costIvaCents);
  const costB = BigInt(b.costIvaCents);
  if (costA < costB) return -1;
  if (costA > costB) return 1;
  return 0;
}

/**
 * La oferta de NODO que corresponde a un producto de la tienda.
 * El mismo SKU gana aunque no tenga stock. Si no hay SKU, el mismo modelo:
 * con stock y, a igualdad, el de menor costo.
 */
export function pickNodoMatch<T extends NodoCandidate>(web: { name: string; sku: string | null }, candidates: T[]): T | null {
  const webSku = skuKey(web.sku);
  if (webSku) {
    const exact = candidates.filter((c) => skuKey(c.sku) === webSku);
    if (exact.length > 0) {
      exact.sort(compareOffers);
      return exact[0] ?? null;
    }
  }
  const scored = candidates
    .map((c) => ({ c, score: matchScore(web.name, c) }))
    .filter((x) => x.score >= MIN_SCORE);
  if (scored.length === 0) return null;
  const top = Math.max(...scored.map((x) => x.score));
  const best = scored.filter((x) => x.score >= top - 0.001).map((x) => x.c);
  best.sort(compareOffers);
  return best[0] ?? null;
}

/**
 * Busca el producto en la tienda y, si lo encuentra, su costo en NODO.
 * Si la tienda o NODO no responden, la promesa falla: no se disfraza el error de "no encontrado".
 */
export async function matchWebComponent<W extends WebCandidate, N extends NodoCandidate>(
  name: string,
  searchWeb: (query: string) => Promise<W[]>,
  searchNodo: (query: string) => Promise<N[]>,
): Promise<{ web: W | null; nodo: N | null }> {
  let web: W | null = null;
  for (const q of searchQueries(name)) {
    web = pickWebMatch(name, await searchWeb(q));
    if (web) break;
  }
  if (!web) return { web: null, nodo: null };
  let nodo: N | null = null;
  for (const q of [web.sku, ...searchQueries(web.name)]) {
    if (!q) continue;
    nodo = pickNodoMatch(web, await searchNodo(q));
    if (nodo) break;
  }
  return { web, nodo };
}

const PERIPHERAL_RE = /mouse|maus|teclado|keyboard|auricular|headset|auris\b|joystick|gamepad|parlante|speaker|micr[oó]fono|webcam/i;
const MOTHER_WIFI_RE = /wi-?fi|wlan|\bax\b/i;
const WIFI_DEVICE_RE = /wi-?fi|wlan|inal[aá]mbric|wireless|\bax\d{3,4}\b|\bbe\d{3,4}\b/i;

/**
 * La PC ya trae WiFi: placa madre con WiFi o AX, o un adaptador / placa de red inalámbrica.
 * Un mouse o un teclado inalámbrico no cuentan.
 */
export function hasWifi(items: ComponentLike[]): boolean {
  return items.some((i) => {
    if (PERIPHERAL_RE.test(i.name) || /^\s*placa wifi pcie/i.test(i.name)) return false;
    if (MOTHERBOARD_RE.test(i.name)) return MOTHER_WIFI_RE.test(i.name);
    return WIFI_DEVICE_RE.test(i.name);
  });
}
