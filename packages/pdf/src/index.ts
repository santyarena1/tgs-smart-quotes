import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';

export type PdfKind = 'SIMPLE' | 'DETALLADO' | 'FORMAL';

export type PdfCompany = {
  name: string;
  taxCondition: string;
  cuit: string;
  grossIncome: string;
  activityStart: string;
  address: string;
  phones: string;
  footerText: string;
  rmaUrl: string;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string | null;
};

export type PdfCustomer = {
  name: string;
  phone?: string | null;
  dni?: string | null;
  address?: string | null;
  taxCondition?: string | null;
  /** EMPRESA lleva razón social (name), CUIT y condición frente al IVA. */
  kind?: 'PERSONA' | 'EMPRESA' | null;
  cuit?: string | null;
  email?: string | null;
  contactName?: string | null;
};

export type PdfFinancingPlan = {
  installments: number;
  interestBps: number;
  bank?: string | null;
  description?: string | null;
  sortOrder?: number;
};

export type PdfItem = {
  code?: string;
  name: string;
  quantity: number;
  unitCents: bigint;
  subtotalCents: bigint;
  isMainLine?: boolean;
  isComponent?: boolean;
  /** IVA incluido en el precio de este ítem, en bps (1050 = 10,5 %). Sin valor se usa el de la empresa. */
  ivaBps?: number | null;
};

export type PdfResolvedConfig = {
  showListPrice: boolean;
  showCashTransfer: boolean;
  showFinancing: boolean;
  showBbva: boolean;
  showOtherBanks: boolean;
  showFinancingNote: boolean;
  showTaxData: boolean;
  showServicesBlock: boolean;
  showWindows: boolean;
  showDrivers: boolean;
  showDelay: boolean;
  showRma: boolean;
  showExtraObservation: boolean;
  showIndividualPrices: boolean;
  showComponentDetail: boolean;
  builtPcTitle: string;
  builtPcDescription: string;
  assemblyText: string;
  installText: string;
  windowsText: string;
  driversText: string;
  estimatedDelay: string;
  rmaText: string;
};

export const PDF_LAYOUT_BLOCK_KEYS = [
  'logo',
  'companyName',
  'companyTaxData',
  'quoteTitle',
  'quoteMeta',
  'quoteData',
  'companyFiscalData',
  'servicesBlock',
  'itemsTable',
  'itemsTable.colCode',
  'itemsTable.colName',
  'itemsTable.colQty',
  'itemsTable.colAmount',
  'totalsBlock',
  'financingBlock',
  'observation',
  'rmaBlock',
  'footerText',
] as const;

export type PdfLayoutBlockKey = (typeof PDF_LAYOUT_BLOCK_KEYS)[number];
export type PdfLayoutStyle = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  /** Oculta el bloque (display:none) y deja que el resto del documento reacomode hacia arriba. */
  hidden?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  italic?: boolean;
  uppercase?: boolean;
  lineHeight?: number;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
};
/** Estilo global del documento (ambas plantillas). Todo opcional: vacío conserva el diseño original. */
export type PdfTradeIns = {
  showValues: boolean;
  items: Array<{ name: string; valueCents: bigint }>;
};
export type PdfLabelKey =
  | 'quoteTitle' | 'quoteDataTitle' | 'fiscalDataTitle'
  | 'colCode' | 'colName' | 'colQty' | 'colAmount'
  | 'listPriceLabel' | 'cashPriceLabel' | 'observationLabel';
export type PdfLayoutDocument = {
  /** Rótulos de plantilla reescritos desde el editor. Vacío conserva el texto original. */
  labels?: Partial<Record<PdfLabelKey, string>>;
  accentColor?: string;
  textColor?: string;
  fontFamily?: string;
  tableHeaderBg?: string;
  tableHeaderColor?: string;
  tableBorderColor?: string;
  tableZebra?: boolean;
  tableDensity?: 'compact' | 'normal' | 'comfortable';
  cardRadius?: number;
  cardBackground?: string;
  cardBorderColor?: string;
};
export type PdfFlowSection = 'header' | 'cards' | 'services' | 'items' | 'totals' | 'observation' | 'rma' | 'footer' | 'end';
/** Bloque de texto libre agregado por el usuario; x/y en px desde el área imprimible. */
export type PdfCustomBlock = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
  hidden?: boolean;
  /** Capa en el flujo: se inserta antes de esa sección ('end' = al final). Sin valor: libre en x/y. */
  before?: PdfFlowSection;
};
export type PdfLayoutConfig = {
  version: 1;
  blocks: Partial<Record<PdfLayoutBlockKey, PdfLayoutStyle>>;
  document?: PdfLayoutDocument;
  customBlocks?: PdfCustomBlock[];
};

export type PdfTemplate = 'CLASICO' | 'MODERNO';

export type PdfRenderInput = {
  kind: PdfKind;
  number: string;
  date: Date;
  isBuiltPc: boolean;
  observation?: string | null;
  /** Productos que entrega el cliente. `showValues` = mostrar a cuánto se toman. */
  tradeIns?: PdfTradeIns | null;
  listTotalCents: bigint;
  cashTotalCents: bigint;
  /** Solo FORMAL: efectivo/transferencia + recargo del cheque a 30 días. Sin valor no se muestra. */
  chequeTotalCents?: bigint | null;
  /** Solo FORMAL: alícuota de IVA incluida en los precios, en bps (2100 = 21 %). Default 2100. */
  ivaBps?: number;
  company: PdfCompany;
  customer?: PdfCustomer | null;
  config: PdfResolvedConfig;
  items: PdfItem[];
  financing: PdfFinancingPlan[];
  layout?: PdfLayoutConfig;
  /** Estilo visual de la plantilla. Default 'CLASICO' (la histórica). 'MODERNO' es el rediseño. */
  template?: PdfTemplate;
  /** Fecha de validez ("Válido hasta") que muestra la plantilla MODERNO. Opcional. */
  validUntil?: Date | null;
  /** Nota aclaratoria de BBVA (caja azul) en la plantilla MODERNO. Opcional/editable. */
  financingBbvaNote?: string | null;
};

export const historicalPdfIsImmutable = true;

export const pdfFileName = (number: string, version: number, kind: PdfKind) =>
  `${number}-V${version}-${kind}.pdf`;

/** Los productos salen siempre en mayúsculas en el PDF, sin importar cómo se cargaron. */
export function itemDisplayName(name: string): string {
  return name.toLocaleUpperCase('es-AR');
}

