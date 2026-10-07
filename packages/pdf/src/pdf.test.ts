import { describe, expect, it } from 'vitest';
import {
  countPdfPages,
  itemDisplayName,
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
  rmaText: 'Importante: al aceptar este presupuesto, ya sea mediante compromiso verbal o monetario —seña, abono total, abono parcial o cualquier confirmación de compra/servicio—, el cliente declara conocer y aceptar las Políticas de Servicio Técnico y RMA: {rmaUrl}',
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
    expect(formatArsFromCents(114367500n)).toBe('$ 1.143.675');
    expect(formatArsFromCents(0n)).toBe('$ 0');
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
    expect(html).toContain('$ 115.000');
    expect(html).toContain('$ 100.000');
    expect(html).toContain('6 cuotas');
    expect(html).toContain('de $ 23.958');
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

  it('un layout con estilo de documento cambia el HTML y el hash, en ambas plantillas', () => {
    const document = {accentColor: '#0055aa', tableHeaderBg: '#0055aa', tableZebra: true, cardRadius: 12};
    for (const template of ['CLASICO', 'MODERNO'] as const) {
      const plain = {...sample(), template};
      const styled = {...plain, layout: {version: 1 as const, blocks: {}, document}};
      const html = renderQuoteHtml(styled);
      expect(html).toContain('#0055aa');
      expect(html).toContain('nth-child(even)');
      expect(html).toContain('border-radius:12px!important');
      expect(pdfInputHash(styled)).not.toBe(pdfInputHash(plain));
    }
  });

  it('muestra la entrega del cliente bajo Efectivo / Transferencia con el precio final', () => {
    const items = [{name: 'Placa de video vieja <GTX>', valueCents: 5_000_000n}, {name: 'Fuente 500W', valueCents: 1_500_000n}];
    for (const template of ['CLASICO', 'MODERNO'] as const) {
      const base = {...sample(), template};
      const finalPrice = formatArsFromCents(base.cashTotalCents - 6_500_000n);
      const withValues = renderQuoteHtml({...base, tradeIns: {showValues: true, items}});
      expect(withValues).toContain('Productos entregados por el cliente:');
      expect(withValues).toContain('Placa de video vieja &lt;GTX&gt; ($ 50.000)');
      expect(withValues).toContain('Fuente 500W ($ 15.000)');
      expect(withValues).toContain('Precio final con entrega de productos del cliente');
      expect(withValues).toContain(finalPrice);
      // Va después de Efectivo / Transferencia y dentro de los totales.
      expect(withValues.indexOf('Efectivo / Transferencia')).toBeLessThan(withValues.indexOf('Precio final con entrega'));
      const namesOnly = renderQuoteHtml({...base, tradeIns: {showValues: false, items}});
      expect(namesOnly).toContain('Fuente 500W');
      expect(namesOnly).not.toContain('$ 15.000');
      expect(namesOnly).toContain('Precio final con entrega de productos del cliente');
      expect(renderQuoteHtml(base)).not.toContain('Productos entregados por el cliente');
      expect(pdfInputHash({...base, tradeIns: {showValues: true, items}})).not.toBe(pdfInputHash(base));
      expect(pdfInputHash({...base, tradeIns: null})).toBe(pdfInputHash(base));
    }
  });

  it('cuenta las páginas de un PDF sin confundir /Pages con /Page', () => {
    const pdf = Buffer.from('<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page /Parent 1 0 R >>');
    expect(countPdfPages(pdf)).toBe(2);
  });

  it('reescribe los rótulos de plantilla elegidos, en ambas plantillas y escapando HTML', () => {
    const labels = {
      quoteTitle: 'COTIZACIÓN <b>', quoteDataTitle: 'Datos', fiscalDataTitle: 'Fiscal',
      colName: 'Producto', colQty: 'Unid.', colAmount: 'Precio', listPriceLabel: 'Lista', cashPriceLabel: 'Contado',
      observationLabel: 'Nota',
    };
    for (const template of ['CLASICO', 'MODERNO'] as const) {
      const input = {...sample(), template, observation: 'Hola', config: {...baseConfig, showExtraObservation: true}};
      const plain = renderQuoteHtml(input);
      const html = renderQuoteHtml({...input, layout: {version: 1 as const, blocks: {}, document: {labels}}});
      expect(html).toContain('COTIZACIÓN &lt;b&gt;');
      expect(html).not.toContain('COTIZACIÓN <b>');
      for (const text of ['>Producto</th>', '>Unid.</th>', '>Precio</th>', '>Lista</span>', '>Contado</span>']) expect(html).toContain(text);
      expect(html).toContain('Nota:');
      expect(plain).not.toContain('>Producto</th>');
      expect(pdfInputHash({...input, layout: {version: 1 as const, blocks: {}, document: {labels}}})).not.toBe(pdfInputHash(input));
    }
  });

  it('aplica alineación, cursiva, mayúsculas, fondo y borde por bloque', () => {
    const html = renderQuoteHtml({
      ...sample(),
      layout: {
        version: 1,
        blocks: {
          footerText: {
            textAlign: 'right', italic: true, uppercase: true, lineHeight: 1.6,
            background: '#eeeeee', borderColor: '#111111', borderWidth: 2, borderRadius: 6, padding: 8,
          },
        },
      },
    });
    for (const css of [
      'text-align:right!important', 'font-style:italic!important', 'text-transform:uppercase!important',
      'line-height:1.6!important', 'background:#eeeeee!important', 'border:2px solid #111111!important',
      'border-radius:6px!important', 'padding:8px!important',
    ]) expect(html).toContain(css);
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

  it('renderiza bloques de texto propios escapados y omite los ocultos', () => {
    const layout = {
      version: 1 as const,
      blocks: {},
      customBlocks: [
        {id: 'a1', text: 'Hola <b>mundo</b>', x: 10, y: 20, width: 200, fontSize: 14},
        {id: 'a2', text: 'oculto', x: 0, y: 0, width: 100, hidden: true},
      ],
    };
    const html = renderQuoteHtml({...sample(), layout});
    expect(html).toContain('data-pdf-block="custom:a1"');
    expect(html).toContain('Hola &lt;b&gt;mundo&lt;/b&gt;');
    expect(html).not.toContain('oculto');
  });

  it('inserta bloques por capa en el flujo, antes de la sección elegida y al final', () => {
    for (const template of ['CLASICO', 'MODERNO'] as const) {
      const layout = {
        version: 1 as const,
        blocks: {},
        customBlocks: [
          {id: 'f1', text: 'ANTES-TABLA', x: 0, y: 0, width: 300, before: 'items' as const},
          {id: 'f2', text: 'AL-FINAL', x: 0, y: 0, width: 300, before: 'end' as const},
          {id: 'f3', text: 'ARRIBA-DE-TODO', x: 0, y: 0, width: 300, before: 'header' as const},
        ],
      };
      const html = renderQuoteHtml({...sample(), template, layout});
      const at = (needle: string) => html.indexOf(needle);
      expect(at('ARRIBA-DE-TODO')).toBeGreaterThan(at('<body'));
      expect(at('ARRIBA-DE-TODO')).toBeLessThan(at('<header class="header"'));
      expect(at('ANTES-TABLA')).toBeLessThan(at('<table'));
      expect(at('ANTES-TABLA')).toBeGreaterThan(at('<section class="cards"'));
      expect(at('AL-FINAL')).toBeGreaterThan(at('<footer'));
      expect(html).not.toContain('pdf-custom-layer');
    }
  });

  it('una capa apuntando a una sección ausente cae a la siguiente que exista', () => {
    const layout = {version: 1 as const, blocks: {}, customBlocks: [{id: 'o1', text: 'OBS-AUSENTE', x: 0, y: 0, width: 300, before: 'observation' as const}]};
    const html = renderQuoteHtml({...sample(), layout});
    expect(html).toContain('OBS-AUSENTE');
    expect(html.indexOf('OBS-AUSENTE')).toBeLessThan(html.indexOf('<footer'));
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

  it('renderiza la plantilla RMA por defecto sin cambiar el texto histórico', () => {
    const html = renderQuoteHtml(sample());
    expect(html).toContain(
      'Importante: al aceptar este presupuesto, ya sea mediante compromiso verbal o monetario —seña, abono total, abono parcial o cualquier confirmación de compra/servicio—, el cliente declara conocer y aceptar las Políticas de Servicio Técnico y RMA: https://thegamershop.com.ar/rma-servicio-tecnico-garantias/',
    );
    expect(html).not.toContain('{rmaUrl}');
  });

  it('mantiene el enlace RMA aunque la plantilla personalizada omita el marcador', () => {
    const html = renderQuoteHtml({
      ...sample(),
      config: {...baseConfig, rmaText: 'Texto personalizado de garantía.'},
    });
    expect(html).toContain(
      'Texto personalizado de garantía. https://thegamershop.com.ar/rma-servicio-tecnico-garantias/',
    );
  });

  it('los productos salen en mayúsculas en el PDF, en ambas plantillas', () => {
    const base = sample();
    const items = [{ name: 'Placa de video Gigabyte RTX 5060 8g ñandú', quantity: 1, unitCents: 100n, subtotalCents: 100n }];
    for (const template of ['CLASICO', 'MODERNO'] as const) {
      const html = renderPdfHtml({ ...base, kind: 'DETALLADO', items, template } as PdfRenderInput);
      expect(html).toContain('PLACA DE VIDEO GIGABYTE RTX 5060 8G ÑANDÚ');
      expect(html).not.toContain('Placa de video Gigabyte');
    }
    expect(itemDisplayName('Memoria Ram 16gb ddr4')).toBe('MEMORIA RAM 16GB DDR4');
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
    expect(simple).toContain('$ 1.143.675');
    // En DETALLADO el componente muestra su importe.
    expect(detailed).toContain('PROCESADOR AMD RYZEN 5');
    expect(detailed).toContain('$ 250.000');
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
    expect(html).toContain('MEMORIA RAM 16GB');
    expect(html).toContain('—');
    expect(html).not.toMatch(/MEMORIA RAM 16GB[\s\S]*\$ 100\.000/);
  });
});
