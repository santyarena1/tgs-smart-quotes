import {describe, expect, it} from "vitest";
import {madeKinds, quoteKind} from "./quote-kinds";
import {getQuoteItems, type Quote} from "./types";

describe("tipos de PDF en el listado", () => {
  it("el último PDF define el tipo visible; sin PDF se ve Normal", () => {
    expect(quoteKind(undefined)).toBe("SIMPLE");
    expect(quoteKind([])).toBe("SIMPLE");
    expect(
      quoteKind([
        {kind: "SIMPLE", createdAt: "2026-10-01T10:00:00.000Z"},
        {kind: "FORMAL", createdAt: "2026-10-02T10:00:00.000Z"},
      ]),
    ).toBe("FORMAL");
  });

  it("lista todos los tipos generados aunque el payload sea el liviano de búsqueda", () => {
    const pdfs = [
      {kind: "DETALLADO" as const, createdAt: "2026-10-02T10:00:00.000Z"},
      {kind: "SIMPLE" as const, createdAt: "2026-10-01T10:00:00.000Z"},
    ];
    expect(madeKinds(pdfs).map(([kind]) => kind)).toEqual(["SIMPLE", "DETALLADO"]);
  });
});

describe("ítems del listado con payload liviano", () => {
  it("arma el nombre de producto desde frozenName (búsqueda no manda el ítem completo)", () => {
    const quote = {
      id: "q1",
      visibleNumber: "TGS-1",
      internalName: "PC",
      activeVersion: 1,
      version: {
        version: 1,
        items: [{frozenName: "Ryzen 5 5600", quantity: 2, frozenSalePriceCents: "100000", position: 0}],
        pdfs: [{kind: "SIMPLE", createdAt: "2026-10-01T10:00:00.000Z"}],
      },
    } as unknown as Quote;
    const items = getQuoteItems(quote);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("Ryzen 5 5600");
    expect(items[0]?.quantity).toBe(2);
  });
});
