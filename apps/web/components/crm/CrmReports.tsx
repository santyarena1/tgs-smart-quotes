"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatCents, INTENT_LABEL, STAGES } from "../../lib/crm";
import { errorMessage } from "../shared";

type Report = {
  days: number;
  now: { waiting: number; oldestWaitMinutes: number | null; needsHumanUnassigned: number };
  firstResponse: {
    conversations: number;
    bot: { count: number; medianMinutes: number | null };
    human: { count: number; medianMinutes: number | null };
    unanswered: number;
  };
  funnel: Array<{ stage: string; total: number; valueCents: string }>;
  temperature: Partial<Record<"HOT" | "WARM" | "COLD", number>>;
  intents: Array<{ intent: string; total: number }>;
  lostReasons: Array<{ reason: string; total: number }>;
  ads: Array<{ ad: string | null; headline: string | null; leads: number; won: number; wonValueCents: string }>;
  sellers: Array<{ name: string; chats: number; won: number; wonValueCents: string; messages: number }>;
  bot: {
    replies: number;
    escalations: number;
    suggestionsApproved: number;
    suggestionsEdited: number;
    suggestionsDismissed: number;
    learned: number;
    assistedSales: number;
    escalationReasons: Array<{ reason: string; total: number }>;
  };
};

const RANGES = [7, 30, 90];

function duration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 48 ? `${hours.toFixed(1).replace(".", ",")} h` : `${Math.round(hours / 24)} días`;
}

const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "—");

