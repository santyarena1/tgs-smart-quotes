"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import "./quote-chat.css";

/** Globo flotante de chat con la IA. Su ÚNICO contexto es el resumen del presupuesto que recibe en `context`:
 *  el servidor no le da acceso a nada más. La conversación vive solo en esta pantalla (no se guarda). */
type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

const SUGGESTIONS = [
  { icon: "🎮", text: "¿Qué rendimiento da en juegos?" },
  { icon: "🧩", text: "¿Es todo compatible?" },
  { icon: "⚡", text: "¿Alcanza la fuente?" },
  { icon: "🔍", text: "¿Hay algún cuello de botella?" },
  { icon: "💬", text: "Explicáselo al cliente en 3 líneas" },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 6 ? "¡Buenas madrugadas!" : h < 13 ? "¡Buen día!" : h < 20 ? "¡Buenas tardes!" : "¡Buenas noches!";
}

/** Muestra la respuesta como si se escribiera (solo la más nueva; el resto aparece completo). */
function Typewriter({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate || n >= text.length) return;
    const t = window.setTimeout(() => setN((v) => Math.min(text.length, v + Math.max(2, Math.ceil(text.length / 90)))), 16);
    return () => window.clearTimeout(t);
  }, [n, animate, text]);
  return <>{renderText(text.slice(0, n))}{n < text.length ? <span className="qc-caret" aria-hidden="true" /> : null}</>;
}

/** Negritas (**x**), viñetas y saltos de línea; lo demás se muestra como texto plano. */
function renderText(text: string): ReactNode {
  const inline = (line: string, key: number) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part,
    );
  return text.split("\n").map((raw, i) => {
    const bullet = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(raw);
    if (bullet) return <div className="qc-li" key={i}><span aria-hidden="true">•</span><span>{inline(bullet[1] ?? "", i)}</span></div>;
    return raw.trim() ? <p key={i}>{inline(raw, i)}</p> : null;
  });
}

export function QuoteChatBubble({ context, hasItems }: { context: string; hasItems: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy, open]);
  useEffect(() => { if (open) { setUnread(false); window.setTimeout(() => inputRef.current?.focus(), 260); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: "user" as const, content: question }];
    setMsgs((prev) => [...prev, { role: "user", content: question }]);
    setText("");
    setBusy(true);
    try {
      const { reply } = await api<{ reply: string }>("/quotes/ai-chat", {
        method: "POST",
        body: { context: contextRef.current, messages: history.slice(-12).map(({ role, content }) => ({ role, content })) },
      });
      setMsgs((prev) => [...prev, { role: "assistant", content: reply }]);
      if (!open) setUnread(true);
    } catch (e) {
      setMsgs((prev) => [...prev, { role: "assistant", error: true, content: e instanceof Error ? e.message : "No pude responder ahora. Probá de nuevo." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qc-root" data-open={open ? "1" : "0"}>
      <section className="qc-panel" role="dialog" aria-label="Asistente del presupuesto" aria-hidden={!open}>
        <header className="qc-head">
          <span className="qc-avatar" aria-hidden="true"><b>✦</b></span>
          <div className="qc-title">
            <strong>Tito, tu copiloto TGS</strong>
            <span><i className="qc-live" />{busy ? "Pensando…" : "En línea · solo conoce este presupuesto"}</span>
          </div>
          {msgs.length ? <button type="button" className="qc-icon" onClick={() => setMsgs([])} title="Limpiar la conversación" aria-label="Limpiar la conversación">↺</button> : null}
          <button type="button" className="qc-icon" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
        </header>

        <div className="qc-body">
          {!msgs.length ? (
            <div className="qc-welcome">
              <div className="qc-orb" aria-hidden="true"><span>✦</span></div>
              <h4>{greeting()} Soy Tito 👋</h4>
              <p>{hasItems ? "Preguntame lo que quieras sobre esta PC: rendimiento, compatibilidad, mejoras…" : "Agregá productos al presupuesto y preguntame sobre rendimiento, compatibilidad y más."}</p>
              {hasItems ? (
                <div className="qc-chips">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={s.text} type="button" style={{ animationDelay: `${120 + i * 70}ms` }} onClick={() => void send(s.text)}><span aria-hidden="true">{s.icon}</span>{s.text}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {msgs.map((m, i) => (
            <div key={i} className={`qc-msg ${m.role}${m.error ? " err" : ""}`}>
              {m.role === "assistant" ? <span className="qc-mini" aria-hidden="true">✦</span> : null}
              <div className="qc-bubble">{m.role === "assistant" ? (m.error ? m.content : <Typewriter text={m.content} animate={i === msgs.length - 1} />) : m.content}</div>
            </div>
          ))}
          {busy ? <div className="qc-msg assistant"><span className="qc-mini" aria-hidden="true">✦</span><div className="qc-bubble qc-typing" aria-label="Escribiendo"><i /><i /><i /></div></div> : null}
          <div ref={endRef} />
        </div>

        <form className="qc-form" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder={hasItems ? "Preguntá sobre este presupuesto…" : "Primero agregá productos…"}
            disabled={!hasItems}
            maxLength={600}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
          />
          <button type="submit" disabled={busy || !text.trim() || !hasItems} aria-label="Enviar">➤</button>
        </form>
        <p className="qc-foot">Respuestas orientativas de IA: verificá antes de prometer rendimiento.</p>
      </section>

      <button type="button" className="qc-fab" onClick={() => setOpen((v) => !v)} aria-label={open ? "Cerrar el asistente" : "Abrir el asistente del presupuesto"} aria-expanded={open}>
        <span className="qc-ring" aria-hidden="true" />
        <span className="qc-ico qc-ico-chat" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12z" /><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" strokeWidth="2.6" /></svg>
        </span>
        <span className="qc-ico qc-ico-x" aria-hidden="true">✕</span>
        {unread ? <span className="qc-dot" aria-hidden="true" /> : null}
      </button>
    </div>
  );
}
