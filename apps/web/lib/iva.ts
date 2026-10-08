import { api } from "./api";

/** IVA general; es lo que lleva un ítem hasta que la memoria o NODO sugieren otra alícuota. */
export const DEFAULT_IVA_PCT = "21";
export const IVA_PRESETS = ["21", "10.5", "0", "27"];

export type IvaSuggestion = { ivaBps: number; categoryKey: string; categoryLabel: string; samples: number };

/** 1050 -> "10.5" */
export const ivaPctFromBps = (bps: number): string => String(bps / 100);

/** "10,5" -> 1050. NaN si no es un número. */
export const ivaBpsFromPct = (pct: string): number => Math.round(Number(pct.replace(",", ".")) * 100);

export const isValidIvaPct = (pct: string): boolean => {
  const bps = ivaBpsFromPct(pct);
  return pct.trim() !== "" && Number.isFinite(bps) && bps >= 0 && bps <= 10000;
};

const cache = new Map<string, Promise<IvaSuggestion | null>>();

/** Alícuota que la memoria de IVA sugiere para un producto según su categoría (null si no la conoce). */
export function fetchIvaSuggestion(name: string): Promise<IvaSuggestion | null> {
  const key = name.trim().toLowerCase();
  if (key.length < 2) return Promise.resolve(null);
  let hit = cache.get(key);
  if (!hit) {
    hit = api<{ suggestion: IvaSuggestion | null }>("/iva/suggest", { query: { name: name.trim() } })
      .then((res) => res.suggestion)
      .catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

/** Enseña a la memoria lo que se eligió a mano al presupuestar. Nunca interrumpe el flujo. */
export function teachIva(items: Array<{ name: string; ivaBps: number }>): void {
  if (!items.length) return;
  void api("/iva/learn", { method: "POST", body: { items: items.slice(0, 200) } }).catch(() => undefined);
}
