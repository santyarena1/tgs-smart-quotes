"use client";

import { useCallback, useEffect, useState } from "react";
import type { WhatsappConversation } from "../../lib/api";
import {
  formatCents,
  getPipeline,
  temperatureBadge,
  listTasks,
  LOST_REASONS,
  STAGES,
  updateLead,
  updateTask,
  type CrmTask,
  type PipelineColumn,
  type StageId,
} from "../../lib/crm";
import { errorMessage } from "../shared";
import { avatarInitials, conversationTitle, relativeTime } from "./format";
import { useCrmLive } from "./useCrmLive";

/** Embudo de ventas: un kanban de los chats por etapa. Se arrastran las tarjetas. */
export function Pipeline() {
  const [columns, setColumns] = useState<PipelineColumn[]>([]);
  const [mine, setMine] = useState(false);
  const [days, setDays] = useState(30);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<StageId | null>(null);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pipeline, open] = await Promise.all([getPipeline({ mine, days }), listTasks({ mine: true, open: true })]);
      setColumns(pipeline.columns);
      setTasks(open);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [mine, days]);

  useEffect(() => { void load(); }, [load]);
  // En vivo: si algo cambia en un chat, se refresca el tablero.
  useCrmLive({ chatKey: null, typing: false, onChats: () => void load() });

  async function move(chatKey: string, stage: StageId, lostReason?: string) {
    setError(null);
    // Movimiento optimista: la tarjeta cambia de columna al instante.
    setColumns((current) => {
      const card = current.flatMap((column) => column.items).find((item) => item.chatKey === chatKey);
      if (!card) return current;
      return current.map((column) => ({
        ...column,
        items: column.stage === stage
          ? [{ ...card, stage }, ...column.items.filter((item) => item.chatKey !== chatKey)]
          : column.items.filter((item) => item.chatKey !== chatKey),
      }));
    });
    try {
      await updateLead(chatKey, { stage, ...(lostReason ? { lostReason } : {}) });
    } catch (reason) {
      setError(errorMessage(reason));
    }
    await load();
  }

  const openTotal = columns
    .filter((column) => !["WON", "LOST"].includes(column.stage))
    .reduce((sum, column) => sum + BigInt(column.totalCents), 0n);
  const won = columns.find((column) => column.stage === "WON");

  return (
    <div className="cx-pipeline">
      <header className="cx-page-head cx-pipeline-head">
        <div>
          <h1>Embudo de ventas</h1>
          <p className="cx-hint">
            En juego: <strong>{formatCents(openTotal.toString())}</strong>
            {won ? <> · Ganado en {days} días: <strong>{formatCents(won.totalCents)}</strong> ({won.count})</> : null}
            {" · "}Arrastrá las tarjetas para cambiarlas de etapa.
          </p>
        </div>
        <div className="cx-row-actions">
          <label className="cx-check"><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} /> Solo mías</label>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Período de cerrados">
            <option value={7}>Cerrados: 7 días</option>
            <option value={30}>Cerrados: 30 días</option>
            <option value={90}>Cerrados: 90 días</option>
          </select>
        </div>
      </header>
      {error ? <p className="cx-reply-error">{error}</p> : null}

      <div className="cx-board">
        {STAGES.map((stage) => {
          const column = columns.find((item) => item.stage === stage.id);
          return (
            <section
              key={stage.id}
              className={`cx-col${over === stage.id ? " over" : ""} ${stage.id.toLowerCase()}`}
              onDragOver={(event) => { event.preventDefault(); setOver(stage.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                const chatKey = event.dataTransfer.getData("text/plain") || dragging;
                if (!chatKey) return;
                if (stage.id === "LOST") setLostFor(chatKey);
                else void move(chatKey, stage.id);
              }}
            >
              <header className="cx-col-head" title={stage.hint}>
                <strong>{stage.label}</strong>
                <span className="cx-count">{column?.count ?? 0}</span>
                <span className="cx-col-total">{column && column.totalCents !== "0" ? formatCents(column.totalCents) : ""}</span>
              </header>
              <div className="cx-col-body">
                {(column?.items ?? []).map((item) => (
                  <LeadCard key={item.chatKey} item={item} onDragStart={() => setDragging(item.chatKey)} onDragEnd={() => setDragging(null)} />
                ))}
                {!column?.items.length ? <p className="cx-hint cx-col-empty">Sin chats</p> : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="cx-card cx-mytasks">
        <h3>Mis tareas pendientes</h3>
        {tasks.length ? tasks.map((task) => (
          <div key={task.id} className="cx-task">
            <input type="checkbox" onChange={() => void updateTask(task.id, { done: true }).then(load)} aria-label="Marcar hecha" />
            <span className="cx-task-title">
              {task.title}
              {task.conversationKey ? <> · <a className="cx-link" href={`/crm?chat=${encodeURIComponent(task.conversationKey)}`}>{task.chatName ?? "ver chat"}</a></> : null}
            </span>
            {task.dueAt ? (
              <span className={new Date(task.dueAt) < new Date() ? "cx-pill alert" : "cx-pill muted"}>
                {new Date(task.dueAt).toLocaleString("es-AR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </div>
        )) : <p className="cx-hint">No tenés tareas pendientes. Se crean desde la ficha de cada chat.</p>}
      </section>

      {lostFor ? (
        <div className="cx-palette-backdrop" onMouseDown={() => setLostFor(null)}>
          <div className="cx-palette cx-lost-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <p><strong>¿Por qué no compró?</strong></p>
            <div className="cx-tags">
              {LOST_REASONS.map((reason) => (
                <button key={reason} type="button" className="cx-tag ghost" onClick={() => { const key = lostFor; setLostFor(null); void move(key, "LOST", reason); }}>
                  {reason}
                </button>
              ))}
            </div>
            <button type="button" className="cx-link" onClick={() => setLostFor(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LeadCard({ item, onDragStart, onDragEnd }: { item: WhatsappConversation; onDragStart: () => void; onDragEnd: () => void }) {
  const profile = item.profile ?? {};
  return (
    <a
      className={`cx-lead${item.unreadCount ? " unread" : ""}`}
      href={`/crm?chat=${encodeURIComponent(item.chatKey)}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData("text/plain", item.chatKey); event.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
    >
      <div className="cx-lead-top">
        <span className="cx-avatar sm" aria-hidden="true">{avatarInitials(item)}</span>
        <strong>{conversationTitle(item)}</strong>
        {item.leadValueCents ? <span className="cx-lead-value">{formatCents(item.leadValueCents)}</span> : null}
      </div>
      {item.nextStep ? <p className="cx-lead-line next">➜ {item.nextStep}</p> : null}
      {profile.usage || profile.games?.length ? (
        <p className="cx-lead-line">{[profile.usage, profile.games?.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}</p>
      ) : null}
      <p className="cx-lead-line muted">{item.lastSpeaker === "US" ? "Vos: " : ""}{(item.lastSpeaker === "US" ? item.lastOutboundText : item.lastInboundText) ?? ""}</p>
      <div className="cx-row-meta">
        {temperatureBadge(item.temperature) ? <span className={`cx-pill temp ${temperatureBadge(item.temperature)!.tone}`}>{temperatureBadge(item.temperature)!.icon} {item.temperature}</span> : null}
        {item.origin ? <span className="cx-pill human" title={item.origin.headline ?? undefined}>📣 Anuncio</span> : null}
        {item.assignedUser ? <span className="cx-pill">👤 {item.assignedUser.displayName || item.assignedUser.username}</span> : null}
        {item.stage === "LOST" && item.lostReason ? <span className="cx-pill muted">{item.lostReason}</span> : null}
        <span className="cx-pill muted">{relativeTime(item.lastMessageAt)}</span>
      </div>
    </a>
  );
}
