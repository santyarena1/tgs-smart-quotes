import {describe, expect, it} from "vitest";
import {applyInterestBps, installmentCents, slugFromLabel} from "./calculator-money";

describe("calculadora: mismas fórmulas que presupuestos", () => {
  it("pasa de efectivo a lista y arma cuotas en centavos enteros", () => {
    const cash = 15000000n;
    const list = applyInterestBps(cash, 1300);
    expect(list).toBe(16950000n);
    expect(installmentCents(list, 3, 0)).toBe(5650000n);
    expect(installmentCents(list, 3, 1050)).toBe(6243250n);
  });

  it("arma un slug estable para medios nuevos", () => {
    expect(slugFromLabel("Mercado Pago")).toBe("mercado-pago");
    expect(slugFromLabel("  GO CUOTAS  ")).toBe("go-cuotas");
  });
});
