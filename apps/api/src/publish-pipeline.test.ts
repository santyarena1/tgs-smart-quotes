import {describe, expect, it} from 'vitest';
import {rankCandidates} from './publish-pipeline.js';
import {enrichmentItemsHash} from './quote-enrichment.js';

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
