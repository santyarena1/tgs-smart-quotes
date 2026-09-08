"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { WhatsappConversation } from "../../lib/api";
import { relativeTime } from "./format";
import { IconBell, IconCart, IconDocument, IconGear, IconGlobe, IconPlus, IconSparkle } from "./icons";

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
 * Una sola acción principal —Sugerir respuesta— y el resto en secundario, para
 * que se lea qué se espera que hagas. La versión de la extensión eran siete
 * botones del mismo peso con emojis.
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
  const bellRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const pending = notifications.filter((item) => !item.actedAt);
  const unread = pending.filter((item) => !item.readAt).length;

  async function markRead(id: string) {
    await api(`/notifications/${encodeURIComponent(id)}/mark`, { method: "POST", body: { read: true } })
      .catch(() => undefined);
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
  }

  const windowOpen = conversation.window.open;

  return (
    <div className="crm-toolbar">
      <button type="button" className="crm-toolbar-btn primary" onClick={onSuggest} disabled={suggesting}>
        <IconSparkle size={15} />
        {suggesting ? "Generando…" : "Sugerir respuesta"}
      </button>

      <span className="crm-toolbar-sep" aria-hidden="true" />

      <button type="button" className="crm-toolbar-btn" onClick={onQuickRequest}>
        <IconPlus size={15} /> Solicitud
      </button>
      <button type="button" className="crm-toolbar-btn" onClick={onQuoteSearch}>
        <IconDocument size={15} /> Presupuesto
      </button>
      <button
        type="button"
        className="crm-toolbar-btn"
        onClick={onProduct}
        disabled={!windowOpen}
        title={windowOpen ? "" : "La ventana de 24 h está cerrada"}
      >
        <IconCart size={15} /> Producto
      </button>
      <button type="button" className="crm-toolbar-btn" onClick={onWebSearch}>
        <IconGlobe size={15} /> Tienda
      </button>

      <span className="crm-toolbar-spacer" />

      <div className="crm-bell-wrap" ref={bellRef}>
        <button
          type="button"
          className="crm-toolbar-btn only-icon"
          onClick={() => setOpen((value) => !value)}
          aria-label={`Notificaciones de este chat${unread ? ` (${unread} sin leer)` : ""}`}
          aria-expanded={open}
        >
          <IconBell size={16} />
          {unread > 0 ? <span className="crm-bell-dot">{unread}</span> : null}
        </button>
        {open ? (
          <div className="crm-menu wide" role="dialog" aria-label="Notificaciones del chat">
            {pending.length === 0 ? (
              <p className="crm-hint crm-menu-empty">Sin notificaciones para este chat.</p>
            ) : (
              pending.map((item) => (
                <button key={item.id} type="button" className="crm-bell-item" onClick={() => void markRead(item.id)}>
                  <strong>{item.title}</strong>
                  <span className="crm-hint">{item.body}</span>
                  <span className="crm-hint">{relativeTime(item.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <a className="crm-toolbar-btn only-icon" href="/configuracion" title="Configuración del bot" aria-label="Configuración del bot">
        <IconGear size={16} />
      </a>
    </div>
  );
}
