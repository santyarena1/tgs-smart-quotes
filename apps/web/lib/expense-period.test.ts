import {describe, expect, it} from "vitest";
import {
  canAdvanceExpensePeriod,
  currentExpensePeriod,
  expensePeriodLabel,
  maxExpensePeriod,
  shiftExpensePeriod,
} from "./expense-period";

describe("períodos de gastos mensuales", () => {
  it("el mes siguiente de septiembre es octubre", () => {
    expect(shiftExpensePeriod("202609", 1)).toBe("202610");
    expect(shiftExpensePeriod("202612", 1)).toBe("202701");
    expect(expensePeriodLabel("202610")).toBe("octubre 2026");
  });

  it("desde el 29 se puede cargar el mes siguiente, no el de más adelante", () => {
    const hoy = new Date("2026-09-29T18:00:00.000Z");
    expect(currentExpensePeriod(hoy)).toBe("202609");
    expect(maxExpensePeriod(hoy)).toBe("202610");
    expect(canAdvanceExpensePeriod("202609", hoy)).toBe(true);
    expect(canAdvanceExpensePeriod("202610", hoy)).toBe(false);
  });
});
