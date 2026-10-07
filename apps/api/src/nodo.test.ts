import { describe, expect, it } from "vitest";
import { costWithIva, effectiveProviderIds, mapOffer, resolveNodoCredentials } from "./nodo-mapping.js";

const offer = {
  id: "off_1",
  provider: { id: "prv_1", name: "Proveedor 11" },
  sku: "CBO-AMD-073",
  stock: { quantity: 10, status: "in_stock" },
  price: {
    currency: "USD" as const,
    cost: {
      net: 251.86,
      taxes: [
        { type: "iva", amount: 26.45 },
        { type: "perception", amount: 7.56 },
      ],
      gross: 285.87,
    },
  },
  freshness: { stale: false },
  product: { name: "Combo Ecovision Amd Ryzen 5600G + Mother + 8Gb", brand: { name: "ECOVISION" } },
};

describe("nodo", () => {
  it("costo + IVA suma el IVA y no las percepciones", () => {
    const c = costWithIva(offer.price.cost)!;
    expect(c.net).toBeCloseTo(251.86);
    expect(c.withIva).toBeCloseTo(278.31);
  });

  it("pasa USD a pesos con la cotización de la key", () => {
    const r = mapOffer(offer, 1545)!;
    expect(r.costIvaCents).toBe(String(Math.round(278.31 * 1545 * 100)));
    expect(r.originalCurrency).toBe("USD");
    expect(r.providerName).toBe("Proveedor 11");
    expect(r.inStock).toBe(true);
  });

  it("si la key ya viene en pesos no convierte", () => {
    const ars = { ...offer, price: { ...offer.price, currency: "ARS" as const, cost: { net: 100000, taxes: [{ type: "iva", amount: 10500 }] } } };
    const r = mapOffer(ars, 1545)!;
    expect(r.costIvaCents).toBe("11050000");
    expect(r.fxRate).toBe(1);
  });

  it("ignora ofertas sin costo (key sin costo visible)", () => {
    expect(mapOffer({ ...offer, price: { currency: "USD" as const } }, 1545)).toBeNull();
  });
});

describe("distribuidores desactivados", () => {
  const all = ["a", "b", "c"];
  it("sin pedir ninguno y sin nada apagado no restringe", () => {
    expect(effectiveProviderIds([], all, new Set())).toBeNull();
  });
  it("sin pedir ninguno, busca solo en los activos", () => {
    expect(effectiveProviderIds([], all, new Set(["b"]))).toEqual(["a", "c"]);
  });
  it("lo pedido se recorta a los activos", () => {
    expect(effectiveProviderIds(["a", "b"], all, new Set(["b"]))).toEqual(["a"]);
  });
  it("si todo lo pedido está apagado no hay dónde buscar", () => {
    expect(effectiveProviderIds(["b"], all, new Set(["b"]))).toEqual([]);
  });
  it("ignora ids que no existen", () => {
    expect(effectiveProviderIds(["zzz"], all, new Set())).toEqual([]);
  });
});

describe("credenciales de NODO", () => {
  it("usa NODO_API_KEY y NODO_API_SECRET", () => {
    expect(resolveNodoCredentials({ NODO_API_KEY: " k ", NODO_API_SECRET: "s" })).toEqual({ key: "k", secret: "s" });
  });
  it("acepta también los nombres API_KEY_NODO y API_SECRET_NODO", () => {
    expect(resolveNodoCredentials({ API_KEY_NODO: "k", API_SECRET_NODO: "s" })).toEqual({ key: "k", secret: "s" });
  });
  it("si falta alguna devuelve null", () => {
    expect(resolveNodoCredentials({ NODO_API_KEY: "k" })).toBeNull();
    expect(resolveNodoCredentials({ NODO_API_KEY: "", NODO_API_SECRET: "s" })).toBeNull();
    expect(resolveNodoCredentials({})).toBeNull();
  });
});
