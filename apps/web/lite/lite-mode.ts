/** Modo de la interfaz: "lite" (solo presupuestos y colecciones) o "full" (suite completa).
 *  El arranque (`/`) siempre abre full; LITE se elige a mano con el interruptor. */
const KEY = "tgs.mode";

export type UiMode = "lite" | "full";

export function readUiMode(): UiMode {
  try {
    return window.localStorage.getItem(KEY) === "lite" ? "lite" : "full";
  } catch {
    return "full";
  }
}

export function saveUiMode(mode: UiMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* sin storage: el modo dura hasta recargar */
  }
}
