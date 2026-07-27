/** Formatea centavos (string/bigint) a ARS solo para UI. */
export function formatArs(cents: string | number | bigint | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "—";
  let value: bigint;
  try {
    value = typeof cents === "bigint" ? cents : BigInt(String(cents).trim());
  } catch {
    return "—";
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const wholeFmt = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fracFmt = frac.toString().padStart(2, "0");
  return `${negative ? "-" : ""}$ ${wholeFmt},${fracFmt}`;
}

/** Convierte entrada de usuario (ARS o centavos puros) a string de centavos. */
export function parseArsToCents(input: string): string {
  const raw = input.trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!raw) throw new Error("Importe vacío");
  if (/^\d+$/.test(raw)) {
    // Si no hay separador decimal, interpretamos como pesos enteros → centavos
    return (BigInt(raw) * 100n).toString();
  }
  // 1.234,56 o 1234,56 o 1234.56
  let normalized = raw;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Importe inválido. Usá formato 1234,56 o centavos enteros.");
  }
  const parts = normalized.split(".");
  const whole = parts[0] ?? "0";
  const frac = parts[1] ?? "";
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return cents.toString();
}

/** Entrada explícita de centavos (solo dígitos). */
export function parseCentsInput(input: string): string {
  const raw = input.trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error("Los centavos deben ser un entero no negativo.");
  }
  return raw;
}

export function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || Number.isNaN(bps)) return "—";
  return `${(bps / 100).toFixed(2)} %`;
}

/** Centavos → texto editable "1234,56" para inputs de ARS. */
export function centsToInput(cents: string | number | bigint | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "";
  try {
    const v = typeof cents === "bigint" ? cents : BigInt(String(cents).trim());
    const abs = v < 0n ? -v : v;
    return `${v < 0n ? "-" : ""}${abs / 100n},${(abs % 100n).toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}

/** Formatea una entrada de usuario en ARS; devuelve "—" si todavía no es válida. */
export function displayArs(input: string): string {
  try {
    return formatArs(parseArsToCents(input));
  } catch {
    return "—";
  }
}

/** Markup en porcentaje (ej "30" o "30,5") → basis points enteros. */
export function pctToBps(pct: string): number {
  const normalized = pct.trim().replace(",", ".");
  const value = Number(normalized);
  if (!normalized || Number.isNaN(value)) throw new Error("Markup inválido");
  return Math.round(value * 100);
}

export function bpsToPct(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.00$/, "");
}

/** Venta = costo * (1 + markup). Redondeo half-up en centavos. */
export function saleFromCostAndPct(costArs: string, pct: string): string {
  try {
    const cost = BigInt(parseArsToCents(costArs));
    const bps = BigInt(pctToBps(pct));
    const sale = (cost * (10000n + bps) + 5000n) / 10000n;
    return centsToInput(sale);
  } catch {
    return "";
  }
}

/** Markup implícito (en %) a partir de costo y precio de venta. */
export function pctFromCostAndSale(costArs: string, saleArs: string): string {
  try {
    const cost = BigInt(parseArsToCents(costArs));
    if (cost === 0n) return "0";
    const sale = BigInt(parseArsToCents(saleArs));
    const diff = sale - cost;
    const bps = (diff * 10000n * 100n) / cost;
    return (Number(bps) / 10000).toFixed(2).replace(/\.00$/, "");
  } catch {
    return "";
  }
}

/** Subtotal de venta de un ítem, en centavos string. */
export function lineTotalCents(saleArs: string, quantity: string): string {
  try {
    const sale = BigInt(parseArsToCents(saleArs));
    const qty = BigInt(Math.max(0, Math.trunc(Number(quantity) || 0)));
    return (sale * qty).toString();
  } catch {
    return "0";
  }
}

/** Redondea centavos al múltiplo de pesos más cercano (ej. 1000 → $1.000). */
export function roundCentsToPesosStep(cents: string | bigint, stepPesos: number): string {
  const value = typeof cents === "bigint" ? cents : BigInt(String(cents).trim() || "0");
  if (!Number.isFinite(stepPesos) || stepPesos <= 0) return value.toString();
  const step = BigInt(Math.trunc(stepPesos)) * 100n;
  if (step <= 0n) return value.toString();
  const sign = value < 0n ? -1n : 1n;
  const abs = value < 0n ? -value : value;
  return (sign * ((abs + step / 2n) / step) * step).toString();
}

export function centsFieldFromArs(arsInput: string): string {
  return parseArsToCents(arsInput);
}
