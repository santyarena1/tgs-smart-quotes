/** "hace 5 minutos", "ayer", "hace 3 días"… a partir de una fecha ISO. Sin fecha devuelve "nunca". */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "nunca";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 45) return "hace un momento";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** Versión compacta para espacios chicos: "hace 5 min", "hace 3 h", "hace 2 d". */
export function timeAgoShort(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "nunca";
  const abs = Math.abs(new Date(iso).getTime() - now) / 1000;
  if (abs < 45) return "recién";
  if (abs < 3600) return `hace ${Math.round(abs / 60)} min`;
  if (abs < 86400) return `hace ${Math.round(abs / 3600)} h`;
  return `hace ${Math.round(abs / 86400)} d`;
}
