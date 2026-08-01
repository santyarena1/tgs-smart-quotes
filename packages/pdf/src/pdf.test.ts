import { describe, expect, it } from 'vitest';
import {
  formatArsFromCents,
  formatDateAr,
  pdfFileName,
  pdfInputHash,
  renderPdfHtml,
  renderQuoteHtml,
  resolvePdfFlags,
  type PdfRenderInput,
} from './index.js';

const baseConfig = {
  showListPrice: true,
  showCashTransfer: true,
  showFinancing: true,
  showBbva: true,
  showOtherBanks: true,
  showFinancingNote: true,
  showTaxData: true,
  showServicesBlock: true,
  showWindows: true,
  showDrivers: true,
  showDelay: true,
  showRma: true,
  showExtraObservation: false,
  showIndividualPrices: true,
  showComponentDetail: true,
  builtPcTitle: 'Presupuesto de PC Armada',
  builtPcDescription: 'Servicio de Armado',
  assemblyText: 'Servicio de Armado',
  installText: 'Instalación y Configuración de PC',
  windowsText: 'Windows 11/10 Pro sin licencia',
  driversText: 'Drivers de video dedicados para la GPU',
  estimatedDelay: '3 a 5 días hábiles una vez dada el alta',
};

const sample = (): PdfRenderInput => ({
  kind: 'SIMPLE',
  number: 'TGS-20260726-0001',
  date: new Date('2026-07-26T15:00:00.000Z'),
  isBuiltPc: true,
  observation: null,
  listTotalCents: 114367500n,
  cashTotalCents: 99450000n,
  company: {
    name: 'The Gamer Shop',
    taxCondition: 'Responsable Inscripto',
    cuit: '23-22364802-9',
    grossIncome: '0088520-07',
    activityStart: '21/10/1992',
    address: 'Carhue 1409, CABA, Argentina',
    phones: '11 2512 1409',
    footerText: 'The Gamer Shop - Tu tienda Gamer de Confianza',
    rmaUrl: 'https://thegamershop.com.ar/rma-servicio-tecnico-garantias/',
    primaryColor: '#111111',
    accentColor: '#c8102e',
  },
  config: baseConfig,
  items: [
    {
      name: 'Presupuesto de PC Armada: The Gamer Shop',
      quantity: 1,
      unitCents: 114367500n,
      subtotalCents: 114367500n,
      isMainLine: true,
    },
    {
      name: 'PROCESADOR AMD (AM5) RYZEN 5 8500G',
      quantity: 1,
      unitCents: 0n,
      subtotalCents: 0n,
      isComponent: true,
    },
  ],
  financing: [
    {
      bank: 'BBVA - Banco Francés',
      installments: 3,
      interestBps: 0,
      description: 'Todos los viernes y sábados.',
      sortOrder: 1,
    },
  ],
});

