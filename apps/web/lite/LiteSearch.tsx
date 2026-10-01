"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Collection, type Quote, type QuoteState } from "../lib/types";
import { errorMessage } from "../components/shared";
import { useLite } from "./LiteContext";
import { downloadQuotePdf, type PdfKind } from "./lite-pdf";

const PAGE_SIZE = 25;
const STATES: Array<[QuoteState, string]> = [
  ["BORRADOR", "Borrador"], ["ENVIADO", "Enviado"], ["ACEPTADO", "Aceptado"],
  ["RECHAZADO", "Rechazado"], ["REEMPLAZADO", "Reemplazado"], ["NO_CONCRETADO", "No concretado"],
];
const STATE_LABEL = Object.fromEntries(STATES) as Record<QuoteState, string>;
const SORTS: Array<[string, string]> = [
  ["lastActivityAt", "Última actividad"], ["createdAt", "Fecha de creación"],
  ["totalSaleCents", "Total"], ["visibleNumber", "Número"],
];

type Page = { items: Quote[]; total?: number };

/** Buscador de todos los presupuestos (de todos los locales) con filtros. */
export function LiteSearch() {
  const { branches } = useLite();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [branchId, setBranchId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [builtPc, setBuiltPc] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("lastActivityAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Quote[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    void api<Collection[]>("/collections").then((c) => setCollections(c.filter((x) => !x.archived))).catch(() => setCollections([]));
  }, []);

  const run = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string | number | boolean> = { page, pageSize: PAGE_SIZE, sort, order };
      if (q.trim()) query.q = q.trim();
      if (state) query.state = state;
      if (branchId) query.branchId = branchId;
      if (collectionId) query.collectionId = collectionId;
      if (builtPc) query.isBuiltPc = builtPc === "1";
      if (from) query.from = from;
      if (to) query.to = `${to}T23:59:59`;
      const res = await api<Page | Quote[]>("/quotes/search", { query });
      if (mine !== seq.current) return;
      if (Array.isArray(res)) { setRows(res); setTotal(null); } else { setRows(res.items); setTotal(res.total ?? null); }
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [q, state, branchId, collectionId, builtPc, from, to, sort, order, page]);

  // Debounce del texto; los demás filtros disparan igual (misma dependencia).
  useEffect(() => {
    const t = window.setTimeout(() => void run(), 250);
    return () => window.clearTimeout(t);
  }, [run]);

  function filter<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(1); };
  }

  const active = [q, state, branchId, collectionId, builtPc, from, to].some(Boolean);
  function clear() {
    setQ(""); setState(""); setBranchId(""); setCollectionId(""); setBuiltPc(""); setFrom(""); setTo(""); setPage(1);
  }

  async function pdf(quote: Quote, kind: PdfKind) {
    setBusyId(`${quote.id}:${kind}`);
    setError(null);
    try {
      await downloadQuotePdf(quote.id, quote.visibleNumber, kind);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const lastPage = total === null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = lastPage === null ? rows.length === PAGE_SIZE : page < lastPage;

  return (
    <div className="lt-col">
      <div className="lt-head">
        <h1>Buscar presupuestos</h1>
        <p>Todos los presupuestos, de todos los locales. Buscá por número, nombre, cliente, teléfono o producto.</p>
      </div>
      {error ? <div className="lt-alert err" role="alert">{error}</div> : null}

      <div className="lt-card">
        <input className="lt-input lt-search-input" autoFocus value={q} onChange={(e) => filter(setQ)(e.target.value)} placeholder="Buscar…" aria-label="Buscar presupuestos" />
        <div className="lt-filters">
          <select className="lt-input" value={state} onChange={(e) => filter(setState)(e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            {STATES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select className="lt-input" value={branchId} onChange={(e) => filter(setBranchId)(e.target.value)} aria-label="Local">
            <option value="">Todos los locales</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="lt-input" value={collectionId} onChange={(e) => filter(setCollectionId)(e.target.value)} aria-label="Colección">
            <option value="">Todas las colecciones</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>)}
          </select>
          <select className="lt-input" value={builtPc} onChange={(e) => filter(setBuiltPc)(e.target.value)} aria-label="Tipo">
            <option value="">PC armada y otros</option>
            <option value="1">Solo PC armada</option>
            <option value="0">Sin PC armada</option>
          </select>
          <label className="lt-field">Desde<input className="lt-input" type="date" value={from} onChange={(e) => filter(setFrom)(e.target.value)} /></label>
          <label className="lt-field">Hasta<input className="lt-input" type="date" value={to} onChange={(e) => filter(setTo)(e.target.value)} /></label>
          <select className="lt-input" value={sort} onChange={(e) => filter(setSort)(e.target.value)} aria-label="Ordenar por">
            {SORTS.map(([v, label]) => <option key={v} value={v}>Ordenar: {label}</option>)}
          </select>
          <button type="button" className="lt-btn ghost" onClick={() => filter(setOrder)(order === "desc" ? "asc" : "desc")}>{order === "desc" ? "↓ Desc." : "↑ Asc."}</button>
        </div>
        {active ? <div><button type="button" className="lt-btn ghost sm" onClick={clear}>Limpiar filtros</button></div> : null}
      </div>

      <div className="lt-muted lt-count-line">
        {loading ? "Buscando…" : total !== null ? `${total} presupuesto${total === 1 ? "" : "s"}` : `${rows.length} resultado${rows.length === 1 ? "" : "s"}`}
      </div>

      {rows.length === 0 && !loading ? <div className="lt-empty">Sin resultados.</div> : (
        <ul className="lt-quote-list">
          {rows.map((quote) => {
            const v = getActiveVersion(quote);
            return (
              <li key={quote.id}>
                <div className="lt-recent-main">
                  <strong>{quote.visibleNumber}</strong>
                  <span className="lt-recent-name">{quote.internalName}</span>
                  <span className="lt-muted">{quote.customer?.name ?? "Sin cliente"}{quote.branch ? ` · ${quote.branch.name}` : ""}</span>
                </div>
                <div className="lt-recent-side">
                  <strong>{formatArs(v?.totalSaleCents)}</strong>
                  {v ? <span className={`lt-state ${v.state.toLowerCase()}`}>{STATE_LABEL[v.state]}</span> : null}
                  <span className="lt-recent-actions">
                    <button type="button" disabled={busyId !== null} onClick={() => void pdf(quote, "SIMPLE")}>{busyId === `${quote.id}:SIMPLE` ? "…" : "PDF"}</button>
                    <button type="button" disabled={busyId !== null} onClick={() => void pdf(quote, "DETALLADO")}>{busyId === `${quote.id}:DETALLADO` ? "…" : "Detallado"}</button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="lt-pager">
        <button type="button" className="lt-btn ghost sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
        <span className="lt-muted">Página {page}{lastPage ? ` de ${lastPage}` : ""}</span>
        <button type="button" className="lt-btn ghost sm" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
      </div>
    </div>
  );
}
