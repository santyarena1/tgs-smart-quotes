"use client";

import { useEffect, useState } from "react";
import type { WhatsappConversation } from "../../../lib/api";
import {
  createTask,
  deleteTask,
  formatCents,
  listTasks,
  LOST_REASONS,
  STAGES,
  updateLead,
  updateTask,
  type CrmTask,
  type StageId,
} from "../../../lib/crm";
import { errorMessage } from "../../shared";

/** Venta del chat: etapa, valor, de qué anuncio vino, qué quiere el cliente y tareas. */
export function LeadPanel({ conversation, onChanged }: { conversation: WhatsappConversation; onChanged: () => Promise<void> }) {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState(conversation.profile ?? {});
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stage = conversation.stage ?? "NEW";

  const loadTasks = () => listTasks({ chatKey: conversation.chatKey }).then(setTasks).catch(() => setTasks([]));
  useEffect(() => {
    void loadTasks();
    setLostOpen(false);
    setEditingProfile(false);
    setError(null);
  }, [conversation.chatKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setProfile(conversation.profile ?? {});
    setValue(conversation.leadValueCents ? String(Number(BigInt(conversation.leadValueCents) / 100n)) : "");
  }, [conversation.profile, conversation.leadValueCents]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  function changeStage(next: StageId) {
    if (next === "LOST") { setLostOpen(true); return; }
    void run(() => updateLead(conversation.chatKey, { stage: next }));
  }

  const p = conversation.profile ?? {};
  const facts: Array<[string, string]> = [
    ["Uso", p.usage ?? ""],
    ["Juegos / programas", (p.games ?? []).join(", ")],
    ["Presupuesto", p.budgetCents ? formatCents(p.budgetCents) : ""],
    ["Ciudad", p.city ?? ""],
    ["Pago", p.payment ?? ""],
    ["Entrega", p.delivery === "ENVIO" ? "Envío" : p.delivery === "RETIRO" ? "Retira en el local" : ""],
  ];

  return (
    <section className="cx-side-block">
      <h4>Venta</h4>
      {error ? <p className="cx-reply-error">{error}</p> : null}
      <div className="cx-stage-row">
        <select value={stage} onChange={(event) => changeStage(event.target.value as StageId)} aria-label="Etapa del embudo">
          {STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <div className="cx-prefix" title="Valor estimado de la venta">
          <span>$</span>
          <input
            inputMode="numeric"
            value={value}
            placeholder="Valor"
            onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
            onBlur={() => {
              const cents = value ? Number(value) * 100 : null;
              const current = conversation.leadValueCents ? Number(conversation.leadValueCents) : null;
              if (cents !== current) void run(() => updateLead(conversation.chatKey, { valueCents: cents }));
            }}
          />
        </div>
      </div>
      {stage === "LOST" && conversation.lostReason ? <p className="cx-hint">Perdido: {conversation.lostReason}</p> : null}
      {lostOpen ? (
        <div className="cx-lost">
          <p className="cx-hint">¿Por qué no compró?</p>
          <div className="cx-tags">
            {LOST_REASONS.map((reason) => (
              <button key={reason} type="button" className="cx-tag ghost" onClick={() => { setLostOpen(false); void run(() => updateLead(conversation.chatKey, { stage: "LOST", lostReason: reason })); }}>
                {reason}
              </button>
            ))}
          </div>
          <button type="button" className="cx-link" onClick={() => setLostOpen(false)}>Cancelar</button>
        </div>
      ) : null}

      {conversation.origin ? (
        <div className="cx-origin" title={conversation.origin.body ?? undefined}>
          <span>📣 Vino de un anuncio</span>
          {conversation.origin.headline ? <strong>{conversation.origin.headline}</strong> : null}
          {conversation.origin.url ? <a className="cx-link" href={conversation.origin.url} target="_blank" rel="noreferrer">Ver anuncio →</a> : null}
        </div>
      ) : null}

      <div className="cx-facts">
        <div className="cx-facts-head">
          <span className="cx-hint">Lo que sabemos del cliente</span>
          <button type="button" className="cx-link" onClick={() => setEditingProfile(!editingProfile)}>{editingProfile ? "Cancelar" : "Editar"}</button>
        </div>
        {editingProfile ? (
          <div className="cx-form">
            <input value={profile.usage ?? ""} placeholder="Uso (juegos, diseño, trabajo…)" onChange={(event) => setProfile({ ...profile, usage: event.target.value })} />
            <input value={(profile.games ?? []).join(", ")} placeholder="Juegos o programas, separados por coma" onChange={(event) => setProfile({ ...profile, games: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
            <input value={profile.budgetCents ? String(profile.budgetCents / 100) : ""} inputMode="numeric" placeholder="Presupuesto en pesos" onChange={(event) => setProfile({ ...profile, budgetCents: event.target.value ? Number(event.target.value.replace(/\D/g, "")) * 100 : null })} />
            <input value={profile.city ?? ""} placeholder="Ciudad" onChange={(event) => setProfile({ ...profile, city: event.target.value })} />
            <input value={profile.payment ?? ""} placeholder="Cómo quiere pagar" onChange={(event) => setProfile({ ...profile, payment: event.target.value })} />
            <select value={profile.delivery ?? ""} onChange={(event) => setProfile({ ...profile, delivery: (event.target.value || null) as "ENVIO" | "RETIRO" | null })}>
              <option value="">Entrega: sin definir</option>
              <option value="ENVIO">Envío</option>
              <option value="RETIRO">Retira en el local</option>
            </select>
            <button type="button" className="cx-btn primary" onClick={() => { setEditingProfile(false); void run(() => updateLead(conversation.chatKey, { profile })); }}>Guardar</button>
          </div>
        ) : facts.some(([, text]) => text) ? (
          <dl className="cx-dl">
            {facts.filter(([, text]) => text).map(([label, text]) => (
              <div key={label}><dt>{label}</dt><dd>{text}</dd></div>
            ))}
          </dl>
        ) : (
          <p className="cx-hint">Todavía nada. El bot lo completa solo a medida que el cliente cuenta qué quiere.</p>
        )}
      </div>

      <div className="cx-tasks">
        <span className="cx-hint">Tareas</span>
        {tasks.map((task) => (
          <div key={task.id} className={task.doneAt ? "cx-task done" : "cx-task"}>
            <input type="checkbox" checked={Boolean(task.doneAt)} onChange={(event) => void updateTask(task.id, { done: event.target.checked }).then(loadTasks)} aria-label="Hecha" />
            <span className="cx-task-title">{task.title}</span>
            {task.dueAt ? (
              <span className={!task.doneAt && new Date(task.dueAt) < new Date() ? "cx-pill alert" : "cx-pill muted"}>
                {new Date(task.dueAt).toLocaleString("es-AR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            <button type="button" className="cx-task-x" onClick={() => void deleteTask(task.id).then(loadTasks)} aria-label="Borrar tarea">×</button>
          </div>
        ))}
        <form
          className="cx-task-new"
          onSubmit={(event) => {
            event.preventDefault();
            if (!taskTitle.trim()) return;
            void createTask({ conversationKey: conversation.chatKey, title: taskTitle.trim(), dueAt: taskDue ? new Date(taskDue).toISOString() : null })
              .then(() => { setTaskTitle(""); setTaskDue(""); return loadTasks(); })
              .catch((reason) => setError(errorMessage(reason)));
          }}
        >
          <input value={taskTitle} placeholder="Ej.: avisarle cuando llegue la 5070" onChange={(event) => setTaskTitle(event.target.value)} />
          <input type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} aria-label="Vence" />
          <button type="submit" className="cx-btn" disabled={!taskTitle.trim()}>+ Tarea</button>
        </form>
      </div>
    </section>
  );
}
