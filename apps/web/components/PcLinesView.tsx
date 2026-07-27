"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PcLine } from "../lib/types";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  errorMessage,
} from "./shared";

type Draft = {
  id?: string;
  name: string;
  sortOrder: string;
  active: boolean;
};

const empty = (): Draft => ({
  name: "",
  sortOrder: "0",
  active: true,
});

export function PcLinesView() {
  const [items, setItems] = useState<PcLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(empty());
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<PcLine[]>("/pc-lines");
      setItems([...data].sort((a, b) => a.sortOrder - b.sortOrder));
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
    setDraft({ ...empty(), sortOrder: String(items.length) });
    setModalOpen(true);
  }

  function openEdit(line: PcLine) {
    setDraft({
      id: line.id,
      name: line.name,
      sortOrder: String(line.sortOrder),
      active: line.active,
    });
    setModalOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const existing = draft.id ? items.find((l) => l.id === draft.id) : undefined;
      const body = {
        name: draft.name.trim(),
        sortOrder: Number(draft.sortOrder),
        active: draft.active,
        // Campos internos del backend (similitud); no se editan en la UI.
        aliases: existing?.aliases ?? [],
        keyLine: existing?.keyLine ?? false,
        concept: existing?.concept ?? "OTHER",
      };
      if (draft.id) {
        await api(`/pc-lines/${draft.id}`, { method: "PUT", body });
        setNotice("Línea actualizada.");
      } else {
        await api("/pc-lines", { method: "POST", body });
        setNotice("Línea creada.");
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
    if (!window.confirm("¿Eliminar esta línea de PC?")) return;
    try {
      await api(`/pc-lines/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catálogo"
        title="Líneas de PC"
        subtitle="Definí el esquema de una PC (CPU, Motherboard, GPU…). Al armar un presupuesto en modo PC armada aparecen como ranuras para elegir productos y el sistema recuerda en qué línea va cada uno."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => void load()}>
              Recargar
            </button>
            <button type="button" onClick={openNew}>
              + Nueva línea
            </button>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="▥" title="Sin líneas configuradas">
          Creá líneas en el orden del armado (por ejemplo CPU, Motherboard, RAM, GPU…). En
          presupuestos “PC armada” cada línea aparece como una ranura para elegir el producto.
        </EmptyState>
      ) : (
        <div className="cfg-list">
          {items.map((line) => (
            <div
              key={line.id}
              className="cfg-row"
              style={line.active ? undefined : { opacity: 0.55 }}
            >
              <span className="cfg-order">{line.sortOrder}</span>
              <div className="cfg-main">
                <div className="hstack">
                  <h3>{line.name}</h3>
                  {!line.active ? <span className="badge">Inactiva</span> : null}
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(line)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => void remove(line.id)}
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
        title={draft.id ? "Editar línea" : "Nueva línea"}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="line-form" disabled={saving}>
              {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear línea"}
            </button>
          </>
        }
      >
        <form id="line-form" className="form-grid" onSubmit={save}>
          <Field label="Nombre" htmlFor="line-name">
            <input
              id="line-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              autoFocus
            />
          </Field>
          <Field
            label="Orden"
            htmlFor="line-order"
            hint="Número menor = aparece antes en la referencia del presupuesto."
          >
            <input
              id="line-order"
              type="number"
              value={draft.sortOrder}
              onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
              required
            />
          </Field>
          <Checkbox
            label="Activa"
            checked={draft.active}
            onChange={(active) => setDraft({ ...draft, active })}
          />
        </form>
      </Modal>
    </div>
  );
}
