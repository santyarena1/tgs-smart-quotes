"use client";

import { useEffect, useState } from "react";
import type { WhatsappConversation, WhatsappMessage } from "../../lib/api";
import { Alert, errorMessage } from "../shared";
import { IconSend, IconSparkle } from "./icons";

type DraftAttachment = {
  image?: { url?: string; filename?: string } | null;
  quote?: { visibleNumber?: string; version?: number } | null;
};

/** Las burbujas que redactó el bot; las sugerencias viejas solo tienen el texto unido. */
function draftBubbles(suggestion: WhatsappMessage): string[] {
  const bubbles = suggestion.decisionMetadata?.bubbles;
  if (Array.isArray(bubbles)) {
    const clean = bubbles.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (clean.length) return clean;
  }
  return [suggestion.text];
}

/** Lo que sale además del texto: adjuntos de la respuesta configurada y el seguimiento. */
function draftExtras(suggestion: WhatsappMessage): string[] {
  const metadata = suggestion.decisionMetadata ?? {};
  const extras: string[] = [];
  for (const attachment of (Array.isArray(metadata.attachments) ? metadata.attachments : []) as DraftAttachment[]) {
    if (attachment?.image?.url) extras.push(`Imagen ${attachment.image.filename ?? ""}`.trim());
    if (attachment?.quote) extras.push(`PDF ${attachment.quote.visibleNumber ?? "del presupuesto"} V${attachment.quote.version ?? ""}`.trim());
  }
  if (typeof metadata.quoteFollowupMessage === "string" && metadata.quoteFollowupMessage.trim()) {
    extras.push("Mensaje de seguimiento del presupuesto");
  }
  return extras;
}

/**
 * Sugerencia del bot pendiente de aprobación (modo SUGGEST).
 *
 * Cada burbuja se edita por separado y sale como un mensaje propio, con las mismas
 * demoras y adjuntos que usa el modo automático.
 */
export function SuggestionCard({
  suggestion,
  conversation,
  onSend,
  onDismiss,
}: {
  suggestion: WhatsappMessage;
  conversation: WhatsappConversation;
  onSend: (logId: string, messages: string[]) => Promise<void>;
  onDismiss: (logId: string) => Promise<void>;
}) {
  const [bubbles, setBubbles] = useState<string[]>(() => draftBubbles(suggestion));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el bot genera una sugerencia nueva, se muestra esa y no la anterior editada.
  useEffect(() => {
    setBubbles(draftBubbles(suggestion));
    setError(null);
  }, [suggestion.id, suggestion.text]);

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

  const clean = bubbles.map((item) => item.trim()).filter(Boolean);
  const original = draftBubbles(suggestion).map((item) => item.trim());
  const edited = clean.join("\n") !== original.join("\n");
  const windowOpen = conversation.window.open;
  const extras = draftExtras(suggestion);

  return (
    <div className="crm-suggestion">
      <div className="crm-suggestion-head">
        <IconSparkle size={15} />
        <strong>
          El bot sugiere {clean.length > 1 ? `${clean.length} mensajes` : "una respuesta"}
        </strong>
        {edited ? <span className="crm-tag info">Editada</span> : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {!windowOpen ? (
        <p className="crm-hint">
          La ventana de 24 h está cerrada, así que esta sugerencia ya no se puede enviar como
          texto libre. Podés descartarla y retomar con una plantilla.
        </p>
      ) : null}

      <div className="crm-suggestion-bubbles">
        {bubbles.map((bubble, index) => (
          <div className="crm-suggestion-bubble" key={index}>
            <span className="crm-suggestion-bubble-index">{index + 1}</span>
            <textarea
              className="crm-textarea"
              value={bubble}
              onChange={(event) => setBubbles(bubbles.map((item, i) => (i === index ? event.target.value : item)))}
              rows={Math.min(4, Math.max(1, Math.ceil(bubble.length / 90)))}
              disabled={busy}
              aria-label={`Mensaje ${index + 1} de la sugerencia`}
            />
            {bubbles.length > 1 ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={busy}
                aria-label={`Quitar mensaje ${index + 1}`}
                onClick={() => setBubbles(bubbles.filter((_, i) => i !== index))}
              >
                ×
              </button>
            ) : <span />}
          </div>
        ))}
      </div>

      {extras.length ? (
        <div className="crm-suggestion-extras">
          <span className="crm-hint">También se envía:</span>
          {extras.map((extra) => <span key={extra} className="crm-tag violet">{extra}</span>)}
        </div>
      ) : null}

      <div className="crm-suggestion-actions">
        <button
          type="button"
          className="btn-dark"
          disabled={busy || !clean.length || !windowOpen}
          onClick={() => void run(() => onSend(suggestion.id, clean))}
        >
          <IconSend size={15} /> {busy ? "Enviando…" : edited ? "Enviar editada" : "Aprobar y enviar"}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy || bubbles.length >= 10}
          onClick={() => setBubbles([...bubbles, ""])}
        >
          + Mensaje
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy}
          onClick={() => void run(() => onDismiss(suggestion.id))}
        >
          Descartar
        </button>
        {suggestion.escalationReason ? (
          <span className="crm-hint">{suggestion.escalationReason}</span>
        ) : null}
      </div>
    </div>
  );
}
