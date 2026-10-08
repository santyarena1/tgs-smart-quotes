import { describe, expect, it } from 'vitest';
import { categoryFor } from './iva-categories.js';
import { buildIvaBaseline } from './iva-memory.js';
import { categoryText, ivaBpsOf } from './nodo-mapping.js';

const key = (name: string, nodoCategory?: string | null) => categoryFor(name, nodoCategory)?.key;

describe('motor de categorías de IVA', () => {
  it('entiende todas las formas de escribir una mother', () => {
    for (const name of ['MOTHER ASUS PRIME B550', 'MB GIGABYTE B450M', 'Motherboard PRIME B860M-K Intel', 'PLACA MADRE MSI A520', 'Placa base ASRock', 'MOBO ASUS TUF', 'Mainboard Biostar', 'M/B ECS H61']) {
      expect(key(name), name).toBe('mother');
    }
  });

  it('entiende todas las formas de escribir un procesador', () => {
    for (const name of ['CPU AMD Ryzen 5 5600', 'MICRO INTEL I5 12400F', 'Microprocesador AMD Athlon 3000G', 'PROCESADOR INTEL CORE I3', 'PROCES. AMD RYZEN 7 5700X', 'Procesador Intel Core Ultra 5 245K']) {
      expect(key(name), name).toBe('procesador');
    }
  });

  it('no confunde MB de megabytes, micro SD ni CPU cooler', () => {
    expect(key('Memoria Flash 512 MB')).not.toBe('mother');
    expect(key('Memoria Micro SD 64 GB Kingston')).toBe('pendrive-sd');
    expect(key('Cooler CPU Deepcool AK400')).toBe('cooler-cpu');
  });

  it('el tipo de producto que aparece primero manda', () => {
    expect(key('GAB COOLER MASTER ELITE 302 3*FAN ARGB')).toBe('gabinete');
    expect(key('Auricular Gamer Logitech G335')).toBe('auriculares');
    expect(key('Water Cooler ASUS ROG STRIX LC III 360')).toBe('cooler-cpu');
    expect(key('Placa de video RTX 4060 8GB')).toBe('placa-de-video');
    expect(key('Memoria RAM 16GB DDR4 3200')).toBe('memoria-ram');
  });

  it('si el nombre no dice qué es usa la categoría del distribuidor, y si no, nada', () => {
    expect(key('ASUS (SOCKET AM5) PRIME X670-P WIFI', 'MOTHERBOARDS')).toBe('mother');
    expect(key('Cosa rara XYZ', 'Varios')).toBe('nodo:varios');
    expect(key('Cosa rara XYZ', null)).toBeUndefined();
  });

  it('toma la alícuota y la categoría que informa NODO', () => {
    expect(ivaBpsOf({ net: 124, taxes: [{ type: 'iva', percent: 10.5, amount: 13.02 }, { type: 'perception', percent: 3, amount: 2.81 }] })).toBe(1050);
    expect(ivaBpsOf({ net: 100, taxes: [{ type: 'iva', amount: 21 }] })).toBe(2100);
    expect(ivaBpsOf({ net: 100, taxes: [] })).toBeNull();
    expect(categoryText({ name: 'Hardware', path: ['Hardware', 'Mothers'] })).toBe('Hardware Mothers');
    expect(categoryText(null)).toBeNull();
  });
});

describe('línea base de la memoria', () => {
  it('reparte las muestras en proporción y deja primera la alícuota dominante', () => {
    const offers = [
      ...Array.from({ length: 95 }, () => ({ name: 'Motherboard ASUS', ivaBps: 1050 })),
      ...Array.from({ length: 5 }, () => ({ name: 'MB Gigabyte', ivaBps: 2100 })),
      ...Array.from({ length: 10 }, () => ({ name: 'Auricular JBL', ivaBps: 2100 })),
    ];
    const rows = buildIvaBaseline(offers);
    const mother = rows.filter((r) => r.categoryKey === 'mother');
    expect(mother[0]).toEqual({ categoryKey: 'mother', ivaBps: 1050, samples: 29 });
    expect(mother[1]!.ivaBps).toBe(2100);
    expect(rows.find((r) => r.categoryKey === 'auriculares')).toEqual({ categoryKey: 'auriculares', ivaBps: 2100, samples: 30 });
  });
});
