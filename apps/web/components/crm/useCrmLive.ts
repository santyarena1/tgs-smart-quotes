"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

export type CrmViewer = { userId: string; name: string; typing: boolean };

/**
 * Canal en vivo del CRM (SSE en /api/crm/stream).
 *
 * - `onChats(chatKeys)`: esos chats cambiaron (mensaje nuevo, entregado/leído, bot
 *   pausado, asignación…). La pantalla vuelve a leer solo lo que le importa.
 * - `viewers[chatKey]`: quién más está mirando o escribiendo en cada chat.
 * - Avisa la presencia propia (`chatKey` abierto y si estoy escribiendo) con un latido.
 *
 * Si el canal se corta, EventSource reconecta solo; mientras tanto `connected` es
 * false y la pantalla puede caer a una recarga periódica de respaldo.
 */
export function useCrmLive({
  onChats,
  chatKey,
  typing,
}: {
  onChats: (chatKeys: string[]) => void;
  chatKey: string | null;
  typing: boolean;
}) {
  const [connected, setConnected] = useState(false);
  const [viewers, setViewers] = useState<Record<string, CrmViewer[]>>({});
  const onChatsRef = useRef(onChats);
  onChatsRef.current = onChats;

  useEffect(() => {
    const source = new EventSource("/api/crm/stream", { withCredentials: true });
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("chats", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { chatKeys?: string[] };
        if (data.chatKeys?.length) onChatsRef.current(data.chatKeys);
      } catch {
        // Un evento malformado no debe cortar el canal.
      }
    });
    source.addEventListener("presence", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { chatKey: string; viewers: CrmViewer[] };
        setViewers((current) => ({ ...current, [data.chatKey]: data.viewers }));
      } catch {
        // idem
      }
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  // Latido de presencia: al cambiar de chat, al empezar/dejar de escribir y cada 15 s.
  useEffect(() => {
    const beat = () => {
      void api("/crm/presence", { method: "POST", body: { chatKey, typing } }).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 15_000);
    return () => window.clearInterval(timer);
  }, [chatKey, typing]);

  // Al cerrar la pestaña, dejar de figurar en el chat.
  useEffect(() => {
    const leave = () => {
      try {
        navigator.sendBeacon?.("/api/crm/presence", new Blob([JSON.stringify({ chatKey: null, typing: false })], { type: "application/json" }));
      } catch {
        // sin beacon: la presencia vence sola a los 30 s
      }
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);

  return { connected, viewers };
}
