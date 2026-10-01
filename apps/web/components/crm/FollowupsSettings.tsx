"use client";

import { useEffect, useState } from "react";
import { api, listWhatsappTemplates, type WhatsappTemplate } from "../../lib/api";
import { errorMessage } from "../shared";

type Step = { afterHours: number; text: string | null; templateId: string | null; variables: string[] };
type Config = { enabled: boolean; onlyBotChats: boolean; steps: Step[] };
type Upcoming = { chatKey: string; name: string | null; step: number; dueAt: string; mode: "TEXT" | "TEMPLATE" | "SKIP" };

/** Seguimiento automático de presupuestos sin respuesta. */
export function FollowupsSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState("");
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      const [cfg, list, next] = await Promise.all([
        api<Config>("/crm/followups"),
        listWhatsappTemplates(),
        api<Upcoming[]>("/crm/followups/upcoming"),
      ]);
      setConfig(cfg);
      setSaved(JSON.stringify(cfg));
      setTemplates(list.filter((item) => item.status === "APPROVED"));
      setUpcoming(next);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  useEffect(() => { void load(); }, []);

  if (!config) return <div className="cx-page"><p className="cx-hint">{error ?? "Cargando…"}</p></div>;
  const dirty = JSON.stringify(config) !== saved;
  const setStep = (index: number, values: Partial<Step>) =>
    setConfig({ ...config, steps: config.steps.map((step, position) => (position === index ? { ...step, ...values } : step)) });

  async function save() {
    setError(null);
    try {
      await api("/crm/followups", { method: "PUT", body: config });
      setNotice(config?.enabled ? "Guardado: los seguimientos están activos." : "Guardado. Los seguimientos están apagados.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="cx-page">
      <header className="cx-page-head">
        <div>
          <h1>Seguimientos automáticos</h1>
          <p className="cx-hint">
            Cuando se manda un presupuesto y el cliente no contesta, le escribimos solos. Se corta apenas responde, y el
            reloj vuelve a cero si un vendedor escribe. Pasadas las 24 h desde su último mensaje, WhatsApp solo deja mandar
            plantillas aprobadas: si el paso no tiene, se saltea. Si el cliente vino de un anuncio, las plantillas de las
            primeras 72 h no tienen costo.
          </p>
        </div>
      </header>
      {error ? <p className="cx-reply-error">{error}</p> : null}
      {notice ? <p className="cx-notice">{notice}</p> : null}

      <div className="cx-card cx-form">
        <label className="cx-check"><input type="checkbox" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} /> <strong>Seguimientos activos</strong></label>
        <label className="cx-check"><input type="checkbox" checked={config.onlyBotChats} onChange={(event) => setConfig({ ...config, onlyBotChats: event.target.checked })} /> Solo en chats que atiende el bot (no en los que tomó un vendedor)</label>
      </div>

      {config.steps.map((step, index) => {
        const template = templates.find((item) => item.id === step.templateId);
        return (
          <div key={index} className="cx-card cx-form">
            <div className="cx-qr-head">
              <strong>Paso {index + 1}</strong>
              <span className="cx-hint">a las</span>
              <input className="cx-hours" type="number" min={0.5} step={0.5} value={step.afterHours} onChange={(event) => setStep(index, { afterHours: Number(event.target.value) })} />
              <span className="cx-hint">horas de nuestro último mensaje sin respuesta</span>
              <button type="button" className="cx-link danger" style={{ marginLeft: "auto" }} onClick={() => setConfig({ ...config, steps: config.steps.filter((_, position) => position !== index) })}>Quitar</button>
            </div>
            <label>
              <span>Mensaje (si la ventana de 24 h sigue abierta) — {"{nombre}"} pone el nombre del cliente</span>
              <textarea rows={2} value={step.text ?? ""} placeholder="Hola {nombre}! Pudiste ver el presupuesto?" onChange={(event) => setStep(index, { text: event.target.value || null })} />
            </label>
            <label>
              <span>Plantilla (si la ventana ya cerró)</span>
              <select value={step.templateId ?? ""} onChange={(event) => {
                const found = templates.find((item) => item.id === event.target.value);
                setStep(index, { templateId: event.target.value || null, variables: found ? Array.from({ length: found.variableCount }, (_, position) => step.variables[position] ?? "") : [] });
              }}>
                <option value="">Sin plantilla (se saltea si la ventana cerró)</option>
                {templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.usageHint ? ` — ${item.usageHint}` : ""}</option>)}
              </select>
            </label>
            {template ? step.variables.map((value, position) => (
              <input key={position} value={value} placeholder={`Variable {{${position + 1}}}`} onChange={(event) => setStep(index, { variables: step.variables.map((item, at) => (at === position ? event.target.value : item)) })} />
            )) : null}
          </div>
        );
      })}

      <div className="cx-row-actions">
        <button type="button" className="cx-btn" disabled={config.steps.length >= 6} onClick={() => setConfig({ ...config, steps: [...config.steps, { afterHours: (config.steps.at(-1)?.afterHours ?? 0) + 24, text: null, templateId: null, variables: [] }] })}>+ Paso</button>
        <button type="button" className="cx-btn primary" disabled={!dirty} onClick={() => void save()}>Guardar</button>
      </div>

      <section className="cx-card">
        <h3 className="cx-card-title">Próximos seguimientos</h3>
        {upcoming.length ? upcoming.map((item) => (
          <div key={`${item.chatKey}-${item.step}`} className="cx-task">
            <a className="cx-link" href={`/crm?chat=${encodeURIComponent(item.chatKey)}`}>{item.name ?? item.chatKey.replace(/^tel:/, "+")}</a>
            <span className="cx-hint">paso {item.step + 1} · {item.mode === "TEXT" ? "mensaje" : item.mode === "TEMPLATE" ? "plantilla" : "se saltea (ventana cerrada sin plantilla)"}</span>
            <span className={new Date(item.dueAt) < new Date() ? "cx-pill alert" : "cx-pill muted"}>
              {new Date(item.dueAt).toLocaleString("es-AR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )) : <p className="cx-hint">Ningún presupuesto esperando respuesta ahora.</p>}
        {!config.enabled && upcoming.length ? <p className="cx-hint">Están apagados: esto es lo que saldría si los activás.</p> : null}
      </section>
    </div>
  );
}
