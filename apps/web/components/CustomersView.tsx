"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Customer } from "../lib/types";
import {
  Alert,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Stat,
  StatStrip,
  errorMessage,
  initials,
} from "./shared";

type Draft = { id?: string; name: string; phone: string; dni: string };
const empty = (): Draft => ({ name: "", phone: "", dni: "" });

export function CustomersView() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(empty());
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api<Customer[]>("/customers"));
    } catch (err) {
      setError(errorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setDraft(empty());
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setDraft({ id: c.id, name: c.name, phone: c.phone ?? "", dni: c.dni ?? "" });
    setModalOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        dni: draft.dni.trim() || null,
      };
      if (draft.id) {
        await api(`/customers/${draft.id}`, { method: "PUT", body });
        setNotice("Cliente actualizado.");
      } else {
        await api("/customers", { method: "POST", body });
        setNotice("Cliente creado.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("¿Eliminar este cliente?")) return;
    try {
      await api(`/customers/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.dni ?? "").toLowerCase().includes(q),
    );
  }, [filter, items]);

  const withPhone = items.filter((c) => c.phone).length;

  return (
    <div>
      <PageHeader
        eyebrow="Agenda"
        title="Clientes"
        subtitle="Directorio de contactos para asociar a solicitudes y presupuestos."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => void load()}>
              Recargar
            </button>
            <button type="button" onClick={openNew}>
              + Nuevo cliente
            </button>
          </>
        }
      />

      <StatStrip>
        <Stat label="Total clientes" value={items.length} accent="var(--red)" />
        <Stat label="Con teléfono" value={withPhone} accent="var(--info)" />
        <Stat label="Con DNI" value={items.filter((c) => c.dni).length} accent="var(--violet)" />
      </StatStrip>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="toolbar">
        <SearchInput value={filter} onChange={setFilter} placeholder="Buscar por nombre, teléfono o DNI" />
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="☺" title="Sin clientes">
          {filter ? "No hay coincidencias con tu búsqueda." : "Creá tu primer cliente para empezar."}
        </EmptyState>
      ) : (
        <div className="dir-grid">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="dir-card"
              role="button"
              tabIndex={0}
              onClick={() => openEdit(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openEdit(c);
              }}
            >
              <div className="dir-top">
                <span className="dir-avatar">{initials(c.name)}</span>
                <h3>{c.name}</h3>
              </div>
              <div className="dir-row">
                <span aria-hidden="true">✆</span>
                {c.phone || "Sin teléfono"}
              </div>
              <div className="dir-row">
                <span aria-hidden="true">▣</span>
                {c.dni ? `DNI ${c.dni}` : "Sin DNI"}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(c.id);
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={draft.id ? "Editar cliente" : "Nuevo cliente"}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="customer-form" disabled={saving}>
              {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear cliente"}
            </button>
          </>
        }
      >
        <form id="customer-form" className="form-grid" onSubmit={save}>
          <Field label="Nombre" htmlFor="cust-name">
            <input
              id="cust-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              autoFocus
            />
          </Field>
          <div className="grid-2">
            <Field label="Teléfono" htmlFor="cust-phone">
              <input
                id="cust-phone"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="Ej: 11 2345 6789"
              />
            </Field>
            <Field label="DNI" htmlFor="cust-dni">
              <input
                id="cust-dni"
                value={draft.dni}
                onChange={(e) => setDraft({ ...draft, dni: e.target.value })}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
