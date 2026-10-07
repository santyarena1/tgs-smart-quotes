import { describe, expect, it } from 'vitest';
import { formatCuit, isValidCuit, normalizeCuit } from './index';

describe('CUIT', () => {
  it('valida el dígito verificador', () => {
    expect(isValidCuit('30-71234567-8')).toBe(false);
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('30-50001091-2')).toBe(true);
  });
  it('rechaza largos y caracteres que no son un CUIT', () => {
    expect(isValidCuit('')).toBe(false);
    expect(isValidCuit('123')).toBe(false);
    expect(isValidCuit('abcdefghijk')).toBe(false);
  });
  it('acepta guiones y espacios', () => {
    expect(isValidCuit('20 12345678 6')).toBe(true);
    expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
  });
  it('lo muestra con el formato habitual', () => {
    expect(formatCuit('20123456786')).toBe('20-12345678-6');
    expect(formatCuit('123')).toBe('123');
  });
});
