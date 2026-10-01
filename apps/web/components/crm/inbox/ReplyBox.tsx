"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WhatsappConversation, WhatsappTemplate } from "../../../lib/api";
import type { QuickReply, TeamMember } from "../../../lib/crm";
import { errorMessage } from "../../shared";
import { conversationTitle, windowCountdown } from "../format";

type Mode = "reply" | "note";

/** Reemplaza las variables de una respuesta rápida con datos del chat. */
function fillQuickReply(body: string, conversation: WhatsappConversation): string {
  const fullName = conversationTitle(conversation);
  const firstName = /^\+?\d/.test(fullName) ? "" : fullName.split(/\s+/)[0] ?? "";
  return body.replace(/\{nombre\}/gi, firstName).replace(/\s+([!?.,])/g, "$1");
}

/** Palabra que se está escribiendo justo antes del cursor ("/env", "@lu"). */
function tokenBeforeCursor(text: string, caret: number): { start: number; token: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|\s)([/@][^\s/@]*)$/);
  if (!match || match.index === undefined) return null;
  const token = match[2] ?? "";
  return { start: before.length - token.length, token };
}

export function ReplyBox({
  conversation,
  templates,
  quickReplies,
  team,
  draft,
  onDraft,
  onSendText,
  onSendTemplate,
  onAddNote,
  onSuggest,
  suggesting,
  actions,
}: {
  conversation: WhatsappConversation;
  templates: WhatsappTemplate[];
  quickReplies: QuickReply[];
  team: TeamMember[];
  draft: string;
  onDraft: (value: string) => void;
  onSendText: (text: string) => Promise<void>;
  onSendTemplate: (templateId: string, variables: string[]) => Promise<void>;
  onAddNote: (body: string, mentions: string[]) => Promise<void>;
  onSuggest: () => void;
  suggesting: boolean;
  actions: Array<{ id: string; label: string; icon: string; onClick: () => void; title?: string }>;
}) {
  const [mode, setMode] = useState<Mode>("reply");
  const [note, setNote] = useState("");
  const [mentions, setMentions] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [templateOpen, setTemplateOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const windowOpen = conversation.window.open;
  const value = mode === "reply" ? draft : note;
  const setValue = mode === "reply" ? onDraft : setNote;

  useEffect(() => {
    setError(null);
    setTemplateOpen(!windowOpen && conversation.lastInboundAt !== null);
  }, [conversation.chatKey, windowOpen, conversation.lastInboundAt]);

  // Crece con el texto, hasta un tope.
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [value, mode]);

  const token = tokenBeforeCursor(value, caret);
  const suggestions = useMemo(() => {
    if (!token) return [];
    const term = token.token.slice(1).toLocaleLowerCase("es-AR");
    if (token.token.startsWith("/") && mode === "reply") {
      return quickReplies
        .filter((item) => item.shortcut.includes(term) || item.title.toLocaleLowerCase("es-AR").includes(term))
        .slice(0, 6)
        .map((item) => ({ id: item.id, label: `/${item.shortcut}`, detail: item.title, kind: "quick" as const, item }));
    }
    if (token.token.startsWith("@") && mode === "note") {
      return team
        .filter((member) => member.name.toLocaleLowerCase("es-AR").includes(term) || member.username.includes(term))
        .slice(0, 6)
        .map((member) => ({ id: member.id, label: `@${member.name}`, detail: member.role === "ADMIN" ? "Administrador" : "Vendedor", kind: "mention" as const, member }));
    }
    return [];
  }, [token, quickReplies, team, mode]);

  useEffect(() => setPick(0), [suggestions.length]);

  function applySuggestion(index: number) {
    const chosen = suggestions[index];
    if (!chosen || !token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(caret);
    const insert = chosen.kind === "quick" ? fillQuickReply(chosen.item.body, conversation) : `@${chosen.member.name} `;
    const next = `${before}${insert}${after}`;
    setValue(next);
    if (chosen.kind === "mention") setMentions((current) => current.some((item) => item.id === chosen.member.id) ? current : [...current, chosen.member]);
    const position = before.length + insert.length;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  }

  async function submit() {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "reply") {
        await onSendText(text);
        onDraft("");
      } else {
        const used = mentions.filter((member) => text.includes(`@${member.name}`)).map((member) => member.id);
        await onAddNote(text, used);
        setNote("");
        setMentions([]);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const countdown = windowCountdown(conversation.window.expiresAt);

  return (
    <div className={`cx-reply ${mode}`}>
      <div className="cx-reply-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "reply"} className={mode === "reply" ? "active" : ""} onClick={() => setMode("reply")}>
          Responder
        </button>
        <button type="button" role="tab" aria-selected={mode === "note"} className={mode === "note" ? "active" : ""} onClick={() => setMode("note")}>
          🔒 Nota interna
        </button>
        <span className="cx-reply-window" title={conversation.window.description}>
          {windowOpen ? `⏱ ${countdown ?? ""} para responder libre` : "⏱ Ventana cerrada: solo plantillas"}
        </span>
      </div>

      {error ? <p className="cx-reply-error">{error}</p> : null}

      {mode === "reply" && !windowOpen ? (
        <TemplatePicker templates={templates} onSend={onSendTemplate} conversation={conversation} />
      ) : (
        <div className="cx-reply-box">
          {suggestions.length ? (
            <ul className="cx-suggest" role="listbox">
              {suggestions.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === pick}
                    className={index === pick ? "active" : ""}
                    onMouseDown={(event) => { event.preventDefault(); applySuggestion(index); }}
                  >
                    <strong>{item.label}</strong> <span>{item.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <textarea
            ref={area}
            className="cx-reply-input"
            rows={1}
            value={value}
            disabled={busy}
            placeholder={mode === "reply"
              ? "Escribí un mensaje…  ( / respuestas rápidas · Enter envía · Shift+Enter salto de línea )"
              : "Nota para el equipo, el cliente no la ve… ( @ para mencionar )"}
            onChange={(event) => { setValue(event.target.value); setCaret(event.target.selectionStart); }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={(event) => {
              if (suggestions.length) {
                if (event.key === "ArrowDown") { event.preventDefault(); setPick((pick + 1) % suggestions.length); return; }
                if (event.key === "ArrowUp") { event.preventDefault(); setPick((pick - 1 + suggestions.length) % suggestions.length); return; }
                if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); applySuggestion(pick); return; }
                if (event.key === "Escape") { event.preventDefault(); setCaret(-1); return; }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <button type="button" className="cx-send" onClick={() => void submit()} disabled={busy || !value.trim()}>
            {busy ? "…" : mode === "reply" ? "Enviar" : "Guardar nota"}
          </button>
        </div>
      )}

      {mode === "reply" ? (
        <div className="cx-reply-actions">
          <button type="button" className="cx-action primary" onClick={onSuggest} disabled={suggesting} title="El bot redacta una respuesta para que la revises">
            ✨ {suggesting ? "Pensando…" : "Sugerir respuesta"}
          </button>
          {actions.map((action) => (
            <button key={action.id} type="button" className="cx-action" onClick={action.onClick} title={action.title ?? action.label}>
              {action.icon} {action.label}
            </button>
          ))}
          {windowOpen && templates.some((item) => item.status === "APPROVED") ? (
            <button type="button" className="cx-action" onClick={() => setTemplateOpen(!templateOpen)}>📄 Plantilla</button>
          ) : null}
        </div>
      ) : null}
      {mode === "reply" && windowOpen && templateOpen ? (
        <TemplatePicker templates={templates} onSend={onSendTemplate} conversation={conversation} />
      ) : null}
    </div>
  );
}

function TemplatePicker({
  templates,
  onSend,
  conversation,
}: {
  templates: WhatsappTemplate[];
  onSend: (templateId: string, variables: string[]) => Promise<void>;
  conversation: WhatsappConversation;
}) {
  const approved = templates.filter((item) => item.status === "APPROVED");
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const template = approved.find((item) => item.id === templateId) ?? null;

  useEffect(() => { setTemplateId(""); setVariables([]); setError(null); }, [conversation.chatKey]);

  if (!approved.length) {
    return (
      <div className="cx-template">
        <p className="cx-hint">
          {conversation.window.open
            ? "No hay plantillas aprobadas todavía."
            : "Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo deja retomar con una plantilla aprobada, y todavía no hay ninguna. Se cargan en Plantillas."}
        </p>
      </div>
    );
  }

  const preview = template?.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => variables[Number(index) - 1] || match);

  return (
    <div className="cx-template">
      {!conversation.window.open ? (
        <p className="cx-hint">Pasaron más de 24 h desde el último mensaje del cliente: para retomar, WhatsApp exige una plantilla aprobada.</p>
      ) : null}
      {error ? <p className="cx-reply-error">{error}</p> : null}
      <select
        value={templateId}
        onChange={(event) => {
          const found = approved.find((item) => item.id === event.target.value);
          setTemplateId(event.target.value);
          setVariables(found ? Array.from({ length: found.variableCount }, () => "") : []);
        }}
        aria-label="Plantilla"
      >
        <option value="">Elegí una plantilla…</option>
        {approved.map((item) => (
          <option key={item.id} value={item.id}>{item.name}{item.usageHint ? ` — ${item.usageHint}` : ""}</option>
        ))}
      </select>
      {variables.map((value, index) => (
        <input
          key={index}
          value={value}
          placeholder={`Variable {{${index + 1}}}`}
          onChange={(event) => setVariables(variables.map((item, position) => (position === index ? event.target.value : item)))}
        />
      ))}
      {preview ? <p className="cx-template-preview">{preview}</p> : null}
      <div className="cx-template-foot">
        <span className="cx-hint">Las plantillas de marketing tienen costo en Meta.</span>
        <button
          type="button"
          className="cx-send"
          disabled={busy || !template || variables.some((value) => !value.trim())}
          onClick={async () => {
            if (!template) return;
            setBusy(true);
            setError(null);
            try {
              await onSend(template.id, variables);
              setTemplateId("");
              setVariables([]);
            } catch (reason) {
              setError(errorMessage(reason));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Enviando…" : "Enviar plantilla"}
        </button>
      </div>
    </div>
  );
}
