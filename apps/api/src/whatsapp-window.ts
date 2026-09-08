/**
 * Ventana de servicio al cliente de 24 h.
 *
 * Meta solo permite texto libre mientras el cliente escribió hace menos de 24 h.
 * Pasado ese plazo, únicamente se pueden enviar plantillas aprobadas: cualquier
 * otra cosa es rechazada. Como la extensión no tenía esta restricción, es la única
 * barrera realmente nueva del sistema.
 *
 * El criterio es bloquear ANTES de intentar el envío: nunca mandamos a Meta algo
 * que sabemos que va a fallar.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export type WindowState = {
  open: boolean;
  expiresAt: Date | null;
  /** Milisegundos restantes; 0 si está cerrada. */
  remainingMs: number;
};

export function windowFromInbound(lastInboundAt: Date | null | undefined): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + WINDOW_MS) : null;
}

export function windowState(expiresAt: Date | null | undefined, now = new Date()): WindowState {
  if (!expiresAt) return {open: false, expiresAt: null, remainingMs: 0};
  const remainingMs = expiresAt.getTime() - now.getTime();
  return {open: remainingMs > 0, expiresAt, remainingMs: Math.max(0, remainingMs)};
}

/** Texto para la UI. Se prefiere el dato crudo en la API y el formateo acá. */
export function describeWindow(state: WindowState): string {
  if (!state.expiresAt) return 'El cliente todavía no escribió: solo se puede iniciar con una plantilla aprobada.';
  if (!state.open) return 'La ventana de 24 h venció: solo se puede enviar una plantilla aprobada.';
  const hours = Math.floor(state.remainingMs / 3_600_000);
  const minutes = Math.floor((state.remainingMs % 3_600_000) / 60_000);
  return hours > 0
    ? `Quedan ${hours} h ${minutes} min de ventana para responder con texto libre.`
    : `Quedan ${minutes} min de ventana para responder con texto libre.`;
}
