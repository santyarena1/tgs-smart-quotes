import { describe, expect, it } from "vitest";

import {
  collectionCreateSchema,
  customerCreateSchema,
  obligationCreateSchema,
  pcLineCreateSchema,
  productCreateSchema,
  productImportSchema,
  quoteCreateSchema,
  quoteSearchSchema,
  quoteRetargetSchema,
  quoteStateSchema,
  requestCreateSchema,
  calculatorConfigInputSchema,
  navItemIdSchema,
  expenseCreateSchema,
  expensePaymentSchema,
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

  it("acepta deudas de la empresa al empleado o del empleado a la empresa", () => {
    expect(
      obligationCreateSchema.parse({
        kind: "OTHER",
        direction: "COMPANY_OWES",
        originalAmountCents: "1500000",
      }).direction,
    ).toBe("COMPANY_OWES");
    expect(
      obligationCreateSchema.parse({
        kind: "ADVANCE",
        originalAmountCents: "50000",
      }).direction,
    ).toBeUndefined();
    expect(() =>
      obligationCreateSchema.parse({
        kind: "OTHER",
        direction: "COMPANY_OWES",
        originalAmountCents: "10.5",
      }),
    ).toThrow();
  });

  it("acepta la config de la calculadora y el ítem de navegación", () => {
    expect(navItemIdSchema.parse("calculadora")).toBe("calculadora");
    expect(
      calculatorConfigInputSchema.parse({
        groups: [
          {
            key: "bbva",
            label: "BBVA",
            kind: "PLAN",
            plans: [{installments: 3, interestBps: 0}],
          },
        ],
      }).groups,
    ).toHaveLength(1);
  });

  it("en el alta de un gasto acepta monto, pagado y período del mes siguiente", () => {
    expect(expenseCreateSchema.parse({ name: "Alquiler" }).paid).toBe(false);
    expect(
      expenseCreateSchema.parse({
        name: "Alquiler",
        amountCents: "35000000",
        paid: true,
        period: "202610",
      }),
    ).toMatchObject({ amountCents: "35000000", paid: true, period: "202610" });
    expect(() => expenseCreateSchema.parse({ name: "Alquiler", paid: true })).toThrow();
    expect(expensePaymentSchema.parse({ amountCents: "100", paid: true }).paid).toBe(true);
  });

  it("en la búsqueda isBuiltPc=false queda en falso", () => {
    expect(quoteSearchSchema.parse({ isBuiltPc: "false" }).isBuiltPc).toBe(false);
    expect(quoteSearchSchema.parse({ isBuiltPc: "0" }).isBuiltPc).toBe(false);
    expect(quoteSearchSchema.parse({ isBuiltPc: "true" }).isBuiltPc).toBe(true);
    expect(quoteSearchSchema.parse({ isBuiltPc: "1" }).isBuiltPc).toBe(true);
    expect(quoteSearchSchema.parse({ isBuiltPc: false }).isBuiltPc).toBe(false);
    expect(quoteSearchSchema.parse({}).isBuiltPc).toBeUndefined();
  });
});
