import { describe, expect, it } from "vitest";
import { diffWebItems, isExtraLineName, warrantyCents } from "./web-quote-check.js";

const now = new Date("2026-11-16T12:00:00Z");
const items = [
  { name: "RYZEN 5 5600", webProductId: 1, priceCents: "20000000" },
  { name: "RTX 4060", webProductId: 2, priceCents: "50000000" },
  { name: "SSD 1TB", webProductId: 3, priceCents: "9000000" },
];

describe("revisión del presupuesto web", () => {
  it("sin cambios no avisa", () => {
    const live = new Map(items.map((i) => [i.webProductId, { id: i.webProductId, priceCents: i.priceCents, inStock: true }]));
    const r = diffWebItems(items, live, now);
    expect(r.alerts).toEqual([]);
    expect(r.priceUpdates.size).toBe(0);
  });

  it("avisa sin stock, ya no publicado y cambio de precio", () => {
    const live = new Map([
      [1, { id: 1, priceCents: "20000000", inStock: false }],
      [2, { id: 2, priceCents: "52000000", inStock: true }],
    ]);
    const r = diffWebItems(items, live, now);
    expect(r.alerts.map((a) => [a.type, a.itemName])).toEqual([
      ["OUT_OF_STOCK", "RYZEN 5 5600"],
      ["PRICE_CHANGED", "RTX 4060"],
      ["NOT_FOUND", "SSD 1TB"],
    ]);
    expect(r.priceUpdates.get(2)).toBe("52000000");
    expect(r.alerts[1]!.message).toContain("$ 500.000");
    expect(r.alerts[1]!.message).toContain("$ 520.000");
  });

  it("la garantía es el 7 % de los componentes, redondeado al peso", () => {
    expect(warrantyCents(100_000_000n)).toBe(7_000_000n);
    expect(warrantyCents(12_345_678n)).toBe(864_200n);
  });

  it("no cuenta armado, garantía ni Windows como componentes", () => {
    expect(isExtraLineName("ARMADO, CONFIGURACION Y PRUEBAS DE RENDIMIENTO")).toBe(true);
    expect(isExtraLineName("GARANTÍA EXTENDIDA TGS")).toBe(true);
    expect(isExtraLineName("LICENCIA WINDOWS 11 PRO")).toBe(true);
    expect(isExtraLineName("RYZEN 5 5600")).toBe(false);
  });
});
