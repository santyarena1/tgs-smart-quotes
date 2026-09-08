"use client";

import { useMemo, useState } from "react";
import type { WhatsappConversation, WhatsappTemplate } from "../../lib/api";
import { Alert, errorMessage } from "../shared";

/**
 * Cuadro de escritura del CRM.
 *
 * Reemplaza al composer de WhatsApp Web que la extensión manipulaba con el puente
 * Lexical. Al ser propio, desaparecen la protección del texto humano y el rastreo
 * del envío manual: acá el envío lo hace el sistema y se registra directo.
 *
 * La ventana de 24 h decide qué se puede mandar, y se bloquea en la UI antes de
 * intentar el envío para que el operador entienda por qué, en vez de recibir un
 * rechazo de Meta sin contexto.
 */
export function Composer({
  conversation,
  templates,
  draft,
  onDraftChange,
  onSend,
  onRecontact,
}: {
  conversation: WhatsappConversation;
  templates: WhatsappTemplate[];
  /** El texto vive en el contenedor para que otras acciones —como pegar el
   *  enlace de una búsqueda en la tienda— puedan escribir en el cuadro. */
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (body: { text?: string; templateId?: string; templateVariables?: string[] }) => Promise<void>;
  onRecontact: (templateId: string, variables: string[]) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approved = useMemo(
    () => templates.filter((template) => template.status === "APPROVED"),
    [templates],
  );
  const text = draft;
  const setText = onDraftChange;
  const template = approved.find((item) => item.id === templateId) ?? null;
  const windowOpen = conversation.window.open;

  function pickTemplate(id: string) {
    setTemplateId(id);
    const found = approved.find((item) => item.id === id);
    setVariables(found ? Array.from({ length: found.variableCount }, () => "") : []);
  }

  const preview = template
    ? template.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index) => variables[Number(index) - 1] || `{{${index}}}`)
    : "";

  async function submitText() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await onSend({ text: value });
      setText("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitTemplate() {
    if (!template) return;
    if (variables.some((value) => !value.trim())) {
      setError("Completá todas las variables de la plantilla antes de enviarla.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Fuera de ventana el envío cuenta como recontacto: respeta topes y opt-out.
      if (windowOpen) await onSend({ templateId: template.id, templateVariables: variables });
      else await onRecontact(template.id, variables);
      setTemplateId("");
      setVariables([]);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-composer">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {windowOpen ? (
        <div className="crm-composer-text">
          <textarea
            className="crm-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter envía, Shift+Enter hace salto de línea: la convención de todo chat.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitText();
              }
            }}
            placeholder="Escribí un mensaje… (Enter para enviar, Shift+Enter para saltar de línea)"
            rows={3}
            disabled={busy}
          />
          <button type="button" className="btn-dark" onClick={() => void submitText()} disabled={busy || !text.trim()}>
            {busy ? "Enviando…" : "Enviar"}
          </button>
        </div>
      ) : (
        <div className="crm-window-blocked">
          <strong>La ventana de 24 h está cerrada.</strong>
          <p>
            WhatsApp no permite mandar texto libre después de 24 h sin respuesta del cliente.
            Para retomar la conversación hay que usar una plantilla aprobada por Meta.
          </p>
        </div>
      )}

      <details className="crm-template-box" open={!windowOpen}>
        <summary>{windowOpen ? "Enviar una plantilla" : "Retomar con una plantilla"}</summary>
        {approved.length === 0 ? (
          <p className="crm-hint">
            No hay plantillas aprobadas todavía. Se cargan y sincronizan desde la sección Plantillas.
          </p>
        ) : (
          <div className="crm-template-form">
            <select
              className="crm-select"
              value={templateId}
              onChange={(event) => pickTemplate(event.target.value)}
              aria-label="Plantilla"
            >
              <option value="">Elegí una plantilla…</option>
              {approved.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.usageHint ? `— ${item.usageHint}` : ""}
                </option>
              ))}
            </select>

            {template && template.variableCount > 0 ? (
              <div className="crm-template-vars">
                {variables.map((value, index) => (
                  <input
                    key={index}
                    className="crm-input"
                    value={value}
                    onChange={(event) => setVariables((current) =>
                      current.map((item, position) => (position === index ? event.target.value : item)))}
                    placeholder={`Variable {{${index + 1}}}`}
                    aria-label={`Variable ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}

            {template ? <p className="crm-template-preview">{preview}</p> : null}

            <button
              type="button"
              className="btn-dark"
              onClick={() => void submitTemplate()}
              disabled={busy || !template}
            >
              {busy ? "Enviando…" : "Enviar plantilla"}
            </button>
          </div>
        )}
      </details>
    </div>
  );
}
