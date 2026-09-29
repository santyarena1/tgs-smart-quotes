/** Períodos YYYYMM de gastos, en zona Argentina. */

const TZ = "America/Argentina/Buenos_Aires";

export function periodFromDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}${month}`;
}

export function currentExpensePeriod(date = new Date()): string {
  return periodFromDate(date);
}

export function shiftExpensePeriod(period: string, months: number): string {
  const year = Number(period.slice(0, 4));
  let month = Number(period.slice(4, 6)) + months;
  let nextYear = year;
  while (month > 12) {
    month -= 12;
    nextYear += 1;
  }
  while (month < 1) {
    month += 12;
    nextYear -= 1;
  }
  return `${nextYear}${String(month).padStart(2, "0")}`;
}

/** Se puede cargar el mes actual y el inmediato siguiente (pagos adelantados). */
export function maxExpensePeriod(date = new Date()): string {
  return shiftExpensePeriod(currentExpensePeriod(date), 1);
}

export function canAdvanceExpensePeriod(period: string, date = new Date()): boolean {
  return period < maxExpensePeriod(date);
}

export const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function expensePeriodLabel(period: string): string {
  const year = period.slice(0, 4);
  const month = Number(period.slice(4, 6));
  return `${MONTH_NAMES[month - 1] ?? ""} ${year}`.trim();
}
