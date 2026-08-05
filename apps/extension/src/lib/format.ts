/** Formatea centavos (string/bigint) a ARS. Copia mínima de apps/web/lib/money.ts para no acoplar paquetes. */
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

/** Precio comercial sin centavos, redondeado al peso y con miles argentinos. */
export function formatArsWhole(cents:string|number|bigint|null|undefined):string{
  if(cents===null||cents===undefined||cents==="")return"—";
  try{
    const value=typeof cents==="bigint"?cents:BigInt(String(cents).trim());
    const negative=value<0n,absolute=negative?-value:value;
    const pesos=(absolute+50n)/100n;
    return`${negative?"-":""}$ ${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g,".")}`;
  }catch{return"—"}
}

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
