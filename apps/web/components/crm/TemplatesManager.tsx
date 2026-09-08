"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  deleteWhatsappTemplate,
  listWhatsappTemplates,
  saveWhatsappTemplate,
  syncWhatsappTemplates,
  type WhatsappTemplate,
} from "../../lib/api";
import { Alert, Loading, errorMessage } from "../shared";
import { IconCheck, IconClock, IconPlus } from "./icons";

/**
 * Plantillas aprobadas por Meta.
 *
 * Son el único contenido que WhatsApp deja enviar cuando la ventana de 24 h está
 * cerrada, así que sostienen los recontactos. El cuerpo lo aprueba Meta: acá se
 * registra para poder elegirlo y completar sus variables, y se sincroniza el estado
 * real desde el otro lado.
 */
const STATUS_TONE: Record<string, string> = {
  APPROVED: "ok",
  PENDING: "warn",
  REJECTED: "bad",
  PAUSED: "warn",
  DISABLED: "bad",
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprobada",
  PENDING: "En revisión",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Deshabilitada",
};

/** Resalta los placeholders {{n}} para que se distingan del texto fijo aprobado. */
function highlightVariables(body: string) {
  return body.split(/(\{\{\s*\d+\s*\}\})/g).map((chunk, index) =>
    /^\{\{\s*\d+\s*\}\}$/.test(chunk)
      ? <span key={index} className="crm-template-var">{chunk}</span>
      : <span key={index}>{chunk}</span>);
}

const EMPTY = {
  name: "",
  language: "es_AR",
  category: "MARKETING",
  body: "",
  usageHint: "",
  useForRecontact: false,
};

export function TemplatesManager() {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [draft, setDraft] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await listWhatsappTemplates());
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveWhatsappTemplate(draft);
      setDraft(EMPTY);
      setNotice("Plantilla registrada. Recordá que Meta tiene que aprobarla antes de poder usarla.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await syncWhatsappTemplates();
      setNotice(`Se sincronizaron ${result.synced} plantillas desde Meta.`);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: WhatsappTemplate) {
    if (!window.confirm(`¿Eliminar la plantilla "${template.name}" de este sistema?`)) return;
    setBusy(true);
    try {
      await deleteWhatsappTemplate(template.id);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const variableCount = (draft.body.match(/\{\{\s*\d+\s*\}\}/g) ?? []).length;

  return (
    <div className="crm-templates">
      <header className="crm-templates-head">
        <div>
          <h1>Plantillas de WhatsApp</h1>
          <p className="crm-hint">
            Pasadas 24 h sin que el cliente escriba, WhatsApp solo permite mandar plantillas
            aprobadas por Meta. Son las que se usan para retomar una conversación.
          </p>
        </div>
        <button type="button" className="btn-dark" onClick={() => void sync()} disabled={busy}>
          {busy ? "Sincronizando…" : "Sincronizar con Meta"}
        </button>
      </header>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <section className="crm-templates-list">
        {loading ? (
          <Loading label="Cargando plantillas…" />
        ) : templates.length === 0 ? (
          <p className="crm-list-empty">
            Todavía no hay plantillas. Creá una acá y después dala de alta en Meta con el mismo
            nombre y cuerpo, o sincronizá si ya las tenés cargadas del otro lado.
          </p>
        ) : (
          templates.map((template) => (
            <article key={template.id} className={template.status === "REJECTED" ? "crm-template-card rejected" : "crm-template-card"}>
              <div className="crm-template-card-head">
                <strong>{template.name}</strong>
                <span className={`crm-tag ${STATUS_TONE[template.status] ?? "muted"}`}>
                  {STATUS_LABEL[template.status] ?? template.status}
                </span>
                <span className="crm-tag muted">{template.language}</span>
                {template.useForRecontact ? <span className="crm-tag info">Recontactos</span> : null}
              </div>
              <p className="crm-template-body">{highlightVariables(template.body)}</p>
              {template.usageHint ? <p className="crm-hint">{template.usageHint}</p> : null}
              <div className="crm-template-card-foot">
                <span className="crm-hint">
                  {template.variableCount === 0
                    ? "Sin variables"
                    : `${template.variableCount} variable${template.variableCount === 1 ? "" : "s"}`}
                </span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => void remove(template)} disabled={busy}>
                  Eliminar
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <form className="crm-template-new" onSubmit={save}>
        <h2>Registrar una plantilla</h2>
        <label>
          <span>Nombre</span>
          <input
            className="crm-input"
            required
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="retomar_presupuesto"
            pattern="[a-z0-9_]+"
            title="Meta solo acepta minúsculas, números y guiones bajos"
          />
        </label>
        <div className="crm-template-new-row">
          <label>
            <span>Idioma</span>
            <input
              className="crm-input"
              required
              value={draft.language}
              onChange={(event) => setDraft({ ...draft, language: event.target.value })}
            />
          </label>
          <label>
            <span>Categoría</span>
            <select
              className="crm-select"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            >
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utilidad</option>
              <option value="AUTHENTICATION">Autenticación</option>
            </select>
          </label>
        </div>
        <label>
          <span>Cuerpo</span>
          <textarea
            className="crm-textarea"
            required
            rows={3}
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            placeholder="Hola {{1}}, te escribo de The Gamer Shop por el presupuesto de {{2}}. ¿Seguís interesado?"
          />
          <small className="crm-hint">
            Usá {"{{1}}"}, {"{{2}}"}… para las partes variables. Detectadas: {variableCount}.
            El resto del texto es fijo y lo aprueba Meta.
          </small>
        </label>
        <label>
          <span>¿Cuándo conviene usarla?</span>
          <input
            className="crm-input"
            value={draft.usageHint}
            onChange={(event) => setDraft({ ...draft, usageHint: event.target.value })}
            placeholder="Cliente que pidió presupuesto y no respondió"
          />
        </label>
        <label className="crm-template-check">
          <input
            type="checkbox"
            checked={draft.useForRecontact}
            onChange={(event) => setDraft({ ...draft, useForRecontact: event.target.checked })}
          />
          <span>Usar para recontactos</span>
        </label>
        <button type="submit" className="btn-dark" disabled={busy}>
          {busy ? "Guardando…" : "Registrar plantilla"}
        </button>
      </form>
    </div>
  );
}
