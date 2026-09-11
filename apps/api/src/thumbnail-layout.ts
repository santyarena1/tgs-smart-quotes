import type {StoreTitleSpecs} from './quote-title.js';

/**
 * Plantilla "TGS" de miniatura, compuesta por el sistema en HTML/CSS y
 * capturada con Chromium (ver renderHtmlToPng en @tgs/pdf).
 *
 * Replica el diseño que el negocio venía generando a mano: logo arriba a la
 * izquierda, "PC GAMER" + título grande (procesador, o placa de video si la PC
 * supera el precio configurado), filas de specs con ícono, el gabinete grande
 * a la derecha y cuatro badges al pie. Como el texto lo pone el sistema, las
 * specs salen siempre exactas.
 */

export type ThumbnailRow = {icon: RowIcon; label: string; value: string};
export type RowIcon = 'cpu' | 'board' | 'ram' | 'storage' | 'gpu' | 'psu' | 'cooler' | 'case';
export type FooterIcon = 'shield' | 'star' | 'headset' | 'truck' | 'check' | 'bolt';
export type FooterBadge = {icon: FooterIcon; line1: string; line2: string};
export type Headline = {kicker: string; line1: string; line2: string; line3: string | null};

export type LayoutInput = {
  width: number;
  height: number;
  accent: string;
  /** data: URL del logo, o null para el logotipo en texto. */
  logoDataUrl: string | null;
  /** data: URL de la foto del gabinete (con fondo transparente idealmente). */
  caseDataUrl: string;
  headline: Headline;
  rows: ThumbnailRow[];
  footer: FooterBadge[];
};

export const DEFAULT_FOOTER: FooterBadge[] = [
  {icon: 'shield', line1: 'COMPONENTES', line2: 'DE CALIDAD'},
  {icon: 'star', line1: 'RENDIMIENTO', line2: 'CONFIABLE'},
  {icon: 'headset', line1: 'GARANTÍA', line2: 'OFICIAL'},
  {icon: 'truck', line1: 'ENVÍOS A', line2: 'TODO EL PAÍS'},
];

export const DEFAULT_CASE_AI_PROMPT =
  'Es la foto de un gabinete de PC gamer con fondo transparente. Devolvé el MISMO gabinete (idéntica forma, color, panel de vidrio, logos y proporciones), visto desde el mismo ángulo, pero con el interior armado como una PC gamer completa: motherboard, placa de video, memorias RGB, cooler y ventiladores con iluminación RGB multicolor encendida. Estilo foto de producto de catálogo, luz de estudio, nítido. Fondo transparente, sin texto, sin sombras fuera del gabinete.';

// ------------------------------------------------------------------ helpers

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c] as string);
const upper = (value: string) => value.toLocaleUpperCase('es-AR');

/**
 * Título grande. Con GPU: "GEFORCE RTX" / "3080 TI" / "12GB". Con CPU:
 * "RYZEN 5" / "3400G" o "CORE I5" / "12400F". Si no se pudo leer ninguno,
 * cae al nombre de la PC partido en dos líneas.
 */
