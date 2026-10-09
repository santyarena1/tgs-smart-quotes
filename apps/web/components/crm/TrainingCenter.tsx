"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  approveLearning,
  getGuidance,
  getTrainers,
  listLearnings,
  rejectLearning,
  saveGuidance,
  saveTrainers,
  type BotLearning,
  type Guidance,
} from "../../lib/training";
import type { ChatbotSettings } from "../../lib/types";
import { Simulator } from "../ChatbotSettingsSection";
import { errorMessage } from "../shared";
import { relativeTime } from "./format";

type Tab = "proposals" | "questions" | "guidance" | "test" | "trainers" | "history";

const SOURCE_LABEL: Record<BotLearning["source"], string> = {
  TRAINER: "📱 Entrenador",
  SELLER_EDIT: "✏️ Corrección de un vendedor",
  UNANSWERED: "❓ Pregunta de cliente",
};

/**
 * Entrenamiento del bot: lo que aprendió espera tu aprobación acá (o por WhatsApp
 * desde el número entrenador). Nada llega a los clientes sin aprobar.
 */
export function TrainingCenter() {
  const [tab, setTab] = useState<Tab>("proposals");
  const [pending, setPending] = useState<BotLearning[]>([]);
  const [history, setHistory] = useState<BotLearning[]>([]);
  const [guidance, setGuidance] = useState<Guidance[]>([]);
  const [trainers, setTrainers] = useState<string[]>([]);
  const [settings, setSettings] = useState<ChatbotSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const [open, done, rules, numbers, config] = await Promise.all([
        listLearnings("PENDING"),
        listLearnings("ALL"),
        getGuidance(),
        getTrainers(),
        api<ChatbotSettings>("/chatbot/settings"),
      ]);
      setPending(open);
      setHistory(done.filter((item) => item.status !== "PENDING").slice(0, 80));
      setGuidance(rules);
      setTrainers(numbers.numbers);
      setSettings(config);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const probar = new URLSearchParams(window.location.search).get("probar");
    if (!probar) return;
    setTab("test");
    setInitialDraft(probar);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const proposals = pending.filter((item) => item.kind !== "QUESTION");
  const questions = pending.filter((item) => item.kind === "QUESTION");

  async function run(action: () => Promise<unknown>, success: string) {
    setError(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "proposals", label: "Para aprobar", count: proposals.length },
    { id: "questions", label: "Preguntas sin responder", count: questions.length },
    { id: "guidance", label: "Indicaciones vigentes", count: guidance.filter((item) => item.enabled).length },
    { id: "test", label: "Probar el bot" },
    { id: "trainers", label: "Números entrenadores" },
    { id: "history", label: "Historial" },
  ];

  return (
    <div className="cx-page wide">
      <header className="cx-page-head">
        <div>
          <h1>Entrenamiento del bot</h1>
          <p className="cx-hint">
            Enseñale desde WhatsApp con el número entrenador ({trainers.join(", ") || "sin configurar"}) o desde acá.
            Nada de lo que aprende llega a los clientes hasta que lo aprobás.
          </p>
        </div>
      </header>

      {error ? <p className="cx-reply-error">{error}</p> : null}
      {notice ? <p className="cx-notice">{notice}</p> : null}

      <div className="cx-tabs" role="tablist">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            {item.label}{item.count ? <span className="cx-count">{item.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "proposals" ? (
        proposals.length ? (
          <div className="cx-qr-list">
            {proposals.map((item) => (
              <ProposalCard
                key={item.id}
                item={item}
                onApprove={(override) => run(() => approveLearning(item.id, override), "Aprobado: el bot ya lo usa con los clientes.")}
                onReject={() => run(() => rejectLearning(item.id), "Descartado.")}
              />
            ))}
          </div>
        ) : (
          <div className="cx-card">
            <p>No hay nada pendiente de aprobar.</p>
            <p className="cx-hint">Probá mandarle desde el número entrenador algo como: "Desde ahora el envío a CABA sale $15.000" o "Si preguntan por notebooks, derivá".</p>
          </div>
        )
      ) : null}

      {tab === "questions" ? (
        questions.length ? (
          <div className="cx-qr-list">
            {questions.map((item) => (
              <QuestionCard
                key={item.id}
                item={item}
                onAnswer={(answer) => run(() => approveLearning(item.id, { answer }), "Listo: el bot ya sabe responder eso.")}
                onDiscard={() => run(() => rejectLearning(item.id), "Pregunta descartada.")}
              />
            ))}
          </div>
        ) : (
          <div className="cx-card"><p>Ninguna pregunta sin responder. Cuando un cliente pregunte algo que el bot no sabe, aparece acá.</p></div>
        )
      ) : null}

      {tab === "guidance" ? (
        <GuidanceEditor
          items={guidance}
          onSave={(items) => run(() => saveGuidance(items), "Indicaciones guardadas.")}
        />
      ) : null}

      {tab === "test" ? (
        settings ? <Simulator settings={settings} dirty={false} initialDraft={initialDraft} /> : <p className="cx-hint">Cargando…</p>
      ) : null}

      {tab === "trainers" ? (
        <TrainersEditor numbers={trainers} onSave={(numbers) => run(() => saveTrainers(numbers), "Números entrenadores guardados.")} />
      ) : null}

      {tab === "history" ? (
        <div className="cx-qr-list">
          {history.map((item) => (
            <article key={item.id} className="cx-card cx-qr">
              <div className="cx-qr-head">
                <span className={item.status === "APPROVED" ? "cx-pill ok" : "cx-pill muted"}>{item.status === "APPROVED" ? "Aprobado" : "Descartado"}</span>
                <strong>{item.summary}</strong>
                <span className="cx-hint" style={{ marginLeft: "auto" }}>{relativeTime(item.decidedAt ?? item.createdAt)}</span>
              </div>
              <p className="cx-hint">{SOURCE_LABEL[item.source]}{item.decisionNote ? ` · ${item.decisionNote}` : ""}</p>
            </article>
          ))}
          {!history.length ? <p className="cx-hint">Todavía no hay historial.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ProposalCard({
  item,
  onApprove,
  onReject,
}: {
  item: BotLearning;
  onApprove: (override: { text?: string; activators?: string[]; answer?: string; context?: string }) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(item.payload.text ?? ""));
  const [answer, setAnswer] = useState(String(item.payload.answer ?? ""));
  const [activators, setActivators] = useState((item.payload.activators ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const knowledge = item.kind === "KNOWLEDGE";

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  }

  return (
    <article className="cx-card cx-qr">
      <div className="cx-qr-head">
        <span className={knowledge ? "cx-pill human" : "cx-pill bot"}>{knowledge ? "Dato del negocio" : "Indicación"}</span>
        <strong>{item.summary}</strong>
      </div>
      <p className="cx-hint">{SOURCE_LABEL[item.source]} · {relativeTime(item.createdAt)}{item.payload.replacesId ? " · actualiza un dato existente" : ""}</p>

      {editing ? (
        <div className="cx-form">
          {knowledge ? (
            <>
              <label><span>Qué tiene que decir</span><textarea rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
              <label><span>Cómo lo pregunta un cliente (separado por comas)</span><input value={activators} onChange={(event) => setActivators(event.target.value)} /></label>
            </>
          ) : (
            <label><span>Indicación</span><textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} /></label>
          )}
        </div>
      ) : knowledge ? (
        <div className="cx-qr-body">
          <p>{String(item.payload.answer ?? "")}</p>
          {(item.payload.activators ?? []).length ? <p className="cx-hint">Se activa con: {(item.payload.activators as string[]).join(" · ")}</p> : null}
        </div>
      ) : (
        <p className="cx-qr-body">{String(item.payload.text ?? "")}</p>
      )}

      {item.source === "SELLER_EDIT" ? (
        <details className="cx-details">
          <summary>Ver la corrección</summary>
          <p className="cx-hint">Cliente: {String(item.payload.customerMessage ?? "")}</p>
          <p className="cx-hint">El bot iba a decir: {String(item.payload.botDraft ?? "")}</p>
          <p className="cx-hint">El vendedor mandó: {String(item.payload.sentByHuman ?? "")}</p>
        </details>
      ) : null}

      <div className="cx-row-actions">
        <button
          type="button"
          className="cx-btn primary"
          disabled={busy}
          onClick={() => void act(() => onApprove(editing
            ? knowledge
              ? { answer, activators: activators.split(",").map((value: string) => value.trim()).filter(Boolean) }
              : { text }
            : {}))}
        >
          ✓ {editing ? "Guardar y aprobar" : "Aprobar"}
        </button>
        {!editing ? <button type="button" className="cx-btn" onClick={() => setEditing(true)}>Editar</button> : null}
        <button type="button" className="cx-btn danger" disabled={busy} onClick={() => void act(onReject)}>Descartar</button>
      </div>
    </article>
  );
}

function QuestionCard({ item, onAnswer, onDiscard }: { item: BotLearning; onAnswer: (answer: string) => Promise<void>; onDiscard: () => Promise<void> }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const examples: string[] = Array.isArray(item.payload.examples) ? item.payload.examples : [];
  return (
    <article className="cx-card cx-qr">
      <div className="cx-qr-head">
        <span className="cx-pill alert">{item.occurrences > 1 ? `${item.occurrences} veces` : "1 vez"}</span>
        <strong>"{String(item.payload.question ?? item.summary)}"</strong>
        {item.conversationKey ? <a className="cx-link" href={`/crm?chat=${encodeURIComponent(item.conversationKey)}`} style={{ marginLeft: "auto" }}>Ver chat →</a> : null}
      </div>
      {examples.length > 1 ? <p className="cx-hint">También: {examples.slice(0, -1).map((value) => `"${value}"`).join(" · ")}</p> : null}
      <textarea className="cx-reply-input" rows={2} value={answer} placeholder="¿Qué tiene que responder el bot cuando pregunten esto?" onChange={(event) => setAnswer(event.target.value)} />
      <div className="cx-row-actions">
        <button type="button" className="cx-btn primary" disabled={busy || !answer.trim()} onClick={async () => { setBusy(true); try { await onAnswer(answer.trim()); } finally { setBusy(false); } }}>
          ✓ Enseñar esta respuesta
        </button>
        <button type="button" className="cx-btn" disabled={busy} onClick={async () => { setBusy(true); try { await onDiscard(); } finally { setBusy(false); } }}>
          No hace falta
        </button>
      </div>
    </article>
  );
}

function GuidanceEditor({ items, onSave }: { items: Guidance[]; onSave: (items: Guidance[]) => Promise<void> }) {
  const [draft, setDraft] = useState<Guidance[]>(items);
  const [fresh, setFresh] = useState("");
  useEffect(() => setDraft(items), [items]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(items);
  return (
    <div className="cx-qr-list">
      <p className="cx-hint">Son reglas que el bot sigue siempre, por encima del tono y los criterios generales. Se suman al aprobar propuestas o se escriben acá.</p>
      {draft.map((item, index) => (
        <article key={item.id} className={`cx-card cx-guidance${item.enabled ? "" : " off"}`}>
          <textarea rows={2} value={item.text} onChange={(event) => setDraft(draft.map((value, position) => (position === index ? { ...value, text: event.target.value } : value)))} />
          <div className="cx-row-actions">
            <label className="cx-check">
              <input type="checkbox" checked={item.enabled} onChange={(event) => setDraft(draft.map((value, position) => (position === index ? { ...value, enabled: event.target.checked } : value)))} />
              {item.enabled ? "Activa" : "Pausada"}
            </label>
            <span className="cx-hint">{SOURCE_LABEL[item.source as BotLearning["source"]] ?? "Manual"}</span>
            <button type="button" className="cx-link danger" onClick={() => setDraft(draft.filter((_, position) => position !== index))}>Borrar</button>
          </div>
        </article>
      ))}
      <div className="cx-card cx-form">
        <label>
          <span>Nueva indicación</span>
          <textarea rows={2} value={fresh} placeholder="Ej.: Si preguntan por notebooks, decí que no trabajamos notebooks y ofrecé una PC de escritorio." onChange={(event) => setFresh(event.target.value)} />
        </label>
        <div className="cx-row-actions">
          <button
            type="button"
            className="cx-btn"
            disabled={!fresh.trim()}
            onClick={() => {
              setDraft([...draft, { id: crypto.randomUUID(), text: fresh.trim(), enabled: true, source: "MANUAL", createdAt: new Date().toISOString() }]);
              setFresh("");
            }}
          >
            + Agregar
          </button>
          <button type="button" className="cx-btn primary" disabled={!dirty} onClick={() => void onSave(draft)}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function TrainersEditor({ numbers, onSave }: { numbers: string[]; onSave: (numbers: string[]) => Promise<void> }) {
  const [list, setList] = useState(numbers);
  const [fresh, setFresh] = useState("");
  useEffect(() => setList(numbers), [numbers]);
  return (
    <div className="cx-card cx-form">
      <p className="cx-hint">
        Cuando uno de estos números le escribe al WhatsApp del bot, no lo atiende como cliente: lo trata como a su jefe.
        Le podés enseñar datos ("el envío a CABA sale $15.000"), reglas ("si preguntan por notebooks, derivá"), probarlo
        ("probá: soy cliente y te pregunto si hacen envíos") o preguntarle qué sabe. Te consulta lo que los clientes le preguntan y no sabe.
      </p>
      {list.map((number) => (
        <div key={number} className="cx-row-actions">
          <strong>{number}</strong>
          <button type="button" className="cx-link danger" onClick={() => setList(list.filter((value) => value !== number))}>Quitar</button>
        </div>
      ))}
      <div className="cx-row-actions">
        <input value={fresh} placeholder="Ej.: 11 4870-4101" onChange={(event) => setFresh(event.target.value)} />
        <button type="button" className="cx-btn" disabled={!fresh.trim()} onClick={() => { setList([...list, fresh.trim()]); setFresh(""); }}>+ Agregar</button>
        <button type="button" className="cx-btn primary" disabled={JSON.stringify(list) === JSON.stringify(numbers)} onClick={() => void onSave(list)}>Guardar</button>
      </div>
    </div>
  );
}