/** Barras horizontales de una sola serie: etiqueta y valor van en texto, la barra solo da la proporción. */
function Bars({ rows, empty }: { rows: Array<{ label: string; value: number; detail?: string }>; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return empty ? <p className="cx-hint">{empty}</p> : null;
  return (
    <div className="cx-bars">
      {rows.map((row) => (
        <div key={row.label} className="cx-bar-row" title={`${row.label}: ${row.value}${row.detail ? ` · ${row.detail}` : ""}`}>
          <span className="cx-bar-label">{row.label}</span>
          <span className="cx-bar-track" aria-hidden="true">
            <span className="cx-bar-fill" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="cx-bar-value">
            {row.value}
            {row.detail ? <small> · {row.detail}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "alert" | "ok" }) {
  return (
    <div className={`cx-kpi${tone ? ` ${tone}` : ""}`}>
      <span className="cx-kpi-label">{label}</span>
      <strong className="cx-kpi-value">{value}</strong>
      {hint ? <span className="cx-kpi-hint">{hint}</span> : null}
    </div>
  );
}

/** Cómo viene la atención y las ventas por WhatsApp. */
export function CrmReports() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api<Report>(`/crm/reports?days=${days}`)
      .then((data) => {
        if (alive) setReport(data);
      })
      .catch((reason) => {
        if (alive) setError(errorMessage(reason));
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const funnelTotal = report?.funnel.reduce((sum, row) => sum + row.total, 0) ?? 0;
  const byStage = new Map(report?.funnel.map((row) => [row.stage, row]) ?? []);
  // Cuántos llegaron al menos a cada etapa: el embudo se lee acumulado, sin los perdidos.
  const open = STAGES.filter((stage) => stage.id !== "LOST");
  const reached = open.map((stage, index) => ({
    stage,
    total: open.slice(index).reduce((sum, later) => sum + (byStage.get(later.id)?.total ?? 0), 0),
  }));
  const won = byStage.get("WON");
  const lost = byStage.get("LOST")?.total ?? 0;
  const temp = report?.temperature ?? {};
  const suggestions = report ? report.bot.suggestionsApproved + report.bot.suggestionsEdited + report.bot.suggestionsDismissed : 0;

  return (
    <div className="cx-page cx-reports">
      <header className="cx-page-head">
        <div>
          <h1>Reportes</h1>
          <p className="cx-hint">Cómo viene la atención y las ventas por WhatsApp. No cuenta el simulador ni el número de entrenamiento.</p>
        </div>
        <div className="cx-segmented" role="group" aria-label="Período">
          {RANGES.map((value) => (
            <button key={value} type="button" className={value === days ? "on" : ""} onClick={() => setDays(value)}>
              {value} días
            </button>
          ))}
        </div>
      </header>
      {error ? <p className="cx-reply-error">{error}</p> : null}
      {!report ? (
        error ? null : <p className="cx-hint">Cargando…</p>
      ) : (
        <>
          <section className="cx-kpis" aria-label="Ahora mismo">
            <Tile
              label="Esperando respuesta"
              value={report.now.waiting}
              hint={report.now.oldestWaitMinutes !== null ? `el más viejo hace ${duration(report.now.oldestWaitMinutes)}` : "nadie esperando"}
              tone={report.now.waiting ? "alert" : "ok"}
            />
            <Tile label="Piden persona sin asignar" value={report.now.needsHumanUnassigned} tone={report.now.needsHumanUnassigned ? "alert" : undefined} />
            <Tile label="🔥 Calientes" value={temp.HOT ?? 0} hint={`🌡 ${temp.WARM ?? 0} tibios · ❄ ${temp.COLD ?? 0} fríos`} />
            <Tile label="Ventas ganadas" value={won?.total ?? 0} hint={won ? formatCents(won.valueCents) : undefined} tone={won?.total ? "ok" : undefined} />
          </section>

          <section className="cx-kpis" aria-label="Primera respuesta">
            <Tile label="Conversaciones nuevas" value={report.firstResponse.conversations} />
            <Tile label="1ª respuesta del bot" value={duration(report.firstResponse.bot.medianMinutes)} hint={`mediana · ${report.firstResponse.bot.count} chats`} />
            <Tile label="1ª respuesta de una persona" value={duration(report.firstResponse.human.medianMinutes)} hint={`mediana · ${report.firstResponse.human.count} chats`} />
            <Tile label="Nunca respondidos" value={report.firstResponse.unanswered} tone={report.firstResponse.unanswered ? "alert" : undefined} />
          </section>

          <div className="cx-report-grid">
            <section className="cx-card">
              <h3 className="cx-card-title">Embudo</h3>
              <p className="cx-hint">Cuántos chats llegaron al menos a cada etapa (de {funnelTotal} en el período).</p>
              <Bars
                rows={reached.map((row, index) => ({
                  label: row.stage.label,
                  value: row.total,
                  detail: index ? `${percent(row.total, reached[index - 1]!.total)} del paso anterior` : undefined,
                }))}
                empty="Sin conversaciones en el período."
              />
              <p className="cx-hint">Perdidos: {lost} · Conversión total: {percent(won?.total ?? 0, funnelTotal)}</p>
            </section>

            <section className="cx-card">
              <h3 className="cx-card-title">Qué quieren los clientes</h3>
              <p className="cx-hint">Intención del último mensaje de cada chat.</p>
              <Bars rows={report.intents.map((row) => ({ label: INTENT_LABEL[row.intent] ?? row.intent, value: row.total }))} empty="Todavía no hay intenciones detectadas." />
            </section>

            <section className="cx-card">
              <h3 className="cx-card-title">Por qué se pierden</h3>
              <Bars rows={report.lostReasons.map((row) => ({ label: row.reason, value: row.total }))} empty="Ninguna venta marcada como perdida." />
            </section>

            <section className="cx-card">
              <h3 className="cx-card-title">El bot</h3>
              <dl className="cx-stats">
                <div><dt>Respuestas enviadas</dt><dd>{report.bot.replies}</dd></div>
                <div><dt>Derivó a una persona</dt><dd>{report.bot.escalations}</dd></div>
                <div><dt>Ventas donde participó</dt><dd>{report.bot.assistedSales}</dd></div>
                <div><dt>Aprendizajes aprobados</dt><dd>{report.bot.learned}</dd></div>
                <div><dt>Sugerencias aprobadas tal cual</dt><dd>{report.bot.suggestionsApproved} <small>({percent(report.bot.suggestionsApproved, suggestions)})</small></dd></div>
                <div><dt>Sugerencias editadas</dt><dd>{report.bot.suggestionsEdited}</dd></div>
                <div><dt>Sugerencias descartadas</dt><dd>{report.bot.suggestionsDismissed}</dd></div>
              </dl>
              {report.bot.escalationReasons.length ? (
                <>
                  <h4 className="cx-sub">Por qué deriva</h4>
                  <Bars rows={report.bot.escalationReasons.map((row) => ({ label: row.reason, value: row.total }))} empty="" />
                </>
              ) : null}
            </section>
          </div>

          <section className="cx-card">
            <h3 className="cx-card-title">Vendedores</h3>
            {report.sellers.length ? (
              <table className="cx-table">
                <thead><tr><th>Vendedor</th><th>Chats</th><th>Mensajes</th><th>Ventas</th><th>Facturado</th></tr></thead>
                <tbody>
                  {report.sellers.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.chats}</td>
                      <td>{row.messages}</td>
                      <td>{row.won} <small>({percent(row.won, row.chats)})</small></td>
                      <td>{formatCents(row.wonValueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="cx-hint">Ningún chat asignado a vendedores en el período.</p>
            )}
          </section>

          <section className="cx-card">
            <h3 className="cx-card-title">Anuncios</h3>
            {report.ads.length ? (
              <table className="cx-table">
                <thead><tr><th>Anuncio</th><th>Chats</th><th>Ventas</th><th>Facturado</th></tr></thead>
                <tbody>
                  {report.ads.map((row) => (
                    <tr key={row.ad ?? "sin-id"}>
                      <td>{row.headline ?? row.ad ?? "Sin identificar"}</td>
                      <td>{row.leads}</td>
                      <td>{row.won} <small>({percent(row.won, row.leads)})</small></td>
                      <td>{formatCents(row.wonValueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="cx-hint">Ningún chat vino de un anuncio de clic a WhatsApp en el período.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
