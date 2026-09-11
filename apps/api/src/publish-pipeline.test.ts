import {describe, expect, it} from 'vitest';
import {rankCandidates} from './publish-pipeline.js';
import {enrichmentItemsHash} from './quote-enrichment.js';
import {buildStoreTitle} from './quote-title.js';

describe('elección de imágenes de Serper', () => {
  it('prefiere PNG grandes y cuadrados, y descarta miniaturas y banners', () => {
    const ranked = rankCandidates([
      {url: 'https://a/banner.jpg', width: 1600, height: 400},
      {url: 'https://a/thumb.png', width: 120, height: 120},
      {url: 'https://a/photo.jpg', width: 800, height: 700},
      {url: 'https://a/cutout.png', width: 900, height: 900},
    ]);
    expect(ranked.map((image) => image.url)).toEqual(['https://a/cutout.png', 'https://a/photo.jpg']);
  });

  it('no descarta resultados sin dimensiones informadas', () => {
    const ranked = rankCandidates([{url: 'https://a/unknown.webp'}]);
    expect(ranked).toHaveLength(1);
  });
});

describe('hash de ítems del enriquecimiento', () => {
  it('no depende del orden ni de mayúsculas', () => {
    const a = enrichmentItemsHash([
      {name: 'RTX 4060', quantity: 1, line: 'GPU'},
      {name: 'Ryzen 5 5600', quantity: 1, line: 'CPU'},
    ]);
    const b = enrichmentItemsHash([
      {name: 'ryzen 5 5600', quantity: 1, line: null},
      {name: 'rtx 4060 ', quantity: 1, line: null},
    ]);
    expect(a).toBe(b);
  });

  it('cambia si cambia la cantidad', () => {
    const one = enrichmentItemsHash([{name: 'DDR5 16GB', quantity: 1, line: null}]);
    const two = enrichmentItemsHash([{name: 'DDR5 16GB', quantity: 2, line: null}]);
    expect(one).not.toBe(two);
  });
});

describe('título de la tienda con formato de specs', () => {
  it('arma el formato PC GAMER | CPU - RAM - DISCO - GPU | WINDOWS', () => {
    const title = buildStoreTitle([
      {name: 'Procesador AMD Ryzen 5 7600X AM5', quantity: 1, line: 'Procesador'},
      {name: 'Memoria Kingston Fury 16GB DDR5 5600', quantity: 1, line: 'Memoria RAM'},
      {name: 'Disco SSD 512GB M.2 NVMe Kingston NV2', quantity: 1, line: 'Disco'},
      {name: 'Placa de video RTX 3070 8GB Gigabyte', quantity: 1, line: 'Placa de video'},
      {name: 'Licencia Windows 11 Home', quantity: 1, line: 'Software'},
      {name: 'Gabinete Cougar MX330', quantity: 1, line: 'Gabinete'},
    ]);
    expect(title).toBe('PC GAMER | RYZEN 5 7600X - RAM 16GB - 512GB M.2 - RTX 3070 8GB | WINDOWS 11');
  });

  it('sin placa de video ni Windows, omite esos segmentos y suma módulos de RAM', () => {
    const title = buildStoreTitle([
      {name: 'AMD Ryzen 5 3400G con gráficos Radeon Vega 11', quantity: 1, line: 'Procesador'},
      {name: 'Memoria 8GB DDR4 3200', quantity: 2, line: 'Memoria RAM'},
      {name: 'SSD 512GB M.2', quantity: 1, line: 'Disco'},
    ]);
    expect(title).toBe('PC GAMER | RYZEN 5 3400G - RAM 16GB - 512GB M.2');
  });

  it('la IA rellena lo que las reglas no leyeron, pero no pisa lo leído', () => {
    const title = buildStoreTitle(
      [
        {name: 'Intel Core i5-12400F', quantity: 1, line: 'Procesador'},
        {name: 'Kit 2x8GB DDR4', quantity: 1, line: 'Memoria RAM'},
        {name: 'Disco 1TB', quantity: 1, line: 'Disco'},
      ],
      {cpu: 'ryzen 9', gpu: 'rtx 4060 8gb', os: 'windows 11'},
    );
    expect(title).toBe('PC GAMER | INTEL I5 12400F - RAM 16GB - 1TB - RTX 4060 8GB | WINDOWS 11');
  });

  it('sin procesador no arma título', () => {
    expect(buildStoreTitle([{name: 'Memoria 16GB', quantity: 1, line: 'Memoria RAM'}])).toBeNull();
  });
});
