"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatArs } from "../lib/money";
import { textOn } from "./SourceBar";

/** Un producto de cualquier fuente (propios, AcuStock, web o distribuidor) en el formato que muestra el modal. */
export type BrowserItem<T = unknown> = {
  key: string;
  /** Fuente: "Propios", "Web", "AcuStock" o el nombre del distribuidor. */
  source: string;
  color: string;
  logo?: string | null;
  name: string;
  sku?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  priceCents: string;
  priceLabel: string;
  stock?: number | null;
  inStock?: boolean;
  stale?: boolean;
  raw: T;
};

type Sort = "relevance" | "price-asc" | "price-desc" | "name" | "stock";
type View = "cards" | "list";

const SORTS: { id: Sort; label: string }[] = [
  { id: "relevance", label: "Relevancia" },
  { id: "price-asc", label: "Precio: menor a mayor" },
  { id: "price-desc", label: "Precio: mayor a menor" },
  { id: "name", label: "Nombre A–Z" },
  { id: "stock", label: "Más stock" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Initial({ item }: { item: BrowserItem }) {
  return (
    <span className="pb-initial" style={{ "--nc": item.color } as React.CSSProperties} aria-hidden="true">
      {item.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function Thumb({ item }: { item: BrowserItem }) {
  const [failed, setFailed] = useState(false);
  if (item.imageUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="pb-img" src={item.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return <Initial item={item} />;
}

function stockText(item: BrowserItem): string | null {
  if (item.stock != null) return item.stock > 0 ? `Stock ${item.stock}` : "Sin stock";
  if (item.inStock === false) return "Sin stock";
  return null;
}

/**
 * Explorador grande de resultados: tarjetas o lista, filtros por fuente, orden y precio, y selección múltiple
 * con tilde verde. Al confirmar devuelve los elegidos para que se carguen al presupuesto.
 */
export function ProductBrowserModal<T>({ items, loading, query, single, sourceBar, onConfirm, onClose }: {
  items: BrowserItem<T>[];
  loading: boolean;
  query: string;
  /** Con true solo se puede elegir un producto (ej.: reemplazar el de una línea). */
  single?: boolean;
  /** Barra para prender o apagar fuentes y distribuidores sin salir del modal (la búsqueda se rehace sola). */
  sourceBar?: ReactNode;
  onConfirm: (picked: BrowserItem<T>[]) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("cards");
  const [sort, setSort] = useState<Sort>("relevance");
  const [text, setText] = useState("");
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [onlyStock, setOnlyStock] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);

  const sourceList = useMemo(() => {
    const map = new Map<string, { color: string; logo?: string | null; count: number }>();
    for (const it of items) {
      const cur = map.get(it.source);
      if (cur) cur.count += 1;
      else map.set(it.source, { color: it.color, logo: it.logo, count: 1 });
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v }));
  }, [items]);

  const visible = useMemo(() => {
    const tokens = norm(text).split(/\s+/).filter(Boolean);
    const min = minPrice.trim() ? Number(minPrice.replace(/\./g, "").replace(",", ".")) * 100 : null;
    const max = maxPrice.trim() ? Number(maxPrice.replace(/\./g, "").replace(",", ".")) * 100 : null;
    const list = items.filter((it) => {
      if (sources.size && !sources.has(it.source)) return false;
      if (onlyStock && (it.inStock === false || (it.stock != null && it.stock <= 0))) return false;
      const price = Number(it.priceCents);
      if (min != null && Number.isFinite(min) && price < min) return false;
      if (max != null && Number.isFinite(max) && price > max) return false;
      if (tokens.length) {
        const hay = norm(`${it.name} ${it.sku ?? ""} ${it.brand ?? ""} ${it.source}`);
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const by: Record<Sort, ((a: BrowserItem<T>, b: BrowserItem<T>) => number) | null> = {
      relevance: null,
      "price-asc": (a, b) => Number(a.priceCents) - Number(b.priceCents),
      "price-desc": (a, b) => Number(b.priceCents) - Number(a.priceCents),
      name: (a, b) => a.name.localeCompare(b.name, "es"),
      stock: (a, b) => (b.stock ?? -1) - (a.stock ?? -1),
    };
    const cmp = by[sort];
    return cmp ? [...list].sort(cmp) : list;
  }, [items, sources, onlyStock, minPrice, maxPrice, text, sort]);

  const pickedItems = useMemo(() => items.filter((it) => picked.has(it.key)), [items, picked]);
  const total = useMemo(() => pickedItems.reduce((s, it) => s + Number(it.priceCents), 0), [pickedItems]);
  const filtersOn = sources.size > 0 || onlyStock || minPrice.trim() !== "" || maxPrice.trim() !== "" || text.trim() !== "" || sort !== "relevance";

  function close() {
    setClosing(true);
    window.setTimeout(onClose, 180);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    setPicked((cur) => {
      if (single) return cur.has(key) ? new Set() : new Set([key]);
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleSource(name: string) {
    setSources((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function reset() {
    setSources(new Set()); setOnlyStock(false); setMinPrice(""); setMaxPrice(""); setText(""); setSort("relevance");
  }

  function confirm() {
    if (!pickedItems.length) return;
    setClosing(true);
    window.setTimeout(() => onConfirm(pickedItems), 220);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`pb-overlay${closing ? " closing" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="pb-modal" role="dialog" aria-modal="true" aria-label="Todos los productos">
        <header className="pb-head">
          <div className="pb-title">
            <h2>Todos los productos</h2>
            <p>
              {loading ? "Buscando en todas las fuentes…" : `${visible.length} de ${items.length} resultados`}
              {query.trim() ? <> para <b>“{query.trim()}”</b></> : null}
            </p>
          </div>
          <div className="pb-view" role="group" aria-label="Modo de vista">
            <span className="pb-view-thumb" style={{ transform: view === "list" ? "translateX(100%)" : "none" }} />
            <button type="button" className={view === "cards" ? "on" : ""} onClick={() => setView("cards")} aria-pressed={view === "cards"}>▦ Tarjetas</button>
            <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")} aria-pressed={view === "list"}>☰ Lista</button>
          </div>
          <button type="button" className="pb-x" onClick={close} aria-label="Cerrar">✕</button>
        </header>

        <div className="pb-filters">
          {sourceBar ? (
            <div className="pb-sources">
              <span className="pb-sources-label">Buscar en</span>
              {sourceBar}
            </div>
          ) : null}
          <div className="pb-row">
            <input className="pb-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar por nombre, SKU o marca…" aria-label="Filtrar resultados" />
            <label className="pb-field">
              <span>Ordenar</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="pb-field pb-price">
              <span>Precio</span>
              <input inputMode="decimal" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Mín" aria-label="Precio mínimo" />
              <i>–</i>
              <input inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Máx" aria-label="Precio máximo" />
            </label>
            <button type="button" className={`pb-toggle${onlyStock ? " on" : ""}`} onClick={() => setOnlyStock((v) => !v)} aria-pressed={onlyStock}>
              <span className="pb-toggle-track"><span className="pb-toggle-knob" /></span>Solo con stock
            </button>
            {filtersOn ? <button type="button" className="pb-link" onClick={reset}>Limpiar filtros</button> : null}
          </div>
          {sourceList.length > 1 ? (
            <div className="pb-row pb-chips" aria-label="Filtrar por proveedor">
              {sourceList.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`pb-chip${sources.has(s.name) ? " on" : ""}`}
                  style={{ "--nc": s.color, "--nt": textOn(s.color) } as React.CSSProperties}
                  onClick={() => toggleSource(s.name)}
                  aria-pressed={sources.has(s.name)}
                >
                  {s.logo ? <img src={s.logo} alt="" width={16} height={16} /> : <span className="pb-dot" />}
                  {s.name}
                  <b>{s.count}</b>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={`pb-scroll ${view}`}>
          {loading && !items.length ? <div className="pb-state"><span className="pb-spin" />Buscando…</div> : null}
          {!loading && !visible.length ? (
            <div className="pb-state">{items.length ? "Ningún producto cumple los filtros." : "Sin resultados."}</div>
          ) : null}
          <div className={view === "cards" ? "pb-grid" : "pb-list"} key={view}>
            {visible.map((it, i) => {
              const on = picked.has(it.key);
              const st = stockText(it);
              return (
                <button
                  key={it.key}
                  type="button"
                  className={`pb-item${on ? " picked" : ""}${it.inStock === false ? " nostock" : ""}`}
                  style={{ "--nc": it.color, "--i": Math.min(i, 24) } as React.CSSProperties}
                  onClick={() => toggle(it.key)}
                  aria-pressed={on}
                >
                  <span className="pb-check" aria-hidden="true">
                    <i className="pb-ring" />
                    <i className="pb-ring r2" />
                    <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" /><path d="M9.5 16.5l4.6 4.6L22.5 11.5" /></svg>
                  </span>
                  <span className="pb-media"><Thumb item={it} /></span>
                  <span className="pb-body">
                    <span className="pb-tag">
                      {it.logo ? <img src={it.logo} alt="" width={14} height={14} /> : <span className="pb-dot" />}
                      {it.source}
                    </span>
                    <span className="pb-name">{it.name}</span>
                    <span className="pb-meta">
                      {[it.sku ? `SKU ${it.sku}` : "", it.brand ?? "", st ?? "", it.stale ? "precio desactualizado" : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="pb-price-tag">
                    {formatArs(it.priceCents)}
                    <small>{it.priceLabel}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="pb-foot">
          <div className="pb-sum">
            {pickedItems.length ? (
              <><b key={pickedItems.length} className="pb-count">{pickedItems.length}</b> seleccionado{pickedItems.length === 1 ? "" : "s"} · {formatArs(total)}</>
            ) : (
              <span className="pb-hint">{single ? "Tocá un producto para elegirlo" : "Tocá uno o varios productos para seleccionarlos"}</span>
            )}
          </div>
          {pickedItems.length ? <button type="button" className="pb-link" onClick={() => setPicked(new Set())}>Deseleccionar</button> : null}
          <button type="button" className="pb-btn ghost" onClick={close}>Cancelar</button>
          <button type="button" className="pb-btn ok" disabled={!pickedItems.length} onClick={confirm}>
            Confirmar{pickedItems.length ? ` (${pickedItems.length})` : ""}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
