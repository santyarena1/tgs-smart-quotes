"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WhatsappConversation } from "../../../lib/api";
import { CRM_VIEWS, getCrmInbox, type CrmViewId } from "../../../lib/crm";
import { conversationTitle, phoneLabel } from "../format";

type Command = { id: string; label: string; detail?: string; run: () => void };

/** Paleta Ctrl+K: buscar un chat (también resueltos) o ir a una vista sin tocar el mouse. */
export function CommandPalette({
  open,
  onClose,
  onOpenChat,
  onView,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  onOpenChat: (chatKey: string) => void;
  onView: (view: CrmViewId) => void;
  extra: Command[];
}) {
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<WhatsappConversation[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) { setChats([]); return; }
    const timer = window.setTimeout(() => {
      void Promise.all([
        getCrmInbox({ view: "ALL", q: term, limit: 8 }),
        getCrmInbox({ view: "RESOLVED", q: term, limit: 4 }),
      ])
        .then(([openChats, resolved]) => setChats([...openChats.items, ...resolved.items]))
        .catch(() => setChats([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const commands = useMemo<Command[]>(() => {
    const term = query.trim().toLocaleLowerCase("es-AR");
    const chatCommands = chats.map((chat) => ({
      id: `chat:${chat.chatKey}`,
      label: conversationTitle(chat),
      detail: `${phoneLabel(chat.chatKey)}${chat.status === "RESOLVED" ? " · resuelto" : ""}`,
      run: () => onOpenChat(chat.chatKey),
    }));
    const viewCommands = CRM_VIEWS.map((view) => ({
      id: `view:${view.id}`,
      label: `Ir a: ${view.label}`,
      detail: view.hint,
      run: () => onView(view.id),
    }));
    const others = [...viewCommands, ...extra].filter((command) => !term || command.label.toLocaleLowerCase("es-AR").includes(term));
    return [...chatCommands, ...others].slice(0, 14);
  }, [chats, query, extra, onOpenChat, onView]);

  useEffect(() => setActive(0), [commands.length]);

  if (!open) return null;
  return (
    <div className="cx-palette-backdrop" onMouseDown={onClose}>
      <div className="cx-palette" role="dialog" aria-label="Buscador rápido" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder="Buscar un chat por nombre o número, o escribir una acción…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); onClose(); }
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((active + 1) % Math.max(1, commands.length)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((active - 1 + commands.length) % Math.max(1, commands.length)); }
            if (event.key === "Enter") {
              event.preventDefault();
              const command = commands[active];
              if (command) { command.run(); onClose(); }
            }
          }}
        />
        <ul>
          {commands.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                className={index === active ? "active" : ""}
                onMouseEnter={() => setActive(index)}
                onClick={() => { command.run(); onClose(); }}
              >
                <strong>{command.label}</strong>
                {command.detail ? <span>{command.detail}</span> : null}
              </button>
            </li>
          ))}
          {!commands.length ? <li className="cx-hint">Sin resultados.</li> : null}
        </ul>
        <p className="cx-palette-foot">↑↓ moverse · Enter abrir · Esc cerrar · J/K chat siguiente/anterior · E resolver · I ficha</p>
      </div>
    </div>
  );
}
