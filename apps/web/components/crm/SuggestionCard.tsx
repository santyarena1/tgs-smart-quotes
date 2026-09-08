"use client";

import { useEffect, useState } from "react";
import type { WhatsappConversation, WhatsappMessage } from "../../lib/api";
import { Alert, errorMessage } from "../shared";
import { IconSend, IconSparkle } from "./icons";

/**
 * Sugerencia del bot pendiente de aprobación (modo SUGGEST).
 *
 * Antes esto se resolvía insertando el texto en el composer de WhatsApp Web y
 * esperando a que el vendedor tocara Enviar, con un observador del DOM tratando de
 * adivinar si había salido. Acá la decisión es explícita: aprobar, editar o descartar.
 */
export function SuggestionCard({
  suggestion,
  conversation,
  onSend,
  onDismiss,
}: {
  suggestion: WhatsappMessage;
  conversation: WhatsappConversation;
  onSend: (logId: string, text: string) => Promise<void>;
  onDismiss: (logId: string) => Promise<void>;
}) {
  const [text, setText] = useState(suggestion.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el bot genera una sugerencia nueva, se muestra esa y no la anterior editada.
  useEffect(() => {
    setText(suggestion.text);
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

  const edited = text.trim() !== suggestion.text.trim();
  const windowOpen = conversation.window.open;

  return (
    <div className="crm-suggestion">
      <div className="crm-suggestion-head">
        <IconSparkle size={15} />
        <strong>El bot sugiere una respuesta</strong>
        {edited ? <span className="crm-tag info">Editada</span> : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {!windowOpen ? (
        <p className="crm-hint">
          La ventana de 24 h está cerrada, así que esta sugerencia ya no se puede enviar como
          texto libre. Podés descartarla y retomar con una plantilla.
        </p>
      ) : null}

      <textarea
        className="crm-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        disabled={busy}
        aria-label="Texto de la sugerencia"
      />

      <div className="crm-suggestion-actions">
        <button
          type="button"
          className="btn-dark"
          disabled={busy || !text.trim() || !windowOpen}
          onClick={() => void run(() => onSend(suggestion.id, text.trim()))}
        >
          <IconSend size={15} /> {busy ? "Enviando…" : edited ? "Enviar editada" : "Aprobar y enviar"}
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