export function buildHeadline(specs: StoreTitleSpecs, useGpu: boolean, fallbackTitle: string): Headline {
  const kicker = 'PC GAMER';
  if (useGpu && specs.gpu) {
    const tokens = upper(specs.gpu).split(/\s+/).filter(Boolean);
    let line3: string | null = null;
    if (tokens.length > 1 && /^\d+GB$/.test(tokens[tokens.length - 1] ?? '')) line3 = tokens.pop() ?? null;
    const brand = tokens[0] ?? '';
    const family: Record<string, string> = {RTX: 'GEFORCE RTX', GTX: 'GEFORCE GTX', RX: 'RADEON RX', ARC: 'INTEL ARC'};
    if (family[brand]) return {kicker, line1: family[brand], line2: tokens.slice(1).join(' ') || brand, line3};
    return {kicker, line1: brand, line2: tokens.slice(1).join(' ') || '', line3};
  }
  if (specs.cpu) {
    const tokens = upper(specs.cpu).split(/\s+/).filter(Boolean);
    if (tokens[0] === 'INTEL' && tokens.length >= 2) {
      return {kicker, line1: `CORE ${tokens[1]}`, line2: tokens.slice(2).join(' ') || tokens[1] || '', line3: null};
    }
    if (tokens.length >= 3) return {kicker, line1: tokens.slice(0, 2).join(' '), line2: tokens.slice(2).join(' '), line3: null};
    if (tokens.length === 2) return {kicker, line1: tokens[0] ?? '', line2: tokens[1] ?? '', line3: null};
    return {kicker, line1: tokens[0] ?? '', line2: '', line3: null};
  }
  const words = upper(fallbackTitle).split(/\s+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  return {kicker, line1: words.slice(0, half).join(' '), line2: words.slice(half).join(' '), line3: null};
}

type RowItem = {name: string; quantity: number; line: string | null};

const LINE_TESTS: {icon: RowIcon; label: string; test: RegExp}[] = [
  {icon: 'cpu', label: 'PROCESADOR', test: /procesador|cpu|micro/i},
  {icon: 'board', label: 'MOTHERBOARD', test: /mother|placa madre|placa base/i},
  {icon: 'ram', label: 'MEMORIA RAM', test: /memoria|ram/i},
  {icon: 'storage', label: 'ALMACENAMIENTO', test: /disco|almacenamiento|ssd|nvme|storage|hdd/i},
  {icon: 'gpu', label: 'PLACA DE VIDEO', test: /placa de video|gpu|gr[aá]fic|video/i},
  {icon: 'psu', label: 'FUENTE DE PODER', test: /fuente|psu|power/i},
  {icon: 'cooler', label: 'REFRIGERACIÓN', test: /refriger|cooler|water|disipador/i},
];

/**
 * Deja el nombre del componente en una sola línea legible: saca el prefijo
 * redundante ("Procesador AMD..." → "AMD..."), las aclaraciones entre
 * paréntesis ("(SIMILAR 500GB)", "(AM4)"), las palabras de catálogo que no
 * le dicen nada al cliente (OEM, BULK, SIN VIDEO...) y acota el largo
 * cortando en una palabra.
 */
function cleanValue(name: string, label: string, max = 30): string {
  let value = upper(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(OEM|BULK|TRAY|BOX|SIMILAR|SIN VIDEO|C\/VIDEO|CON VIDEO|NUEVO|NUEVA|GARANTIA|GARANTÍA)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:-]+$/g, '')
    .trim();
  const prefixes = [label, 'PLACA DE VIDEO', 'MEMORIA RAM', 'MEMORIA', 'DISCO SÓLIDO', 'DISCO SSD', 'DISCO', 'FUENTE DE PODER', 'FUENTE', 'PROCESADOR', 'MOTHERBOARD', 'MOTHER', 'GABINETE', 'SSD', 'MICROPROCESADOR'];
  for (const prefix of prefixes) {
    if (value.startsWith(prefix + ' ')) value = value.slice(prefix.length + 1);
  }
  if (value.length > max) {
    const cut = value.slice(0, max + 1);
    const space = cut.lastIndexOf(' ');
    value = (space > max * 0.5 ? cut.slice(0, space) : value.slice(0, max)).trim();
  }
  return value;
}

/**
 * Filas de specs a partir de los ítems del presupuesto: una por línea
 * (procesador, mother, RAM, almacenamiento, gráficos, fuente), en ese orden.
 * Varios discos se juntan en una fila. Si la PC no tiene placa de video se
 * muestra "GRÁFICOS INTEGRADOS". Si entran más de `max` filas, RAM y
 * almacenamiento se fusionan (como en las miniaturas originales).
 */
