"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  associatedQuotesOf,
  normalizeCollectionQuote,
  quoteCollectionLabel,
  quotesMatchingQuery,
  type CollectionQuoteRef,
} from "../lib/collection-quotes";
import type { Collection, Quote } from "../lib/types";
import { QuotesView } from "./QuotesView";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Pill,
  SearchInput,
  errorMessage,
  useKeyboardNav,
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

function asQuoteRef(quote: Quote): CollectionQuoteRef {
  return (
    normalizeCollectionQuote({
      id: quote.id,
      visibleNumber: quote.visibleNumber,
      internalName: quote.internalName,
      customerName: quote.customer?.name ?? null,
    }) ?? {
      id: quote.id,
      visibleNumber: quote.visibleNumber,
      internalName: quote.internalName,
      customerName: quote.customer?.name ?? null,
    }
  );
}

export function CollectionsView() {
  const [items, setItems] = useState<Collection[]>([]);
  const [quotes, setQuotes] = useState<CollectionQuoteRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(empty());
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [viewing, setViewing] = useState<Collection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [collections, quoteList] = await Promise.all([
        api<Collection[]>("/collections"),
        api<Quote[]>("/quotes").catch(() => [] as Quote[]),
      ]);
      const sorted = [...collections].sort((a, b) => a.sortOrder - b.sortOrder);
      setItems(sorted);
      setQuotes(quoteList.map(asQuoteRef));
      setViewing((current) => {
        if (!current) return null;
        return sorted.find((row) => row.id === current.id) ?? current;
      });
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

  const associatedQuotes = useMemo(
    () => associatedQuotesOf({ familyIds: draft.familyIds }, quotes),
    [quotes, draft.familyIds],
  );
  const quoteMatches = useMemo(
    () => quotesMatchingQuery(quotes, quoteQuery, new Set(draft.familyIds)),
    [quotes, quoteQuery, draft.familyIds],
  );
  const {
    activeIndex: quoteActive,
    setActiveIndex: setQuoteActive,
    onKeyDown: onQuoteKeyDown,
  } = useKeyboardNav({
    itemCount: quoteMatches.length,
    enabled: modalOpen && quoteMatches.length > 0,
    resetKey: quoteQuery,
    onSelect: (index) => {
      const quote = quoteMatches[index];
      if (quote) addQuote(quote.id);
    },
    onEscape: () => setQuoteQuery(""),
  });

  function openNew() {
    setDraft({ ...empty(), sortOrder: String(items.length) });
    setQuoteQuery("");
    setModalOpen(true);
  }

  function openView(c: Collection) {
    setViewing(c);
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
      familyIds:
        c.familyIds ??
        associatedQuotesOf(c, quotes).map((quote) => quote.id),
    });
    setQuoteQuery("");
    if (c.quotes?.length) {
      setQuotes((prev) => {
        const byId = new Map(prev.map((quote) => [quote.id, quote]));
        for (const quote of c.quotes ?? []) byId.set(quote.id, quote);
        return [...byId.values()];
      });
    }
    setModalOpen(true);
  }

  function addQuote(id: string) {
    setDraft((prev) =>
      prev.familyIds.includes(id) ? prev : { ...prev, familyIds: [...prev.familyIds, id] },
    );
    setQuoteQuery("");
  }

  function removeQuote(id: string) {
    setDraft((prev) => ({
      ...prev,
      familyIds: prev.familyIds.filter((familyId) => familyId !== id),
    }));
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
      if (viewing?.id === id) setViewing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const viewingQuotes = viewing ? associatedQuotesOf(viewing, quotes) : [];
  const viewingFamilyIds = viewingQuotes.map((quote) => quote.id);

  return (
    <div>
      {viewing ? (
        <PageHeader
          eyebrow="Colección"
          title={viewing.name}
          subtitle={viewing.description || "Presupuestos de esta colección, con las mismas acciones que en Presupuestos."}
          actions={
            <>
              <button type="button" className="btn-ghost" onClick={() => setViewing(null)}>
                ← Colecciones
              </button>
              <button type="button" onClick={() => openEdit(viewing)}>
                Editar colección
              </button>
              <button type="button" className="btn-danger" onClick={() => void remove(viewing.id)}>
                Eliminar
              </button>
            </>
          }
        />
      ) : (
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
      )}

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      {viewing ? (
        <>
          <div className="gal-meta" style={{ marginBottom: "0.85rem" }}>
            <Pill tone="neutral">
              {viewingQuotes.length} presupuesto{viewingQuotes.length === 1 ? "" : "s"}
            </Pill>
            {viewing.visibleInExtension ? <Pill tone="info">Extensión</Pill> : null}
            {viewing.favorite ? <Pill tone="ok">Favorita</Pill> : null}
            {viewing.archived ? <Pill tone="bad">Archivada</Pill> : null}
          </div>
          <QuotesView key={viewing.id} embedded onlyFamilyIds={viewingFamilyIds} />
        </>
      ) : loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="◆" title="Sin colecciones">
          Creá una colección para agrupar presupuestos destacados.
        </EmptyState>
      ) : (
        <div className="gallery">
          {items.map((c) => {
            const associated = associatedQuotesOf(c, quotes);
            const extra = associated.length > 6 ? associated.length - 6 : 0;
            return (
              <article
                key={c.id}
                className="gal-card"
                style={c.archived ? { opacity: 0.6 } : undefined}
              >
                <div className="gal-banner">
                  <span className="gal-ico">{c.icon || "◆"}</span>
                  {c.favorite ? <span aria-label="Favorita">★</span> : null}
                </div>
                <div className="gal-body">
                  <h3>{c.name}</h3>
                  {c.description ? <p className="cell-sub">{c.description}</p> : null}
                  <div className="gal-meta">
                    <Pill tone="neutral">
                      {associated.length} presupuesto{associated.length === 1 ? "" : "s"}
                    </Pill>
                    {c.visibleInExtension ? <Pill tone="info">Extensión</Pill> : null}
                    {c.archived ? <Pill tone="bad">Archivada</Pill> : null}
                  </div>
                  {associated.length === 0 ? (
                    <p className="muted">Sin presupuestos asociados</p>
                  ) : (
                    <ul className="gal-quotes">
                      {associated.slice(0, 6).map((quote) => (
                        <li key={quote.id}>{quoteCollectionLabel(quote)}</li>
                      ))}
                      {extra > 0 ? <li className="gal-quote-more">+{extra} más</li> : null}
                    </ul>
                  )}
                  <div className="row-actions">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => openView(c)}>
                      Ver
                    </button>
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      onClick={() => void remove(c.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
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
          <div className="combo-editor">
            <p className="section-label">Presupuestos asociados</p>
            <SearchInput
              value={quoteQuery}
              onChange={setQuoteQuery}
              onKeyDown={onQuoteKeyDown}
              placeholder="Buscar presupuesto para agregar… (número, nombre o cliente)"
            />
            {quoteMatches.length > 0 ? (
              <div className="picker-results inline" role="listbox">
                {quoteMatches.map((quote, idx) => (
                  <button
                    key={quote.id}
                    id={`col-quote-opt-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={quoteActive === idx}
                    className={`picker-option${quoteActive === idx ? " is-active" : ""}`}
                    onMouseEnter={() => setQuoteActive(idx)}
                    onClick={() => addQuote(quote.id)}
                  >
                    <span className="po-name">{quoteCollectionLabel(quote)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {associatedQuotes.length === 0 ? (
              <p className="muted">Todavía no hay presupuestos en esta colección. Buscá uno para agregarlo.</p>
            ) : (
              <ul className="col-quote-list">
                {associatedQuotes.map((quote) => (
                  <li key={quote.id} className="col-quote-row">
                    <span>{quoteCollectionLabel(quote)}</span>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => removeQuote(quote.id)}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
