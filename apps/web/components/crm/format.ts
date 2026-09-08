import type { WhatsappConversation, WhatsappMessage } from "../../lib/api";

export function conversationTitle(conversation: WhatsappConversation): string {
  return conversation.displayName?.trim()
    || conversation.waContactName?.trim()
    || conversation.chatKey.replace(/^tel:/, "+");
}

export function phoneLabel(chatKey: string): string {
  return chatKey.replace(/^tel:/, "+");
}

/** Iniciales para el avatar. Un número queda con sus dos últimos dígitos. */
export function avatarInitials(conversation: WhatsappConversation): string {
  const name = (conversation.displayName || conversation.waContactName || "").trim();
  if (!name || /^\+?\d+$/.test(name)) return conversation.chatKey.replace(/\D/g, "").slice(-2) || "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

/** Cuenta regresiva de la ventana. Se calcula en el cliente para que avance sola. */
export function windowCountdown(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** Porcentaje restante de la ventana, para la barra de progreso del panel. */
export function windowProgress(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.min(100, (remaining / (24 * 60 * 60 * 1000)) * 100));
}

/** Prioridad de una fila de la bandeja: define la barra de color de la izquierda. */
export function rowPriority(conversation: WhatsappConversation): "escalated" | "unread" | "closed" | "none" {
  if (conversation.escalatedAt) return "escalated";
  if (conversation.unreadCount > 0) return "unread";
  if (!conversation.window.open) return "closed";
  return "none";
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d` : new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function clockTime(value: string): string {
  return new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Hoy";
  if (sameDay(date, yesterday)) return "Ayer";
  return date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Estado de entrega de un saliente.
 *
 * Con la extensión esto era una heurística con puntaje de confianza; ahora son las
 * confirmaciones reales que manda Meta en el webhook de `statuses`.
 */
export function deliveryLabel(message: WhatsappMessage): { icon: string; label: string; tone: string } {
  if (message.direction === "INBOUND") return { icon: "", label: "", tone: "" };
  switch (message.status) {
    case "READ":
      return { icon: "✓✓", label: "Leído", tone: "read" };
    case "DELIVERED":
      return { icon: "✓✓", label: "Entregado", tone: "delivered" };
    case "SENT":
      return { icon: "✓", label: "Enviado", tone: "sent" };
    case "SEND_PENDING":
      return { icon: "◷", label: "En cola", tone: "pending" };
    case "SEND_FAILED":
      return { icon: "!", label: message.error || "No se pudo enviar", tone: "failed" };
    case "SUGGESTED":
      return { icon: "✎", label: "Sugerencia sin enviar", tone: "draft" };
    case "ESCALATED":
      return { icon: "⚠", label: "Escalado", tone: "failed" };
    default:
      return { icon: "", label: message.status, tone: "" };
  }
}

export function actorLabel(message: WhatsappMessage): string {
  if (message.direction === "INBOUND") return "Cliente";
  if (message.actor === "BOT") return "Bot";
  if (message.actor === "HUMAN") return "Vos";
  return "Sistema";
}
