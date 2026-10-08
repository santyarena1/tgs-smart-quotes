import { describe, expect, it } from 'vitest';
import { categoryFor } from './iva-categories.js';
import { ivaBpsOf } from './nodo-mapping.js';

describe('memoria de IVA', () => {
  it('reconoce el tipo de producto por el nombre aunque el distribuidor la llame distinto', () => {
    expect(categoryFor('Motherboard PRIME B860M-K Intel Socket LGA1851', 'Componentes PC')?.key).toBe('mother');
    expect(categoryFor('Motherboard GIGABYTE B550M K WIFI6E AM4 DDR4', 'Hardware')?.key).toBe('mother');
    expect(categoryFor('Procesador AMD Ryzen 5 5600', 'Hardware')?.key).toBe('procesador');
    expect(categoryFor('Placa de video RTX 4060 8GB', null)?.key).toBe('placa-de-video');
    expect(categoryFor('Memoria RAM 16GB DDR4 3200', null)?.key).toBe('memoria-ram');
  });

  it('si no reconoce el nombre usa la categoría del distribuidor, y sin eso nada', () => {
    expect(categoryFor('Cosa rara XYZ', 'Varios')?.key).toBe('nodo:varios');
    expect(categoryFor('Cosa rara XYZ', null)).toBeNull();
  });

  it('toma la alícuota de IVA que informa NODO', () => {
    expect(ivaBpsOf({ net: 124, taxes: [{ type: 'iva', percent: 10.5, amount: 13.02 }, { type: 'perception', percent: 3, amount: 2.81 }] })).toBe(1050);
    expect(ivaBpsOf({ net: 100, taxes: [{ type: 'iva', amount: 21 }] })).toBe(2100);
    expect(ivaBpsOf({ net: 100, taxes: [] })).toBeNull();
  });
});
