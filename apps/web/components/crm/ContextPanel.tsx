"use client";

import { useEffect, useState } from "react";
import { api, listCrmRequests } from "../../lib/api";
import type { WhatsappConversation } from "../../lib/api";
import type { AuthUser, QuoteRequest } from "../../lib/types";
import { errorMessage } from "../shared";
import { conversationTitle, phoneLabel, relativeTime, windowCountdown, windowProgress } from "./format";
import { IconExternal, IconTrash } from "./icons";

/**
 * Panel de contexto comercial: quién es, en qué estado está la ventana, quién la
 * atiende y qué trabajo comercial tiene abierto. Es el tab "Chat" del panel que
 * la extensión inyectaba en WhatsApp Web, con lugar propio.
 */
export function ContextPanel({
  conversation,
  onAssign,
  onDelete,
}: {
  conversation: WhatsappConversation | null;
  onAssign: (userId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [readyRequests, setReadyRequests] = useState<QuoteRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: AuthUser[] }>("/users")
      .then((response) => setUsers(response.items.filter((user) => user.id)))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setConfirmDelete(false);
    setError(null);
  }, [conversation?.chatKey]);

  useEffect(() => {
    const expiresAt = conversation?.window.expiresAt ?? null;
    setCountdown(windowCountdown(expiresAt));
    const timer = window.setInterval(() => setCountdown(windowCountdown(expiresAt)), 30_000);
    return () => window.clearInterval(timer);
  }, [conversation?.window.expiresAt]);

  // Solicitudes abiertas de este teléfono: el atajo que mostraba el tab de Chat.
  useEffect(() => {
    if (!conversation) { setReadyRequests([]); return; }
    const digits = conversation.chatKey.replace(/^tel:/, "");
    void listCrmRequests()
      .then((all) => setReadyRequests(all.filter((request) => {
        if (request.state === "CERRADA") return false;
        const phone = (request.detectedPhone ?? "").replace(/\D/g, "");
        return Boolean(phone) && (phone.endsWith(digits.slice(-8)) || digits.endsWith(phone.slice(-8)));
      }).slice(0, 4)))
      .catch(() => setReadyRequests([]));
  }, [conversation?.chatKey]);

  if (!conversation) {
    return <aside className="crm-context crm-context-empty" aria-hidden="true" />;
  }

  const progress = windowProgress(conversation.window.expiresAt);

  return (
    <aside className="crm-context">
      <div className="crm-context-block">
        <h2>{conversationTitle(conversation)}</h2>
        <p className="crm-context-phone">{phoneLabel(conversation.chatKey)}</p>
        {conversation.waContactName && conversation.waContactName !== conversation.displayName ? (
          <p className="crm-hint">Perfil de WhatsApp: {conversation.waContactName}</p>
        ) : null}
      </div>

      <div className="crm-context-block">
        <div className="crm-section-label">Ventana de respuesta</div>
        <div className={countdown ? "crm-window-card open" : "crm-window-card closed"}>
          <strong>{countdown ?? "Cerrada"}</strong>
          <p>{conversation.window.description}</p>
          <div className="crm-window-track">
            <div className="crm-window-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="crm-context-block">
        <div className="crm-section-label">Asignada a</div>
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
            <option key={user.id} value={user.id}>{user.displayName || user.username}</option>
          ))}
        </select>
      </div>

      {conversation.activeRequest ? (
        <div className="crm-context-block">
          <div className="crm-section-label">Solicitud activa</div>
          <div className="crm-context-card">
            <strong>{conversation.activeRequest.title}</strong>
            <div className="crm-context-card-meta">
              <span className="crm-tag info">{conversation.activeRequest.state}</span>
            </div>
          </div>
          <a className="crm-link" href="/solicitudes"><IconExternal size={13} /> Ver en Solicitudes</a>
        </div>
      ) : null}

      {readyRequests.length ? (
        <div className="crm-context-block">
          <div className="crm-section-label">Otras solicitudes de este cliente</div>
          {readyRequests.map((request) => (
            <div key={request.id} className="crm-context-card">
              <strong>{request.title}</strong>
              <div className="crm-context-card-meta">
                <span className="crm-tag muted">{request.state}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {conversation.escalatedAt ? (
        <div className="crm-context-block">
          <div className="crm-section-label">Escalada</div>
          <p className="crm-hint">{conversation.escalationReason || "Requiere revisión humana."}</p>
          <p className="crm-hint">Hace {relativeTime(conversation.escalatedAt)}</p>
        </div>
      ) : null}

      <div className="crm-context-block">
        <div className="crm-section-label">Bot</div>
        <p className="crm-hint">
          {conversation.modeOverride === "OFF"
            ? "Apagado para esta conversación."
            : conversation.modeOverride === "AUTO"
              ? "Responde automáticamente."
              : conversation.modeOverride === "SUGGEST"
                ? "Redacta, pero no envía sin tu aprobación."
                : "Usa el modo general configurado."}
        </p>
        <a className="crm-link" href="/configuracion"><IconExternal size={13} /> Configurar el bot</a>
      </div>

      <div className="crm-context-block crm-context-danger">
        {error ? <p className="crm-quotebar-error">{error}</p> : null}
        {confirmDelete ? (
          <>
            <p className="crm-hint">
              Se borra la conversación con todo su historial y la memoria que el bot construyó.
              Las solicitudes y presupuestos no se tocan. No se puede deshacer.
            </p>
            <div className="crm-danger-actions">
              <button
                type="button"
                className="btn-danger btn-sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void onDelete()
                    .catch((reason) => setError(errorMessage(reason)))
                    .finally(() => { setBusy(false); setConfirmDelete(false); });
                }}
              >
                {busy ? "Borrando…" : "Sí, borrar"}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="crm-danger-link" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={14} /> Borrar esta conversación
          </button>
        )}
      </div>
    </aside>
  );
}
