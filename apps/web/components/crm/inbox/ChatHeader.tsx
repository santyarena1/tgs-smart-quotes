"use client";

import { useEffect, useRef, useState } from "react";
import type { WhatsappConversation } from "../../../lib/api";
import { avatarInitials, conversationTitle, phoneLabel, windowCountdown } from "../format";
import type { CrmViewer } from "../useCrmLive";
import { StatusPill } from "./ChatList";

/** Opciones rápidas para posponer, como en Front/Intercom. */
function snoozeOptions(): Array<{ label: string; at: Date }> {
  const now = new Date();
  const inHours = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
  const at = (days: number, hour: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date;
  };
  const nextMonday = (() => {
    const date = at(1, 10);
    while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
    return date;
  })();
  return [
    { label: "En 1 hora", at: inHours(1) },
    { label: "En 3 horas", at: inHours(3) },
    { label: "Mañana 10:00", at: at(1, 10) },
    { label: "Lunes 10:00", at: nextMonday },
    { label: "En una semana", at: at(7, 10) },
  ];
}

export function ChatHeader({
  conversation,
  viewers,
  meId,
  onRename,
  onTake,
  onRelease,
  onResolve,
  onReopen,
  onSnooze,
  onToggleSide,
  sideOpen,
  onBack,
}: {
  conversation: WhatsappConversation;
  viewers: CrmViewer[];
  meId: string;
  onRename: (name: string | null) => Promise<void>;
  onTake: () => void;
  onRelease: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onSnooze: (until: Date) => void;
  onToggleSide: () => void;
  sideOpen: boolean;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const others = viewers.filter((viewer) => viewer.userId !== meId);
  const countdown = windowCountdown(conversation.window.expiresAt);
  const resolved = conversation.status === "RESOLVED";

  useEffect(() => { setEditing(false); setSnoozeOpen(false); }, [conversation.chatKey]);
  useEffect(() => {
    if (!snoozeOpen) return;
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setSnoozeOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [snoozeOpen]);

  return (
    <header className="cx-chat-head">
      <button type="button" className="cx-back" onClick={onBack} aria-label="Volver a la lista">←</button>
      <span className="cx-avatar lg" aria-hidden="true">{avatarInitials(conversation)}</span>
      <div className="cx-chat-id">
        {editing ? (
          <form
            className="cx-rename"
            onSubmit={(event) => {
              event.preventDefault();
              void onRename(name.trim() || null).then(() => setEditing(false));
            }}
          >
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del cliente" />
            <button type="submit">Guardar</button>
            <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancelar</button>
          </form>
        ) : (
          <button
            type="button"
            className="cx-chat-name"
            title="Editar nombre"
            onClick={() => { setName(conversation.displayName ?? conversation.waContactName ?? ""); setEditing(true); }}
          >
            {conversationTitle(conversation)} <span aria-hidden="true">✎</span>
          </button>
        )}
        <div className="cx-chat-sub">
          <button
            type="button"
            className="cx-copy"
            title="Copiar número"
            onClick={() => void navigator.clipboard?.writeText(phoneLabel(conversation.chatKey))}
          >
            {phoneLabel(conversation.chatKey)}
          </button>
          <StatusPill item={conversation} />
          <span className={conversation.window.open ? "cx-pill ok" : "cx-pill muted"} title={conversation.window.description}>
            ⏱ {conversation.window.open ? countdown : "Ventana cerrada"}
          </span>
          {others.map((viewer) => (
            <span key={viewer.userId} className="cx-pill eye">
              👁 {viewer.name}{viewer.typing ? " escribiendo…" : " está viendo"}
            </span>
          ))}
        </div>
      </div>

      <div className="cx-chat-actions">
        {conversation.bot?.paused || conversation.status === "NEEDS_HUMAN" ? (
          <button type="button" className="cx-btn" onClick={onRelease} title="El bot vuelve a atender este chat desde el próximo mensaje">
            🤖 Devolver al bot
          </button>
        ) : (
          <button type="button" className="cx-btn" onClick={onTake} title="Te lo asignás y el bot deja de responder acá">
            👤 Tomar
          </button>
        )}
        {resolved ? (
          <button type="button" className="cx-btn" onClick={onReopen}>↺ Reabrir</button>
        ) : (
          <button type="button" className="cx-btn primary" onClick={onResolve} title="Resolver (E)">✓ Resolver</button>
        )}
        <div className="cx-menu-wrap" ref={menu}>
          <button type="button" className="cx-btn" onClick={() => setSnoozeOpen(!snoozeOpen)} aria-expanded={snoozeOpen}>
            ⏰ Posponer
          </button>
          {snoozeOpen ? (
            <div className="cx-menu" role="menu">
              {snoozeOptions().map((option) => (
                <button key={option.label} type="button" role="menuitem" onClick={() => { onSnooze(option.at); setSnoozeOpen(false); }}>
                  {option.label}
                  <span>{option.at.toLocaleString("es-AR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              ))}
              <form
                className="cx-menu-custom"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!custom) return;
                  onSnooze(new Date(custom));
                  setSnoozeOpen(false);
                }}
              >
                <input type="datetime-local" value={custom} onChange={(event) => setCustom(event.target.value)} aria-label="Fecha y hora" />
                <button type="submit">OK</button>
              </form>
              <p className="cx-hint">Vuelve antes si el cliente escribe.</p>
            </div>
          ) : null}
        </div>
        <button type="button" className={sideOpen ? "cx-btn icon active" : "cx-btn icon"} onClick={onToggleSide} title="Ficha del cliente (I)">
          ⓘ
        </button>
      </div>
    </header>
  );
}
