"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, downloadAuthenticated } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Collection, type Quote } from "../lib/types";
import { errorMessage } from "../components/shared";
import { useLite } from "./LiteContext";
import { downloadQuotePdf, type PdfKind } from "./lite-pdf";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Todos los presupuestos del local, o de todos si no hay local (paginado de a 100, con tope). */
async function fetchBranchQuotes(branchId: string): Promise<Quote[]> {
  const all: Quote[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await api<{ items: Quote[] } | Quote[]>("/quotes/search", {
      query: { ...(branchId ? { branchId } : {}), page, pageSize: PAGE_SIZE, sort: "lastActivityAt", order: "desc" },
    });
    const rows = Array.isArray(res) ? res : res.items;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export function LiteCollections() {
  const { branches, branchId: homeBranchId, locked } = useLite();
  // "" = todos los locales; arranca en el local activo y se puede cambiar sin tocar el selector global.
  const [branchId, setBranchId] = useState<string | null>(null);
  useEffect(() => { setBranchId((cur) => cur ?? homeBranchId); }, [homeBranchId]);
  const branchName = branches.find((b) => b.id === branchId)?.name ?? "";
  const [collections, setCollections] = useState<Collection[]>([]);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", icon: "", description: "" });
  const [saving, setSaving] = useState(false);
  /** Las colecciones recién creadas están vacías: se muestran igual para poder elegirlas. */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const load = useCallback(async () => {
    if (branchId === null) return;
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
      .filter((entry) => entry.quotes.length > 0 || fresh.has(entry.collection.id)),
    [collections, quotes, fresh],
  );

  const current = visible.find((entry) => entry.collection.id === selectedId) ?? visible[0] ?? null;
  const rows = useMemo(() => {
    if (!current) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return current.quotes;
    return current.quotes.filter((q) =>
      [q.visibleNumber, q.internalName, q.customer?.name].some((v) => v?.toLowerCase().includes(needle)));
  }, [current, filter]);

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api<Collection>("/collections", {
        method: "POST",
        body: {
          name: draft.name.trim(),
          icon: draft.icon.trim() || null,
          description: draft.description.trim() || null,
          sortOrder: collections.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1,
        },
      });
      setFresh((cur) => new Set(cur).add(created.id));
      setSelectedId(created.id);
      setDraft({ name: "", icon: "", description: "" });
      setCreating(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

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

  async function downloadCollection(c: Collection) {
    setBusyId(`col:${c.id}`);
    setError(null);
    setNotice(null);
    try {
      await downloadAuthenticated(`/collections/${c.id}/download`, `${c.name}.zip`);
      setNotice(`Descarga de “${c.name}” lista.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startRename(q: Quote) {
    setRenamingId(q.id);
    setRenameDraft(q.internalName);
  }

  async function saveRename(q: Quote) {
    const next = renameDraft.trim();
    if (!next || next === q.internalName) { setRenamingId(null); return; }
    setBusyId(`${q.id}:rename`);
    setError(null);
    try {
      await api(`/quotes/${q.id}`, { method: "PUT", body: { internalName: next } });
      setQuotes((cur) => new Map(cur).set(q.id, { ...q, internalName: next }));
      setRenamingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  /** Crea un presupuesto nuevo (sin colección) y deja en el nombre de dónde viene. */
  async function duplicate(q: Quote, collectionName: string) {
    setBusyId(`${q.id}:dup`);
    setError(null);
    setNotice(null);
    try {
      const copy = await api<Quote>(`/quotes/${q.id}/duplicate`, { method: "POST" });
      const name = `${q.internalName} (copia de colección ${collectionName})`;
      await api(`/quotes/${copy.id}`, { method: "PUT", body: { internalName: name } });
      setNotice(`Duplicado como ${copy.visibleNumber}: ${name}. Está fuera de la colección; lo encontrás en Presupuestos.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  /** Saca el presupuesto de esta colección sin tocarlo ni sacarlo de las otras. */
  async function unlink(q: Quote, collection: Collection) {
    if (!window.confirm(`¿Sacar ${q.visibleNumber} de “${collection.name}”? El presupuesto no se borra.`)) return;
    setBusyId(`${q.id}:unlink`);
    setError(null);
    setNotice(null);
    try {
      const collectionIds = collections.filter((c) => c.id !== collection.id && (c.familyIds ?? []).includes(q.id)).map((c) => c.id);
      await api(`/quotes/${q.id}/collections`, { method: "PUT", body: { collectionIds } });
      setNotice(`${q.visibleNumber} salió de “${collection.name}”. Sigue en Presupuestos.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(q: Quote) {
    if (!window.confirm(`¿Eliminar ${q.visibleNumber} y todas sus versiones? Se borra del sistema (para solo sacarlo de la colección usá “Sacar”). No se puede deshacer.`)) return;
    setBusyId(`${q.id}:del`);
    setError(null);
    try {
      await api(`/quotes/${q.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="lt-coll">
      <div className="lt-head lt-coll-top">
        <div>
        <h1>Colecciones</h1>
        <div className="lt-coll-branch">
          <span>{branchId === "" ? "Presupuestos de todos los locales." : `Solo presupuestos de ${branchName || "tu local"}.`}</span>
          <select className="lt-input" value={branchId ?? ""} disabled={locked} onChange={(e) => { setBranchId(e.target.value); setSelectedId(null); }} aria-label="Filtrar por local">
            {locked ? null : <option value="">Todos los locales</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        </div>
        <button type="button" className={`lt-btn sm ${creating ? "ghost" : "tone-green"}`} onClick={() => setCreating((v) => !v)}>{creating ? "Cancelar" : "+ Nueva colección"}</button>
      </div>
      {creating ? (
        <form className="lt-card lt-coll-new" onSubmit={(e) => void createCollection(e)}>
          <div className="lt-coll-new-row">
            <input className="lt-input lt-icon-in" value={draft.icon} maxLength={4} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="🎮" aria-label="Ícono" />
            <input className="lt-input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre de la colección" aria-label="Nombre" />
          </div>
          <input className="lt-input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Descripción (opcional)" aria-label="Descripción" />
          <div className="lt-coll-new-foot">
            <span className="lt-muted">Después asignale presupuestos desde “Nuevo” (chips de Colecciones).</span>
            <button type="submit" className="lt-btn sm tone-green" disabled={!draft.name.trim() || saving}>{saving ? "Guardando…" : "Crear colección"}</button>
          </div>
        </form>
      ) : null}
      {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
      {notice ? <div className="lt-alert ok" role="status">{notice}</div> : null}
      {loading ? <div className="lt-empty">Cargando…</div> : visible.length === 0 ? (
        <div className="lt-empty">No hay presupuestos en colecciones para este filtro.</div>
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
                {current?.quotes.length === 0 ? <p className="lt-muted">Vacía: asignale presupuestos al crearlos.</p> : null}
                {current?.collection.description ? <p className="lt-muted">{current.collection.description}</p> : null}
              </div>
              <div className="lt-coll-tools">
                <input className="lt-input lt-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar…" aria-label="Filtrar presupuestos" />
                {current ? (
                  <button
                    type="button"
                    className="lt-btn sm tone-indigo"
                    disabled={busyId !== null || current.quotes.length === 0}
                    title="Descarga un .zip con los PDF de todos los presupuestos de la colección"
                    onClick={() => void downloadCollection(current.collection)}
                  >
                    {busyId === `col:${current.collection.id}` ? "Descargando…" : "⬇ Descargar colección"}
                  </button>
                ) : null}
              </div>
            </div>
            {rows.length === 0 ? <div className="lt-empty">Sin resultados.</div> : (
              <ul className="lt-quote-list">
                {rows.map((q) => {
                  const v = getActiveVersion(q);
                  return (
                    <li key={q.id}>
                      <div className="lt-recent-main">
                        <strong>{q.visibleNumber}</strong>
                        {renamingId === q.id ? (
                          <form className="lt-rename" onSubmit={(e) => { e.preventDefault(); void saveRename(q); }}>
                            <input
                              className="lt-input"
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }}
                              aria-label="Nombre del presupuesto"
                            />
                            <button type="submit" className="lt-act print" disabled={busyId !== null || !renameDraft.trim()}>{busyId === `${q.id}:rename` ? "…" : "Guardar"}</button>
                            <button type="button" className="lt-act" onClick={() => setRenamingId(null)}>Cancelar</button>
                          </form>
                        ) : <span className="lt-recent-name">{q.internalName}</span>}
                        <span className="lt-muted">{q.customer?.name ?? "Sin cliente"}{branchId === "" && q.branch ? ` · ${q.branch.name}` : ""}</span>
                      </div>
                      <strong className="lt-quote-total">{formatArs(v?.totalSaleCents)}</strong>
                      <span className="lt-coll-actions">
                        <button type="button" className="lt-act edit" disabled={busyId !== null} title="Abrir en Presupuestos para modificarlo" onClick={() => router.push(`/lite?edit=${q.id}`)}>Editar</button>
                        <button type="button" className="lt-act rename" disabled={busyId !== null} title="Cambiar el nombre" onClick={() => startRename(q)}>Renombrar</button>
                        <button type="button" className="lt-act print" disabled={busyId !== null} onClick={() => void pdf(q, "SIMPLE")}>
                          {busyId === `${q.id}:SIMPLE` ? "…" : "PDF"}
                        </button>
                        <button type="button" className="lt-act detail" disabled={busyId !== null} onClick={() => void pdf(q, "DETALLADO")}>
                          {busyId === `${q.id}:DETALLADO` ? "…" : "Detallado"}
                        </button>
                        <button type="button" className="lt-act dup" disabled={busyId !== null} title="Crea una copia fuera de la colección" onClick={() => void duplicate(q, current?.collection.name ?? "")}>
                          {busyId === `${q.id}:dup` ? "…" : "Duplicar"}
                        </button>
                        <button type="button" className="lt-act unlink" disabled={busyId !== null} title="Sacarlo de esta colección sin borrarlo" onClick={() => current && void unlink(q, current.collection)}>
                          {busyId === `${q.id}:unlink` ? "…" : "Sacar"}
                        </button>
                        <button type="button" className="lt-act del" disabled={busyId !== null} title="Borrarlo del sistema" onClick={() => void remove(q)}>
                          {busyId === `${q.id}:del` ? "…" : "Eliminar"}
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
