"use client";

import { useState } from "react";
import { addSalesRule, addStyleExample, type WhatsappMessage } from "../../../lib/api";
import { errorMessage } from "../../shared";

type Trace = {
  source?: string;
  sourceLabel?: string;
  scriptName?: string | null;
  decisionReason?: string | null;
  customerMessage?: string | null;
  recentMessages?: Array<{direction?: string; text?: string}>;
  summary?: string | null;
  adName?: string | null;
  systemData?: string | null;
  prompt?: string | null;
  userPrompt?: string | null;
  model?: string | null;
  usedAi?: boolean;
};

function traceOf(message: WhatsappMessage): Trace | null {
  const raw = message.decisionMetadata?.replyTrace;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Trace;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Este mensaje lo escribió el bot (o se aprobó una sugerencia suya). */
export function explainsBot(message: WhatsappMessage): boolean {
  if (message.direction !== "OUTBOUND") return false;
  const meta = message.decisionMetadata ?? {};
  if (meta.manual === true && !meta.replyTrace && !meta.decisionReason) return false;
  return message.actor === "BOT" || Boolean(meta.replyTrace) || Boolean(meta.decisionReason) || Boolean(meta.approvedByUserId);
}

function draftRule(customer: string, bubble: string): string {
  const text = customer
    ? `Cuando el cliente dice "${customer}", contestá: "${bubble}".`
    : `Contestá: "${bubble}".`;
  return text.slice(0, 2000);
}

function styleLine(customer: string, corrected: string): string {
  const answer = corrected.trim().slice(0, 700);
  const who = customer.trim().slice(0, 700) || "…";
  const line = `Cliente: "${who}" → Fede: "${answer}"`;
  return line.length <= 1500 ? line : `${line.slice(0, 1499)}"`;
}

export function MessageInspect({
  message,
  bubble,
  onClose,
}: {
  message: WhatsappMessage;
  bubble: string;
  onClose: () => void;
}) {
  const trace = traceOf(message);
  const meta = message.decisionMetadata ?? {};
  const customer = trace?.customerMessage?.trim() || "";
  const reason = trace?.decisionReason?.trim() || textOf(meta.decisionReason) || message.escalationReason || "";
  const sourceLabel = trace?.sourceLabel?.trim() || (message.actor === "BOT" ? "Respuesta del bot" : "Respuesta aprobada");
  const fixed = trace?.source === "charla" || trace?.source === "saludo";
  const recent = (trace?.recentMessages ?? []).filter((item) => item.text?.trim());
  const [showPrompt, setShowPrompt] = useState(false);
  const [rule, setRule] = useState(() => draftRule(customer, bubble));
  const [confirmRule, setConfirmRule] = useState(false);
  const [corrected, setCorrected] = useState(bubble);
  const [confirmExample, setConfirmExample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveRule() {
    setBusy(true);
    setError(null);
    try {
      await addSalesRule(rule.trim());
      setNotice("Regla guardada. Se aplica en el próximo mensaje que arme la IA.");
      setConfirmRule(false);
    } catch (reasonCaught) {
      setError(errorMessage(reasonCaught));
    } finally {
      setBusy(false);
    }
  }

  async function saveExample() {
    setBusy(true);
    setError(null);
    try {
      await addStyleExample(styleLine(customer || "…", corrected));
      setNotice("Ejemplo guardado. La IA lo va a tener en cuenta en los próximos mensajes.");
      setConfirmExample(false);
    } catch (reasonCaught) {
      setError(errorMessage(reasonCaught));
    } finally {
      setBusy(false);
    }
  }

  const probar = customer ? `/crm/entrenamiento?probar=${encodeURIComponent(customer.slice(0, 300))}` : "/crm/entrenamiento";

  return (
    <div className="cx-why-backdrop" onClick={onClose}>
      <div className="cx-why" role="dialog" aria-label="Por qué salió este mensaje" onClick={(event) => event.stopPropagation()}>
        <div className="cx-why-head">
          <h2>Este mensaje</h2>
          <button type="button" className="cx-why-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <p className="cx-why-quote">{bubble}</p>

        <section>
          <h3>Por qué</h3>
          <p>{sourceLabel}{trace?.model ? ` · ${trace.model}` : ""}</p>
          {reason ? <p>{reason}</p> : <p className="cx-hint">Este mensaje no guardó el motivo. Los próximos sí lo van a guardar.</p>}
          {fixed ? (
            <p className="cx-hint">Está escrito fijo y sale tal cual, sin IA. Una regla nueva no cambia este texto: la usa la IA en los mensajes que no son fijos.</p>
          ) : null}
        </section>

        <section>
          <h3>Qué miró</h3>
          {customer ? <p><strong>Cliente:</strong> {customer}</p> : <p className="cx-hint">No quedó guardado el mensaje del cliente para esta respuesta.</p>}
          {recent.length ? (
            <ul className="cx-why-list">
              {recent.map((item, index) => (
                <li key={index}>{item.direction === "OUTBOUND" ? "Fede" : "Cliente"}: {item.text}</li>
              ))}
            </ul>
          ) : null}
          {trace?.summary ? <p><strong>Memoria:</strong> {trace.summary}</p> : null}
          {trace?.adName ? <p><strong>Anuncio:</strong> {trace.adName}</p> : null}
          {trace?.systemData ? (
            <details>
              <summary>Datos del sistema que tenía a mano</summary>
              <pre>{trace.systemData}</pre>
            </details>
          ) : null}
        </section>

        <section>
          <h3>Prompt</h3>
          {trace?.prompt ? (
            <>
              <button type="button" className="cx-btn" onClick={() => setShowPrompt(!showPrompt)}>
                {showPrompt ? "Ocultar prompt" : "Ver prompt"}
              </button>
              {showPrompt ? (
                <>
                  <pre>{trace.prompt}</pre>
                  {trace.userPrompt ? <pre>{trace.userPrompt}</pre> : null}
                </>
              ) : null}
            </>
          ) : (
            <p className="cx-hint">{trace?.usedAi === false || fixed ? "No usó un prompt: no pasó por la IA." : "El prompt de este mensaje no quedó guardado."}</p>
          )}
        </section>

        <section>
          <h3>Regla nueva</h3>
          <textarea rows={4} value={rule} maxLength={2000} onChange={(event) => { setRule(event.target.value); setConfirmRule(false); }} />
          <div className="cx-why-actions">
            {confirmRule ? (
              <>
                <button type="button" disabled={busy || !rule.trim()} onClick={() => void saveRule()}>Confirmar y guardar</button>
                <button type="button" className="cx-btn" disabled={busy} onClick={() => setConfirmRule(false)}>Cancelar</button>
              </>
            ) : (
              <button type="button" disabled={!rule.trim()} onClick={() => setConfirmRule(true)}>Guardar esta regla</button>
            )}
          </div>
        </section>

        <section>
          <h3>Corregir este mensaje</h3>
          <textarea rows={3} value={corrected} maxLength={1200} onChange={(event) => { setCorrected(event.target.value); setConfirmExample(false); }} />
          <div className="cx-why-actions">
            {confirmExample ? (
              <>
                <button type="button" disabled={busy || !corrected.trim() || corrected.trim() === bubble.trim()} onClick={() => void saveExample()}>Confirmar ejemplo</button>
                <button type="button" className="cx-btn" disabled={busy} onClick={() => setConfirmExample(false)}>Cancelar</button>
              </>
            ) : (
              <button type="button" disabled={!corrected.trim() || corrected.trim() === bubble.trim()} onClick={() => setConfirmExample(true)}>Guardar como ejemplo</button>
            )}
            <a className="cx-link" href={probar}>Probar este mensaje</a>
          </div>
        </section>

        {notice ? <p className="cx-notice">{notice}</p> : null}
        {error ? <p className="cx-reply-error">{error}</p> : null}
      </div>
    </div>
  );
}
