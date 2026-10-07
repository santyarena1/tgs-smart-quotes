"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Customer } from "../lib/types";
import { CustomerEditorModal } from "./CustomerEditorModal";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
  SearchInput,
  Stat,
  StatStrip,
  errorMessage,
  initials,
} from "./shared";

export function CustomersView() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setModalOpen(true);
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
        (c.dni ?? "").toLowerCase().includes(q) ||
        (c.cuit ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000") ||
        (c.cuit ?? "").toLowerCase().includes(q),
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
        <Stat label="Empresas" value={items.filter((c) => c.kind === "EMPRESA").length} accent="var(--violet)" />
      </StatStrip>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="toolbar">
        <SearchInput value={filter} onChange={setFilter} placeholder="Buscar por nombre, teléfono, DNI o CUIT" />
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
                {c.kind === "EMPRESA" ? <span className="kind-badge">Empresa</span> : null}
              </div>
              <div className="dir-row">
                <span aria-hidden="true">✆</span>
                {c.phone || "Sin teléfono"}
              </div>
              <div className="dir-row">
                <span aria-hidden="true">▣</span>
                {c.kind === "EMPRESA" ? (c.cuit ? `CUIT ${c.cuit}` : "Sin CUIT") : c.dni ? `DNI ${c.dni}` : "Sin DNI"}
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

      <CustomerEditorModal
        open={modalOpen}
        customer={editing}
        onClose={() => setModalOpen(false)}
        onSaved={(saved) => {
          setModalOpen(false);
          setNotice(editing ? "Cliente actualizado." : `Cliente “${saved.name}” creado.`);
          void load();
        }}
      />
    </div>
  );
}
