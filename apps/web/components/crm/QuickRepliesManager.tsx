"use client";

import { useEffect, useState } from "react";
import { deleteQuickReply, listQuickReplies, saveQuickReply, type QuickReply } from "../../lib/crm";
import { errorMessage } from "../shared";

const EXAMPLES: Array<Omit<QuickReply, "id">> = [
  {
    shortcut: "pagos",
    title: "Medios de pago",
    body: "Tenés todos estos medios de pago:\n- Efectivo (precio del presupuesto)\n- Transferencia (precio del presupuesto)\n- Dólares cara grande\n- Tarjeta de crédito en 3, 6 o 12 cuotas con interés\n- Tarjeta de débito (se cobra un recargo)\nComo querías abonar la tuya?",
  },
  { shortcut: "uso", title: "Preguntar el uso", body: "Comentame {nombre}, buscás una PC para juegos, diseño, trabajo, estudio?" },
  { shortcut: "locales", title: "Dirección de los locales", body: "Estamos en Liniers, Av. Lisandro de la Torre 373, y en Naón, Carhué 1409. Lunes a viernes de 10 a 19 hs y sábados de 10:30 a 13:30 hs!" },
];

/** Respuestas rápidas: en cualquier chat se insertan escribiendo "/" y el atajo. */
export function QuickRepliesManager() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listQuickReplies().then(setItems).catch((reason) => setError(errorMessage(reason)));
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!editing?.shortcut || !editing.title || !editing.body) {
      setError("Completá atajo, título y texto.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveQuickReply({ shortcut: editing.shortcut, title: editing.title, body: editing.body }, editing.id);
      setEditing(null);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cx-page">
      <header className="cx-page-head">
        <div>
          <h1>Respuestas rápidas</h1>
          <p className="cx-hint">En cualquier chat escribí <kbd>/</kbd> y el atajo para insertarla. <code>{"{nombre}"}</code> se reemplaza por el nombre del cliente.</p>
        </div>
        <button type="button" className="cx-btn primary" onClick={() => setEditing({ shortcut: "", title: "", body: "" })}>+ Nueva</button>
      </header>
      {error ? <p className="cx-reply-error">{error}</p> : null}

      {editing ? (
        <div className="cx-card cx-form">
          <label>
            <span>Atajo</span>
            <div className="cx-prefix"><span>/</span><input value={editing.shortcut ?? ""} onChange={(event) => setEditing({ ...editing, shortcut: event.target.value.replace(/\s+/g, "") })} placeholder="pagos" /></div>
          </label>
          <label>
            <span>Título</span>
            <input value={editing.title ?? ""} onChange={(event) => setEditing({ ...editing, title: event.target.value })} placeholder="Medios de pago" />
          </label>
          <label>
            <span>Texto</span>
            <textarea rows={6} value={editing.body ?? ""} onChange={(event) => setEditing({ ...editing, body: event.target.value })} />
          </label>
          <div className="cx-row-actions">
            <button type="button" className="cx-btn primary" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar"}</button>
            <button type="button" className="cx-btn" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {items.length === 0 && !editing ? (
        <div className="cx-card">
          <p>Todavía no hay respuestas rápidas. Podés arrancar con estas:</p>
          <div className="cx-row-actions">
            {EXAMPLES.map((example) => (
              <button key={example.shortcut} type="button" className="cx-btn" onClick={() => setEditing(example)}>+ /{example.shortcut}</button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="cx-qr-list">
        {items.map((item) => (
          <article key={item.id} className="cx-card cx-qr">
            <div className="cx-qr-head">
              <code>/{item.shortcut}</code>
              <strong>{item.title}</strong>
              <span className="cx-row-actions">
                <button type="button" className="cx-btn" onClick={() => setEditing(item)}>Editar</button>
                <button
                  type="button"
                  className="cx-btn danger"
                  onClick={() => void deleteQuickReply(item.id).then(load).catch((reason) => setError(errorMessage(reason)))}
                >
                  Borrar
                </button>
              </span>
            </div>
            <p className="cx-qr-body">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
