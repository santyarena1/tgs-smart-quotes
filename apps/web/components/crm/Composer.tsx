"use client";

import { useMemo, useState } from "react";
import type { WhatsappConversation, WhatsappTemplate } from "../../lib/api";
import { Alert, errorMessage } from "../shared";
import { IconInfo, IconLock, IconSend } from "./icons";

/**
 * Cuadro de escritura del CRM.
 *
 * Cuando la ventana de 24 h está cerrada no desaparece en silencio: en el mismo
 * lugar aparece la explicación y el flujo de plantilla, con vista previa de cómo
 * lo recibe el cliente. El objetivo es que se entienda el porqué, en vez de que
 * Meta devuelva un rechazo sin contexto después de escribir.
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
  const template = approved.find((item) => item.id === templateId) ?? null;
  const windowOpen = conversation.window.open;

  function pickTemplate(id: string) {
    setTemplateId(id);
    const found = approved.find((item) => item.id === id);
    setVariables(found ? Array.from({ length: found.variableCount }, () => "") : []);
  }

  const previewParts = useMemo(() => {
    if (!template) return null;
    // Se parte el cuerpo por los placeholders para poder resaltar los valores.
    return template.body.split(/(\{\{\s*\d+\s*\}\})/g).map((chunk) => {
      const match = chunk.match(/^\{\{\s*(\d+)\s*\}\}$/);
      if (!match) return { text: chunk, filled: false };
      const value = variables[Number(match[1]) - 1];
      return { text: value || chunk, filled: Boolean(value) };
    });
  }, [template, variables]);

  async function submitText() {
    const value = draft.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await onSend({ text: value });
      onDraftChange("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitTemplate() {
    if (!template) return;
    if (variables.some((value) => !value.trim())) {
      setError("Completá todas las variables antes de enviar la plantilla.");
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
        <>
          <div className="crm-composer-text">
            <textarea
              className="crm-textarea"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                // Enter envía, Shift+Enter salta de línea: la convención de todo chat.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitText();
                }
              }}
              placeholder="Escribí un mensaje…"
              rows={2}
              disabled={busy}
            />
            <button type="button" className="crm-send" onClick={() => void submitText()} disabled={busy || !draft.trim()}>
              <IconSend size={15} /> {busy ? "Enviando…" : "Enviar"}
            </button>
          </div>
          {approved.length > 0 ? (
            <details className="crm-template-box">
              <summary>Enviar una plantilla</summary>
              <TemplateForm
                approved={approved}
                template={template}
                templateId={templateId}
                variables={variables}
                previewParts={previewParts}
                busy={busy}
                onPick={pickTemplate}
                onVariable={(index, value) =>
                  setVariables((current) => current.map((item, position) => (position === index ? value : item)))}
                onSubmit={() => void submitTemplate()}
              />
            </details>
          ) : null}
        </>
      ) : (
        <div className="crm-window-blocked">
          <div className="crm-window-blocked-head">
            <IconLock size={19} />
            <div>
              <strong>No se puede escribir libremente</strong>
              <p>
                Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite
                retomar con una plantilla aprobada por Meta.
              </p>
            </div>
          </div>

          {approved.length === 0 ? (
            <p className="crm-hint">
              Todavía no hay plantillas aprobadas. Se cargan y sincronizan en la sección Plantillas.
            </p>
          ) : (
            <>
              <div className="crm-section-label">Retomar con una plantilla</div>
              <TemplateForm
                approved={approved}
                template={template}
                templateId={templateId}
                variables={variables}
                previewParts={previewParts}
                busy={busy}
                onPick={pickTemplate}
                onVariable={(index, value) =>
                  setVariables((current) => current.map((item, position) => (position === index ? value : item)))}
                onSubmit={() => void submitTemplate()}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  approved,
  template,
  templateId,
  variables,
  previewParts,
  busy,
  onPick,
  onVariable,
  onSubmit,
}: {
  approved: WhatsappTemplate[];
  template: WhatsappTemplate | null;
  templateId: string;
  variables: string[];
  previewParts: { text: string; filled: boolean }[] | null;
  busy: boolean;
  onPick: (id: string) => void;
  onVariable: (index: number, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="crm-template-form">
      <select className="crm-select" value={templateId} onChange={(event) => onPick(event.target.value)} aria-label="Plantilla">
        <option value="">Elegí una plantilla…</option>
        {approved.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}{item.usageHint ? ` — ${item.usageHint}` : ""}
          </option>
        ))}
      </select>

      {template && template.variableCount > 0 ? (
        <div className="crm-template-vars">
          {variables.map((value, index) => (
            <label key={index}>
              <span>Variable {index + 1}</span>
              <input
                className="crm-input"
                value={value}
                onChange={(event) => onVariable(index, event.target.value)}
                placeholder={`Valor de {{${index + 1}}}`}
              />
            </label>
          ))}
        </div>
      ) : null}

      {template && previewParts ? (
        <div className="crm-template-preview">
          <div className="crm-section-label">Así lo va a recibir</div>
          <p>
            {previewParts.map((part, index) =>
              part.filled
                ? <strong key={index}>{part.text}</strong>
                : <span key={index}>{part.text}</span>)}
          </p>
        </div>
      ) : null}

      <div className="crm-template-foot">
        <span className="crm-hint">
          <IconInfo size={14} /> Las plantillas de marketing se cobran por conversación.
        </span>
        <button type="button" className="crm-send" onClick={onSubmit} disabled={busy || !template}>
          <IconSend size={15} /> {busy ? "Enviando…" : "Enviar plantilla"}
        </button>
      </div>
    </div>
  );
}
