"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { api } from "../lib/api";
import { formatArs, parseArsToCents } from "../lib/money";
import type { Customer, Quote, QuoteFromRequestSeed, QuoteRequest, RequestState } from "../lib/types";
import {
  Alert,
  Field,
  Loading,
  Modal,
  MoneyInput,
  PageHeader,
  Pill,
  SearchInput,
  Tone,
  errorMessage,
  useKeyboardNav,
} from "./shared";

type Draft = {
  id?: string;
  title: string;
  originalText: string;
  internalNotes: string;
  customerId: string;
  detectedPhone: string;
  maxBudgetArs: string;
  expectedUse: string;
  requiredComponents: string;
  state: RequestState;
};

type QuoteSuggestion = {
  id: string;
  visibleNumber: string;
  internalName: string;
  requestId: string | null;
  customerId: string | null;
  customerName: string | null;
  state: string | null;
  totalSaleCents: string | null;
  score: number;
  preview: string[];
};

const empty = (): Draft => ({
  title: "",
  originalText: "",
  internalNotes: "",
  customerId: "",
  detectedPhone: "",
  maxBudgetArs: "",
  expectedUse: "",
  requiredComponents: "",
  state: "PENDIENTE",
});

const COLUMNS: { state: RequestState; label: string; color: string; tone: Tone }[] = [
  { state: "PENDIENTE", label: "Pendiente", color: "var(--faint)", tone: "neutral" },
  { state: "EN_PREPARACION", label: "En preparación", color: "var(--warn)", tone: "warn" },
  { state: "LISTA", label: "Lista", color: "var(--info)", tone: "info" },
  { state: "ENVIADA", label: "Enviada", color: "var(--violet)", tone: "violet" },
  { state: "CERRADA", label: "Cerrada", color: "var(--ok)", tone: "ok" },
];

const NEXT_STATE: Partial<Record<RequestState, RequestState>> = {
  PENDIENTE: "EN_PREPARACION",
  EN_PREPARACION: "LISTA",
  LISTA: "ENVIADA",
  ENVIADA: "CERRADA",
};