describe('@tgs/pdf', () => {
  it('formatea dinero ARS sin floats', () => {
    expect(formatArsFromCents(114367500n)).toBe('$ 1.143.675,00');
    expect(formatArsFromCents(0n)).toBe('$ 0,00');
  });

  it('nombra archivos históricos de forma estable', () => {
    expect(pdfFileName('TGS-1', 2, 'DETALLADO')).toBe('TGS-1-V2-DETALLADO.pdf');
  });

  it('no incluye vencimiento en el HTML', () => {
    const html = renderQuoteHtml(sample());
    expect(html.toLowerCase()).not.toContain('válido hasta');
    expect(html.toLowerCase()).not.toContain('valido hasta');
    expect(html).toContain('PRESUPUESTO');
    expect(html).toContain('Efectivo / Transferencia');
    expect(html).toContain('DATOS DEL PRESUPUESTO');
  });

  it('calcula cuotas sobre lista con interés y redondeo half-up', () => {
    const html = renderQuoteHtml({
      ...sample(),
      cashTotalCents: 10000000n,
      listTotalCents: 11500000n,
      financing: [{installments: 6, interestBps: 2500, bank: null, description: null}],
    });
    expect(html).toContain('Precio de lista (1 pago tarjeta)');
    expect(html).toContain('$ 115.000,00');
    expect(html).toContain('$ 100.000,00');
    expect(html).toContain('6 cuotas');
    expect(html).toContain('de $ 23.958,33');
  });

  it('resuelve overrides triestado', () => {
    const resolved = resolvePdfFlags(baseConfig, {
      showRma: 'OCULTAR',
      showListPrice: 'HEREDAR',
      showCashTransfer: 'MOSTRAR',
    });
    expect(resolved.showRma).toBe(false);
    expect(resolved.showListPrice).toBe(true);
    expect(resolved.showCashTransfer).toBe(true);
  });

  it('hash de input es estable', () => {
    const a = pdfInputHash(sample());
    const b = pdfInputHash(sample());
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('un layout vacío conserva exactamente el HTML y el hash históricos', () => {
    const legacy = sample();
    const emptyLayout = {...sample(), layout: {version: 1 as const, blocks: {}}};
    expect(renderQuoteHtml(emptyLayout)).toBe(renderQuoteHtml(legacy));
    expect(pdfInputHash(emptyLayout)).toBe(pdfInputHash(legacy));
  });

  it('el preview del editor reproduce el content box A4 y expone hit-targets', () => {
    const html = renderPdfHtml(sample(), true);
    expect(html).toContain('data-pdf-editor-preview');
    expect(html).toContain('width: 210mm');
    expect(html).toContain('min-height: 297mm');
    expect(html).toContain('padding: 14mm 12mm');
    expect(html).toContain('data-pdf-block="itemsTable"');
    expect(html).toContain('data-pdf-block="itemsTable.colAmount"');
    expect(html).toContain('data-pdf-block="totalsBlock"');
    expect(html).toContain('data-pdf-block="financingBlock"');
    expect(html).toContain('data-pdf-block="footerText"');
  });

  it('el logo conserva su proporción aun con un layout antiguo deformado', () => {
    const html = renderQuoteHtml({
      ...sample(),
      company: {...sample().company, logoUrl: 'https://example.com/logo.png'},
      layout: {
        version: 1,
        blocks: {logo: {width: 240, height: 20}},
      },
    });
    expect(html).toContain('width:240px!important');
    expect(html).toContain('height:auto!important');
    expect(html).not.toContain('height:20px!important');
  });

  it('SIMPLE oculta precios individuales; DETALLADO los muestra', () => {
    const base = sample();
    const simple = renderQuoteHtml({ ...base, kind: 'SIMPLE' });
    const detailed = renderQuoteHtml({ ...base, kind: 'DETALLADO', items: [
      {
        name: 'Presupuesto de PC Armada',
        quantity: 1,
        unitCents: 114367500n,
        subtotalCents: 114367500n,
        isMainLine: true,
      },
      {
        name: 'PROCESADOR AMD RYZEN 5',
        quantity: 1,
        unitCents: 25000000n,
        subtotalCents: 25000000n,
        isComponent: true,
      },
    ]});
    // En SIMPLE el componente no lleva precio monetario (guión).
    expect(simple).toContain('—');
    expect(simple).toContain('$ 1.143.675,00');
    // En DETALLADO el componente muestra su importe.
    expect(detailed).toContain('PROCESADOR AMD RYZEN 5');
    expect(detailed).toContain('$ 250.000,00');
  });

  it('SIMPLE sin PC armada no muestra importes por fila', () => {
    const html = renderQuoteHtml({
      ...sample(),
      kind: 'SIMPLE',
      isBuiltPc: false,
      items: [
        {
          name: 'Memoria RAM 16GB',
          quantity: 2,
          unitCents: 5000000n,
          subtotalCents: 10000000n,
        },
      ],
    });
    expect(html).toContain('Memoria RAM 16GB');
    expect(html).toContain('—');
    expect(html).not.toMatch(/Memoria RAM 16GB[\s\S]*\$ 100\.000,00/);
  });
});
