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
/** Tipo de presupuesto = PDF ya generado de ese tipo. Colores = los de los botones de cada PDF. */
const KINDS: Array<[PdfKind, string]> = [["SIMPLE", "Normal"], ["DETALLADO", "Detallado"], ["FORMAL", "Formal"]];
const KIND_LABEL = Object.fromEntries(KINDS) as Record<PdfKind, string>;

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
  const [pdfKind, setPdfKind] = useState("");
  const [branchId, setBranchId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [month, setMonth] = useState("");
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
      if (pdfKind) query.pdfKind = pdfKind;
      const scopedBranch = locked ? homeBranchId : branchId;
      if (scopedBranch) query.branchId = scopedBranch;
      if (collectionId) query.collectionId = collectionId;
      // El mes es el atajo; un rango exacto (Más filtros) tiene prioridad.
      if (from || to) {
        if (from) query.from = from;
        if (to) query.to = `${to}T23:59:59`;
      } else if (month) {
        const [y, m] = month.split("-").map(Number);
        const last = new Date(y!, m!, 0).getDate();
        query.from = `${month}-01`;
        query.to = `${month}-${String(last).padStart(2, "0")}T23:59:59`;
      }
      const res = await api<{ items: Quote[]; total?: number } | Quote[]>("/quotes/search", { query });
      if (mine !== seq.current) return;
      setError(null);
      if (Array.isArray(res)) { setRows(res); setTotal(null); } else { setRows(res.items); setTotal(res.total ?? null); }
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [q, state, pdfKind, branchId, collectionId, month, from, to, page, refreshKey, locked, homeBranchId]);

  useEffect(() => {
    const t = window.setTimeout(() => void run(), 250);
    return () => window.clearTimeout(t);
  }, [run]);

  const moreCount = [month, from, to].filter(Boolean).length;
  const anyFilter = Boolean(q || branchId || collectionId || state || pdfKind || moreCount);
  const clearAll = () => { setQ(""); setState(""); setPdfKind(""); setBranchId(""); setCollectionId(""); setMonth(""); setFrom(""); setTo(""); setPage(1); };
  const branchName = branches.find((b) => b.id === branchId)?.name;
  const collName = collections.find((c) => c.id === collectionId)?.name;
  const monthLabel = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : "";
  // Etiquetas de los filtros activos, cada una se quita con un toque.
  const active: Array<[string, string, () => void]> = [];
  if (!locked && branchId) active.push(["local", branchName ?? "Local", () => reset(setBranchId)("")]);
  if (collectionId) active.push(["coll", collName ?? "Colección", () => reset(setCollectionId)("")]);
  if (state) active.push(["state", STATE_LABEL[state as QuoteState] ?? state, () => reset(setState)("")]);
  if (from || to) active.push(["range", `${from ? from.split("-").reverse().join("/") : "…"} → ${to ? to.split("-").reverse().join("/") : "…"}`, () => { setFrom(""); setTo(""); setPage(1); }]);
  else if (month) active.push(["month", monthLabel, () => reset(setMonth)("")]);
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
      <input className="lt-input" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Buscar número, nombre, cliente, teléfono o producto…" aria-label="Buscar presupuestos" />
      <div className="lt-quick">
        <select className="lt-input" value={locked ? (homeBranchId ?? "") : branchId} disabled={locked} onChange={(e) => reset(setBranchId)(e.target.value)} aria-label="Local">
          {locked ? null : <option value="">Todos los locales</option>}
          {(locked ? branches.filter((b) => b.id === homeBranchId) : branches).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="lt-input" value={collectionId} onChange={(e) => reset(setCollectionId)(e.target.value)} aria-label="Colección">
          <option value="">Todas las colecciones</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>)}
        </select>
      </div>
      <div className="lt-kinds" role="group" aria-label="Tipo de presupuesto">
        <button type="button" className={`lt-kind all${pdfKind === "" ? " on" : ""}`} aria-pressed={pdfKind === ""} onClick={() => reset(setPdfKind)("")}>Todos</button>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" className={`lt-kind ${k.toLowerCase()}${pdfKind === k ? " on" : ""}`} aria-pressed={pdfKind === k} title={`Presupuestos con PDF ${label.toLowerCase()} generado`} onClick={() => reset(setPdfKind)(pdfKind === k ? "" : k)}>{label}</button>
        ))}
      </div>
      <div className="lt-more-row">
        <button type="button" className={`lt-btn ghost sm${moreCount || state ? " on" : ""}`} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
          Estado y fechas{moreCount ? ` (${moreCount})` : ""} {showFilters ? "▴" : "▾"}
        </button>
        {anyFilter ? <button type="button" className="lt-link" onClick={clearAll}>Limpiar todo</button> : null}
      </div>
      {active.length ? (
        <div className="lt-active" aria-label="Filtros activos">
          {active.map(([key, label, remove]) => (
            <button key={key} type="button" className="lt-pill" onClick={remove} title="Quitar este filtro">{label} <span aria-hidden="true">×</span></button>
          ))}
        </div>
      ) : null}
      {showFilters ? (
        <div className="lt-list-filters">
          <div className="lt-states" role="group" aria-label="Estado">
            {STATES.map(([v, label]) => (
              <button key={v} type="button" className={`lt-chip${state === v ? " on" : ""}`} aria-pressed={state === v} onClick={() => reset(setState)(state === v ? "" : v)}>{label}</button>
            ))}
          </div>
          <label className="lt-field">Mes<input className="lt-input" type="month" value={month} onChange={(e) => reset(setMonth)(e.target.value)} /></label>
          <div className="lt-list-dates">
            <label className="lt-field">Desde<input className="lt-input" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
            <label className="lt-field">Hasta<input className="lt-input" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          </div>
          <p className="lt-muted lt-hint">Un rango exacto (desde/hasta) reemplaza al mes.</p>
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
                <div className="lt-qrow">
                  <strong className="lt-qnum">{quote.visibleNumber}</strong>
                  <span className="lt-qname" title={quote.internalName}>{quote.internalName}</span>
                  <span className="lt-qmeta" title={`${quote.customer?.name ?? "Sin cliente"}${quote.branch ? ` · ${quote.branch.name}` : ""}`}>
                    {quote.customer?.name ?? "Sin cliente"}{quote.branch ? ` · ${quote.branch.name}` : ""}
                  </span>
                </div>
                <div className="lt-qfoot">
                  <strong className="lt-qprice">{formatArs(v?.totalSaleCents)}</strong>
                  {v ? <span className={`lt-state ${v.state.toLowerCase()}`}>{STATE_LABEL[v.state]}</span> : null}
                  {KINDS.filter(([k]) => v?.pdfs?.some((pdf) => pdf.kind === k)).map(([k]) => (
                    <span key={k} className={`lt-kindtag ${k.toLowerCase()}`} title={`PDF ${KIND_LABEL[k].toLowerCase()} generado`}>{KIND_LABEL[k]}</span>
                  ))}
                  {v?.createdAt ? <span className="lt-qdate" title="Fecha de la última versión">Últ. {new Date(v.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span> : null}
                </div>
                <div className="lt-actions">
                  <button type="button" className="lt-act edit" disabled={busy !== null} onClick={() => onEdit(quote)}>Editar</button>
                  <button type="button" className="lt-act print" disabled={busy !== null} onClick={() => void print(quote, "SIMPLE")}>
                    {b && busy === `${quote.id}:SIMPLE` ? "…" : "Ver"}
                  </button>
                  <button type="button" className="lt-act detail" disabled={busy !== null} title="Ver el PDF detallado" onClick={() => void print(quote, "DETALLADO")}>
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
