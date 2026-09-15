import {describe, expect, it} from 'vitest';
import {comboStrikeCents} from './wordpress.js';

describe('precio tachado de un combo (descuento inverso)', () => {
  it('con $100.000 y 10 % el tachado es $111.111,11', () => {
    expect(comboStrikeCents(10_000_000n, 1000)).toBe(11_111_111n);
  });

  it('el tachado menos el descuento vuelve al precio (redondeo al centavo)', () => {
    const price = 12_345_678n;
    const strike = comboStrikeCents(price, 1500)!;
    // 15 % de descuento sobre el tachado, redondeado al centavo.
    const back = (strike * 8500n + 5000n) / 10000n;
    expect(back).toBe(price);
  });

  it('sin descuento no hay tachado', () => {
    expect(comboStrikeCents(10_000_000n, 0)).toBeNull();
  });
});
