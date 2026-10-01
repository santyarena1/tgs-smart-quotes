"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { WhatsappConversation, WhatsappMessage } from "../../../lib/api";
import { mediaUrl, type CrmNote } from "../../../lib/crm";
import { clockTime, dayLabel, deliveryLabel } from "../format";

type Item =
  | { kind: "message"; at: string; message: WhatsappMessage }
  | { kind: "note"; at: string; note: CrmNote }
  | { kind: "event"; at: string; text: string; tone: "info" | "warn" | "error" };

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

/** Una respuesta del bot sale en varias burbujas: se muestran como las ve el cliente. */
function outboundParts(message: WhatsappMessage): string[] {
  const metadata = message.decisionMetadata ?? {};
  const sent = strings(metadata.sentBubbles);
  if (sent.length) return sent;
  const bubbles = message.actor === "BOT" ? strings(metadata.bubbles) : [];
  return bubbles.length ? bubbles : [message.text];
}

/** Adjuntos que acompañaron a un saliente (el log guarda qué se encoló, no el archivo). */
function outboundAttachments(message: WhatsappMessage): string[] {
  const metadata = message.decisionMetadata ?? {};
  const labels: string[] = [];
  const quote = metadata.quote as { version?: number } | undefined;
  if (quote) labels.push(`PDF del presupuesto V${quote.version ?? ""}`);
  if (typeof metadata.productMpn === "string") labels.push("Foto del producto");
  for (const attachment of (Array.isArray(metadata.attachments) ? metadata.attachments : []) as Array<{
    image?: { url?: string; filename?: string } | null;
    quote?: { visibleNumber?: string; version?: number } | null;
  }>) {
    if (attachment?.image?.url) labels.push(`Imagen ${attachment.image.filename ?? ""}`.trim());
    if (attachment?.quote) labels.push(`PDF ${attachment.quote.visibleNumber ?? "del presupuesto"} V${attachment.quote.version ?? ""}`);
  }
  return labels;
}

function authorOf(message: WhatsappMessage): string {
  if (message.direction === "INBOUND") return "";
  if (message.actor === "BOT") return "🤖 Bot";
  if (message.actor === "HUMAN") {
    const metadata = message.decisionMetadata ?? {};
    if (metadata.approvedByUserId) return "🤖 Bot · aprobado";
    return "👤 Equipo";
  }
  return "Sistema";
}

/** Lo que el cliente mandó y no es texto: foto, audio, video o documento. */
function InboundMedia({ message }: { message: WhatsappMessage }) {
  if (!message.mediaId) return null;
  const mime = message.mediaMimeType ?? "";
  const url = mediaUrl(message.id);
  if (mime.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="cx-media-img">
        <img src={url} alt="Imagen del cliente" loading="lazy" />
      </a>
    );
  }
  if (mime.startsWith("audio/")) return <audio className="cx-media-audio" controls preload="none" src={url} />;
  if (mime.startsWith("video/")) return <video className="cx-media-video" controls preload="none" src={url} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="cx-media-doc">
      📎 {message.mediaFilename ?? "Documento"}
    </a>
  );
}

/** Texto del cliente que en realidad es la etiqueta de un adjunto ("[Imagen recibida]"). */
function isPlaceholder(text: string) {
  return /^\[(Imagen recibida|Documento recibido.*|Mensaje de audio sin transcripción|tipo_no_soportado.*)\]$/.test(text.trim());
}

