import { describe, expect, it } from "vitest";
import { isValidCuit, normalizeCuit } from "./cuit";

describe("cuit (web)", () => {
  it("valida el dígito verificador", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("30-71234567-8")).toBe(false);
    expect(isValidCuit("123")).toBe(false);
    expect(isValidCuit("")).toBe(false);
  });
  it("acepta guiones y espacios", () => {
    expect(isValidCuit("20 12345678 6")).toBe(true);
    expect(normalizeCuit("20-12345678-6")).toBe("20123456786");
  });
});
