/** Formatea centavos a pesos enteros ARS. Copia de apps/web/lib/money.ts para no acoplar paquetes. */
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
  const pesos = (abs + 50n) / 100n;
  return `${negative ? "-" : ""}$ ${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Alias: el default del sistema es pesos sin centavos. */
export const formatArsWhole = formatArs;

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
