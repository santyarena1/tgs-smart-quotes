import { describe, expect, it } from "vitest";
import { checkAcustockToken, mapItem, mapVersion } from "./acustock-export.js";

describe("checkAcustockToken", () => {
  it("sin token configurado la API queda apagada", () => {
    expect(checkAcustockToken("Bearer algo", undefined)).toBe("not_configured");
    expect(checkAcustockToken("Bearer algo", "  ")).toBe("not_configured");
  });
  it("acepta solo el token exacto como Bearer", () => {
    expect(checkAcustockToken("Bearer secreto-123", "secreto-123")).toBe("ok");
    expect(checkAcustockToken("bearer secreto-123", "secreto-123")).toBe("ok");
    expect(checkAcustockToken("Bearer secreto-12", "secreto-123")).toBe("unauthorized");
    expect(checkAcustockToken("secreto-123", "secreto-123")).toBe("unauthorized");
    expect(checkAcustockToken(undefined, "secreto-123")).toBe("unauthorized");
  });
});

const item = {
  id: "i1",
  position: 2,
  frozenName: "MEMORIA RAM 16GB DDR4",
  quantity: 2,
  frozenCostCents: 8_500_000n,
  frozenMarkupBps: 2000,
  frozenSalePriceCents: 10_200_000n,
  subtotalCents: 20_400_000n,
  ivaBps: 2100,
  observation: null,
  webDescription: null,
  webImageUrl: null,
  isPcMainLine: false,
  productId: null,
  line: { id: "l1", name: "Memoria" },
};

describe("mapItem", () => {
  it("devuelve montos en centavos como string y la ganancia de la línea", () => {
    const out = mapItem(item);
    expect(out.unitCostCents).toBe("8500000");
    expect(out.totalCostCents).toBe("17000000");
    expect(out.subtotalCents).toBe("20400000");
    expect(out.profitCents).toBe("3400000");
    expect(out.markupBps).toBe(2000);
    expect(out.line).toEqual({ id: "l1", name: "Memoria" });
  });
});

describe("mapVersion", () => {
  const base = {
    id: "v2",
    version: 2,
    state: "ENVIADO",
    reason: null,
    totalCostCents: 17_000_000n,
    totalSaleCents: 20_400_000n,
    profitCents: 3_400_000n,
    effectiveMarkupBps: 2000,
    publicObservation: null,
    tradeIns: null,
    financingSnapshot: null,
    webMeta: null,
    alertsJson: null,
    sentAt: new Date("2026-11-12T15:00:00Z"),
    expiresAt: null,
    checkedAt: null,
    lastActivityAt: null,
    createdAt: new Date("2026-11-12T14:00:00Z"),
    updatedAt: new Date("2026-11-12T15:00:00Z"),
    creator: { displayName: "Vendedor" },
    items: [{ ...item, id: "b", position: 2 }, { ...item, id: "a", position: 1 }],
    pdfs: [],
  };

  it("marca la versión vigente, ordena los ítems y no expone datos del cliente", () => {
    const out = mapVersion(base, 2);
    expect(out.isActive).toBe(true);
    expect(mapVersion(base, 3).isActive).toBe(false);
    expect(out.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(out.totals).toEqual({ costCents: "17000000", saleCents: "20400000", profitCents: "3400000", markupBps: 2000 });
    expect(out.web).toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/customer|sentMessage/i);
  });
});
