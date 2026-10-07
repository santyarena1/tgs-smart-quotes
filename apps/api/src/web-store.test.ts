import { describe, expect, it } from "vitest";
import { decodeEntities, mapWooProduct } from "./web-store-mapping.js";

describe("tienda web", () => {
  it("decodifica las entidades HTML de los nombres", () => {
    expect(decodeEntities("PC GAMER &#8211; RYZEN 5 &amp; RTX")).toBe("PC GAMER – RYZEN 5 & RTX");
  });

  it("el precio viene en centavos y se conserva", () => {
    const r = mapWooProduct({ id: 7, name: "VGA RTX 5060", sku: "IC_GV", permalink: "https://x/p/", is_in_stock: true, prices: { price: "109300000", currency_minor_unit: 2 } })!;
    expect(r.priceCents).toBe("109300000");
    expect(r.sku).toBe("IC_GV");
    expect(r.inStock).toBe(true);
  });

  it("convierte otras unidades menores a centavos", () => {
    expect(mapWooProduct({ id: 1, name: "X", prices: { price: "1500", currency_minor_unit: 0 } })!.priceCents).toBe("150000");
  });

  it("ignora productos sin precio", () => {
    expect(mapWooProduct({ id: 2, name: "Sin precio", prices: { price: "" } })).toBeNull();
    expect(mapWooProduct({ id: 3, name: "Cero", prices: { price: "0" } })).toBeNull();
  });
});
