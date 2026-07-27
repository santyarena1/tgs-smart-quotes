"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Collection, Quote } from "../lib/types";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Pill,
  errorMessage,
} from "./shared";

type Draft = {
  id?: string;
  name: string;
  description: string;
  sortOrder: string;
  icon: string;
  archived: boolean;
  favorite: boolean;
  visibleInExtension: boolean;
  familyIds: string[];
};

const empty = (): Draft => ({
  name: "",
  description: "",
  sortOrder: "0",
  icon: "",
  archived: false,
  favorite: false,
  visibleInExtension: true,
  familyIds: [],
});

export function CollectionsView() {
  const [items, setItems] = useState<Collection[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
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
      const [collections, quoteList] = await Promise.all([
        api<Collection[]>("/collections"),
        api<Quote[]>("/quotes").catch(() => [] as Quote[]),
      ]);
      setItems([...collections].sort((a, b) => a.sortOrder - b.sortOrder));
      setQuotes(quoteList);
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

  function openEdit(c: Collection) {
    setDraft({
      id: c.id,
      name: c.name,
      description: c.description ?? "",
      sortOrder: String(c.sortOrder),
      icon: c.icon ?? "",
      archived: c.archived,
      favorite: c.favorite,
      visibleInExtension: c.visibleInExtension,
      familyIds: c.familyIds ?? [],
    });
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
        description: draft.description.trim() || null,
        sortOrder: Number(draft.sortOrder),
        icon: draft.icon.trim() || null,
        archived: draft.archived,
        favorite: draft.favorite,
        visibleInExtension: draft.visibleInExtension,
        familyIds: draft.familyIds,
      };
      if (draft.id) {
        await api(`/collections/${draft.id}`, { method: "PUT", body });
        setNotice("Colección actualizada.");
      } else {
        await api("/collections", { method: "POST", body });
        setNotice("Colección creada.");
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
    if (!window.confirm("¿Eliminar esta colección?")) return;
    try {
      await api(`/collections/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function toggleFamily(id: string) {
    setDraft((prev) => ({
      ...prev,
      familyIds: prev.familyIds.includes(id)
        ? prev.familyIds.filter((x) => x !== id)
        : [...prev.familyIds, id],
    }));
  }

  return (
    <div>
      <PageHeader
        eyebrow="Organización"
        title="Colecciones"
        subtitle="Agrupá presupuestos en catálogos reutilizables (ej: armados destacados) visibles en la extensión."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => void load()}>
              Recargar
            </button>
            <button type="button" onClick={openNew}>
              + Nueva colección
            </button>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="◆" title="Sin colecciones">
          Creá una colección para agrupar presupuestos destacados.
        </EmptyState>
      ) : (
        <div className="gallery">
          {items.map((c) => (
            <article
              key={c.id}
              className="gal-card"
              style={c.archived ? { opacity: 0.6 } : undefined}
              onClick={() => openEdit(c)}
            >
              <div className="gal-banner">
                <span className="gal-ico">{c.icon || "◆"}</span>
                {c.favorite ? <span aria-label="Favorita">★</span> : null}
              </div>
              <div className="gal-body">
                <h3>{c.name}</h3>
                {c.description ? <p className="cell-sub">{c.description}</p> : null}
                <div className="gal-meta">
                  <Pill tone="neutral">{(c.familyIds?.length ?? 0)} presupuestos</Pill>
                  {c.visibleInExtension ? <Pill tone="info">Extensión</Pill> : null}
                  {c.archived ? <Pill tone="bad">Archivada</Pill> : null}
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
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={draft.id ? "Editar colección" : "Nueva colección"}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="col-form" disabled={saving}>
              {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear colección"}
            </button>
          </>
        }
      >
        <form id="col-form" className="form-grid" onSubmit={save}>
          <div className="grid-2">
            <Field label="Nombre" htmlFor="col-name">
              <input
                id="col-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                autoFocus
              />
            </Field>
            <div className="grid-2">
              <Field label="Ícono (emoji)" htmlFor="col-icon">
                <input
                  id="col-icon"
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                  placeholder="◆"
                />
              </Field>
              <Field label="Orden" htmlFor="col-order">
                <input
                  id="col-order"
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <Field label="Descripción" htmlFor="col-desc">
            <textarea
              id="col-desc"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
          <div className="grid-3">
            <Checkbox
              label="Favorita"
              checked={draft.favorite}
              onChange={(favorite) => setDraft({ ...draft, favorite })}
            />
            <Checkbox
              label="Archivada"
              checked={draft.archived}
              onChange={(archived) => setDraft({ ...draft, archived })}
            />
            <Checkbox
              label="Visible en extensión"
              checked={draft.visibleInExtension}
              onChange={(visibleInExtension) => setDraft({ ...draft, visibleInExtension })}
            />
          </div>
          <Field label="Presupuestos asociados">
            <div className="check-grid" style={{ maxHeight: 220, overflow: "auto" }}>
              {quotes.length === 0 ? (
                <p className="muted">No hay presupuestos para asociar.</p>
              ) : (
                quotes.map((q) => (
                  <Checkbox
                    key={q.id}
                    label={`${q.visibleNumber} — ${q.internalName}`}
                    checked={draft.familyIds.includes(q.id)}
                    onChange={() => toggleFamily(q.id)}
                  />
                ))
              )}
            </div>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
