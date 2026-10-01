"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Collection, type Quote, type QuoteState } from "../lib/types";
import { errorMessage } from "../components/shared";
import { useLite } from "./LiteContext";
import { printQuotePdf, type PdfKind } from "./lite-pdf";

const PAGE_SIZE = 12;
const STATES: Array<[QuoteState, string]> = [
  ["BORRADOR", "Borrador"], ["ENVIADO", "Enviado"], ["ACEPTADO", "Aceptado"],
  ["RECHAZADO", "Rechazado"], ["REEMPLAZADO", "Reemplazado"], ["NO_CONCRETADO", "No concretado"],
];
const STATE_LABEL = Object.fromEntries(STATES) as Record<QuoteState, string>;

/** Todos los presupuestos, con búsqueda y filtros en la misma pantalla y acciones por presupuesto. */
export function LiteQuoteList({ refreshKey, editingId, onEdit, onDeleted }: {
  refreshKey: number;
  editingId: string | null;
  onEdit: (quote: Quote) => void;
  onDeleted: (quote: Quote) => void;
}) {
  const { branches, branchId: homeBranchId, locked } = useLite();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [branchId, setBranchId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Quote[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    void api<Collection[]>("/collections").then((c) => setCollections(c.filter((x) => !x.archived))).catch(() => setCollections([]));
  }, []);

  const run = useCallback(async () => {
    const mine = ++seq.current;
    if (locked && !homeBranchId) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query: Record<string, string | number> = { page, pageSize: PAGE_SIZE, sort: "lastActivityAt", order: "desc" };
      if (q.trim()) query.q = q.trim();
      if (state) query.state = state;
      const scopedBranch = locked ? homeBranchId : branchId;
      if (scopedBranch) query.branchId = scopedBranch;
      if (collectionId) query.collectionId = collectionId;
      if (from) query.from = from;
      if (to) query.to = `${to}T23:59:59`;
      const res = await api<{ items: Quote[]; total?: number } | Quote[]>("/quotes/search", { query });
      if (mine !== seq.current) return;
      setError(null);
      if (Array.isArray(res)) { setRows(res); setTotal(null); } else { setRows(res.items); setTotal(res.total ?? null); }
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [q, state, branchId, collectionId, from, to, page, refreshKey, locked, homeBranchId]);

  useEffect(() => {
    const t = window.setTimeout(() => void run(), 250);
    return () => window.clearTimeout(t);
  }, [run]);

  const filtered = [state, branchId, collectionId, from, to].filter(Boolean).length;
  const reset = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const lastPage = total === null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = lastPage === null ? rows.length === PAGE_SIZE : page < lastPage;

  async function print(quote: Quote, kind: PdfKind) {
    setBusy(`${quote.id}:${kind}`);
    setError(null);
    try {
      await printQuotePdf(quote.id, kind);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(quote: Quote) {
    if (!window.confirm(`¿Eliminar ${quote.visibleNumber} y todas sus versiones? No se puede deshacer.`)) return;
    setBusy(`${quote.id}:del`);
    setError(null);
    try {
      await api(`/quotes/${quote.id}`, { method: "DELETE" });
      onDeleted(quote);
      await run();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="lt-side">
      <h2>Presupuestos</h2>
      <div className="lt-list-search">
        <input className="lt-input" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Buscar número, nombre, cliente, teléfono o producto…" aria-label="Buscar presupuestos" />
        <button type="button" className={`lt-btn ghost sm${filtered ? " on" : ""}`} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
          Filtros{filtered ? ` (${filtered})` : ""}
        </button>
      </div>
      {showFilters ? (
        <div className="lt-list-filters">
          <select className="lt-input" value={state} onChange={(e) => reset(setState)(e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            {STATES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select className="lt-input" value={locked ? (homeBranchId ?? "") : branchId} disabled={locked} onChange={(e) => reset(setBranchId)(e.target.value)} aria-label="Local">
            {locked ? null : <option value="">Todos los locales</option>}
            {(locked ? branches.filter((b) => b.id === homeBranchId) : branches).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="lt-input" value={collectionId} onChange={(e) => reset(setCollectionId)(e.target.value)} aria-label="Colección">
            <option value="">Todas las colecciones</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>)}
          </select>
          <div className="lt-list-dates">
            <label className="lt-field">Desde<input className="lt-input" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
            <label className="lt-field">Hasta<input className="lt-input" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          </div>
          {filtered ? (
            <button type="button" className="lt-btn ghost sm" onClick={() => { setState(""); setBranchId(""); setCollectionId(""); setFrom(""); setTo(""); setPage(1); }}>Limpiar filtros</button>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
      <p className="lt-muted lt-count-line">
        {loading ? "Buscando…" : total !== null ? `${total} presupuesto${total === 1 ? "" : "s"}` : `${rows.length} resultado${rows.length === 1 ? "" : "s"}`}
      </p>

      {rows.length === 0 && !loading ? <p className="lt-muted">Sin resultados.</p> : (
        <ul className="lt-recent">
          {rows.map((quote) => {
            const v = getActiveVersion(quote);
            const b = busy?.startsWith(quote.id);
            return (
              <li key={quote.id} className={editingId === quote.id ? "editing" : ""}>
                <div className="lt-recent-top">
                  <div className="lt-recent-main">
                    <strong>{quote.visibleNumber}</strong>
                    <span className="lt-recent-name">{quote.internalName}</span>
                    <span className="lt-muted">{quote.customer?.name ?? "Sin cliente"}{quote.branch ? ` · ${quote.branch.name}` : ""}</span>
                  </div>
                  <div className="lt-recent-side">
                    <strong>{formatArs(v?.totalSaleCents)}</strong>
                    {v ? <span className={`lt-state ${v.state.toLowerCase()}`}>{STATE_LABEL[v.state]}</span> : null}
                  </div>
                </div>
                <div className="lt-actions">
                  <button type="button" className="lt-act edit" disabled={busy !== null} onClick={() => onEdit(quote)}>Editar</button>
                  <button type="button" className="lt-act print" disabled={busy !== null} onClick={() => void print(quote, "SIMPLE")}>
                    {b && busy === `${quote.id}:SIMPLE` ? "…" : "Imprimir"}
                  </button>
                  <button type="button" className="lt-act" disabled={busy !== null} title="Imprimir el PDF detallado" onClick={() => void print(quote, "DETALLADO")}>
                    {b && busy === `${quote.id}:DETALLADO` ? "…" : "Detallado"}
                  </button>
                  <button type="button" className="lt-act del" disabled={busy !== null} onClick={() => void remove(quote)}>
                    {b && busy === `${quote.id}:del` ? "…" : "Eliminar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="lt-pager">
        <button type="button" className="lt-btn ghost sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>←</button>
        <span className="lt-muted">Página {page}{lastPage ? ` de ${lastPage}` : ""}</span>
        <button type="button" className="lt-btn ghost sm" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>→</button>
      </div>
    </aside>
  );
}
