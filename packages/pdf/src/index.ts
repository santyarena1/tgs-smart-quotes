import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';

export type PdfKind = 'SIMPLE' | 'DETALLADO';

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
};
export type PdfLayoutConfig = {
  version: 1;
  blocks: Partial<Record<PdfLayoutBlockKey, PdfLayoutStyle>>;
};

export type PdfTemplate = 'CLASICO' | 'MODERNO';

export type PdfRenderInput = {
  kind: PdfKind;
  number: string;
  date: Date;
  isBuiltPc: boolean;
  observation?: string | null;
  listTotalCents: bigint;
  cashTotalCents: bigint;
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

export function formatArsFromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fracStr = frac.toString().padStart(2, '0');
  return `${negative ? '-' : ''}$ ${wholeStr},${fracStr}`;
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
    company: input.company,
    customer: input.customer ?? null,
    config: input.config,
    items: input.items.map((i) => ({
      ...i,
      unitCents: i.unitCents.toString(),
      subtotalCents: i.subtotalCents.toString(),
    })),
    financing: input.financing,
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
  return Boolean(layout && Object.keys(layout.blocks).length > 0);
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
  return declarations.length ? `[data-pdf-block="${key}"]{${declarations.join(';')}}` : '';
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
  return `${styles}${columnCss}`;
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
    ['<th>Cant.</th>', '<th data-pdf-block="itemsTable.colQty" class="qty">Cant.</th>'],
    ['<th>Importe</th>', '<th data-pdf-block="itemsTable.colAmount" class="amt">Importe</th>'],
    ['<section class="totals">', '<section data-pdf-block="totalsBlock" class="totals">'],
    ['<section class="obs">', '<section data-pdf-block="observation" class="obs">'],
    ['<section class="rma">', '<section data-pdf-block="rmaBlock" class="rma">'],
    ['<footer class="footer">', '<footer data-pdf-block="footerText" class="footer">'],
  ];
  for (const [from, to] of replacements) next = next.replaceAll(from, to);
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
      const name = escapeHtml(item.name);
      const qty = String(item.quantity);
      const amount = showRowPrice(item)
        ? formatArsFromCents(item.subtotalCents)
        : input.kind === 'SIMPLE'
          ? '—'
          : formatArsFromCents(0n);
      const cls = item.isMainLine ? 'main' : item.isComponent ? 'component' : '';
      return `<tr class="${cls}"><td class="code">${code}</td><td class="name">${name}</td><td class="qty">${qty}</td><td class="amt">${amount}</td></tr>`;
    })
    .join('');
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
      <tr>
        <th>Cód.</th>
        <th>Artículo</th>
        <th>Cant.</th>
        <th>Importe</th>
      </tr>
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
  return hasLayoutOverrides(input.layout) ? decorateLayoutHtml(html, input.layout!) : html;
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
      const name = escapeHtml(item.name);
      const qty = String(item.quantity);
      // Solo se muestra importe en las filas que corresponde (línea principal en SIMPLE,
      // todas en DETALLADO). El resto queda vacío (no "$ 0,00").
      const amount = showRowPrice(item) ? formatArsFromCents(item.subtotalCents) : '';
      const subtitle =
        item.isMainLine && input.config.builtPcDescription
          ? `<div class="sub">${escapeHtml(input.config.builtPcDescription)}</div>`
          : '';
      const cls = item.isMainLine ? 'main' : item.isComponent ? 'component' : '';
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
  table.items thead th.amt { text-align: right; }
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
  table.items td.amt { font-weight: 800; }
  .price-block { border: 1px solid #d9d9d9; border-radius: 6px; padding: 4px 14px 10px; margin-top: 9px; }
  .totals { margin-top: 0; }
  .totals .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; border-bottom: 1px solid #eee; }
  .totals .row .lbl { color: #333; font-size: 10.8px; }
  .totals .list .val { color: ${accent}; font-weight: 800; font-size: 12.8px; }
  .totals .cash { border-bottom: none; padding-top: 8px; }
  .totals .cash .lbl { color: ${green}; font-weight: 800; font-size: 11.3px; }
  .totals .cash .val { color: ${green}; font-weight: 900; font-size: 17px; }
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
      <tr><th class="code" data-pdf-block="itemsTable.colCode">Cód.</th><th class="name" data-pdf-block="itemsTable.colName">Artículo</th><th class="qty" data-pdf-block="itemsTable.colQty">Cant.</th><th class="amt" data-pdf-block="itemsTable.colAmount">Importe</th></tr>
    </thead>
    <tbody>${buildItemsRowsModerno(input)}</tbody>
  </table>

  <div class="price-block">
    <section class="totals" data-pdf-block="totalsBlock">
      ${input.config.showListPrice ? `<div class="row list"><span class="lbl">Precio de lista</span><span class="val">${formatArsFromCents(input.listTotalCents)}</span></div>` : ''}
      ${input.config.showCashTransfer ? `<div class="row cash"><span class="lbl">Efectivo / Transferencia</span><span class="val">${formatArsFromCents(input.cashTotalCents)}</span></div>` : ''}
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
  return hasLayoutOverrides(input.layout)
    ? html.replace('</style>', `${layoutBlocksCss(input.layout!)}</style>`)
    : html;
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

export async function renderPdfBuffer(input: PdfRenderInput): Promise<Buffer> {
  const html = renderQuoteHtml(input);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(buffer);
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
