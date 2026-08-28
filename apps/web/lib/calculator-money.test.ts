import {describe, expect, it} from "vitest";
import {formatArs} from "./money";
import {
  applyInterestBps,
  installmentCents,
  planInstallmentCents,
  planTotalCents,
  slugFromLabel,
} from "./calculator-money";

describe("calculadora: mismas fórmulas que presupuestos", () => {
  it("pasa de efectivo a lista y arma cuotas en centavos enteros", () => {
    const cash = 15000000n;
    const list = applyInterestBps(cash, 1300);
    expect(list).toBe(16950000n);
    expect(installmentCents(list, 3, 0)).toBe(5650000n);
    expect(installmentCents(list, 3, 1050)).toBe(6243250n);
  });

  it("13% de $10 es $11, no $13: el % no se acumula con la lista", () => {
    const cash = 1000n;
    const list = applyInterestBps(cash, 1300);
    expect(list).toBe(1130n);
    expect(formatArs(list)).toBe("$ 11");
    expect(planTotalCents(cash, list, 1300)).toBe(1130n);
    expect(formatArs(planTotalCents(cash, list, 1300))).toBe("$ 11");
    expect(planTotalCents(cash, list, 0)).toBe(1130n);
    expect(planInstallmentCents(cash, list, 3, 0)).toBe(377n);
    expect(planInstallmentCents(cash, list, 1, 1300)).toBe(1130n);
    const stacked = applyInterestBps(list, 1300);
    expect(formatArs(stacked)).toBe("$ 13");
    expect(planTotalCents(cash, list, 1300)).not.toBe(stacked);
  });

  it("arma un slug estable para medios nuevos", () => {
    expect(slugFromLabel("Mercado Pago")).toBe("mercado-pago");
    expect(slugFromLabel("  GO CUOTAS  ")).toBe("go-cuotas");
  });
});