export function buildRows(items: RowItem[], specs: StoreTitleSpecs, max = 6): ThumbnailRow[] {
  const byIcon = new Map<RowIcon, string[]>();
  for (const item of items) {
    const haystack = `${item.line ?? ''} ${item.name}`;
    const match = LINE_TESTS.find((entry) => (item.line ? entry.test.test(item.line) : entry.test.test(haystack)));
    if (!match) continue;
    const list = byIcon.get(match.icon) ?? [];
    let value = cleanValue(item.name, match.label);
    // RAM: se muestra el total ("2x 16GB" → "32GB DDR5"), como en las miniaturas.
    if (match.icon === 'ram' && item.quantity > 1) {
      const per = /(\d+)\s*GB/i.exec(value);
      value = per ? value.replace(per[0], `${Number(per[1]) * item.quantity}GB`) : `${item.quantity}x ${value}`;
    } else if (item.quantity > 1) {
      value = `${item.quantity}x ${value}`;
    }
    list.push(value);
    byIcon.set(match.icon, list);
  }
  const rows: ThumbnailRow[] = [];
  const push = (icon: RowIcon, label: string, value: string | undefined) => {
    if (value) rows.push({icon, label, value});
  };
  push('cpu', 'PROCESADOR', byIcon.get('cpu')?.[0] ?? (specs.cpu ? upper(specs.cpu) : undefined));
  push('board', 'MOTHERBOARD', byIcon.get('board')?.[0]);
  const ram = byIcon.get('ram')?.[0] ?? (specs.ramGb ? `${specs.ramGb}GB` : undefined);
  push('ram', 'MEMORIA RAM', ram);
  const storage = byIcon.get('storage')?.slice(0, 2).join(' + ') ?? (specs.storage ? upper(specs.storage) : undefined);
  push('storage', 'ALMACENAMIENTO', storage);
  push('gpu', 'PLACA DE VIDEO', byIcon.get('gpu')?.[0] ?? (specs.gpu ? upper(specs.gpu) : 'GRÁFICOS INTEGRADOS'));
  push('psu', 'FUENTE DE PODER', byIcon.get('psu')?.[0]);
  push('cooler', 'REFRIGERACIÓN', byIcon.get('cooler')?.[0]);
  if (rows.length > max) {
    const ramIndex = rows.findIndex((row) => row.icon === 'ram');
    const storageIndex = rows.findIndex((row) => row.icon === 'storage');
    if (ramIndex >= 0 && storageIndex >= 0) {
      rows[ramIndex] = {icon: 'ram', label: 'MEMORIA RAM + DISCO', value: `${rows[ramIndex]?.value ?? ''}\n${rows[storageIndex]?.value ?? ''}`};
      rows.splice(storageIndex, 1);
    }
  }
  return rows.slice(0, max);
}

// -------------------------------------------------------------------- icons

const ROW_ICONS: Record<RowIcon, string> = {
  cpu: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4"/><path d="M9 3v4M12 3v4M15 3v4M9 17v4M12 17v4M15 17v4M3 9h4M3 12h4M3 15h4M17 9h4M17 12h4M17 15h4"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="5" height="5"/><path d="M15 7h3M15 10h3M7 15h10M7 18h6"/>',
  ram: '<rect x="2" y="7" width="20" height="9" rx="1"/><path d="M6 10v3M10 10v3M14 10v3M18 10v3M4 16v2M8 16v2M12 16v2M16 16v2M20 16v2"/>',
  storage: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 12h10M7 15h4"/><circle cx="17" cy="15" r="1"/>',
  gpu: '<rect x="2" y="6" width="19" height="11" rx="1.5"/><circle cx="9" cy="11.5" r="3"/><circle cx="16" cy="11.5" r="2"/><path d="M4 17v3h9v-3M9 8.5v6M6 11.5h6"/>',
  psu: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  cooler: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C12 5 9 3 6 3c0 4 2 6 6 6.5M14.5 12c4.5 0 6.5-3 6.5-6-4 0-6 2-6.5 6M12 14.5c0 4.5 3 6.5 6 6.5 0-4-2-6-6-6.5M9.5 12C5 12 3 15 3 18c4 0 6-2 6.5-6"/>',
  case: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 6h6M9 9h6"/><circle cx="12" cy="16" r="2.5"/>',
};

