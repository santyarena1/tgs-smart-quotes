"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { isValidCuit } from "../lib/cuit";
import type { Customer } from "../lib/types";
import { errorMessage } from "../components/shared";

export type NewCustomerKind = "PERSONA" | "EMPRESA";

const IVA_OPTIONS: Array<[string, string]> = [
  ["RESPONSABLE_INSCRIPTO", "Responsable Inscripto"],
  ["MONOTRIBUTO", "Monotributo"],
  ["EXENTO", "Exento"],
];

/**
 * Alta de cliente desde el creador de presupuestos. Se elige si es consumidor final o empresa; la empresa
 * lleva razón social, CUIT, condición frente al IVA y datos de contacto.
 */
export function LiteNewCustomer({ onCreated, onCancel, initialKind = "PERSONA", lockKind = false, title, intro, submitLabel }: {
  onCreated: (customer: Customer) => void;
  onCancel: () => void;
  initialKind?: NewCustomerKind;
  /** Deja fija la empresa (presupuesto formal): no se puede cambiar a consumidor final. */
  lockKind?: boolean;
  title?: string;
  intro?: string;
  submitLabel?: string;
}) {
  const [kind, setKind] = useState<NewCustomerKind>(initialKind);
  const [form, setForm] = useState({
    name: "", phone: "", dni: "",
    cuit: "", taxCondition: "RESPONSABLE_INSCRIPTO", address: "", email: "", contactName: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCompany = kind === "EMPRESA";
  const set = (patch: Partial<typeof form>) => setForm((cur) => ({ ...cur, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.name.trim()) { setError(isCompany ? "Poné la razón social de la empresa." : "Poné el nombre del cliente."); return; }
    if (isCompany) {
      if (!isValidCuit(form.cuit)) { setError("El CUIT no es válido: son 11 dígitos (por ejemplo 30-12345678-9)."); return; }
      if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError("El email no es válido."); return; }
    }
    setBusy(true);
    setError(null);
    try {
      const body = isCompany
        ? {
            kind: "EMPRESA",
            name: form.name.trim(),
            cuit: form.cuit.trim(),
            taxCondition: form.taxCondition,
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            contactName: form.contactName.trim() || null,
          }
        : {
            kind: "PERSONA",
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            dni: form.dni.trim() || null,
            taxCondition: "CONSUMIDOR_FINAL",
          };
      onCreated(await api<Customer>("/customers", { method: "POST", body }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="lt-modal" role="dialog" aria-modal="true" aria-label={title ?? "Cliente nuevo"} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="lt-card lt-modal-card" onSubmit={(e) => void submit(e)} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
        <h2>{title ?? "Cliente nuevo"}</h2>
        {intro ? <p className="lt-muted lt-modal-intro">{intro}</p> : null}
        {error ? <div className="lt-alert err" role="alert">{error}</div> : null}

        {lockKind ? null : (
          <div className="lt-seg" role="radiogroup" aria-label="Tipo de cliente">
            <button type="button" role="radio" aria-checked={!isCompany} className={!isCompany ? "on" : ""} onClick={() => setKind("PERSONA")}>Consumidor final</button>
            <button type="button" role="radio" aria-checked={isCompany} className={isCompany ? "on" : ""} onClick={() => setKind("EMPRESA")}>Empresa</button>
          </div>
        )}

        <label className="lt-field">{isCompany ? "Razón social" : "Nombre"}
          <input className="lt-input" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>

        {isCompany ? (
          <>
            <div className="lt-modal-grid two">
              <label className="lt-field">CUIT
                <input className="lt-input" inputMode="numeric" placeholder="30-12345678-9" value={form.cuit} onChange={(e) => set({ cuit: e.target.value })} />
              </label>
              <label className="lt-field">Condición frente al IVA
                <select className="lt-input" value={form.taxCondition} onChange={(e) => set({ taxCondition: e.target.value })}>
                  {IVA_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <label className="lt-field">Domicilio fiscal
              <input className="lt-input" value={form.address} onChange={(e) => set({ address: e.target.value })} />
            </label>
            <div className="lt-modal-grid two">
              <label className="lt-field">Teléfono
                <input className="lt-input" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </label>
              <label className="lt-field">Email
                <input className="lt-input" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
              </label>
            </div>
            <label className="lt-field">Persona de contacto
              <input className="lt-input" value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
            </label>
          </>
        ) : (
          <div className="lt-modal-grid two">
            <label className="lt-field">Teléfono
              <input className="lt-input" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </label>
            <label className="lt-field">DNI
              <input className="lt-input" value={form.dni} onChange={(e) => set({ dni: e.target.value })} />
            </label>
          </div>
        )}

        <div className="lt-modal-foot">
          <button type="button" className="lt-btn ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="lt-btn" disabled={busy}>{busy ? "Guardando…" : submitLabel ?? "Crear y seleccionar"}</button>
        </div>
      </form>
    </div>
  );
}