export function formatArsFromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const pesos = (abs + 50n) / 100n;
  const wholeStr = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}$ ${wholeStr}`;
}

export function formatDateAr(date: Date): string {
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

export function sha256Hex(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function pdfInputHash(input: PdfRenderInput): string {
  const canonical = {
    kind: input.kind,
    number: input.number,
    date: input.date.toISOString().slice(0, 10),
    isBuiltPc: input.isBuiltPc,
    observation: input.observation ?? null,
    listTotalCents: input.listTotalCents.toString(),
    cashTotalCents: input.cashTotalCents.toString(),
    ...(input.kind === 'FORMAL' || input.kind === 'DETALLADO'
      ? {
          ivaBps: input.ivaBps ?? 2100,
          ...(input.kind === 'FORMAL' ? { chequeTotalCents: input.chequeTotalCents?.toString() ?? null } : {}),
        }
      : {}),
    company: input.company,
    customer: input.customer ?? null,
    config: input.config,
    items: input.items.map((i) => ({
      ...i,
      unitCents: i.unitCents.toString(),
      subtotalCents: i.subtotalCents.toString(),
    })),
    financing: input.financing,
    ...(input.tradeIns?.items.length
      ? { tradeIns: { showValues: input.tradeIns.showValues, items: input.tradeIns.items.map((i) => ({ name: i.name, valueCents: i.valueCents.toString() })) } }
      : {}),
    ...(hasLayoutOverrides(input.layout) ? { layout: input.layout } : {}),
  };
  return sha256Hex(JSON.stringify(canonical));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function applyInterest(baseCents: bigint, interestBps: number): bigint {
  return (baseCents * BigInt(10000 + interestBps) + 5000n) / 10000n;
}

function installmentAmount(baseCents: bigint, plan: PdfFinancingPlan): bigint {
  const total = applyInterest(baseCents, plan.interestBps);
  return (total + BigInt(plan.installments) / 2n) / BigInt(plan.installments);
}

function renderRmaText(template: string, rmaUrl: string): string {
  const marker = '{rmaUrl}';
  if (!template.includes(marker)) {
    return `${escapeHtml(template)} ${escapeHtml(rmaUrl)}`;
  }
  return template.split(marker).map(escapeHtml).join(escapeHtml(rmaUrl));
}

function hasLayoutOverrides(layout?: PdfLayoutConfig): boolean {
  return Boolean(
    layout
      && (Object.keys(layout.blocks).length > 0
        || Object.keys(layout.document ?? {}).length > 0
        || layout.customBlocks?.length),
  );
}

/** Capa con los bloques de texto libre. Se ancla al área imprimible (en print, el origen del
 *  contenedor inicial es el content box de @page; el preview del editor lo compensa por CSS). */
function customBlockFontCss(block: PdfCustomBlock): string[] {
  return [
    ...(block.fontSize !== undefined ? [`font-size:${block.fontSize}px`] : []),
    ...(block.color !== undefined ? [`color:${cssValue(block.color)}`] : []),
    ...(block.fontFamily !== undefined ? [`font-family:"${cssValue(block.fontFamily)}",sans-serif`] : []),
    ...(block.fontWeight !== undefined ? [`font-weight:${block.fontWeight}`] : []),
    ...(block.align ? [`text-align:${block.align}`] : []),
  ];
}

const visibleCustomBlocks = (layout?: PdfLayoutConfig) =>
  (layout?.customBlocks ?? []).filter((block) => !block.hidden && block.text.trim());

/** Capa con los bloques de texto libres (sin `before`). Se ancla al área imprimible (en print, el origen del
 *  contenedor inicial es el content box de @page; el preview del editor lo compensa por CSS). */
function renderCustomBlocks(layout?: PdfLayoutConfig): string {
  const blocks = visibleCustomBlocks(layout).filter((block) => !block.before);
  if (!blocks.length) return '';
  const items = blocks
    .map((block) => {
      const css = [
        'position:absolute',
        `left:${block.x}px`,
        `top:${block.y}px`,
        `width:${block.width}px`,
        'white-space:pre-wrap',
        'overflow-wrap:anywhere',
        'z-index:3',
        ...customBlockFontCss(block),
      ].join(';');
      return `<div data-pdf-block="custom:${escapeHtml(block.id)}" style="${css}">${escapeHtml(block.text)}</div>`;
    })
    .join('');
  return `<div class="pdf-custom-layer" style="position:absolute;left:0;top:0;width:0;height:0">${items}</div>`;
}

/** Orden del documento y cómo ubicar cada sección en ambas plantillas (la primera coincidencia del HTML). */
const FLOW_SECTIONS: Array<{ key: PdfFlowSection; pattern: RegExp }> = [
  { key: 'header', pattern: /<header class="header"/ },
  { key: 'cards', pattern: /<section class="cards"/ },
  { key: 'services', pattern: /<(?:section|div)\b[^>]*(?:data-pdf-block="servicesBlock"|class="services")/ },
  { key: 'items', pattern: /<table\b[^>]*(?:class="items"|data-pdf-block="itemsTable")/ },
  { key: 'totals', pattern: /<div class="price-block"|<section\b[^>]*(?:class="totals"|data-pdf-block="totalsBlock")/ },
  { key: 'observation', pattern: /<(?:section|div)\b[^>]*(?:class="obs"|data-pdf-block="observation")/ },
  { key: 'rma', pattern: /<(?:section|div)\b[^>]*(?:class="rma"|data-pdf-block="rmaBlock")/ },
  { key: 'footer', pattern: /<footer\b/ },
];

/** Inserta los bloques con `before` en el flujo, sin tocar posiciones del resto: el contenido se acomoda solo.
 *  Si la sección no existe (p. ej. sin observación) se usa la siguiente que exista, o el final. */
function insertFlowBlocks(html: string, layout?: PdfLayoutConfig): string {
  const blocks = visibleCustomBlocks(layout).filter((block) => block.before);
  if (!blocks.length) return html;
  const bodyStart = Math.max(html.indexOf('<body'), 0);
  const bodyEnd = html.lastIndexOf('</body>');
  const endIndex = bodyEnd >= 0 ? bodyEnd : html.length;
  const positions = FLOW_SECTIONS.map(({ pattern }) => {
    const match = pattern.exec(html.slice(bodyStart));
    return match ? bodyStart + match.index : -1;
  });
  const positionFor = (section: PdfFlowSection): number => {
    if (section === 'end') return endIndex;
    for (let i = FLOW_SECTIONS.findIndex((s) => s.key === section); i < FLOW_SECTIONS.length; i += 1) {
      if (positions[i]! >= 0) return positions[i]!;
    }
    return endIndex;
  };
  const inserts = new Map<number, string>();
  for (const block of blocks) {
    const css = [
      'display:block',
      `width:min(${block.width}px,100%)`,
      'margin:8px 0',
      'white-space:pre-wrap',
      'overflow-wrap:anywhere',
      'break-inside:avoid',
      ...customBlockFontCss(block),
    ].join(';');
    const at = positionFor(block.before!);
    inserts.set(at, `${inserts.get(at) ?? ''}<div data-pdf-block="custom:${escapeHtml(block.id)}" style="${css}">${escapeHtml(block.text)}</div>`);
  }
  let out = html;
  for (const at of [...inserts.keys()].sort((a, b) => b - a)) {
    out = `${out.slice(0, at)}${inserts.get(at)}${out.slice(at)}`;
  }
  return out;
}

function withCustomBlocks(html: string, layout?: PdfLayoutConfig): string {
  const flowed = insertFlowBlocks(html, layout);
  const layer = renderCustomBlocks(layout);
  return layer ? flowed.replace('</body>', () => `${layer}</body>`) : flowed;
}

function cssValue(value: string): string {
  return value.replace(/["'\\;{}]/g, '');
}

function blockCss(key: PdfLayoutBlockKey, style: PdfLayoutStyle): string {
  // Ocultar reacomoda el flujo (a diferencia del translate, que solo mueve visualmente).
  if (style.hidden) return `[data-pdf-block="${key}"]{display:none!important}`;
  const declarations: string[] = [];
  if (style.x !== undefined || style.y !== undefined) {
    declarations.push(
      `transform:translate(${style.x ?? 0}px,${style.y ?? 0}px)!important`,
      'position:relative!important',
      'z-index:2!important',
    );
  }
  if (key === 'logo') {
    // El logo nunca acepta dos ejes independientes: si existe ancho, éste gobierna y la
    // altura sale de la proporción intrínseca; para layouts antiguos con sólo alto, viceversa.
    if (style.width !== undefined) {
      declarations.push(
        `width:${style.width}px!important`,
        `max-width:${style.width}px!important`,
        'height:auto!important',
        'max-height:none!important',
      );
    } else if (style.height !== undefined) {
      declarations.push(
        `height:${style.height}px!important`,
        `max-height:${style.height}px!important`,
        'width:auto!important',
        'max-width:none!important',
      );
    }
  } else if (style.width !== undefined) {
    declarations.push(`width:${style.width}px!important`, `max-width:${style.width}px!important`);
  }
  if (key !== 'logo' && style.height !== undefined) {
    declarations.push(
      `height:${style.height}px!important`,
      `max-height:${style.height}px!important`,
      'overflow:hidden!important',
    );
  }
  if (style.fontSize !== undefined) declarations.push(`font-size:${style.fontSize}px!important`);
  if (style.color !== undefined) declarations.push(`color:${cssValue(style.color)}!important`);
  if (style.fontFamily !== undefined) declarations.push(`font-family:"${cssValue(style.fontFamily)}",sans-serif!important`);
  if (style.fontWeight !== undefined) declarations.push(`font-weight:${style.fontWeight}!important`);
  if (style.textAlign !== undefined) declarations.push(`text-align:${style.textAlign}!important`);
  if (style.italic !== undefined) declarations.push(`font-style:${style.italic ? 'italic' : 'normal'}!important`);
  if (style.uppercase !== undefined) declarations.push(`text-transform:${style.uppercase ? 'uppercase' : 'none'}!important`);
  if (style.lineHeight !== undefined) declarations.push(`line-height:${style.lineHeight}!important`);
  if (style.background !== undefined) declarations.push(`background:${cssValue(style.background)}!important`);
  if (style.borderColor !== undefined || style.borderWidth !== undefined) {
    const width = style.borderWidth ?? 1;
    declarations.push(
      width > 0
        ? `border:${width}px solid ${cssValue(style.borderColor ?? '#cccccc')}!important`
        : 'border:none!important',
    );
  }
  if (style.borderRadius !== undefined) declarations.push(`border-radius:${style.borderRadius}px!important`);
  if (style.padding !== undefined) declarations.push(`padding:${style.padding}px!important`);
  return declarations.length ? `[data-pdf-block="${key}"]{${declarations.join(';')}}` : '';
}

/** CSS del estilo global del documento. Selecciona por clases de ambas plantillas; las que no
 *  existan en una plantilla simplemente no aplican. Los colores ya vienen validados (#RRGGBB). */
function documentCss(doc: PdfLayoutDocument | undefined): string {
  if (!doc) return '';
  const rules: string[] = [];
  if (doc.fontFamily) rules.push(`body{font-family:"${cssValue(doc.fontFamily)}",sans-serif!important}`);
  if (doc.textColor) rules.push(`body{color:${cssValue(doc.textColor)}!important}`);
  if (doc.accentColor) {
    const accent = cssValue(doc.accentColor);
    rules.push(
      `.title-block h1,.brand .logo-text,.brand .names .cname,.card h2,.totals .list .val,.box a,.box b.url{color:${accent}!important}`,
      `.rule,.services{background:${accent}!important}`,
      `.box-red{border-left-color:${accent}!important}`,
    );
  }
  if (doc.tableHeaderBg) {
    const bg = cssValue(doc.tableHeaderBg);
    rules.push(`table.items thead th{background:${bg}!important;border-color:${bg}!important}`);
  }
  if (doc.tableHeaderColor) rules.push(`table.items thead th{color:${cssValue(doc.tableHeaderColor)}!important}`);
  if (doc.tableBorderColor) {
    const border = cssValue(doc.tableBorderColor);
    rules.push(`table.items{border-color:${border}!important}`, `table.items td{border-bottom-color:${border}!important}`);
  }
  if (doc.tableZebra) rules.push('table.items tbody tr:nth-child(even) td{background:#f5f5f5!important}');
  if (doc.tableDensity === 'compact') rules.push('table.items td{padding-top:3px!important;padding-bottom:3px!important}');
  if (doc.tableDensity === 'comfortable') rules.push('table.items td{padding-top:9px!important;padding-bottom:9px!important}');
  if (doc.cardRadius !== undefined) {
    rules.push(`.card,.box,.services,.price-block{border-radius:${doc.cardRadius}px!important}`);
  }
  if (doc.cardBackground) rules.push(`.card,.box{background:${cssValue(doc.cardBackground)}!important}`);
  if (doc.cardBorderColor) rules.push(`.card{border-color:${cssValue(doc.cardBorderColor)}!important}`);
  return rules.join('');
}

/** CSS de overrides de layout por bloque (posición/tamaño/fuente/color) + anchos de columna.
 *  Es agnóstico a la plantilla: selecciona por `[data-pdf-block]` y por clase de columna. */
function layoutBlocksCss(layout: PdfLayoutConfig): string {
  const styles = Object.entries(layout.blocks)
    .map(([key, style]) => blockCss(key as PdfLayoutBlockKey, style))
    .join('');
  const columnSelectors: Record<string, string> = {
    'itemsTable.colCode': 'code',
    'itemsTable.colName': 'name',
    'itemsTable.colQty': 'qty',
    'itemsTable.colAmount': 'amt',
  };
  const columnCss = Object.entries(columnSelectors)
    .map(([key, className]) => {
      const width = layout.blocks[key as PdfLayoutBlockKey]?.width;
      return width === undefined
        ? ''
        : `table.items .${className}{width:${width}px!important;max-width:${width}px!important}`;
    })
    .join('');
  return `${documentCss(layout.document)}${styles}${columnCss}`;
}

/** Reescribe los rótulos de plantilla elegidos en el editor. Toca solo el texto entre etiquetas ya marcadas. */
function applyLabelOverrides(html: string, labels: NonNullable<PdfLayoutConfig['document']>['labels']): string {
  if (!labels) return html;
  const swap = (source: string, pattern: RegExp, label: string | undefined) =>
    label ? source.replace(pattern, (_m, open: string, close: string) => `${open}${escapeHtml(label)}${close}`) : source;
  let next = html;
  next = swap(next, /(<h1 data-pdf-block="quoteTitle">)[^<]*(<\/h1>)/, labels.quoteTitle);
  next = swap(next, /(data-pdf-block="quoteData"[^>]*>\s*<h2>)[^<]*(<\/h2>)/, labels.quoteDataTitle);
  next = swap(next, /(data-pdf-block="companyFiscalData"[^>]*>\s*<h2>)[^<]*(<\/h2>)/, labels.fiscalDataTitle);
  const columns: Array<[string, string | undefined]> = [
    ['colCode', labels.colCode], ['colName', labels.colName], ['colQty', labels.colQty], ['colAmount', labels.colAmount],
  ];
  for (const [key, label] of columns) {
    next = swap(next, new RegExp(`(<th[^>]*data-pdf-block="itemsTable\\.${key}"[^>]*>)[^<]*(</th>)`), label);
  }
  next = swap(next, /(<span[^>]*>)Precio de lista(?: \(1 pago tarjeta\))?(<\/span>)/, labels.listPriceLabel);
  next = swap(next, /(<span[^>]*>)Efectivo \/ Transferencia(<\/span>)/, labels.cashPriceLabel);
  next = swap(next, /(<(?:strong|b)>)Observación:(<\/(?:strong|b)>)/, labels.observationLabel ? `${labels.observationLabel}:` : undefined);
  return next;
}

function decorateLayoutHtml(html: string, layout: PdfLayoutConfig): string {
  let next = html.replace('</style>', `${layoutBlocksCss(layout)}</style>`);
  const replacements: Array<[string, string]> = [
    ['<img class="logo"', '<img data-pdf-block="logo" class="logo"'],
    ['<div class="logo-text">', '<div data-pdf-block="companyName" class="logo-text">'],
    ['<div class="tax">', '<div data-pdf-block="companyTaxData" class="tax">'],
    ['<h1>PRESUPUESTO</h1>', '<h1 data-pdf-block="quoteTitle">PRESUPUESTO</h1>'],
    ['<div class="meta">', '<div data-pdf-block="quoteMeta" class="meta">'],
    ['<div class="card">\n      <h2>DATOS DEL PRESUPUESTO</h2>', '<div data-pdf-block="quoteData" class="card">\n      <h2>DATOS DEL PRESUPUESTO</h2>'],
    ['<div class="card">\n      <h2>DATOS FISCALES</h2>', '<div data-pdf-block="companyFiscalData" class="card">\n      <h2>DATOS FISCALES</h2>'],
    ['<div class="card"><h2>DATOS FISCALES</h2>', '<div data-pdf-block="companyFiscalData" class="card"><h2>DATOS FISCALES</h2>'],
    ['<section class="services">', '<section data-pdf-block="servicesBlock" class="services">'],
    ['<table class="items">', '<table data-pdf-block="itemsTable" class="items">'],
    ['<th>Cód.</th>', '<th data-pdf-block="itemsTable.colCode" class="code">Cód.</th>'],
    ['<th>Artículo</th>', '<th data-pdf-block="itemsTable.colName" class="name">Artículo</th>'],
    ['<th>Producto</th>', '<th data-pdf-block="itemsTable.colName" class="name">Producto</th>'],
    ['<th>Cant.</th>', '<th data-pdf-block="itemsTable.colQty" class="qty">Cant.</th>'],
    ['<th>Importe</th>', '<th data-pdf-block="itemsTable.colAmount" class="amt">Importe</th>'],
    ['<section class="totals">', '<section data-pdf-block="totalsBlock" class="totals">'],
    ['<section class="obs">', '<section data-pdf-block="observation" class="obs">'],
    ['<section class="rma">', '<section data-pdf-block="rmaBlock" class="rma">'],
    ['<footer class="footer">', '<footer data-pdf-block="footerText" class="footer">'],
  ];
  for (const [from, to] of replacements) next = next.replaceAll(from, to);
  next = applyLabelOverrides(next, layout.document?.labels);
  if (next.includes('<table class="fin">') || next.includes('<p class="note">')) {
    const financingStart = next.indexOf('<p class="note">') >= 0
      ? next.indexOf('<p class="note">')
      : next.indexOf('<table class="fin">');
    const observationStart = next.indexOf('\n\n  <section data-pdf-block="observation"', financingStart);
    const rmaStart = next.indexOf('\n\n  <section data-pdf-block="rmaBlock"', financingStart);
    const footerStart = next.indexOf('\n\n  <footer data-pdf-block="footerText"', financingStart);
    const candidates = [observationStart, rmaStart, footerStart].filter((index) => index > financingStart);
    const financingEnd = Math.min(...candidates);
    if (financingStart >= 0 && Number.isFinite(financingEnd)) {
      next =
        `${next.slice(0, financingStart)}<section data-pdf-block="financingBlock">` +
        `${next.slice(financingStart, financingEnd)}</section>${next.slice(financingEnd)}`;
    }
  }
  return next;
}

export function resolvePdfFlags(
  defaults: PdfResolvedConfig,
  overrides?: Record<string, 'HEREDAR' | 'MOSTRAR' | 'OCULTAR'> | null,
): PdfResolvedConfig {
  if (!overrides) return { ...defaults };
  const next = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in next) || value === 'HEREDAR') continue;
    const typedKey = key as keyof PdfResolvedConfig;
    if (typeof next[typedKey] === 'boolean') {
      (next as Record<string, unknown>)[key] = value === 'MOSTRAR';
    }
  }
  return next;
}

/** Los precios cargados ya incluyen IVA: precio neto de una unidad según la alícuota (bps). */
function netOfIva(withIvaCents: bigint, ivaBps: number): bigint {
  return (withIvaCents * 10000n + BigInt(10000 + ivaBps) / 2n) / BigInt(10000 + ivaBps);
}

/** Desglose de un ítem: precio sin IVA, IVA, precio con IVA (los cargados ya lo incluyen) e importe total. */
function ivaCells(item: PdfItem, input: PdfRenderInput): string {
  const bps = item.ivaBps ?? input.ivaBps ?? 2100;
  const net = netOfIva(item.unitCents, bps);
  return (
    `<td class="unit">${formatArsFromCents(net)}</td>` +
    `<td class="iva">${formatArsFromCents(item.unitCents - net)}<small>${ivaLabelOf(bps)}</small></td>` +
    `<td class="gross">${formatArsFromCents(item.unitCents)}</td>`
  );
}

function ivaHeadCells(): string {
  return '<th class="unit">Precio sin IVA</th><th class="iva">IVA</th><th class="gross">Precio con IVA</th>';
}

function ivaLabelOf(ivaBps: number): string {
  return `${(ivaBps / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;
}

function buildItemsRows(input: PdfRenderInput): string {
  // DETALLADO: siempre precios por ítem.
  // SIMPLE: solo la línea principal de PC armada lleva importe; el resto va sin precio
  // individual (componentes o ítems de presupuesto normal).
  const showRowPrice = (item: PdfItem): boolean => {
    if (input.kind === 'DETALLADO') return true;
    if (input.isBuiltPc) return Boolean(item.isMainLine);
    return false;
  };

  return input.items
    .map((item, index) => {
      const code = escapeHtml(item.code ?? String(index + 1).padStart(3, '0'));
      const name = escapeHtml(itemDisplayName(item.name));
      const qty = String(item.quantity);
      const amount = showRowPrice(item)
        ? formatArsFromCents(item.subtotalCents)
        : input.kind === 'SIMPLE'
          ? '—'
          : formatArsFromCents(0n);
      const cls = item.isMainLine ? 'main' : item.isComponent ? 'component' : '';
      if (input.kind === 'DETALLADO') {
        return `<tr class="${cls}"><td class="name">${name}</td><td class="qty">${qty}</td>${ivaCells(item, input)}<td class="amt">${amount}</td></tr>`;
      }
      return `<tr class="${cls}"><td class="code">${code}</td><td class="name">${name}</td><td class="qty">${qty}</td><td class="amt">${amount}</td></tr>`;
    })
    .join('');
}

/** Entrega del cliente dentro de los totales, justo debajo de Efectivo / Transferencia:
 *  una línea compacta con lo que entregó y el precio final. Vacío si no entregó nada. */
function buildTradeInsTotals(input: PdfRenderInput, variant: 'classic' | 'modern'): string {
  const trade = input.tradeIns;
  if (!trade || trade.items.length === 0) return '';
  const names = trade.items
    .map((item) => escapeHtml(item.name) + (trade.showValues ? ` (${formatArsFromCents(item.valueCents)})` : ''))
    .join(' · ');
  const discount = trade.items.reduce((sum, item) => sum + item.valueCents, 0n);
  const toPay = input.cashTotalCents > discount ? input.cashTotalCents - discount : 0n;
  const label = 'Precio final con entrega de productos del cliente';
  const list = variant === 'modern'
    ? `<div class="row trade-list"><span class="lbl"><b>Productos entregados por el cliente:</b> ${names}</span></div>`
    : `<div class="row trade-list"><span><b>Productos entregados por el cliente:</b> ${names}</span></div>`;
  const final = !input.config.showCashTransfer
    ? ''
    : variant === 'modern'
      ? `<div class="row final"><span class="lbl">${label}</span><span class="val">${formatArsFromCents(toPay)}</span></div>`
      : `<div class="row final"><span>${label}</span><span>${formatArsFromCents(toPay)}</span></div>`;
  return list + final;
}

function buildFinancing(input: PdfRenderInput): string {
  if (!input.config.showFinancing || input.financing.length === 0) return '';
  const plans = [...input.financing].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const bbva = plans.filter((p) => /bbva/i.test(p.bank ?? ''));
  const others = plans.filter((p) => !bbva.includes(p));
  const row = (plan: PdfFinancingPlan) => {
    const cuota = installmentAmount(input.listTotalCents, plan);
    const bank = plan.bank ? `${escapeHtml(plan.bank)} · ` : '';
    const interest = plan.interestBps === 0 ? ' sin interés' : '';
    const description = plan.description
      ? `<div class="note">${escapeHtml(plan.description)}</div>`
      : '';
    return `<tr><td colspan="2">${bank}${plan.installments} cuotas${interest}${description}</td><td class="amt">de ${formatArsFromCents(cuota)}</td></tr>`;
  };
  const parts: string[] = [];
  if (input.config.showFinancingNote) {
    parts.push(
      `<p class="note">Cuotas: los valores financiados se calculan sobre el precio de lista, no sobre el precio de efectivo/transferencia.</p>`,
    );
  }
  if (input.config.showBbva && bbva.length) {
    parts.push(`<table class="fin">${bbva.map(row).join('')}</table>`);
  }
  if (input.config.showOtherBanks && others.length) {
    parts.push(`<table class="fin">${others.map(row).join('')}</table>`);
  }
  return parts.join('');
}

export function renderQuoteHtml(input: PdfRenderInput): string {
  if (input.kind === 'FORMAL') return renderQuoteFormalHtml(input);
  if (input.template === 'MODERNO') return renderQuoteModernoHtml(input);
  const date = formatDateAr(input.date);
  const primary = escapeHtml(input.company.primaryColor || '#1a1a1a');
  const accent = escapeHtml(input.company.accentColor || '#c8102e');
  const services: string[] = [];
  if (input.config.showServicesBlock) {
    const bits = [input.config.assemblyText, input.config.installText].filter(Boolean);
    if (bits.length) services.push(`Incluye: ${bits.join(', ')}.`);
  }
  if (input.config.showWindows && input.config.windowsText) {
    services.push(input.config.windowsText);
  }
  if (input.config.showDrivers && input.config.driversText) {
    services.push(input.config.driversText);
  }
  if (input.config.showDelay && input.config.estimatedDelay) {
    services.push(`Demora estimada: ${input.config.estimatedDelay}.`);
  }

  const logo = input.company.logoUrl
    ? `<img class="logo" src="${escapeHtml(input.company.logoUrl)}" alt="" />`
    : `<div class="logo-text">${escapeHtml(input.company.name)}</div>`;

  const html = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 11px;
    line-height: 1.35;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .brand .logo { max-height: 52px; max-width: 180px; }
  .brand .logo-text { font-size: 22px; font-weight: 800; color: ${accent}; letter-spacing: 0.02em; }
  .brand .tax { margin-top: 4px; color: #444; }
  .title-block { text-align: right; }
  .title-block h1 {
    margin: 0;
    font-size: 22px;
    letter-spacing: 0.08em;
    color: ${primary};
  }
  .title-block .meta { margin-top: 6px; color: #333; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0 10px; }
  .card {
    border: 1px solid #d8d8d8;
    border-radius: 4px;
    padding: 10px 12px;
    background: #fafafa;
  }
  .card h2 {
    margin: 0 0 8px;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: #222;
  }
  .card dl { margin: 0; display: grid; grid-template-columns: 110px 1fr; gap: 3px 8px; }
  .card dt { color: #666; }
  .card dd { margin: 0; font-weight: 600; }
  .services {
    background: ${accent};
    color: #fff;
    padding: 10px 12px;
    border-radius: 4px;
    margin: 8px 0 12px;
  }
  .services p { margin: 0 0 4px; }
  .services p:last-child { margin-bottom: 0; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items thead th {
    background: #111;
    color: #fff;
    text-align: left;
    padding: 7px 8px;
    font-weight: 600;
  }
  table.items td {
    border-bottom: 1px solid #e5e5e5;
    padding: 6px 8px;
    vertical-align: top;
  }
  table.items tr.main td { font-weight: 700; }
  table.items tr.component td.name { padding-left: 18px; color: #333; }
  table.items .code { width: 48px; }
  table.items .qty { width: 48px; text-align: center; }
  table.items .amt { width: 110px; text-align: right; white-space: nowrap; }
  table.items .unit, table.items .gross { width: 88px; text-align: right; white-space: nowrap; }
  table.items .iva { width: 78px; text-align: right; white-space: nowrap; }
  table.items td.iva small { display: block; font-size: 8.5px; color: #666; }
  table.items thead th.unit, table.items thead th.iva, table.items thead th.gross, table.items thead th.amt { text-align: right; color: #fff; }
  .totals { margin-top: 12px; width: 100%; }
  .totals .row {
    display: flex;
    justify-content: space-between;
    padding: 7px 10px;
    border-bottom: 1px solid #eee;
  }
  .totals .cash {
    background: #111;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    border: 0;
    margin-top: 4px;
  }
  .totals .trade-list { display: block; padding: 5px 10px; font-size: 10px; line-height: 1.35; color: #444; }
  .totals .final { padding: 6px 10px; font-size: 12.5px; font-weight: 400; color: #800020; border-bottom: 2px solid #800020; }
  .totals .final span:last-child { font-weight: 800; }
  table.fin { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.fin td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  table.fin .amt { text-align: right; white-space: nowrap; }
  .note { color: #444; margin: 8px 0; }
  .rma {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fbfbfb;
  }
  .footer {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    color: #555;
    font-size: 10px;
  }
  .obs { margin-top: 10px; }
</style>
</head>
<body>
  <header class="header">
    <div class="brand">
      ${logo}
      <div class="tax">${escapeHtml(input.company.taxCondition)}</div>
    </div>
    <div class="title-block">
      <h1>PRESUPUESTO</h1>
      <div class="meta">Nº ${escapeHtml(input.number)} · ${date}</div>
    </div>
  </header>

  <section class="cards">
    <div class="card">
      <h2>DATOS DEL PRESUPUESTO</h2>
      <dl>
        <dt>Número</dt><dd>${escapeHtml(input.number)}</dd>
        <dt>Fecha</dt><dd>${date}</dd>
        <dt>Moneda</dt><dd>Pesos Argentinos</dd>
      </dl>
    </div>
    ${
      input.config.showTaxData
        ? `<div class="card">
      <h2>DATOS FISCALES</h2>
      <dl>
        <dt>Inicio Act.</dt><dd>${escapeHtml(input.company.activityStart)}</dd>
        <dt>Ing. Brutos</dt><dd>${escapeHtml(input.company.grossIncome)}</dd>
        <dt>CUIT</dt><dd>${escapeHtml(input.company.cuit)}</dd>
        <dt>Domicilio</dt><dd>${escapeHtml(input.company.address)}</dd>
      </dl>
    </div>`
        : `<div class="card"><h2>DATOS FISCALES</h2><p>Ocultos por configuración</p></div>`
    }
  </section>

  ${
    services.length
      ? `<section class="services">${services
          .map((s) => `<p>${escapeHtml(s)}</p>`)
          .join('')}</section>`
      : ''
  }

  <table class="items">
    <thead>
      ${
        input.kind === 'DETALLADO'
          ? `<tr><th>Producto</th><th>Cant.</th>${ivaHeadCells()}<th class="amt">Importe total</th></tr>`
          : '<tr><th>Cód.</th><th>Artículo</th><th>Cant.</th><th>Importe</th></tr>'
      }
    </thead>
    <tbody>
      ${buildItemsRows(input)}
    </tbody>
  </table>

  <section class="totals">
    ${
      input.config.showListPrice
        ? `<div class="row"><span>Precio de lista (1 pago tarjeta)</span><strong>${formatArsFromCents(input.listTotalCents)}</strong></div>`
        : ''
    }
    ${
      input.config.showCashTransfer
        ? `<div class="row cash"><span>Efectivo / Transferencia</span><span>${formatArsFromCents(input.cashTotalCents)}</span></div>`
        : ''
    }
    ${buildTradeInsTotals(input, 'classic')}
  </section>

  ${buildFinancing(input)}

  ${
    input.config.showExtraObservation && input.observation
      ? `<section class="obs"><strong>Observación:</strong> ${escapeHtml(input.observation)}</section>`
      : ''
  }

  ${
    input.config.showRma
      ? `<section class="rma">${renderRmaText(input.config.rmaText, input.company.rmaUrl)}</section>`
      : ''
  }

  <footer class="footer">${escapeHtml(input.company.footerText)} · ${escapeHtml(input.company.address)} · ${escapeHtml(input.company.phones)}</footer>
</body>
</html>`;
  return withCustomBlocks(
    hasLayoutOverrides(input.layout) ? decorateLayoutHtml(html, input.layout!) : html,
    input.layout,
  );
}

function buildItemsRowsModerno(input: PdfRenderInput): string {
  const showRowPrice = (item: PdfItem): boolean => {
    if (input.kind === 'DETALLADO') return true;
    if (input.isBuiltPc) return Boolean(item.isMainLine);
    return false;
  };
  return input.items
    .map((item, index) => {
      const code = escapeHtml(item.code ?? String(index + 1).padStart(3, '0'));
      const name = escapeHtml(itemDisplayName(item.name));
      const qty = String(item.quantity);
      // Solo se muestra importe en las filas que corresponde (línea principal en SIMPLE,
      // todas en DETALLADO). El resto queda vacío (no "$ 0").
      const amount = showRowPrice(item) ? formatArsFromCents(item.subtotalCents) : '';
      const subtitle =
        item.isMainLine && input.config.builtPcDescription
          ? `<div class="sub">${escapeHtml(input.config.builtPcDescription)}</div>`
          : '';
      const cls = item.isMainLine ? 'main' : item.isComponent ? 'component' : '';
      if (input.kind === 'DETALLADO') {
        return `<tr class="${cls}"><td class="name"><span class="pname">${name}</span>${subtitle}</td><td class="qty">${qty}</td>${ivaCells(item, input)}<td class="amt">${amount}</td></tr>`;
      }
      return `<tr class="${cls}"><td class="code">${code}</td><td class="name"><span class="pname">${name}</span>${subtitle}</td><td class="qty">${qty}</td><td class="amt">${amount}</td></tr>`;
    })
    .join('');
}

function buildFinancingModerno(input: PdfRenderInput): string {
  if (!input.config.showFinancing || input.financing.length === 0) return '';
  const plans = [...input.financing].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const bbva = plans.filter((p) => /bbva/i.test(p.bank ?? ''));
  const others = plans.filter((p) => !bbva.includes(p));
  const rowHtml = (plan: PdfFinancingPlan, isBbva: boolean): string => {
    const cuota = installmentAmount(input.listTotalCents, plan);
    const bank = escapeHtml(plan.bank ?? (isBbva ? 'BBVA' : 'Otros bancos'));
    const sinInteres = plan.interestBps === 0 ? ' sin interés' : '';
    const desc = plan.description
      ? escapeHtml(plan.description)
      : `${plan.installments} cuotas${sinInteres}`;
    return `<tr class="${isBbva ? 'bbva' : ''}"><td class="bank">${bank}</td><td class="desc">${desc}</td><td class="amt">${formatArsFromCents(cuota)}</td></tr>`;
  };
  const body: string[] = [];
  if (input.config.showBbva) body.push(...bbva.map((p) => rowHtml(p, true)));
  if (input.config.showOtherBanks) body.push(...others.map((p) => rowHtml(p, false)));
  if (!body.length) return '';
  const note = input.config.showFinancingNote
    ? `<div class="box box-red"><b>Cuotas:</b> los valores financiados se calculan sobre el <b>precio de lista</b>, no sobre el precio de efectivo/transferencia.</div>`
    : '';
  const bbvaNote =
    input.config.showBbva && input.financingBbvaNote
      ? `<div class="box box-blue">${renderRmaText(input.financingBbvaNote, '')}</div>`
      : '';
  return `${note}<table class="fin"><tbody>${body.join('')}</tbody></table>${bbvaNote}`;
}

const TAX_CONDITION_LABELS: Record<string, string> = {
  CONSUMIDOR_FINAL: 'Consumidor Final',
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};

/** Bloque "Datos del cliente" (mismo patrón visual .card/dl que "Datos fiscales"). Solo se
 *  emite si hay cliente vinculado a la familia, y solo muestra los campos cargados. */
function buildCustomerCardModerno(customer?: PdfCustomer | null): string {
  if (!customer) return '';
  const rows: string[] = [`<dt>Nombre</dt><dd>${escapeHtml(customer.name)}</dd>`];
  if (customer.phone) rows.push(`<dt>Teléfono</dt><dd>${escapeHtml(customer.phone)}</dd>`);
  if (customer.dni) rows.push(`<dt>DNI/CUIT</dt><dd>${escapeHtml(customer.dni)}</dd>`);
  if (customer.address) rows.push(`<dt>Dirección</dt><dd>${escapeHtml(customer.address)}</dd>`);
  if (customer.taxCondition) {
    const label = TAX_CONDITION_LABELS[customer.taxCondition] ?? customer.taxCondition;
    rows.push(`<dt>Cond. Fiscal</dt><dd>${escapeHtml(label)}</dd>`);
  }
  return `<div class="card"><h2>Datos del cliente</h2><dl>${rows.join('')}</dl></div>`;
}

/** Rediseño "MODERNO": réplica del modelo de presupuesto TGS (header con regla, cards con labels en color,
 *  caja Incluye, totales lista/efectivo, tabla de financiación por banco y cajas de notas). */
export function renderQuoteModernoHtml(input: PdfRenderInput): string {
  const date = formatDateAr(input.date);
  const primary = escapeHtml(input.company.primaryColor || '#111111');
  const accent = escapeHtml(input.company.accentColor || '#E31B23');
  const green = '#1a7d3c';
  const blue = '#1d4ed8';

  const includeParts: string[] = [];
  if (input.config.showServicesBlock) {
    const bits = [input.config.assemblyText, input.config.installText].filter(Boolean);
    if (bits.length) includeParts.push(`<b>Incluye:</b> ${escapeHtml(bits.join(', '))}.`);
  }
  const extraBits: string[] = [];
  if (input.config.showWindows && input.config.windowsText) extraBits.push(escapeHtml(input.config.windowsText));
  if (input.config.showDrivers && input.config.driversText) extraBits.push(escapeHtml(input.config.driversText));
  if (extraBits.length) includeParts.push(extraBits.join(' · '));
  if (input.config.showDelay && input.config.estimatedDelay) {
    includeParts.push(`<b>Demora estimada:</b> ${escapeHtml(input.config.estimatedDelay)}.`);
  }

  const logo = input.company.logoUrl
    ? `<img data-pdf-block="logo" class="logo" src="${escapeHtml(input.company.logoUrl)}" alt="" />`
    : '';

  const customerHtml = buildCustomerCardModerno(input.customer);

  const financingHtml = buildFinancingModerno(input);

  const validUntilRow = input.validUntil
    ? `<dt>Válido hasta</dt><dd>${formatDateAr(input.validUntil)}</dd>`
    : '';

  const html = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 13mm 12mm 18mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.35; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand .logo { height: 40px; width: auto; max-width: 120px; object-fit: contain; }
  .brand .names .cname { font-size: 20px; font-weight: 800; color: ${primary}; line-height: 1.05; }
  .brand .names .csub { font-size: 10px; color: #777; margin-top: 1px; }
  .title-block { text-align: right; }
  .title-block h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.02em; color: ${primary}; }
  .title-block .meta { margin-top: 3px; color: #666; font-size: 10.2px; }
  .rule { height: 2px; background: ${primary}; margin: 8px 0 9px; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 9px; }
  .card { border: 1px solid #e2e2e2; border-radius: 5px; padding: 8px 9px; margin-bottom: 9px; }
  .card h2 { margin: 0 0 4px; font-size: 9.6px; font-weight: 800; letter-spacing: 0.04em; color: ${accent}; text-transform: uppercase; }
  .card dl { margin: 0; display: grid; grid-template-columns: 100px 1fr; gap: 2px 6px; }
  .card dt { color: #666; font-size: 10.2px; }
  .card dd { margin: 0; font-weight: 600; font-size: 10.7px; color: #1a1a1a; }
  .box { border: 1px solid #e6e6e6; border-left: 3px solid ${accent}; border-radius: 4px; padding: 7px 9px; margin: 9px 0; background: #fafafa; font-size: 10.5px; }
  .box p { margin: 0 0 2px; }
  .box p:last-child { margin: 0; }
  .box-red { border-left-color: ${accent}; }
  .box-blue { border-left-color: ${blue}; }
  table.items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 9px; border: 1px solid #dedede; }
  table.items thead th { background: ${primary}; color: #fff; text-align: left; padding: 6px 8px; font-weight: 700; font-size: 10.8px; border: 1px solid ${primary}; }
  table.items thead th.qty { text-align: center; }
  table.items thead th.amt, table.items thead th.unit, table.items thead th.iva, table.items thead th.gross { text-align: right; color: #fff; }
  table.items td { border-bottom: 1px solid #e8e8e8; padding: 5px 8px; vertical-align: top; font-size: 10.9px; }
  table.items tr:last-child td { border-bottom: none; }
  table.items .pname { font-weight: 700; }
  table.items tr.component .pname { font-weight: 700; }
  table.items .sub { color: #888; font-size: 9.5px; margin-top: 1px; }
  table.items .code { width: 50px; }
  table.items td.code { color: #555; }
  table.items .qty { width: 62px; text-align: center; }
  table.items td.qty { font-weight: 700; }
  table.items .amt { width: 115px; text-align: right; white-space: nowrap; }
  table.items .unit, table.items .gross { width: 88px; text-align: right; white-space: nowrap; }
  table.items .iva { width: 74px; text-align: right; white-space: nowrap; }
  table.items td.iva { color: #555; }
  table.items td.iva small { display: block; font-size: 8.5px; color: #888; }
  table.items td.amt { font-weight: 800; }
  .price-block { border: 1px solid #d9d9d9; border-radius: 6px; padding: 4px 14px 10px; margin-top: 9px; }
  .totals { margin-top: 0; }
  .totals .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; border-bottom: 1px solid #eee; }
  .totals .row .lbl { color: #333; font-size: 10.8px; }
  .totals .list .val { color: ${accent}; font-weight: 800; font-size: 12.8px; }
  .totals .cash { border-bottom: none; padding-top: 8px; }
  .totals .cash .lbl { color: ${green}; font-weight: 800; font-size: 11.3px; }
  .totals .cash .val { color: ${green}; font-weight: 900; font-size: 17px; }
  .totals .trade-list { display: block; padding: 4px 2px; border-bottom: none; }
  .totals .trade-list .lbl { font-size: 9.6px; color: #555; line-height: 1.35; }
  .totals .final { border-bottom: none; border-top: 1px solid #ddd; padding-top: 6px; }
  .totals .final .lbl { color: #800020; font-weight: 400; font-size: 11px; }
  .totals .final .val { color: #800020; font-weight: 800; font-size: 14.5px; }
  table.fin { width: 100%; border-collapse: collapse; margin: 7px 0; border: 1px solid #dedede; }
  table.fin td { padding: 5px 8px; border-bottom: 1px solid #eeeeee; vertical-align: middle; font-size: 10.7px; }
  table.fin tr:last-child td { border-bottom: none; }
  table.fin tr.bbva td { background: #f5f8ff; }
  table.fin .bank { font-weight: 700; width: 34%; }
  table.fin tr.bbva .bank { color: ${blue}; }
  table.fin .desc { color: #555; width: 33%; }
  table.fin tr.bbva .desc { color: ${blue}; }
  table.fin .amt { text-align: right; white-space: nowrap; font-weight: 800; width: 33%; }
  .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #e2e2e2; color: #888; font-size: 8.8px; text-align: center; }
  .box a, .box b.url { color: ${accent}; font-weight: 700; }
</style>
</head>
<body>
  <header class="header">
    <div class="brand">
      ${logo}
      <div class="names">
        <div class="cname" data-pdf-block="companyName">${escapeHtml(input.company.name)}</div>
        <div class="csub" data-pdf-block="companyTaxData">${escapeHtml(input.company.taxCondition)}</div>
      </div>
    </div>
    <div class="title-block">
      <h1 data-pdf-block="quoteTitle">PRESUPUESTO</h1>
      <div class="meta" data-pdf-block="quoteMeta">Nº ${escapeHtml(input.number)} · ${date}</div>
    </div>
  </header>
  <div class="rule"></div>

  <section class="cards">
    <div class="card" data-pdf-block="quoteData">
      <h2>Datos del presupuesto</h2>
      <dl>
        <dt>Número</dt><dd>${escapeHtml(input.number)}</dd>
        <dt>Fecha</dt><dd>${date}</dd>
        <dt>Moneda</dt><dd>Pesos Argentinos</dd>
        ${validUntilRow}
      </dl>
    </div>
    ${
      input.config.showTaxData
        ? `<div class="card" data-pdf-block="companyFiscalData">
      <h2>Datos fiscales</h2>
      <dl>
        <dt>Inicio Act.</dt><dd>${escapeHtml(input.company.activityStart)}</dd>
        <dt>Ing. Brutos</dt><dd>${escapeHtml(input.company.grossIncome)}</dd>
        <dt>CUIT</dt><dd>${escapeHtml(input.company.cuit)}</dd>
        <dt>Domicilio</dt><dd>${escapeHtml(input.company.address)}</dd>
      </dl>
    </div>`
        : `<div class="card" data-pdf-block="companyFiscalData"><h2>Datos fiscales</h2><p>Ocultos por configuración</p></div>`
    }
  </section>

  ${customerHtml}

  ${includeParts.length ? `<div class="box box-red" data-pdf-block="servicesBlock">${includeParts.map((p) => `<p>${p}</p>`).join('')}</div>` : ''}

  <table class="items" data-pdf-block="itemsTable">
    <thead>
      ${
        input.kind === 'DETALLADO'
          ? `<tr><th class="name" data-pdf-block="itemsTable.colName">Producto</th><th class="qty" data-pdf-block="itemsTable.colQty">Cant.</th>${ivaHeadCells()}<th class="amt" data-pdf-block="itemsTable.colAmount">Importe total</th></tr>`
          : '<tr><th class="code" data-pdf-block="itemsTable.colCode">Cód.</th><th class="name" data-pdf-block="itemsTable.colName">Artículo</th><th class="qty" data-pdf-block="itemsTable.colQty">Cant.</th><th class="amt" data-pdf-block="itemsTable.colAmount">Importe</th></tr>'
      }
    </thead>
    <tbody>${buildItemsRowsModerno(input)}</tbody>
  </table>

  <div class="price-block">
    <section class="totals" data-pdf-block="totalsBlock">
      ${input.config.showListPrice ? `<div class="row list"><span class="lbl">Precio de lista</span><span class="val">${formatArsFromCents(input.listTotalCents)}</span></div>` : ''}
      ${input.config.showCashTransfer ? `<div class="row cash"><span class="lbl">Efectivo / Transferencia</span><span class="val">${formatArsFromCents(input.cashTotalCents)}</span></div>` : ''}
      ${buildTradeInsTotals(input, 'modern')}
    </section>
    ${financingHtml ? `<section data-pdf-block="financingBlock">${financingHtml}</section>` : ''}
  </div>

  ${
    input.config.showExtraObservation && input.observation
      ? `<div class="box box-red" data-pdf-block="observation"><b>Observación:</b> ${escapeHtml(input.observation)}</div>`
      : ''
  }

  ${input.config.showRma ? `<div class="box box-red" data-pdf-block="rmaBlock">${renderRmaText(input.config.rmaText, input.company.rmaUrl)}</div>` : ''}

  <footer class="footer" data-pdf-block="footerText">${escapeHtml(input.company.footerText)}</footer>
</body>
</html>`;
  return withCustomBlocks(
    hasLayoutOverrides(input.layout)
      ? applyLabelOverrides(
          html.replace('</style>', `${layoutBlocksCss(input.layout!)}</style>`),
          input.layout!.document?.labels,
        )
      : html,
    input.layout,
  );
}

/**
 * Presupuesto FORMAL para empresas: estilo corporativo y solo lo esencial. Datos de la empresa y de la empresa cliente,
 * tabla con producto, cantidad, precio unitario, IVA e importe, y debajo el precio de lista, el efectivo / transferencia
 * y el cheque a 30 días (solo este PDF lo lleva).
 * No lleva armado, demora, línea de PC armada, financiación, observaciones, RMA ni textos de la tienda.
 */
export function renderQuoteFormalHtml(input: PdfRenderInput): string {
  const date = formatDateAr(input.date);
  const navy = '#14284b';
  const blue = '#1d4ed8';
  const company = input.company;
  const logo = company.logoUrl ? `<img class="logo" src="${escapeHtml(company.logoUrl)}" alt="" />` : '';

  // Solo los datos que existen: un campo vacío o con "-" no se muestra.
  const has = (value?: string | null): value is string => Boolean(value && value.trim() && value.trim() !== '-');
  const companyLines = [
    has(company.taxCondition) ? company.taxCondition : '',
    has(company.cuit) ? `CUIT ${company.cuit}` : '',
    has(company.grossIncome) ? `Ing. Brutos ${company.grossIncome}` : '',
    has(company.activityStart) ? `Inicio de actividades ${company.activityStart}` : '',
    has(company.address) ? company.address : '',
    has(company.phones) ? company.phones : '',
  ].filter(Boolean);

  const c = input.customer;
  const customerRows: Array<[string, string]> = [];
  if (c) {
    customerRows.push([c.kind === 'EMPRESA' ? 'Razón social' : 'Cliente', c.name]);
    const taxId = c.cuit || c.dni;
    if (taxId) customerRows.push([c.cuit ? 'CUIT' : 'DNI', taxId]);
    if (c.taxCondition) customerRows.push(['Condición IVA', TAX_CONDITION_LABELS[c.taxCondition] ?? c.taxCondition]);
    if (c.address) customerRows.push(['Domicilio', c.address]);
    if (c.contactName) customerRows.push(['Atención', c.contactName]);
    if (c.phone) customerRows.push(['Teléfono', c.phone]);
    if (c.email) customerRows.push(['Email', c.email]);
  }

  // Los precios cargados ya incluyen IVA: el unitario se muestra neto, el IVA como alícuota
  // y el importe es precio con IVA × cantidad.
  // La línea principal de una PC armada ("Presupuesto de PC Armada…") no va: solo los productos.
  const rows = input.items
    .filter((item) => !item.isMainLine)
    .map(
      (item) =>
        `<tr><td class="name">${escapeHtml(itemDisplayName(item.name))}</td><td class="qty">${item.quantity}</td>${ivaCells(item, input)}<td class="amt">${formatArsFromCents(item.subtotalCents)}</td></tr>`,
    )
    .join('');
  const chequeRow =
    input.chequeTotalCents != null
      ? `<div class="row cheque"><span class="lbl">Cheque a 30 días</span><span class="val">${formatArsFromCents(input.chequeTotalCents)}</span></div>`
      : '';

  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.4; }
  .topbar { height: 6px; background: ${navy}; margin-bottom: 14px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { display: flex; align-items: flex-start; gap: 12px; }
  .brand .logo { height: 54px; width: auto; max-width: 140px; object-fit: contain; }
  .brand .cname { font-size: 19px; font-weight: 800; color: ${navy}; line-height: 1.1; }
  .brand .cdata { margin-top: 4px; color: #4b5563; font-size: 9.6px; line-height: 1.5; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 25px; font-weight: 800; letter-spacing: 0.08em; color: ${navy}; }
  .doc dl { margin: 6px 0 0; display: grid; grid-template-columns: auto auto; gap: 2px 12px; justify-content: end; font-size: 10.4px; }
  .doc dt { color: #6b7280; text-align: right; }
  .doc dd { margin: 0; font-weight: 700; color: #111827; text-align: right; }
  .client { margin-top: 16px; border: 1px solid #cbd5e1; border-radius: 4px; }
  .client h2 { margin: 0; padding: 5px 12px; background: #eef2f9; border-bottom: 1px solid #cbd5e1; font-size: 9.6px; letter-spacing: 0.12em; text-transform: uppercase; color: ${navy}; }
  .client dl { margin: 0; padding: 8px 12px 9px; display: grid; grid-template-columns: 96px 1fr 96px 1fr; gap: 4px 12px; }
  .client dt { color: #6b7280; font-size: 10px; }
  .client dd { margin: 0; font-weight: 600; color: #111827; font-size: 10.8px; }
  table.items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 16px; }
  table.items thead th { background: ${navy}; color: #fff; padding: 7px 9px; font-size: 9.8px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; text-align: left; }
  table.items thead th.qty { text-align: center; }
  table.items thead th.unit, table.items thead th.iva, table.items thead th.gross, table.items thead th.amt { text-align: right; color: #fff; }
  table.items td { padding: 7px 9px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 10.9px; }
  table.items tbody tr:nth-child(even) td { background: #f8fafc; }
  table.items td.name { font-weight: 600; color: #111827; }
  table.items .qty { width: 54px; text-align: center; }
  table.items .iva { width: 84px; text-align: right; white-space: nowrap; }
  table.items td.iva { color: #4b5563; }
  table.items td.iva small { display: block; font-size: 8.5px; color: #9ca3af; }
  table.items .unit, table.items .gross { width: 98px; text-align: right; white-space: nowrap; }
  table.items .amt { width: 118px; text-align: right; white-space: nowrap; }
  table.items td.amt { font-weight: 700; color: #111827; }
  .totals { width: 100%; margin: 14px 0 0; border: 1px solid #cbd5e1; border-top: 3px solid ${navy}; border-radius: 0 0 4px 4px; }
  .totals .row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 12px; }
  .totals .row + .row { border-top: 1px solid #e5e7eb; }
  .totals .lbl { color: #374151; font-size: 11px; }
  .totals .list .val { color: ${navy}; font-weight: 800; font-size: 14px; }
  .totals .cash { background: #eef2f9; }
  .totals .cash .lbl { color: ${blue}; font-weight: 800; }
  .totals .cash .val { color: ${blue}; font-weight: 900; font-size: 18px; }
  .totals .cheque .lbl { color: #374151; font-weight: 700; }
  .totals .cheque .val { color: #111827; font-weight: 800; font-size: 14px; }
</style>
</head>
<body>
  <div class="topbar"></div>
  <header class="header">
    <div class="brand">
      ${logo}
      <div>
        <div class="cname">${escapeHtml(company.name)}</div>
        <div class="cdata">${companyLines.map((l) => escapeHtml(l)).join('<br />')}</div>
      </div>
    </div>
    <div class="doc">
      <h1>PRESUPUESTO</h1>
      <dl>
        <dt>Número</dt><dd>${escapeHtml(input.number)}</dd>
        <dt>Fecha</dt><dd>${date}</dd>
        <dt>Moneda</dt><dd>Pesos argentinos</dd>
      </dl>
    </div>
  </header>

  ${customerRows.length ? `<section class="client"><h2>Cliente</h2><dl>${customerRows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl></section>` : ''}

  <table class="items">
    <thead>
      <tr><th class="name">Producto</th><th class="qty">Cant.</th>${ivaHeadCells()}<th class="amt">Importe total</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="totals">
    <div class="row list"><span class="lbl">Precio de lista</span><span class="val">${formatArsFromCents(input.listTotalCents)}</span></div>
    <div class="row cash"><span class="lbl">Efectivo / Transferencia</span><span class="val">${formatArsFromCents(input.cashTotalCents)}</span></div>
    ${chequeRow}
  </section>
</body>
</html>`;
}

/** Renderer compartido por el preview live y la generación final. `editor` agrega hit-targets aun sin overrides. */
export function renderPdfHtml(input: PdfRenderInput, editor = false): string {
  const html = renderQuoteHtml(input);
  if (!editor) return html;
  // La plantilla MODERNO ya emite sus propios data-pdf-block inline (no usa el decorador de la
  // CLÁSICA, que hace reemplazos de strings sobre su HTML específico).
  const decorated =
    input.template === 'MODERNO' || hasLayoutOverrides(input.layout)
      ? html
      : decorateLayoutHtml(html, {version: 1, blocks: {}});
  // `@page` sólo afecta print. El preview screen debe reproducir el mismo content box:
  // A4 completo con exactamente los 14 mm / 12 mm usados por Chromium al imprimir.
  return decorated
    .replace('<html lang="es-AR">', '<html lang="es-AR" data-pdf-editor-preview>')
    .replace(
      '</style>',
      `@media screen {
  html[data-pdf-editor-preview] {
    width: 210mm;
    min-height: 297mm;
    overflow: hidden;
    background: #fff;
  }
  html[data-pdf-editor-preview] body {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 12mm;
  }
  html[data-pdf-editor-preview] .pdf-custom-layer { left: 12mm !important; top: 14mm !important; }
}</style>`,
    );
}

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser) return sharedBrowser;
  sharedBrowser = await chromium.launch({ headless: true });
  return sharedBrowser;
}

export async function closePdfBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

/** Cantidad de páginas de un PDF generado por Chromium (cada página es un objeto `/Type /Page`). */
export function countPdfPages(buffer: Buffer): number {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page(?![\w])/g) ?? []).length;
}

/** Escalas que se prueban cuando el presupuesto se pasa a una segunda hoja por poco. */
const FIT_ONE_PAGE_SCALES = [0.93, 0.87, 0.82, 0.78];

export async function renderPdfBuffer(input: PdfRenderInput): Promise<Buffer> {
  const html = renderQuoteHtml(input);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    const print = async (scale?: number) =>
      Buffer.from(
        await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
          ...(scale ? { scale } : {}),
        }),
      );
    const buffer = await print();
    // Un presupuesto que solo se desborda a una 2ª hoja se achica lo justo para que entre en una.
    // Los que ya entran no se tocan, y los realmente largos (3+ hojas) conservan su tamaño.
    if (countPdfPages(buffer) !== 2) return buffer;
    for (const scale of FIT_ONE_PAGE_SCALES) {
      const fitted = await print(scale);
      if (countPdfPages(fitted) === 1) return fitted;
    }
    return buffer;
  } finally {
    await page.close();
  }
}

export type StorageDriver = 'local' | 's3';

export type PdfStorage = {
  driver: StorageDriver;
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
};

export function createLocalPdfStorage(rootDir: string): PdfStorage {
  const root = path.resolve(rootDir);
  return {
    driver: 'local',
    async put(key, body) {
      const full = path.join(root, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    },
    async get(key) {
      return readFile(path.join(root, key));
    },
  };
}

export function createS3PdfStorage(opts: {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}): PdfStorage {
  // Implementación mínima S3-compatible vía fetch PUT/GET (path-style).
  // Firma simple: solo entornos de desarrollo con MinIO sin firma V4 estricta.
  // Para producción conviene reemplazar por AWS SDK; se deja cableado y testeable.
  const base = opts.endpoint.replace(/\/$/, '');
  const auth = Buffer.from(`${opts.accessKey}:${opts.secretKey}`).toString('base64');
  return {
    driver: 's3',
    async put(key, body, contentType = 'application/pdf') {
      const res = await fetch(`${base}/${opts.bucket}/${key}`, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': contentType,
        },
        body: new Uint8Array(body),
      });
      if (!res.ok) {
        throw new Error(`No se pudo guardar PDF en S3 (${res.status})`);
      }
    },
    async get(key) {
      const res = await fetch(`${base}/${opts.bucket}/${key}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) {
        throw new Error(`No se pudo leer PDF desde S3 (${res.status})`);
      }
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

export function createPdfStorageFromEnv(env: {
  PDF_STORAGE_DRIVER?: string;
  PDF_LOCAL_DIR?: string;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
}): PdfStorage {
  const driver = (env.PDF_STORAGE_DRIVER ?? 'local') as StorageDriver;
  if (driver === 's3') {
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      throw new Error('Faltan variables S3 para PDF_STORAGE_DRIVER=s3');
    }
    return createS3PdfStorage({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
    });
  }
  return createLocalPdfStorage(env.PDF_LOCAL_DIR ?? 'storage/pdfs');
}

export async function generateAndStorePdf(opts: {
  input: PdfRenderInput;
  storage: PdfStorage;
  storageKey: string;
}): Promise<{ buffer: Buffer; sha256: string; sizeBytes: number; inputHash: string; storageKey: string; driver: StorageDriver }> {
  const inputHash = pdfInputHash(opts.input);
  const buffer = await renderPdfBuffer(opts.input);
  const sha256 = sha256Hex(buffer);
  await opts.storage.put(opts.storageKey, buffer, 'application/pdf');
  return {
    buffer,
    sha256,
    sizeBytes: buffer.byteLength,
    inputHash,
    storageKey: opts.storageKey,
    driver: opts.storage.driver,
  };
}

/**
 * Renderiza un HTML a PNG con el mismo Chromium de los PDFs. Lo usan las
 * miniaturas de la tienda: el diseño se arma en HTML/CSS (tipografías web,
 * degradados, sombras) y se saca una captura del tamaño exacto pedido.
 */
export async function renderHtmlToPng(html: string, size: { width: number; height: number }): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    // Las fuentes web pueden seguir cargando después de networkidle.
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => undefined);
    const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size.width, height: size.height } });
    return Buffer.from(buffer);
  } finally {
    await page.close();
  }
}
