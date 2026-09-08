"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { WhatsappConversation } from "../../lib/api";
import { relativeTime } from "./format";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  chatPhone: string | null;
  readAt: string | null;
  actedAt: string | null;
  createdAt: string;
};

/**
 * Barra de acciones de la conversación.
 *
 * Porta la barra que la extensión inyectaba arriba de WhatsApp Web: sugerir,
 * solicitud rápida, buscar presupuesto, mandar producto, buscar en la tienda,
 * notificaciones y acceso a la configuración del bot.
 */
export function CrmToolbar({
  conversation,
  suggesting,
  onSuggest,
  onQuickRequest,
  onQuoteSearch,
  onProduct,
  onWebSearch,
}: {
  conversation: WhatsappConversation;
  suggesting: boolean;
  onSuggest: () => void;
  onQuickRequest: () => void;
  onQuoteSearch: () => void;
  onProduct: () => void;
  onWebSearch: () => void;
}) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      // El endpoint ya filtra por chat: no hace falta traer todas y descartar.
      void api<NotificationRow[]>("/notifications", { query: { chatPhone: conversation.chatKey, limit: 20 } })
        .then((rows) => { if (!cancelled) setNotifications(rows); })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [conversation.chatKey]);

  // Solo las de este chat: el resto vive en la vista de Notificaciones del sistema.
  const mine = notifications.filter((item) => !item.actedAt);
  const unread = mine.filter((item) => !item.readAt).length;

  async function markRead(id: string) {
    await api(`/notifications/${encodeURIComponent(id)}/mark`, { method: "POST", body: { read: true } }).catch(() => undefined);
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
  }

  const windowOpen = conversation.window.open;

  return (
    <div className="crm-toolbar">
      <button
        type="button"
        className="crm-toolbar-btn primary"
        onClick={onSuggest}
        disabled={suggesting}
        title="Generar una respuesta con el bot sobre el último mensaje del cliente"
      >
        {suggesting ? "⏳ Generando…" : "✨ Sugerir"}
      </button>
      <button type="button" className="crm-toolbar-btn" onClick={onQuickRequest}>
        ➕ Solicitud
      </button>
      <button type="button" className="crm-toolbar-btn" onClick={onQuoteSearch}>
        🔍 Presupuesto
      </button>
      <button
        type="button"
        className="crm-toolbar-btn"
        onClick={onProduct}
        disabled={!windowOpen}
        title={windowOpen ? "" : "La ventana de 24 h está cerrada"}
      >
        🛒 Producto
      </button>
      <button type="button" className="crm-toolbar-btn" onClick={onWebSearch}>
        🔎 Buscar web
      </button>

      <div className="crm-toolbar-spacer" />

      <div className="crm-bell-wrap">
        <button
          type="button"
          className="crm-toolbar-btn"
          onClick={() => setOpen((value) => !value)}
          aria-label="Notificaciones de este chat"
          aria-expanded={open}
        >
          🔔{unread > 0 ? <span className="crm-bell-dot">{unread}</span> : null}
        </button>
        {open ? (
          <aside className="crm-bell-panel" role="dialog" aria-label="Notificaciones del chat">
            {mine.length === 0 ? (
              <p className="crm-hint">Sin notificaciones para este chat.</p>
            ) : (
              mine.map((item) => (
                <button key={item.id} type="button" className="crm-bell-item" onClick={() => void markRead(item.id)}>
                  <strong>{item.title}</strong>
                  <span className="crm-hint">{item.body}</span>
                  <span className="crm-hint">{relativeTime(item.createdAt)}</span>
                </button>
              ))
            )}
          </aside>
        ) : null}
      </div>

      <a
        className="crm-toolbar-btn"
        href="/configuracion"
        title="Configuración del bot"
      >
        ⚙️
      </a>
    </div>
  );
}
