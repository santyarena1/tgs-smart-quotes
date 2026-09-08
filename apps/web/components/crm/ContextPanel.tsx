"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { WhatsappConversation } from "../../lib/api";
import type { AuthUser } from "../../lib/types";
import { conversationTitle, relativeTime } from "./format";

/**
 * Panel de contexto comercial: quién es, qué solicitud tiene abierta y a quién
 * está asignada la conversación. Es el equivalente al tab "Chat" del panel que la
 * extensión inyectaba dentro de WhatsApp Web, ahora con lugar propio.
 */
export function ContextPanel({
  conversation,
  onAssign,
}: {
  conversation: WhatsappConversation | null;
  onAssign: (userId: string | null) => Promise<void>;
}) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ items: AuthUser[] }>("/users")
      .then((response) => setUsers(response.items.filter((user) => user.id)))
      .catch(() => setUsers([]));
  }, []);

  if (!conversation) {
    return <aside className="crm-context crm-context-empty" aria-hidden="true" />;
  }

  return (
    <aside className="crm-context">
      <div className="crm-context-block">
        <h2>{conversationTitle(conversation)}</h2>
        <p className="crm-context-phone">{conversation.chatKey.replace(/^tel:/, "+")}</p>
        {conversation.waContactName && conversation.waContactName !== conversation.displayName ? (
          <p className="crm-hint">Perfil de WhatsApp: {conversation.waContactName}</p>
        ) : null}
      </div>

      <div className="crm-context-block">
        <h3>Ventana de conversación</h3>
        <p className={conversation.window.open ? "crm-window open" : "crm-window closed"}>
          {conversation.window.description}
        </p>
      </div>

      <div className="crm-context-block">
        <h3>Asignada a</h3>
        <select
          className="crm-select"
          value={conversation.assignedUser?.id ?? ""}
          disabled={busy}
          onChange={(event) => {
            setBusy(true);
            void onAssign(event.target.value || null).finally(() => setBusy(false));
          }}
          aria-label="Vendedor asignado"
        >
          <option value="">Sin asignar</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName || user.username}
            </option>
          ))}
        </select>
      </div>

      {conversation.activeRequest ? (
        <div className="crm-context-block">
          <h3>Solicitud activa</h3>
          <p className="crm-context-strong">{conversation.activeRequest.title}</p>
          <p className="crm-hint">Estado: {conversation.activeRequest.state}</p>
          <a className="crm-link" href="/solicitudes">Ver en Solicitudes →</a>
        </div>
      ) : null}

      {conversation.escalatedAt ? (
        <div className="crm-context-block">
          <h3>Escalada</h3>
          <p className="crm-hint">{conversation.escalationReason || "Requiere revisión humana."}</p>
          <p className="crm-hint">Hace {relativeTime(conversation.escalatedAt)}</p>
        </div>
      ) : null}

      <div className="crm-context-block">
        <h3>Bot</h3>
        <p className="crm-hint">
          {conversation.modeOverride === "OFF"
            ? "Apagado para esta conversación."
            : conversation.modeOverride === "AUTO"
              ? "Responde automáticamente."
              : conversation.modeOverride === "SUGGEST"
                ? "Solo sugiere; no envía solo."
                : "Usa el modo general configurado."}
        </p>
        <a className="crm-link" href="/configuracion">Configurar el bot →</a>
      </div>
    </aside>
  );
}
