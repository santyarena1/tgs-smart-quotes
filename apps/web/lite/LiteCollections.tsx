"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Collection, type Quote } from "../lib/types";
import { errorMessage } from "../components/shared";
import { useLite } from "./LiteContext";
import { downloadQuotePdf, type PdfKind } from "./lite-pdf";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Todos los presupuestos del local (paginado de a 100, con tope). */
async function fetchBranchQuotes(branchId: string): Promise<Quote[]> {
  const all: Quote[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await api<{ items: Quote[] } | Quote[]>("/quotes/search", {
      query: { branchId, page, pageSize: PAGE_SIZE, sort: "lastActivityAt", order: "desc" },
    });
    const rows = Array.isArray(res) ? res : res.items;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export function LiteCollections() {
  const { branchId, branchName } = useLite();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const [cols, local] = await Promise.all([api<Collection[]>("/collections"), fetchBranchQuotes(branchId)]);
      setCollections([...cols].sort((a, b) => a.sortOrder - b.sortOrder));
      setQuotes(new Map(local.map((q) => [q.id, q])));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [branchId]);
  useEffect(() => { void load(); }, [load]);

  /** Cada colección con solo los presupuestos del local; se ocultan las que quedan vacías. */
  const visible = useMemo(
    () => collections
      .filter((c) => !c.archived)
      .map((c) => ({ collection: c, quotes: (c.familyIds ?? []).map((id) => quotes.get(id)).filter((q): q is Quote => Boolean(q)) }))
      .filter((entry) => entry.quotes.length > 0),
    [collections, quotes],
  );

  const current = visible.find((entry) => entry.collection.id === selectedId) ?? visible[0] ?? null;
  const rows = useMemo(() => {
    if (!current) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return current.quotes;
    return current.quotes.filter((q) =>
      [q.visibleNumber, q.internalName, q.customer?.name].some((v) => v?.toLowerCase().includes(needle)));
  }, [current, filter]);

  async function pdf(q: Quote, kind: PdfKind) {
    setBusyId(`${q.id}:${kind}`);
    setError(null);
    try {
      await downloadQuotePdf(q.id, q.visibleNumber, kind);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="lt-coll">
      <div className="lt-head">
        <h1>Colecciones</h1>
        <p>Solo presupuestos de {branchName || "tu local"}.</p>
      </div>
      {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
      {loading ? <div className="lt-empty">Cargando…</div> : visible.length === 0 ? (
        <div className="lt-empty">Este local todavía no tiene presupuestos en colecciones.</div>
      ) : (
        <div className="lt-coll-grid">
          <ul className="lt-coll-list">
            {visible.map(({ collection, quotes: list }) => (
              <li key={collection.id}>
                <button
                  type="button"
                  className={current?.collection.id === collection.id ? "active" : ""}
                  onClick={() => { setSelectedId(collection.id); setFilter(""); }}
                >
                  <span className="lt-coll-icon">{collection.icon || "◆"}</span>
                  <span className="lt-coll-name">{collection.name}</span>
                  {collection.favorite ? <span className="lt-fav" aria-label="Favorita">★</span> : null}
                  <span className="lt-count">{list.length}</span>
                </button>
              </li>
            ))}
          </ul>
          <section className="lt-card lt-coll-detail">
            <div className="lt-coll-head">
              <div>
                <h2>{current?.collection.name}</h2>
                {current?.collection.description ? <p className="lt-muted">{current.collection.description}</p> : null}
              </div>
              <input className="lt-input lt-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar…" aria-label="Filtrar presupuestos" />
            </div>
            {rows.length === 0 ? <div className="lt-empty">Sin resultados.</div> : (
              <ul className="lt-quote-list">
                {rows.map((q) => {
                  const v = getActiveVersion(q);
                  return (
                    <li key={q.id}>
                      <div className="lt-recent-main">
                        <strong>{q.visibleNumber}</strong>
                        <span className="lt-recent-name">{q.internalName}</span>
                        <span className="lt-muted">{q.customer?.name ?? "Sin cliente"}</span>
                      </div>
                      <strong className="lt-quote-total">{formatArs(v?.totalSaleCents)}</strong>
                      <span className="lt-recent-actions">
                        <button type="button" disabled={busyId !== null} onClick={() => void pdf(q, "SIMPLE")}>
                          {busyId === `${q.id}:SIMPLE` ? "…" : "PDF"}
                        </button>
                        <button type="button" disabled={busyId !== null} onClick={() => void pdf(q, "DETALLADO")}>
                          {busyId === `${q.id}:DETALLADO` ? "…" : "Detallado"}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
