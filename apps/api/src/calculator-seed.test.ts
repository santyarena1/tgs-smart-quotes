import {describe, expect, it} from 'vitest';
import {
  applyInterestBps,
  groupKeyFromBank,
  installmentCents,
  seedCalculatorGroups,
} from './calculator-seed.js';

describe('semilla de la calculadora', () => {
  it('agrupa BBVA y otros bancos, y copia tasas de referencia a medios extra', () => {
    const groups = seedCalculatorGroups(1300, [
      {bank: 'BBVA - Banco Francés', installments: 3, interestBps: 0, sortOrder: 1},
      {bank: 'BBVA - Banco Francés', installments: 6, interestBps: 0, sortOrder: 2},
      {bank: 'Otros bancos', installments: 3, interestBps: 1050, sortOrder: 3},
      {bank: 'Otros bancos', installments: 6, interestBps: 2150, sortOrder: 4},
      {bank: 'Otros bancos', installments: 12, interestBps: 9400, sortOrder: 5},
    ]);

    expect(groups.find((g) => g.key === 'cash')?.plans[0]?.interestBps).toBe(0);
    expect(groups.find((g) => g.key === 'list')?.plans[0]?.interestBps).toBe(1300);
    expect(groups.find((g) => g.key === 'bbva')?.plans.map((p) => p.installments)).toEqual([3, 6]);
    const mp = groups.find((g) => g.key === 'mercadopago');
    expect(mp?.plans.map((p) => p.interestBps)).toEqual([1050, 2150, 9400]);
    expect(groups.find((g) => g.key === 'visa')?.label).toBe('Visa');
    expect(groups.find((g) => g.key === 'gocuotas')?.label).toBe('Go Cuotas');
  });

  it('reconoce nombres de banco aunque vengan con acentos o extra', () => {
    expect(groupKeyFromBank('BBVA')).toBe('bbva');
    expect(groupKeyFromBank('Mercado Pago')).toBe('mercadopago');
    expect(groupKeyFromBank('GO CUOTAS')).toBe('gocuotas');
    expect(groupKeyFromBank('Mastercard Gold')).toBe('mastercard');
  });
});

describe('cuotas igual que el PDF', () => {
  it('aplica interés half-up y divide la cuota', () => {
    const cash = 15000000n;
    const list = applyInterestBps(cash, 1300);
    expect(list).toBe(16950000n);
    expect(installmentCents(list, 3, 0)).toBe(5650000n);
    expect(installmentCents(list, 3, 1050)).toBe(6243250n);
  });
});
