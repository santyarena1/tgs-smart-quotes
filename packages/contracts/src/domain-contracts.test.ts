import { describe, expect, it } from "vitest";

import {
  collectionCreateSchema,
  customerCreateSchema,
  pcLineCreateSchema,
  productCreateSchema,
  productImportSchema,
  quoteCreateSchema,
  quoteRetargetSchema,
  quoteStateSchema,
  requestCreateSchema,
} from "./index.js";

describe("contratos del dominio", () => {
  it("acepta dinero como centavos enteros serializados", () => {
    const product = productCreateSchema.parse({
      name: "RTX 5070",
      costCents: "100000",
      markupBps: 3000,
      usesGeneralMarkup: true,
    });

    expect(product.costCents).toBe("100000");
  });

  it("rechaza floats, negativos y notación decimal en dinero", () => {
    expect(() =>
      productCreateSchema.parse({
        name: "RTX 5070",
        costCents: "1000.50",
        markupBps: 3000,
        usesGeneralMarkup: true,
      }),
    ).toThrow();
  });

  it("valida importación y entidades auxiliares", () => {
    expect(
      productImportSchema.parse({
        mode: "skip",
        rows: [
          {
            name: "Ryzen 7",
            costCents: "250000",
            markupBps: 3000,
            usesGeneralMarkup: true,
          },
        ],
      }).rows,
    ).toHaveLength(1);
    expect(customerCreateSchema.parse({ name: "Santiago", phone: "11 5555-1234" }).name).toBe(
      "Santiago",
    );
    expect(
      pcLineCreateSchema.parse({
        name: "Procesador",
        sortOrder: 1,
        aliases: ["CPU"],
        keyLine: true,
        concept: "CPU",
        active: true,
      }).concept,
    ).toBe("CPU");
  });

  it("valida presupuesto, ajuste, estado, colección y solicitud", () => {
    const quote = quoteCreateSchema.parse({
      internalName: "PC gamer julio",
      isBuiltPc: true,
      items: [
        {
          name: "Ryzen 7",
          quantity: 1,
          costCents: "250000",
          markupBps: 3000,
          position: 0,
        },
      ],
    });

    expect(quote.items).toHaveLength(1);
    expect(quoteRetargetSchema.parse({ targetTotalCents: "400000" }).targetTotalCents).toBe(
      "400000",
    );
    expect(quoteStateSchema.parse({ state: "ENVIADO" }).state).toBe("ENVIADO");
    expect(collectionCreateSchema.parse({ name: "PC GAMER" }).visibleInExtension).toBe(true);
    expect(
      requestCreateSchema.parse({
        title: "PC para arquitectura",
        originalText: "",
        requiredComponents: [],
      }).state,
    ).toBe("PENDIENTE");
  });
});
