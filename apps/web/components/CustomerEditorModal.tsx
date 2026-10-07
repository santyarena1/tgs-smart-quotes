"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { isValidCuit } from "../lib/cuit";
import type { Customer } from "../lib/types";
import { Alert, Field, Modal, errorMessage } from "./shared";

export type CustomerKind = "PERSONA" | "EMPRESA";

type Draft = {
  kind: CustomerKind;
  name: string;
  phone: string;
  dni: string;
  address: string;
  taxCondition: string;
  cuit: string;
  email: string;
  contactName: string;
};

const blank = (kind: CustomerKind): Draft => ({
  kind, name: "", phone: "", dni: "", address: "",
  taxCondition: kind === "EMPRESA" ? "RESPONSABLE_INSCRIPTO" : "CONSUMIDOR_FINAL",
  cuit: "", email: "", contactName: "",
});

const fromCustomer = (c: Customer): Draft => ({
  kind: c.kind ?? "PERSONA",
  name: c.name,
  phone: c.phone ?? "",
  dni: c.dni ?? "",
  address: c.address ?? "",
  taxCondition: c.taxCondition ?? (c.kind === "EMPRESA" ? "RESPONSABLE_INSCRIPTO" : ""),
  cuit: c.cuit ?? "",
  email: c.email ?? "",
  contactName: c.contactName ?? "",
});

/**
 * Alta y edición de clientes. Se elige si es consumidor final o empresa; la empresa lleva razón social, CUIT,
 * condición frente al IVA, domicilio y datos de contacto.
 */
export function CustomerEditorModal({ open, onClose, customer, initialKind = "PERSONA", lockKind = false, title, intro, submitLabel, onSaved }: {
  open: boolean;
  onClose: () => void;
  /** Si viene, se edita ese cliente; si no, se crea uno nuevo. */
  customer?: Customer | null;
  initialKind?: CustomerKind;
  /** Deja fijo el tipo (presupuesto formal: siempre empresa). */
  lockKind?: boolean;
  title?: string;
  intro?: string;
  submitLabel?: string;
  onSaved: (customer: Customer) => void;
}) {
  const [draft, setDraft] = useState<Draft>(blank(initialKind));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(customer ? fromCustomer(customer) : blank(initialKind));
    setError(null);
    setSaving(false);
  }, [open, customer, initialKind]);

  const isCompany = draft.kind === "EMPRESA";
  const set = (patch: Partial<Draft>) => setDraft((cur) => ({ ...cur, ...patch }));

  function changeKind(kind: CustomerKind) {
    setDraft((cur) => ({
      ...cur,
      kind,
      // Al cambiar de tipo se propone la condición habitual de cada uno.
      taxCondition: kind === "EMPRESA"
        ? (cur.taxCondition && cur.taxCondition !== "CONSUMIDOR_FINAL" ? cur.taxCondition : "RESPONSABLE_INSCRIPTO")
        : (cur.taxCondition && cur.taxCondition !== "RESPONSABLE_INSCRIPTO" ? cur.taxCondition : "CONSUMIDOR_FINAL"),
    }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (isCompany) {
      if (!isValidCuit(draft.cuit)) { setError("El CUIT no es válido: son 11 dígitos (por ejemplo 30-12345678-9)."); return; }
      if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) { setError("El email no es válido."); return; }
    }
    setSaving(true);
    setError(null);
    try {
      const body = isCompany
        ? {
            kind: "EMPRESA",
            name: draft.name.trim(),
            cuit: draft.cuit.trim(),
            taxCondition: draft.taxCondition,
            address: draft.address.trim() || null,
            phone: draft.phone.trim() || null,
            email: draft.email.trim() || null,
            contactName: draft.contactName.trim() || null,
          }
        : {
            kind: "PERSONA",
            name: draft.name.trim(),
            phone: draft.phone.trim() || null,
            dni: draft.dni.trim() || null,
            address: draft.address.trim() || null,
            taxCondition: draft.taxCondition || null,
          };
      const saved = customer
        ? await api<Customer>(`/customers/${customer.id}`, { method: "PUT", body })
        : await api<Customer>("/customers", { method: "POST", body });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title ?? (customer ? "Editar cliente" : "Nuevo cliente")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="customer-editor-form" disabled={saving}>
            {saving ? "Guardando…" : submitLabel ?? (customer ? "Guardar cambios" : "Crear cliente")}
          </button>
        </>
      }
    >
      <form id="customer-editor-form" className="form-grid" onSubmit={save}>
        {intro ? <p className="muted" style={{ margin: 0 }}>{intro}</p> : null}
        {error ? <Alert>{error}</Alert> : null}

        {lockKind ? null : (
          <div className="kind-seg" role="radiogroup" aria-label="Tipo de cliente">
            <button type="button" role="radio" aria-checked={!isCompany} className={!isCompany ? "on" : ""} onClick={() => changeKind("PERSONA")}>Consumidor final</button>
            <button type="button" role="radio" aria-checked={isCompany} className={isCompany ? "on" : ""} onClick={() => changeKind("EMPRESA")}>Empresa</button>
          </div>
        )}

        <Field label={isCompany ? "Razón social" : "Nombre"} htmlFor="cust-name">
          <input id="cust-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} required autoFocus />
        </Field>

        {isCompany ? (
          <>
            <div className="grid-2">
              <Field label="CUIT" htmlFor="cust-cuit">
                <input id="cust-cuit" inputMode="numeric" placeholder="30-12345678-9" value={draft.cuit} onChange={(e) => set({ cuit: e.target.value })} required />
              </Field>
              <Field label="Condición frente al IVA" htmlFor="cust-iva">
                <select id="cust-iva" value={draft.taxCondition} onChange={(e) => set({ taxCondition: e.target.value })}>
                  <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                  <option value="MONOTRIBUTO">Monotributo</option>
                  <option value="EXENTO">Exento</option>
                </select>
              </Field>
            </div>
            <Field label="Domicilio fiscal" htmlFor="cust-address">
              <input id="cust-address" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <div className="grid-2">
              <Field label="Teléfono" htmlFor="cust-phone">
                <input id="cust-phone" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Ej: 11 2345 6789" />
              </Field>
              <Field label="Email" htmlFor="cust-email">
                <input id="cust-email" type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} />
              </Field>
            </div>
            <Field label="Persona de contacto" htmlFor="cust-contact">
              <input id="cust-contact" value={draft.contactName} onChange={(e) => set({ contactName: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <div className="grid-2">
              <Field label="Teléfono" htmlFor="cust-phone">
                <input id="cust-phone" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Ej: 11 2345 6789" />
              </Field>
              <Field label="DNI" htmlFor="cust-dni">
                <input id="cust-dni" value={draft.dni} onChange={(e) => set({ dni: e.target.value })} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Dirección" htmlFor="cust-address">
                <input id="cust-address" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
              <Field label="Cond. Fiscal" htmlFor="cust-tax-condition">
                <select id="cust-tax-condition" value={draft.taxCondition} onChange={(e) => set({ taxCondition: e.target.value })}>
                  <option value="">Sin especificar</option>
                  <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
                  <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                  <option value="MONOTRIBUTO">Monotributo</option>
                  <option value="EXENTO">Exento</option>
                </select>
              </Field>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