export function Thread({
  conversation,
  messages,
  notes,
  loading,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onDeleteNote,
  meId,
}: {
  conversation: WhatsappConversation;
  messages: WhatsappMessage[];
  notes: CrmNote[];
  loading: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onDeleteNote: (id: string) => void;
  meId: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const previousHeight = useRef(0);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const message of messages) {
      // Las sugerencias sin aprobar y las respuestas descartadas no le llegaron al cliente.
      if (message.status === "SUGGESTED" || message.status === "DISMISSED") continue;
      if (message.direction === "OUTBOUND" && message.actor === "SYSTEM" && !message.text.trim()) {
        if (message.error) list.push({ kind: "event", at: message.createdAt, text: message.error, tone: "error" });
        continue;
      }
      if (message.status === "ESCALATED") {
        list.push({ kind: "event", at: message.createdAt, text: `Derivado a una persona${message.escalationReason ? `: ${message.escalationReason}` : ""}`, tone: "warn" });
        continue;
      }
      list.push({ kind: "message", at: message.createdAt, message });
    }
    for (const note of notes) list.push({ kind: "note", at: note.createdAt, note });
    if (conversation.bot?.paused && conversation.bot.pausedAt) {
      list.push({
        kind: "event",
        at: conversation.bot.pausedAt,
        text: `${conversation.bot.pausedBy ?? "Un vendedor"} tomó el chat: el bot quedó en pausa`,
        tone: "info",
      });
    }
    return list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [messages, notes, conversation.bot]);

  // Se queda abajo si ya estaba abajo; si cargó mensajes viejos, mantiene la posición.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (previousHeight.current && node.scrollTop < 40 && node.scrollHeight > previousHeight.current) {
      node.scrollTop = node.scrollHeight - previousHeight.current;
    } else if (stickToBottom.current) {
      node.scrollTop = node.scrollHeight;
    }
    previousHeight.current = node.scrollHeight;
  }, [items]);

  useEffect(() => {
    stickToBottom.current = true;
    previousHeight.current = 0;
  }, [conversation.chatKey]);

  let lastDay = "";
  return (
    <div
      className="cx-thread"
      ref={scroller}
      onScroll={(event) => {
        const node = event.currentTarget;
        stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        if (node.scrollTop < 60 && hasOlder && !loadingOlder) onLoadOlder();
      }}
    >
      {hasOlder ? (
        <button type="button" className="cx-older" onClick={onLoadOlder} disabled={loadingOlder}>
          {loadingOlder ? "Cargando…" : "Ver mensajes anteriores"}
        </button>
      ) : null}
      {loading && !items.length ? <p className="cx-empty">Cargando conversación…</p> : null}
      {!loading && !items.length ? <p className="cx-empty">Todavía no hay mensajes en esta conversación.</p> : null}

      {items.map((item) => {
        const day = dayLabel(item.at);
        const showDay = day !== lastDay;
        lastDay = day;
        const key = item.kind === "message" ? item.message.id : item.kind === "note" ? item.note.id : `${item.at}-${item.text}`;
        return (
          <div key={key}>
            {showDay ? <div className="cx-day"><span>{day}</span></div> : null}
            {item.kind === "event" ? (
              <div className={`cx-event ${item.tone}`}>{item.text} · {clockTime(item.at)}</div>
            ) : item.kind === "note" ? (
              <div className="cx-note">
                <div className="cx-note-head">
                  <span>🔒 Nota interna · <strong>{item.note.authorName}</strong></span>
                  <span>{clockTime(item.note.createdAt)}</span>
                </div>
                <p>{item.note.body}</p>
                {item.note.authorId === meId ? (
                  <button type="button" className="cx-note-delete" onClick={() => onDeleteNote(item.note.id)} aria-label="Borrar nota">Borrar</button>
                ) : null}
              </div>
            ) : (
              <MessageBubbles message={item.message} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageBubbles({ message }: { message: WhatsappMessage }) {
  const outbound = message.direction === "OUTBOUND";
  const delivery = deliveryLabel(message);
  if (!outbound) {
    const showText = message.text && !(message.mediaId && isPlaceholder(message.text));
    return (
      <div className="cx-bubble-row in">
        <div className="cx-bubble in">
          <InboundMedia message={message} />
          {showText ? <p className="cx-bubble-text">{message.text}</p> : null}
          {!message.mediaId && isPlaceholder(message.text) ? <p className="cx-bubble-text muted">{message.text}</p> : null}
          <span className="cx-bubble-meta">{clockTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }
  const parts = outboundParts(message);
  const attachments = outboundAttachments(message);
  return (
    <div className="cx-bubble-group out">
      <span className="cx-author">{authorOf(message)}</span>
      {parts.map((part, index) => {
        const last = index === parts.length - 1;
        return (
          <div key={index} className="cx-bubble-row out">
            <div className={`cx-bubble out${message.status === "SEND_FAILED" ? " failed" : ""}${message.actor === "BOT" ? " bot" : ""}`}>
              <p className="cx-bubble-text">{part}</p>
              {last ? attachments.map((label) => <p key={label} className="cx-bubble-attach">📎 {label}</p>) : null}
              {last ? (
                <span className="cx-bubble-meta">
                  {clockTime(message.createdAt)}
                  {delivery.icon ? <span className={`cx-tick ${delivery.tone}`} title={delivery.label}>{delivery.icon}</span> : null}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
      {message.status === "SEND_FAILED" && message.error ? <p className="cx-bubble-error">No salió: {message.error}</p> : null}
    </div>
  );
}