const FOOTER_ICONS: Record<FooterIcon, string> = {
  shield: '<path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  star: '<path d="m12 2 2.2 2.4 3.2-.5.6 3.2 2.9 1.4-1.5 2.9 1.5 2.9-2.9 1.4-.6 3.2-3.2-.5L12 22l-2.2-2.4-3.2.5-.6-3.2-2.9-1.4 1.5-2.9-1.5-2.9 2.9-1.4.6-3.2 3.2.5z"/><path d="m12 7.5 1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z"/>',
  headset: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="2" y="13" width="5" height="7" rx="2"/><rect x="17" y="13" width="5" height="7" rx="2"/><path d="M19 20a3 3 0 0 1-3 2h-3"/>',
  truck: '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M8 18h7"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
};

const svg = (paths: string, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

// --------------------------------------------------------------------- html

/** Lado de referencia del diseño: todas las medidas en px están pensadas para 1240. */
const BASE = 1240;

export function renderThumbnailHtml(input: LayoutInput): string {
  const {accent} = input;
  // El diseño se dibuja a escala 1240 y se achica/agranda entero con zoom,
  // así el mismo layout sirve para 1024, 1536 o el tamaño que sea. En formatos
  // no cuadrados el lado corto manda y el largo gana lienzo.
  const scale = Math.min(input.width, input.height) / BASE;
  const designW = Math.round(input.width / scale);
  const designH = Math.round(input.height / scale);
  const threeLines = Boolean(input.headline.line3);
  const rowsHtml = input.rows
    .map(
      (row) =>
        `<div class="row"><div class="ico">${svg(ROW_ICONS[row.icon], 40)}</div><div class="txt"><span class="lbl">${esc(row.label)}</span><span class="val">${esc(row.value).replace(/\n/g, '<br>')}</span></div></div>`,
    )
    .join('');
  const footerHtml = input.footer
    .map((badge) => `<div class="badge"><div class="bico">${svg(FOOTER_ICONS[badge.icon], 52)}</div><div class="btxt"><span>${esc(badge.line1)}</span><strong>${esc(badge.line2)}</strong></div></div>`)
    .join('<div class="sep"></div>');
  const logo = input.logoDataUrl
    ? `<img class="logo" src="${input.logoDataUrl}" alt="">`
    : `<div class="logo-text"><span class="lt1">THE</span><span class="lt2">GAMER</span><span class="lt3">SHOP</span></div>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  html { margin: 0; width: ${input.width}px; height: ${input.height}px; overflow: hidden; background: #09090b; }
  body {
    margin: 0; width: ${designW}px; height: ${designH}px; overflow: hidden; zoom: ${scale};
    position: relative; color: #fff; font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif;
    background:
      radial-gradient(ellipse 70% 55% at 12% 100%, color-mix(in srgb, var(--accent) 55%, transparent), transparent 70%),
      radial-gradient(ellipse 60% 50% at 85% 0%, rgba(255,255,255,.07), transparent 65%),
      radial-gradient(ellipse 80% 60% at 70% 60%, rgba(255,255,255,.03), transparent 70%),
      linear-gradient(180deg, #131316 0%, #09090b 100%);
  }
  .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse 90% 90% at 50% 50%, transparent 60%, rgba(0,0,0,.55) 100%); pointer-events: none; }
  .left { position: absolute; left: 56px; top: 44px; width: 470px; display: flex; flex-direction: column; align-items: flex-start; }
  .logo { height: 130px; width: auto; max-width: 300px; object-fit: contain; object-position: left; }
  .logo-text { display: inline-flex; flex-direction: column; width: max-content; line-height: .9; font-weight: 900; letter-spacing: -.02em; text-transform: uppercase; }
  .logo-text .lt1 { font-size: 34px; color: #fff; }
  .logo-text .lt2 { font-size: 78px; color: var(--accent); -webkit-text-stroke: 2px #fff; }
  .logo-text .lt3 { font-size: 30px; color: #fff; align-self: flex-end; margin-right: 6px; }
  .kicker { margin-top: 28px; font-size: 26px; font-weight: 600; letter-spacing: .06em; color: var(--accent); text-transform: uppercase; }
  .h1 { font-size: ${threeLines ? 84 : 92}px; font-weight: 800; line-height: .95; letter-spacing: -.01em; text-transform: uppercase; white-space: nowrap; }
  .h2 { font-size: ${threeLines ? 108 : 118}px; font-weight: 900; line-height: .95; letter-spacing: -.02em; color: var(--accent); text-transform: uppercase; white-space: nowrap; text-shadow: 0 0 40px color-mix(in srgb, var(--accent) 45%, transparent); }
  .h3 { font-size: 46px; font-weight: 800; line-height: 1; color: var(--accent); text-transform: uppercase; margin-top: 6px; }
  .rule { margin-top: 14px; height: 3px; width: 440px; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 30%, transparent)); border-radius: 2px; }
  .rows { margin-top: 18px; display: flex; flex-direction: column; gap: ${input.rows.length > 5 ? 10 : 16}px; width: 100%; }
  .row { display: flex; align-items: center; gap: 16px; min-height: 72px; width: 100%; }
  .ico { width: 78px; height: 78px; flex: 0 0 78px; display: grid; place-items: center; color: var(--accent); background: rgba(255,255,255,.03); border: 2px solid color-mix(in srgb, var(--accent) 75%, transparent); border-radius: 12px; box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 22%, transparent), inset 0 0 14px rgba(0,0,0,.5); }
  .txt { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .lbl { font-size: 17px; font-weight: 600; letter-spacing: .1em; color: var(--accent); text-transform: uppercase; }
  .val { font-size: 25px; font-weight: 600; line-height: 1.12; color: #fff; text-transform: uppercase; white-space: nowrap; }
  .txt { flex: 1 1 auto; }
  .case { position: absolute; right: 20px; top: 100px; width: ${designW - 560}px; height: ${designH - 270}px; display: grid; place-items: center; }
  .case img { max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 40px 50px rgba(0,0,0,.85)) drop-shadow(0 0 90px color-mix(in srgb, var(--accent) 22%, transparent)); }
  .floor { position: absolute; right: 50px; bottom: 160px; width: ${designW - 620}px; height: 60px; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,.75), transparent 70%); filter: blur(6px); }
  .footer { position: absolute; left: 56px; right: 56px; bottom: 44px; height: 110px; border-top: 1px solid rgba(255,255,255,.12); padding-top: 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .badge { display: flex; align-items: center; gap: 14px; flex: 1; }
  .bico { color: #fff; width: 62px; height: 62px; display: grid; place-items: center; }
  .badge:nth-child(4n+3) .bico, .badge:nth-child(4n+5) .bico { color: var(--accent); }
  .btxt { display: flex; flex-direction: column; line-height: 1.15; }
  .btxt span { font-size: 20px; font-weight: 600; color: #fff; text-transform: uppercase; }
  .btxt strong { font-size: 20px; font-weight: 800; color: var(--accent); text-transform: uppercase; }
  .sep { width: 1px; height: 56px; background: rgba(255,255,255,.18); flex: 0 0 1px; }
</style></head><body>
<div class="vignette"></div>
<div class="left">
  ${logo}
  <div class="kicker">${esc(input.headline.kicker)}</div>
  <div class="h1">${esc(input.headline.line1)}</div>
  <div class="h2">${esc(input.headline.line2)}</div>
  ${input.headline.line3 ? `<div class="h3">${esc(input.headline.line3)}</div>` : ''}
  <div class="rule"></div>
  <div class="rows">${rowsHtml}</div>
</div>
<div class="floor"></div>
<div class="case"><img src="${input.caseDataUrl}" alt=""></div>
<div class="footer">${footerHtml}</div>
<script>
  // Título grande: si una línea no entra en la columna, se achica hasta que entre.
  // Corre recién con la tipografía web cargada: con la de reserva mide distinto.
  function shrink(el, max, min) {
    var size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > max && size > min) { size -= 1; el.style.fontSize = size + 'px'; }
  }
  function fit() {
    var max = document.querySelector('.left').clientWidth;
    document.querySelectorAll('.h1, .h2, .h3').forEach(function (el) { shrink(el, max, 30); });
    // Valores de las filas: una sola línea; si no entra, se achica la letra.
    document.querySelectorAll('.val').forEach(function (el) { shrink(el, el.parentNode.clientWidth, 15); });
  }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fit, fit);
</script>
</body></html>`;
}
