import {describe, expect, it} from "vitest";
import {
  associatedQuotesOf,
  normalizeCollectionQuote,
  quoteCollectionLabel,
  quotesForCollection,
  quotesMatchingQuery,
} from "./collection-quotes";

const quotes = [
  {id: "a", visibleNumber: "TGS-20260923-0001", internalName: "PC gamer", customerName: "Ana"},
  {id: "b", visibleNumber: "TGS-20260923-0002", internalName: "Oficina", customerName: null},
  {id: "c", visibleNumber: "TGS-20260923-0003", internalName: "Combo teclado", customerName: "Luis"},
];

describe("presupuestos de una colección", () => {
  it("lista solo los asociados, en el orden guardado", () => {
    expect(quotesForCollection(quotes, ["c", "a"]).map((q) => q.id)).toEqual(["c", "a"]);
    expect(quotesForCollection(quotes, ["missing", "b"]).map((q) => q.id)).toEqual(["b"]);
  });

  it("el buscador no ofrece los que ya están y no lista todo si no hay texto", () => {
    expect(quotesMatchingQuery(quotes, "", new Set())).toEqual([]);
    expect(quotesMatchingQuery(quotes, "tgs", new Set(["a"])).map((q) => q.id)).toEqual(["b", "c"]);
    expect(quotesMatchingQuery(quotes, "ana", new Set()).map((q) => q.id)).toEqual(["a"]);
  });

  it("arma la etiqueta con número, nombre y cliente", () => {
    expect(quoteCollectionLabel(quotes[0]!)).toBe("TGS-20260923-0001 · PC gamer (Ana)");
    expect(quoteCollectionLabel(quotes[1]!)).toBe("TGS-20260923-0002 · Oficina");
    expect(quoteCollectionLabel({id: "x", visibleNumber: "", internalName: ""})).toBe("— · Sin nombre");
  });

  it("lee la fila cruda de Prisma sin dejar undefined", () => {
    const raw = {
      collectionId: "col",
      familyId: "a",
      family: {
        id: "a",
        visibleNumber: "TGS-20260923-0001",
        internalName: "PC gamer",
        customer: {name: "Ana"},
      },
    };
    expect(normalizeCollectionQuote(raw)).toEqual({
      id: "a",
      visibleNumber: "TGS-20260923-0001",
      internalName: "PC gamer",
      customerName: "Ana",
    });
    expect(quoteCollectionLabel(normalizeCollectionQuote(raw)!)).toBe(
      "TGS-20260923-0001 · PC gamer (Ana)",
    );
  });

  it("completa nombre y número desde el catálogo si la relación viene vacía", () => {
    const associated = associatedQuotesOf(
      {
        familyIds: ["a", "b"],
        quotes: [
          {familyId: "a", family: {}},
          {id: "b"},
        ],
      },
      quotes,
    );
    expect(associated.map((q) => quoteCollectionLabel(q))).toEqual([
      "TGS-20260923-0001 · PC gamer (Ana)",
      "TGS-20260923-0002 · Oficina",
    ]);
  });
});
