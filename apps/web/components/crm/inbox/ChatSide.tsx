"use client";

import { useEffect, useState } from "react";
import { listCrmRequests, type WhatsappConversation } from "../../../lib/api";
import type { TeamMember } from "../../../lib/crm";
import type { QuoteRequest } from "../../../lib/types";
import { errorMessage } from "../../shared";
import { conversationTitle, phoneLabel, relativeTime } from "../format";
import { LeadPanel } from "./LeadPanel";

type BotMode = "OFF" | "SUGGEST" | "AUTO" | null;

export function ChatSide({
  conversation,
  team,
  knownTags,
  onAssign,
  onTags,
  onBotMode,
  onAlwaysOn,
  onDelete,
  onTagFilter,
  canDelete,
  onLeadChanged,
}: {
  conversation: WhatsappConversation;
  team: TeamMember[];
  knownTags: string[];
  onAssign: (userId: string | null) => Promise<void>;
  onTags: (tags: string[]) => Promise<void>;
  onBotMode: (mode: BotMode) => Promise<void>;
  onAlwaysOn: (alwaysOn: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onTagFilter: (tag: string) => void;
  canDelete: boolean;
  onLeadChanged: () => Promise<void>;
}) {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tags = conversation.tags ?? [];

  useEffect(() => {
    setConfirmDelete(false);
    setError(null);
    setTagDraft("");
    const digits = conversation.chatKey.replace(/^tel:/, "");
    void listCrmRequests()
      .then((all) => setRequests(all.filter((request) => {
        if (request.state === "CERRADA") return false;
        const phone = (request.detectedPhone ?? "").replace(/\D/g, "");
        return Boolean(phone) && (phone.endsWith(digits.slice(-8)) || digits.endsWith(phone.slice(-8)));
      }).slice(0, 5)))
      .catch(() => setRequests([]));
  }, [conversation.chatKey]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, "").toLocaleLowerCase("es-AR");
    if (!tag || tags.includes(tag)) { setTagDraft(""); return; }
    setTagDraft("");
    void run(() => onTags([...tags, tag]));
  }

  const tagSuggestions = knownTags.filter((tag) => !tags.includes(tag) && (!tagDraft || tag.includes(tagDraft.toLocaleLowerCase("es-AR")))).slice(0, 6);

  return (
    <aside className="cx-side" aria-label="Ficha del cliente">
      {error ? <p className="cx-reply-error">{error}</p> : null}

      <section className="cx-side-block">
        <h3>{conversationTitle(conversation)}</h3>
        <p className="cx-side-line">{phoneLabel(conversation.chatKey)}</p>
        {conversation.waContactName && conversation.waContactName !== conversation.displayName ? (
          <p className="cx-hint">Perfil de WhatsApp: {conversation.waContactName}</p>
        ) : null}
        <p className="cx-hint">Último mensaje {relativeTime(conversation.lastMessageAt ?? conversation.lastInboundAt) || "—"}</p>
      </section>

      {conversation.isTrainer ? (
        <section className="cx-side-block">
          <h4>Entrenador</h4>
          <p className="cx-hint">Este número entrena al bot: lo que escribe acá no se atiende como cliente. Lo que enseña queda para aprobar en Entrenamiento.</p>
          <a className="cx-link" href="/crm/entrenamiento">Ir a Entrenamiento →</a>
        </section>
      ) : (
        <LeadPanel conversation={conversation} onChanged={onLeadChanged} />
      )}

      <section className="cx-side-block">
        <h4>Asignado a</h4>
        <select
          value={conversation.assignedUser?.id ?? ""}
          disabled={busy}
          onChange={(event) => void run(() => onAssign(event.target.value || null))}
          aria-label="Vendedor asignado"
        >
          <option value="">Sin asignar</option>
          {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </section>

      <section className="cx-side-block">
        <h4>Etiquetas</h4>
        <div className="cx-tags">
          {tags.map((tag) => (
            <span key={tag} className="cx-tag">
              <button type="button" className="cx-tag-name" onClick={() => onTagFilter(tag)} title="Ver todos los chats con esta etiqueta">#{tag}</button>
              <button type="button" aria-label={`Quitar ${tag}`} onClick={() => void run(() => onTags(tags.filter((item) => item !== tag)))}>×</button>
            </span>
          ))}
        </div>
        <input
          value={tagDraft}
          disabled={busy}
          placeholder="Agregar etiqueta y Enter"
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(tagDraft); } }}
        />
        {tagSuggestions.length ? (
          <div className="cx-tags suggestions">
            {tagSuggestions.map((tag) => (
              <button key={tag} type="button" className="cx-tag ghost" onClick={() => addTag(tag)}>+ #{tag}</button>
            ))}
          </div>
        ) : null}
      </section>

      {conversation.activeRequest || requests.length ? (
        <section className="cx-side-block">
          <h4>Solicitudes</h4>
          {conversation.activeRequest ? (
            <a className="cx-side-card" href="/solicitudes">
              <strong>{conversation.activeRequest.title}</strong>
              <span className="cx-pill">{conversation.activeRequest.state}</span>
            </a>
          ) : null}
          {requests.filter((request) => request.id !== conversation.activeRequest?.id).map((request) => (
            <a key={request.id} className="cx-side-card" href="/solicitudes">
              <strong>{request.title}</strong>
              <span className="cx-pill muted">{request.state}</span>
            </a>
          ))}
        </section>
      ) : null}

      <section className="cx-side-block">
        <h4>Bot en este chat</h4>
        <select
          value={conversation.modeOverride ?? ""}
          disabled={busy}
          onChange={(event) => void run(() => onBotMode((event.target.value || null) as BotMode))}
          aria-label="Modo del bot en esta conversación"
        >
          <option value="">Como el modo general</option>
          <option value="AUTO">Automático</option>
          <option value="SUGGEST">Solo sugerir</option>
          <option value="OFF">Apagado</option>
        </select>
        <label className="cx-check" title="El bot contesta aunque el local esté cerrado">
          <input
            type="checkbox"
            checked={Boolean(conversation.alwaysOn)}
            disabled={busy}
            onChange={(event) => void run(() => onAlwaysOn(event.target.checked))}
          />{" "}
          Responde siempre (ignora el horario)
        </label>
        {conversation.escalationReason ? <p className="cx-hint">Derivado: {conversation.escalationReason}</p> : null}
        <a className="cx-link" href="/configuracion?tab=chatbot">Configurar el bot →</a>
      </section>

      {canDelete ? (
        <section className="cx-side-block danger">
          {confirmDelete ? (
            <>
              <p className="cx-hint">Se borra la conversación con todo su historial y la memoria del bot. Las solicitudes y presupuestos no se tocan. No se puede deshacer.</p>
              <div className="cx-row-actions">
                <button type="button" className="cx-btn danger" disabled={busy} onClick={() => void run(onDelete)}>Sí, borrar</button>
                <button type="button" className="cx-btn" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <button type="button" className="cx-link danger" onClick={() => setConfirmDelete(true)}>Borrar esta conversación</button>
          )}
        </section>
      ) : null}
    </aside>
  );
}
