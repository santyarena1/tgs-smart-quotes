"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, downloadAuthenticated } from "../lib/api";
import { isCollectionProtected, protectionNotice } from "../lib/collection-protection";
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
  /** Aviso corto y flotante (ej.: candado de protección), para que se vea aunque la lista esté scrolleada. */
  const [toast, setToast] = useState<{ text: string; on: boolean } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cols, local] = await Promise.all([api<Collection[]>("/collections"), fetchBranchQuotes("")]);
      setCollections([...cols].sort((a, b) => a.sortOrder - b.sortOrder));
      setQuotes(new Map(local.map((q) => [q.id, q])));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // El menú "Más" se cierra al tocar cualquier otro lado o con Escape.
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [menuId]);

  /** Colecciones del local elegido con todos sus presupuestos (igual que en la versión común); se ocultan las vacías. */
  const visible = useMemo(
    () => collections
      .filter((c) => !c.archived && (!branchId || !c.branchId || c.branchId === branchId))
      .map((c) => ({ collection: c, quotes: (c.familyIds ?? []).map((id) => quotes.get(id)).filter((q): q is Quote => Boolean(q)) }))
      .filter((entry) => entry.quotes.length > 0 || fresh.has(entry.collection.id)),
    [collections, quotes, fresh, branchId],
  );

  const current = visible.find((entry) => entry.collection.id === selectedId) ?? visible[0] ?? null;
  const rows = useMemo(() => {
    if (!current) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return current.quotes;
    return current.quotes.filter((q) =>
      [q.visibleNumber, q.internalName, q.customer?.name].some((v) => v?.toLowerCase().includes(needle)));
  }, [current, filter]);
  const currentProtected = current ? isCollectionProtected(current.collection) : true;

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
          ...(branchId ? { branchId } : {}),
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

  /** Candado: prende o apaga la protección de la colección y avisa cómo quedó. */
  async function toggleProtection(c: Collection) {
    const next = !isCollectionProtected(c);
    setBusyId(`lock:${c.id}`);
    setError(null);
    try {
      await api(`/collections/${c.id}`, { method: "PUT", body: { isProtected: next } });
      setCollections((cur) => cur.map((x) => (x.id === c.id ? { ...x, isProtected: next } : x)));
      setToast({ text: protectionNotice(c, next), on: next });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
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

  function startRename(q: Quote, collection: Collection) {
    if (isCollectionProtected(collection)) {
      setNotice(`“${collection.name}” está protegida: no se puede renombrar un presupuesto de adentro. Apagá el candado de la colección para hacerlo.`);
      return;
    }
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

  const busy = busyId !== null;

  /** Suma de las ventas de la colección (versión activa de cada presupuesto); null si no se puede calcular. */
  const collectionTotal = useMemo(() => {
    if (!current || current.quotes.length === 0) return null;
    try {
      return current.quotes.reduce((sum, q) => sum + BigInt(getActiveVersion(q)?.totalSaleCents ?? 0), 0n).toString();
    } catch {
      return null;
    }
  }, [current]);

  return (
    <div className="lt-cv">
      <header className="lt-cv-top">
        <div className="lt-cv-title">
          <h1>Colecciones</h1>
          <p>{branchId === "" ? "Colecciones de todos los locales" : `Colecciones de ${branchName || "tu local"}`}</p>
        </div>
        <label className="lt-cv-branch">
          <span>Local</span>
          <select value={branchId ?? ""} onChange={(e) => { setBranchId(e.target.value); setSelectedId(null); }} aria-label="Filtrar por local">
            {locked ? null : <option value="">Todos los locales</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <button type="button" className={`lt-btn ${creating ? "ghost" : "tone-green"}`} onClick={() => setCreating((v) => !v)}>{creating ? "Cancelar" : "+ Nueva colección"}</button>
      </header>

      {creating ? (
        <form className="lt-cv-new" onSubmit={(e) => void createCollection(e)}>
          <div className="lt-cv-new-row">
            <input className="lt-input lt-icon-in" value={draft.icon} maxLength={4} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="🎮" aria-label="Ícono" />
            <input className="lt-input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre de la colección" aria-label="Nombre" />
          </div>
          <input className="lt-input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Descripción (opcional)" aria-label="Descripción" />
          <div className="lt-cv-new-foot">
            <span>Nace protegida 🔒. Después asignale presupuestos desde “Nuevo” (chips de Colecciones).</span>
            <button type="submit" className="lt-btn tone-green" disabled={!draft.name.trim() || saving}>{saving ? "Guardando…" : "Crear colección"}</button>
          </div>
        </form>
      ) : null}

      {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
      {notice ? <div className="lt-alert ok" role="status">{notice}</div> : null}

      {loading ? <div className="lt-empty">Cargando…</div> : visible.length === 0 ? (
        <div className="lt-empty">No hay presupuestos en colecciones para este filtro.</div>
      ) : (
        <div className="lt-cv-grid">
          <nav className="lt-cv-list" aria-label="Colecciones">
            {visible.map(({ collection, quotes: list }) => {
              const prot = isCollectionProtected(collection);
              return (
                <div key={collection.id} className={`lt-cv-item${current?.collection.id === collection.id ? " active" : ""}`}>
                  <button type="button" className="lt-cv-pick" onClick={() => { setSelectedId(collection.id); setFilter(""); }}>
                    <span className="lt-cv-icon">{collection.icon || "◆"}</span>
                    <span className="lt-cv-info">
                      <span className="lt-cv-name">{collection.name}{collection.favorite ? <span className="lt-fav" aria-label="Favorita"> ★</span> : null}</span>
                      <span className="lt-cv-sub">{plural(list.length, "presupuesto", "presupuestos")}</span>
                    </span>
                    <span className="lt-cv-count" aria-hidden="true">{list.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`lt-lock${prot ? " on" : ""}`}
                    disabled={busyId === `lock:${collection.id}`}
                    aria-pressed={prot}
                    aria-label={prot ? `Protección activada en ${collection.name}` : `Protección desactivada en ${collection.name}`}
                    title={prot ? "Protegida: editar un presupuesto crea otro, no modifica el de la colección. Tocá para desactivar" : "Sin protección: editar modifica el presupuesto de la colección. Tocá para activar"}
                    onClick={() => void toggleProtection(collection)}
                  >{prot ? "🔒" : "🔓"}</button>
                </div>
              );
            })}
          </nav>

          <section className="lt-cv-detail">
            <div className="lt-cv-head">
              <span className="lt-cv-icon big">{current?.collection.icon || "◆"}</span>
              <div className="lt-cv-head-main">
                <h2>
                  {current?.collection.name}
                  {current ? (
                    <button
                      type="button"
                      className={`lt-lock big${currentProtected ? " on" : ""}`}
                      disabled={busyId === `lock:${current.collection.id}`}
                      aria-pressed={currentProtected}
                      title={currentProtected ? "Protegida: editar un presupuesto crea otro. Tocá para desactivar" : "Sin protección: editar modifica el presupuesto. Tocá para activar"}
                      onClick={() => void toggleProtection(current.collection)}
                    >{currentProtected ? "🔒 Protegida" : "🔓 Sin protección"}</button>
                  ) : null}
                </h2>
                {current?.collection.description ? <p>{current.collection.description}</p> : null}
                {current?.quotes.length === 0 ? <p>Vacía: asignale presupuestos al crearlos.</p> : (
                  <p className="lt-cv-stats">
                    <span>{plural(current?.quotes.length ?? 0, "presupuesto", "presupuestos")}</span>
                    {collectionTotal !== null ? <><span className="lt-cv-dot" aria-hidden="true">·</span><span>Suma total <strong>{formatArs(collectionTotal)}</strong></span></> : null}
                  </p>
                )}
              </div>
              <div className="lt-cv-tools">
                <input className="lt-input lt-cv-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar por número, nombre o cliente…" aria-label="Filtrar presupuestos" />
                {current ? (
                  <button
                    type="button"
                    className="lt-btn tone-indigo"
                    disabled={busy || current.quotes.length === 0}
                    title="Descarga un .zip con los PDF de todos los presupuestos de la colección"
                    onClick={() => void downloadCollection(current.collection)}
                  >
                    {busyId === `col:${current.collection.id}` ? "Descargando…" : "⬇ Descargar colección"}
                  </button>
                ) : null}
              </div>
            </div>

            {rows.length === 0 ? <div className="lt-empty">Sin resultados.</div> : (
              <ul className="lt-cv-quotes">
                {rows.map((q) => {
                  const v = getActiveVersion(q);
                  const collection = current!.collection;
                  return (
                    <li key={q.id} className="lt-cv-quote">
                      <div className="lt-cv-q-main">
                        <div className="lt-cv-q-meta">
                          <span className="lt-cv-num">{q.visibleNumber}</span>
                          <span className="lt-cv-q-sub">{q.customer?.name ?? "Sin cliente"}{branchId === "" && q.branch ? ` · ${q.branch.name}` : ""}</span>
                        </div>
                        {renamingId === q.id ? (
                          <form className="lt-cv-rename" onSubmit={(e) => { e.preventDefault(); void saveRename(q); }}>
                            <input
                              className="lt-input"
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }}
                              aria-label="Nombre del presupuesto"
                            />
                            <button type="submit" className="lt-cv-btn primary" disabled={busy || !renameDraft.trim()}>{busyId === `${q.id}:rename` ? "…" : "Guardar"}</button>
                            <button type="button" className="lt-cv-btn" onClick={() => setRenamingId(null)}>Cancelar</button>
                          </form>
                        ) : <strong className="lt-cv-q-name">{q.internalName}</strong>}
                      </div>
                      <div className="lt-cv-total-wrap">
                        <span className="lt-cv-total-label">Total</span>
                        <strong className="lt-cv-total">{formatArs(v?.totalSaleCents)}</strong>
                      </div>
                      <div className="lt-cv-actions">
                        <button
                          type="button"
                          className="lt-cv-btn primary"
                          disabled={busy}
                          title={currentProtected ? "Abre el presupuesto para modificarlo. La colección está protegida: al guardar se crea uno nuevo" : "Abrir en Presupuestos para modificarlo"}
                          onClick={() => router.push(`/lite?edit=${q.id}`)}
                        >Editar</button>
                        <button type="button" className="lt-cv-btn" disabled={busy} onClick={() => void pdf(q, "SIMPLE")}>{busyId === `${q.id}:SIMPLE` ? "…" : "PDF"}</button>
                        <button type="button" className="lt-cv-btn" disabled={busy} onClick={() => void pdf(q, "DETALLADO")}>{busyId === `${q.id}:DETALLADO` ? "…" : "Detallado"}</button>
                        <div className="lt-cv-more">
                          <button
                            type="button"
                            className="lt-cv-btn icon"
                            aria-haspopup="menu"
                            aria-expanded={menuId === q.id}
                            aria-label="Más acciones"
                            disabled={busy}
                            onClick={(e) => { e.stopPropagation(); setMenuId((cur) => (cur === q.id ? null : q.id)); }}
                          >⋯</button>
                          {menuId === q.id ? (
                            <div className="lt-cv-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => startRename(q, collection)}>Renombrar</button>
                              <button type="button" role="menuitem" title="Crea una copia fuera de la colección" onClick={() => void duplicate(q, collection.name)}>
                                {busyId === `${q.id}:dup` ? "…" : "Duplicar"}
                              </button>
                              <button type="button" role="menuitem" title="Sacarlo de esta colección sin borrarlo" onClick={() => void unlink(q, collection)}>Sacar de la colección</button>
                              <button type="button" role="menuitem" className="danger" title="Borrarlo del sistema" onClick={() => void remove(q)}>Eliminar</button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {toast ? <div className={`lt-cv-toast${toast.on ? " on" : ""}`} role="status">{toast.on ? "🔒" : "🔓"} {toast.text}</div> : null}
    </div>
  );
}
