import {describe, expect, it} from "vitest";
import {
  applyDraftCost,
  applyDraftMarkup,
  applyDraftSale,
  itemPricePayload,
  retargetSaleLines,
  sellsBelowCost,
} from "./quote-item-pricing";

const loadedFromSaved = {
  costArs: "100.000",
  markupPct: "30",
  saleArs: "130.000",
  // Al reabrir, el editor entra en modo venta para no perder un redondeo o
  // un ajuste al total. Editar el costo no debe quedar anclado a esa venta.
  priceMode: "sale" as const,
};

describe("precio de ítem: el margen queda fijo al editar el costo", () => {
  it("al cambiar el costo recalcula la venta y no el margen", () => {
    const next = applyDraftCost(loadedFromSaved, "200.000");
    expect(next.markupPct).toBe("30");
    expect(next.saleArs).toBe("260.000");
    expect(next.priceMode).toBe("markup");
    expect(itemPricePayload(next)).toEqual({markupBps: 3000});
  });

  it("si yo cambio el margen, sí se recalcula la venta", () => {
    const next = applyDraftMarkup(loadedFromSaved, "50");
    expect(next.markupPct).toBe("50");
    expect(next.saleArs).toBe("150.000");
    expect(next.priceMode).toBe("markup");
  });

  it("si yo cambio la venta (o uso total objetivo), se deriva el margen", () => {
    const next = applyDraftSale(loadedFromSaved, "110.000");
    expect(next.saleArs).toBe("110.000");
    expect(next.markupPct).toBe("10");
    expect(next.priceMode).toBe("sale");
    expect(itemPricePayload(next)).toEqual({
      markupBps: 0,
      salePriceCents: "11000000",
    });
  });

  it("después de fijar una venta, un costo nuevo usa ese margen y mueve la venta", () => {
    const afterSale = applyDraftSale(loadedFromSaved, "150.000");
    const afterCost = applyDraftCost(afterSale, "200.000");
    expect(afterCost.markupPct).toBe("50");
    expect(afterCost.saleArs).toBe("300.000");
    expect(afterCost.priceMode).toBe("markup");
  });
});

describe("ajuste de total como en LITE", () => {
  it("escala las ventas en proporción y absorbe el residuo en un ítem de cantidad 1", () => {
    const result = retargetSaleLines(
      [
        {...loadedFromSaved, quantity: "1", saleArs: "100.000"},
        {...loadedFromSaved, quantity: "2", saleArs: "50.000"},
      ],
      30000000n,
    );
    expect(result).not.toBeNull();
    expect(result!.reached).toBe(30000000n);
    expect(result!.lines[0]!.saleArs).toBe("150.000");
    expect(result!.lines[1]!.saleArs).toBe("75.000");
  });

  it("marca venta por debajo del costo", () => {
    expect(sellsBelowCost({costArs: "100.000", saleArs: "90.000"})).toBe(true);
    expect(sellsBelowCost({costArs: "100.000", saleArs: "130.000"})).toBe(false);
  });
});