export function RequestsView({
  onCreateAndAssociateQuote,
}: {
  onCreateAndAssociateQuote?: (seed: QuoteFromRequestSeed) => void;
} = {}) {
  const [items, setItems] = useState<QuoteRequest[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(empty());
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<RequestState | null>(null);

  const [associateReq, setAssociateReq] = useState<QuoteRequest | null>(null);
  const [suggestions, setSuggestions] = useState<QuoteSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteMatches, setQuoteMatches] = useState<Quote[]>([]);
  const [quoteSearching, setQuoteSearching] = useState(false);
  const [associatingId, setAssociatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [requests, custs] = await Promise.all([
        api<QuoteRequest[]>("/requests"),
        api<Customer[]>("/customers").catch(() => [] as Customer[]),
      ]);
      setItems(requests);
      setCustomers(custs);
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

  useEffect(() => {
    if (!associateReq) return;
    const q = quoteQuery.trim();
    if (q.length < 2) {
      setQuoteMatches([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setQuoteSearching(true);
      void api<{ items: Quote[] } | Quote[]>("/quotes/search", {
        query: { q, page: 1, pageSize: 8, sort: "lastActivityAt", order: "desc" },
      })
        .then((payload) => {
          const list = Array.isArray(payload) ? payload : (payload.items ?? []);
          setQuoteMatches(list);
        })
        .catch(() => setQuoteMatches([]))
        .finally(() => setQuoteSearching(false));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [quoteQuery, associateReq]);

  const associateOptions = useMemo(() => {
    type Opt =
      | { kind: "suggest"; row: QuoteSuggestion }
      | { kind: "search"; row: Quote };
    const opts: Opt[] = [];
    const seen = new Set<string>();
    for (const row of suggestions) {
      opts.push({ kind: "suggest", row });
      seen.add(row.id);
    }
    for (const row of quoteMatches) {
      if (seen.has(row.id)) continue;
      opts.push({ kind: "search", row });
      seen.add(row.id);
    }
    return opts;
  }, [suggestions, quoteMatches]);

  const {
    activeIndex: associateActive,
    setActiveIndex: setAssociateActive,
    onKeyDown: onAssociateKeyDown,
  } = useKeyboardNav({
    itemCount: associateOptions.length,
    enabled: Boolean(associateReq) && associateOptions.length > 0,
    resetKey: `${quoteQuery}:${suggestions.length}`,
    onSelect: (index) => {
      const opt = associateOptions[index];
      if (!opt) return;
      if (opt.kind === "suggest") {
        void associateFamily(opt.row.id, opt.row.visibleNumber);
      } else {
        void associateFamily(opt.row.id, opt.row.visibleNumber);
      }
    },
    onEscape: () => setAssociateReq(null),
  });

  function openNew() {
    setDraft(empty());
    setModalOpen(true);
  }

  function openEdit(req: QuoteRequest) {
    setDraft({
      id: req.id,
      title: req.title,
      originalText: req.originalText ?? "",
      internalNotes: req.internalNotes ?? "",
      customerId: req.customerId ?? "",
      detectedPhone: req.detectedPhone ?? "",
      maxBudgetArs: budgetInput(req.maximumBudgetCents),
      expectedUse: req.expectedUse ?? "",
      requiredComponents: (req.requiredComponents ?? []).join(", "),
      state: req.state,
    });
    setModalOpen(true);
  }

  function bodyFromDraft(d: Draft) {
    return {
      title: d.title.trim(),
      originalText: d.originalText,
      internalNotes: d.internalNotes,
      customerId: d.customerId || null,
      detectedPhone: d.detectedPhone.trim() || null,
      maximumBudgetCents: d.maxBudgetArs.trim() ? parseArsToCents(d.maxBudgetArs) : null,
      expectedUse: d.expectedUse.trim() || null,
      requiredComponents: d.requiredComponents.split(",").map((x) => x.trim()).filter(Boolean),
      state: d.state,
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = bodyFromDraft(draft);
      if (draft.id) {
        await api(`/requests/${draft.id}`, { method: "PUT", body });
        setNotice("Solicitud actualizada.");
      } else {
        await api("/requests", { method: "POST", body });
        setNotice("Solicitud creada.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function moveToState(req: QuoteRequest, next: RequestState) {
    if (req.state === next) return;
    setError(null);
    // Optimistic UI
    setItems((prev) => prev.map((r) => (r.id === req.id ? { ...r, state: next } : r)));
    try {
      await api(`/requests/${req.id}`, {
        method: "PUT",
        body: { state: next },
      });
    } catch (err) {
      setError(errorMessage(err));
      await load();
    }
  }

  async function advance(req: QuoteRequest) {
    const next = NEXT_STATE[req.state];
    if (!next) return;
    await moveToState(req, next);
  }

  async function createAndAssociate(req: QuoteRequest) {
    if (!onCreateAndAssociateQuote) return;
    setStartingId(req.id);
    setError(null);
    setNotice(null);
    try {
      const prepared = await api<{
        seed: QuoteFromRequestSeed;
        customer: { id: string; name: string; phone: string | null };
      }>(`/requests/${req.id}/prepare-quote`, { method: "POST" });
      setNotice(
        `Cliente asociado: ${prepared.customer.name}${
          prepared.customer.phone ? ` (${prepared.customer.phone})` : ""
        }.`,
      );
      onCreateAndAssociateQuote(prepared.seed);
    } catch (err) {
      console.warn("prepare-quote falló, abriendo con datos locales", err);
      onCreateAndAssociateQuote({
        requestId: req.id,
        customerId: req.customerId,
        internalName: req.title.trim() || `Solicitud ${req.id.slice(0, 8)}`,
      });
    } finally {
      setStartingId(null);
    }
  }

  async function openAssociate(req: QuoteRequest) {
    setAssociateReq(req);
    setQuoteQuery("");
    setQuoteMatches([]);
    setSuggestions([]);
    setSuggestLoading(true);
    setError(null);
    try {
      const res = await api<{ suggestions: QuoteSuggestion[] }>(
        `/requests/${req.id}/suggest-quotes`,
      );
      setSuggestions(res.suggestions ?? []);
    } catch (err) {
      setError(errorMessage(err));
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }

  async function associateFamily(familyId: string, label: string) {
    if (!associateReq) return;
    setAssociatingId(familyId);
    setError(null);
    setNotice(null);
    try {
      await api(`/requests/${associateReq.id}/associate-quote`, {
        method: "POST",
        body: { familyId },
      });
      setNotice(`Presupuesto ${label} asociado a la solicitud.`);
      setAssociateReq(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAssociatingId(null);
    }
  }

  function customerName(req: QuoteRequest) {
    return req.customer?.name ?? customers.find((c) => c.id === req.customerId)?.name ?? null;
  }

  function onDragStart(e: DragEvent, req: QuoteRequest) {
    setDraggingId(req.id);
    e.dataTransfer.setData("text/plain", req.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  function onColumnDragOver(e: DragEvent, state: RequestState) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(state);
  }

  function onColumnDrop(e: DragEvent, state: RequestState) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    setDropTarget(null);
    setDraggingId(null);
    if (!id) return;
    const req = items.find((r) => r.id === id);
    if (!req) return;
    void moveToState(req, state);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Entrada"
        title="Solicitudes"
        subtitle="Arrastrá las tarjetas entre columnas. Podés crear un presupuesto nuevo o asociar uno existente."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => void load()}>
              Recargar
            </button>
            <button type="button" onClick={openNew}>
              + Nueva solicitud
            </button>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      {loading ? (
        <Loading />
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const cards = items.filter((r) => r.state === col.state);
            return (
              <section
                className={`kcol${dropTarget === col.state ? " drop-target" : ""}`}
                key={col.state}
                onDragOver={(e) => onColumnDragOver(e, col.state)}
                onDragLeave={() => setDropTarget((cur) => (cur === col.state ? null : cur))}
                onDrop={(e) => onColumnDrop(e, col.state)}
              >
                <header className="kcol-head" style={{ ["--kc" as string]: col.color } as never}>
                  <span>{col.label}</span>
                  <span className="count">{cards.length}</span>
                </header>
                <div className="kcol-body">
                  {cards.length === 0 ? (
                    <p className="muted" style={{ fontSize: "0.8rem", padding: "0.5rem" }}>
                      Soltá acá
                    </p>
                  ) : (
                    cards.map((req) => {
                      const next = NEXT_STATE[req.state];
                      const cname = customerName(req);
                      const canLinkQuote =
                        req.state === "PENDIENTE" || req.state === "EN_PREPARACION";
                      return (
                        <article
                          className={`kcard${draggingId === req.id ? " dragging" : ""}`}
                          key={req.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, req)}
                          onDragEnd={onDragEnd}
                          onClick={() => openEdit(req)}
                        >
                          <h4>{req.title}</h4>
                          <div className="kcard-meta">
                            {cname ? <span>☺ {cname}</span> : null}
                            {req.maximumBudgetCents ? (
                              <span className="money">{formatArs(req.maximumBudgetCents)}</span>
                            ) : null}
                          </div>
                          {req.expectedUse ? (
                            <div className="kcard-meta">
                              <Pill tone="neutral">{req.expectedUse}</Pill>
                            </div>
                          ) : null}
                          <div className="kcard-actions" onClick={(e) => e.stopPropagation()}>
                            {canLinkQuote && onCreateAndAssociateQuote ? (
                              <button
                                type="button"
                                className="btn-sm"
                                disabled={startingId === req.id}
                                onClick={() => void createAndAssociate(req)}
                              >
                                {startingId === req.id ? "Abriendo…" : "Crear presupuesto"}
                              </button>
                            ) : null}
                            {canLinkQuote ? (
                              <button
                                type="button"
                                className="btn-ghost btn-sm"
                                onClick={() => void openAssociate(req)}
                              >
                                Asociar existente
                              </button>
                            ) : null}
                            {next ? (
                              <button
                                type="button"
                                className="btn-ghost btn-sm"
                                onClick={() => void advance(req)}
                              >
                                Mover a {COLUMNS.find((c) => c.state === next)?.label} →
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={draft.id ? "Editar solicitud" : "Nueva solicitud"}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="req-form" disabled={saving}>
              {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear solicitud"}
            </button>
          </>
        }
      >
        <form id="req-form" className="form-grid" onSubmit={save}>
          <div className="grid-2">
            <Field label="Título" htmlFor="req-title">
              <input
                id="req-title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                required
                autoFocus
              />
            </Field>
            <Field label="Estado">
              <select
                value={draft.state}
                onChange={(e) => setDraft({ ...draft, state: e.target.value as RequestState })}
              >
                {COLUMNS.map((c) => (
                  <option key={c.state} value={c.state}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Texto original (mensaje del cliente)" htmlFor="req-orig">
            <textarea
              id="req-orig"
              rows={3}
              value={draft.originalText}
              onChange={(e) => setDraft({ ...draft, originalText: e.target.value })}
            />
          </Field>
          <div className="grid-2">
            <Field label="Cliente">
              <select
                value={draft.customerId}
                onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}
              >
                <option value="">Sin cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Teléfono detectado" htmlFor="req-phone">
              <input
                id="req-phone"
                value={draft.detectedPhone}
                onChange={(e) => setDraft({ ...draft, detectedPhone: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Presupuesto máximo (ARS)" htmlFor="req-budget">
              <MoneyInput
                id="req-budget"
                value={draft.maxBudgetArs}
                onChange={(v) => setDraft({ ...draft, maxBudgetArs: v })}
                placeholder="Ej: 800000"
              />
            </Field>
            <Field label="Uso esperado" htmlFor="req-use">
              <input
                id="req-use"
                value={draft.expectedUse}
                onChange={(e) => setDraft({ ...draft, expectedUse: e.target.value })}
                placeholder="Gaming, oficina, edición…"
              />
            </Field>
          </div>
          <Field label="Componentes requeridos (separados por coma)" htmlFor="req-comps">
            <input
              id="req-comps"
              value={draft.requiredComponents}
              onChange={(e) => setDraft({ ...draft, requiredComponents: e.target.value })}
              placeholder="RTX 4060, 32GB RAM"
            />
          </Field>
          <Field label="Notas internas" htmlFor="req-notes">
            <textarea
              id="req-notes"
              rows={2}
              value={draft.internalNotes}
              onChange={(e) => setDraft({ ...draft, internalNotes: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(associateReq)}
        title={associateReq ? `Asociar presupuesto · ${associateReq.title}` : "Asociar"}
        onClose={() => setAssociateReq(null)}
        wide
        footer={
          <button type="button" className="btn-ghost" onClick={() => setAssociateReq(null)}>
            Cerrar
          </button>
        }
      >
        <div className="associate-quotes">
          <p className="section-note">
            Sugerencias según el texto del pedido. Usá ↑↓ y Enter, o buscá por número/nombre.
          </p>

          <p className="section-label">Sugeridos</p>
          {suggestLoading ? (
            <Loading />
          ) : suggestions.length === 0 ? (
            <p className="muted">No hay coincidencias claras. Buscá manualmente abajo.</p>
          ) : null}

          <p className="section-label">Buscar presupuesto</p>
          <SearchInput
            value={quoteQuery}
            onChange={setQuoteQuery}
            onKeyDown={onAssociateKeyDown}
            placeholder="Número, nombre interno o cliente… (↑↓ Enter)"
          />
          {quoteSearching ? <p className="muted">Buscando…</p> : null}

          {associateOptions.length > 0 ? (
            <div className="suggest-list" role="listbox">
              {associateOptions.map((opt, idx) => {
                const id = opt.row.id;
                const visibleNumber = opt.row.visibleNumber;
                const internalName = opt.row.internalName;
                const subtitle =
                  opt.kind === "suggest"
                    ? `${opt.row.customerName ?? "Sin cliente"}${opt.row.state ? ` · ${opt.row.state}` : ""}${
                        opt.row.preview.length ? ` · ${opt.row.preview.slice(0, 3).join(", ")}` : ""
                      }`
                    : `${opt.row.customer?.name ?? "Sin cliente"}${
                        opt.row.requestId ? " · ya tiene solicitud" : ""
                      }`;
                const badge = opt.kind === "suggest" ? `${opt.row.score}%` : "Elegir";
                return (
                  <button
                    key={`${opt.kind}-${id}`}
                    id={`assoc-opt-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={associateActive === idx}
                    className={`suggest-row${associateActive === idx ? " is-active" : ""}`}
                    disabled={associatingId === id}
                    onMouseEnter={() => setAssociateActive(idx)}
                    onClick={() => void associateFamily(id, visibleNumber)}
                  >
                    <span className="suggest-main">
                      <strong>
                        {visibleNumber} · {internalName}
                        {opt.kind === "suggest" ? (
                          <span className="cell-sub"> · sugerido</span>
                        ) : null}
                      </strong>
                      <span className="cell-sub">{subtitle}</span>
                    </span>
                    <span className="suggest-score">{badge}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function budgetInput(cents: string | null): string {
  if (!cents) return "";
  try {
    const v = BigInt(cents);
    return `${v / 100n},${(v % 100n).toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}
