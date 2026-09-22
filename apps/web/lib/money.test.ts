import {describe,expect,it} from 'vitest';
import {centsToInput,formatArs,parseArsToCents,roundToPesoCents,saleFromCostAndPct} from './money';

describe('dinero en pesos enteros',()=>{
  it('muestra pesos sin decimales',()=>{
    expect(formatArs(111682400n)).toBe('$ 1.116.824');
    expect(formatArs(0n)).toBe('$ 0');
    expect(formatArs(-2500000n)).toBe('-$ 25.000');
  });

  it('redondea al peso más cercano',()=>{
    expect(roundToPesoCents(12349n)).toBe(12300n);
    expect(roundToPesoCents(12350n)).toBe(12400n);
    expect(formatArs(2395833n)).toBe('$ 23.958');
  });

  it('parsea pesos con miles y redondea decimales viejos',()=>{
    expect(parseArsToCents('50.000')).toBe('5000000');
    expect(parseArsToCents('1.116.824')).toBe('111682400');
    expect(parseArsToCents('1500,50')).toBe('150100');
    expect(parseArsToCents('485.000,00')).toBe('48500000');
  });

  it('el input editable es pesos con miles, sin centavos',()=>{
    expect(centsToInput(111682400n)).toBe('1.116.824');
    expect(centsToInput(50n)).toBe('1');
  });

  it('venta desde costo y margen: 30 % de $100.000 es $130.000',()=>{
    expect(saleFromCostAndPct('100.000','30')).toBe('130.000');
    expect(saleFromCostAndPct('200.000','30')).toBe('260.000');
  });
});
