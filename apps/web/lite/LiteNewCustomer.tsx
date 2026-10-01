"use client";

import { useState } from "react";
import { api } from "../lib/api";
import type { Customer } from "../lib/types";
import { errorMessage } from "../components/shared";

/** Alta rápida de cliente desde el creador de presupuestos. */
export function LiteNewCustomer({ onCreated, onCancel }: { onCreated: (customer: Customer) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", dni: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.name.trim()) { setError("Poné el nombre del cliente."); return; }
    setBusy(true);
    setError(null);
    try {
      onCreated(await api<Customer>("/customers", {
        method: "POST",
        body: { name: form.name.trim(), phone: form.phone.trim() || null, dni: form.dni.trim() || null },
      }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="lt-modal" role="dialog" aria-modal="true" aria-label="Cliente nuevo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="lt-card lt-modal-card" onSubmit={(e) => void submit(e)} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
        <h2>Cliente nuevo</h2>
        {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
        <label className="lt-field">Nombre
          <input className="lt-input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <div className="lt-modal-grid two">
          <label className="lt-field">Teléfono
            <input className="lt-input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="lt-field">DNI / CUIT
            <input className="lt-input" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} />
          </label>
        </div>
        <div className="lt-modal-foot">
          <button type="button" className="lt-btn ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="lt-btn" disabled={busy}>{busy ? "Guardando…" : "Crear y seleccionar"}</button>
        </div>
      </form>
    </div>
  );
}
