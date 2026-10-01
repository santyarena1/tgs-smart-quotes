"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { bpsToPct, centsToInput, formatArs, lineTotalCents, parseArsToCents, roundCentsToPesosStep } from "../lib/money";
import { applyDraftCost, applyDraftMarkup, applyDraftSale, itemPricePayload } from "../lib/quote-item-pricing";
import { getActiveVersion, type Collection, type Customer, type PcLine, type Product, type Quote, type QuoteState } from "../lib/types";
import { errorMessage, MoneyInput } from "../components/shared";
import { useLite } from "./LiteContext";
import { downloadQuotePdf, type PdfKind } from "./lite-pdf";

type Line = {
  key: string;
  productId: string;
  /** Componente de la PC armada ("" = extra / sin componente). */
  lineId: string;
  name: string;
  quantity: string;
  costArs: string;
  markupPct: string;
  saleArs: string;
  priceMode: "markup" | "sale";
};

const DEFAULT_MARKUP = "30";
const MARKUP_PRESETS = ["10", "15", "20", "25", "30", "35", "40", "50"];
const ROUND_STEPS = ["100", "500", "1000", "5000"];
const STATE_LABEL: Record<QuoteState, string> = {
  BORRADOR: "Borrador", ENVIADO: "Enviado", ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado", REEMPLAZADO: "Reemplazado", NO_CONCRETADO: "No concretado",
};

const norm = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function lineFromProduct(p: Product, lineId = ""): Line {
  return {
    key: crypto.randomUUID(),
    productId: p.id,
    lineId,
    name: p.name,
    quantity: "1",
    costArs: centsToInput(p.costCents),
    markupPct: bpsToPct(p.markupBps),
    saleArs: centsToInput(p.salePriceCents),
    priceMode: "markup",
  };
}

function freeLine(name: string, lineId = ""): Line {
  return { key: crypto.randomUUID(), productId: "", lineId, name, quantity: "1", costArs: "", markupPct: DEFAULT_MARKUP, saleArs: "", priceMode: "markup" };
}

function validate(lines: Line[]): string | null {
  if (!lines.length) return "Agregá al menos un producto.";
  for (const [i, line] of lines.entries()) {
    if (!line.name.trim()) return `El ítem ${i + 1} necesita un nombre.`;
    if (!line.costArs.trim()) return `El ítem ${i + 1} necesita un costo.`;
    if (!Number(line.quantity) || Number(line.quantity) < 1) return `El ítem ${i + 1} necesita una cantidad válida.`;
    try {
      parseArsToCents(line.costArs);
      itemPricePayload(line);
    } catch {
      return `Revisá los importes del ítem ${i + 1}.`;
    }
  }
  return null;
}

function SlotPicker({ products, preferLineId, onPick, onFree }: {
  products: Product[];
  preferLineId: string;
  onPick: (p: Product) => void;
  onFree: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    const pool = products.filter((p) => tokens.every((t) => norm(p.name).includes(t)));
    // Sin texto, primero los productos habituales de este componente.
    if (!tokens.length) return pool.filter((p) => p.defaultLineId === preferLineId).slice(0, 6);
    return pool.sort((a, b) => Number(b.defaultLineId === preferLineId) - Number(a.defaultLineId === preferLineId)).slice(0, 6);
  }, [products, q, preferLineId]);
  return (
    <div className="lt-search lt-slot">
      <input
        className="lt-input"
        value={q}
        autoComplete="off"
        placeholder="Elegir producto…"
        aria-label="Elegir producto para el componente"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (hits[0]) onPick(hits[0]);
            else if (q.trim()) onFree(q.trim());
          }
        }}
      />
      {open && (hits.length || q.trim()) ? (
        <ul className="lt-results" role="listbox">
          {hits.map((p) => (
            <li key={p.id} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); onPick(p); }}>
              <span className="lt-res-name">{p.name}</span>
              <span className="lt-res-price">{formatArs(p.salePriceCents)}</span>
            </li>
          ))}
          {q.trim() ? (
            <li className="free" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); onFree(q.trim()); }}>
              <span className="lt-res-name">+ Agregar “{q.trim()}” como ítem libre</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export function LiteQuoteCreator() {
  const { branchId, writesElsewhere } = useLite();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recent, setRecent] = useState<Quote[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pcLines, setPcLines] = useState<PcLine[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [isBuiltPc, setIsBuiltPc] = useState(false);
  const [roundStep, setRoundStep] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [bulkMarkup, setBulkMarkup] = useState("");
  const [busy, setBusy] = useState<PdfKind | "row" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.all([
      api<Product[]>("/products").catch(() => [] as Product[]),
      api<Customer[]>("/customers").catch(() => [] as Customer[]),
      api<PcLine[]>("/pc-lines").catch(() => [] as PcLine[]),
      api<Collection[]>("/collections").catch(() => [] as Collection[]),
    ]).then(([prods, custs, pcs, cols]) => {
      setProducts(prods.filter((p) => p.active));
      setCustomers(custs);
      setPcLines(pcs.filter((l) => l.active).sort((a, b) => a.sortOrder - b.sortOrder));
      setCollections(cols.filter((c) => !c.archived));
    });
  }, []);

  const loadRecent = useCallback(async () => {
    if (!branchId) return;
    try {
      const res = await api<{ items: Quote[] } | Quote[]>("/quotes/search", {
        query: { branchId, page: 1, pageSize: 8, sort: "lastActivityAt", order: "desc" },
      });
      setRecent(Array.isArray(res) ? res : res.items);
    } catch {
      setRecent([]);
    }
  }, [branchId]);
  useEffect(() => { void loadRecent(); }, [loadRecent]);

  const results = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    const pool = tokens.length
      ? products.filter((p) => { const n = norm(p.name); return tokens.every((t) => n.includes(t)); })
      : [...products].sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
    return pool.slice(0, 7);
  }, [products, query]);
  useEffect(() => setActive(0), [query]);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + BigInt(lineTotalCents(l.saleArs, l.quantity)), 0n),
    [lines],
  );
  const cost = useMemo(() => {
    let sum = 0n;
    for (const l of lines) {
      try {
        sum += BigInt(parseArsToCents(l.costArs)) * BigInt(Math.max(0, Math.trunc(Number(l.quantity) || 0)));
      } catch { /* ítem incompleto */ }
    }
    return sum;
  }, [lines]);

  function patch(key: string, fn: (line: Line) => Line) {
    setLines((current) => current.map((l) => (l.key === key ? fn(l) : l)));
  }

  function addProduct(p: Product, lineId?: string) {
    // En PC armada el producto va a su componente (el elegido o el habitual); sin componente queda como extra.
    const target = lineId ?? (isBuiltPc && pcLines.some((l) => l.id === p.defaultLineId) ? p.defaultLineId ?? "" : "");
    setLines((current) => [...current, lineFromProduct(p, target)]);
    setQuery("");
    searchRef.current?.focus();
  }

  function addFree(lineId = "", name = query.trim()) {
    const line = freeLine(name, lineId);
    setFocusKey(line.key);
    setLines((current) => [...current, line]);
    setQuery("");
  }

  function applyRounding() {
    const step = Number(roundStep);
    if (!step) return;
    setLines((current) => current.map((l) => {
      try {
        return applyDraftSale(l, centsToInput(roundCentsToPesosStep(parseArsToCents(l.saleArs), step)));
      } catch {
        return l;
      }
    }));
    setNotice(`Precios redondeados a múltiplos de $ ${step.toLocaleString("es-AR")}.`);
  }

  function toggleCollection(id: string, checked: boolean) {
    setCollectionIds((current) => (checked ? [...new Set([...current, id])] : current.filter((c) => c !== id)));
  }

  function toggleBuiltPc(next: boolean) {
    if (next && !pcLines.length) {
      setError("No hay componentes de PC configurados (Líneas PC en la suite completa).");
      return;
    }
    setError(null);
    setIsBuiltPc(next);
  }

  async function submit(kind: PdfKind) {
    if (busy) return;
    const invalid = validate(lines);
    if (invalid) { setError(invalid); return; }
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const customerName = customers.find((c) => c.id === customerId)?.name;
      const internalName = name.trim() || customerName || lines[0]!.name;
      // Los componentes salen en el orden de la PC; los extras al final.
      const lineOrder = new Map(pcLines.map((l, i) => [l.id, i]));
      const ordered = isBuiltPc
        ? [...lines].sort((a, b) => (lineOrder.get(a.lineId) ?? 999) - (lineOrder.get(b.lineId) ?? 999))
        : lines;
      const created = await api<Quote>("/quotes", {
        method: "POST",
        body: {
          internalName,
          customerId: customerId || null,
          requestId: null,
          isBuiltPc,
          kind: "PC",
          publicObservation: null,
          collectionIds,
          items: ordered.map((l, position) => ({
            productId: l.productId || null,
            name: l.name.trim(),
            lineId: isBuiltPc && l.lineId ? l.lineId : null,
            quantity: Number(l.quantity),
            costCents: parseArsToCents(l.costArs),
            position,
            observation: null,
            ...itemPricePayload(l),
          })),
        },
      });
      setLines([]);
      setName("");
      setCustomerId("");
      setBulkMarkup("");
      setCollectionIds([]);
      setIsBuiltPc(false);
      setRoundStep("");
      try {
        await downloadQuotePdf(created.id, created.visibleNumber, kind);
        setNotice(`${created.visibleNumber} creado · PDF ${kind === "SIMPLE" ? "simple" : "detallado"} descargado.`);
      } catch (err) {
        setNotice(`${created.visibleNumber} creado, pero el PDF falló: ${errorMessage(err)}`);
      }
      void loadRecent();
      searchRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setQuery("");
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { void submit("SIMPLE"); return; }
      const hit = results[active];
      if (hit) addProduct(hit);
      else if (query.trim()) addFree();
    }
  }

  async function rowPdf(q: Quote, kind: PdfKind) {
    setBusy("row");
    setError(null);
    try {
      await downloadQuotePdf(q.id, q.visibleNumber, kind);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function renderLine(l: Line) {
    return (
      <div className="lt-line" key={l.key}>
        <input className="lt-cell" value={l.name} onChange={(e) => patch(l.key, (x) => ({ ...x, name: e.target.value }))} aria-label="Nombre" />
        <input className="lt-cell num" type="number" min={1} value={l.quantity} onChange={(e) => patch(l.key, (x) => ({ ...x, quantity: e.target.value }))} aria-label="Cantidad" />
        <MoneyInput
          className="lt-cell num"
          value={l.costArs}
          autoFocus={focusKey === l.key}
          onChange={(v) => patch(l.key, (x) => applyDraftCost(x, v))}
          aria-label="Costo"
          placeholder="0"
        />
        <input className="lt-cell num" inputMode="decimal" value={l.markupPct} onChange={(e) => patch(l.key, (x) => applyDraftMarkup(x, e.target.value))} aria-label="Margen" />
        <MoneyInput className="lt-cell num" value={l.saleArs} onChange={(v) => patch(l.key, (x) => applyDraftSale(x, v))} aria-label="Venta" placeholder="0" />
        <strong className="lt-line-total r">{formatArs(lineTotalCents(l.saleArs, l.quantity))}</strong>
        <button type="button" className="lt-x" onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))} aria-label="Quitar ítem">×</button>
      </div>
    );
  }

  const extras = lines.filter((l) => !l.lineId || !pcLines.some((pc) => pc.id === l.lineId));

  const ready = lines.length > 0 && !busy;

  return (
    <div className="lt-grid">
      <section className="lt-col">
        <div className="lt-head">
          <h1>Nuevo presupuesto</h1>
          <p>Buscá un producto y Enter. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> crea y descarga el PDF.</p>
        </div>

        {writesElsewhere ? <div className="lt-note">Estás viendo otro local: los presupuestos nuevos se guardan en el tuyo.</div> : null}
        {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
        {notice ? <div className="lt-alert ok" role="status">{notice}</div> : null}

        <div className="lt-card">
          <div className="lt-meta">
            <input className="lt-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (opcional: usa el cliente o el primer ítem)" aria-label="Nombre interno" />
            <select className="lt-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Cliente">
              <option value="">Sin cliente</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <button type="button" className={`lt-pc${isBuiltPc ? " on" : ""}`} role="switch" aria-checked={isBuiltPc} onClick={() => toggleBuiltPc(!isBuiltPc)}>
            <span className="lt-switch-track"><span className="lt-switch-knob" /></span>
            <span className="lt-pc-copy"><strong>PC armada</strong><small>{isBuiltPc ? "Un renglón por componente" : "Activalo para cargar por componentes"}</small></span>
          </button>

          {collections.length ? (
            <div className="lt-colls">
              <span className="lt-muted">Colecciones</span>
              {collections.map((c) => (
                <label key={c.id} className={`lt-chip${collectionIds.includes(c.id) ? " on" : ""}`}>
                  <input type="checkbox" hidden checked={collectionIds.includes(c.id)} onChange={(e) => toggleCollection(c.id, e.target.checked)} />
                  {c.icon ? `${c.icon} ` : ""}{c.name}
                </label>
              ))}
            </div>
          ) : null}

          <div className="lt-search">
            <input
              ref={searchRef}
              className="lt-input lt-search-input"
              value={query}
              autoFocus
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Buscar producto…  (↑↓ Enter)"
              aria-label="Buscar producto"
            />
            {query.trim() || products.length ? (
              <ul className="lt-results" role="listbox">
                {results.map((p, i) => (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? "active" : ""}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); addProduct(p); }}
                  >
                    <span className="lt-res-name">{p.name}</span>
                    <span className="lt-res-price">{formatArs(p.salePriceCents)}</span>
                  </li>
                ))}
                {query.trim() ? (
                  <li className="free" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); addFree(); }}>
                    <span className="lt-res-name">+ Agregar “{query.trim()}” como ítem libre</span>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          {lines.length === 0 && !isBuiltPc ? (
            <div className="lt-empty">Todavía no hay ítems. Buscá arriba para empezar.</div>
          ) : (
            <div className="lt-lines">
              <div className="lt-line head">
                <span>Producto</span><span>Cant.</span><span>Costo</span><span>Margen %</span><span>Venta</span><span className="r">Total</span><span />
              </div>
              {isBuiltPc ? (
                <>
                  {pcLines.map((pc) => {
                    const rows = lines.filter((l) => l.lineId === pc.id);
                    return (
                      <div className="lt-comp" key={pc.id}>
                        <div className="lt-comp-name">{pc.name}</div>
                        {rows.map(renderLine)}
                        {rows.length === 0 ? (
                          <SlotPicker
                            products={products}
                            preferLineId={pc.id}
                            onPick={(p) => addProduct(p, pc.id)}
                            onFree={(n) => addFree(pc.id, n)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                  {extras.length ? <div className="lt-comp"><div className="lt-comp-name">Extras</div>{extras.map(renderLine)}</div> : null}
                </>
              ) : lines.map(renderLine)}
              <div className="lt-bulk">
                <span>Margen para todos</span>
                {MARKUP_PRESETS.map((p) => (
                  <button key={p} type="button" className="lt-chip" onClick={() => setLines((c) => c.map((l) => applyDraftMarkup(l, p)))}>{p}%</button>
                ))}
                <input className="lt-cell num" inputMode="decimal" value={bulkMarkup} onChange={(e) => setBulkMarkup(e.target.value)} placeholder="otro %" aria-label="Margen general" />
                <button type="button" className="lt-btn ghost sm" disabled={!bulkMarkup.trim()} onClick={() => setLines((c) => c.map((l) => applyDraftMarkup(l, bulkMarkup.trim())))}>Aplicar</button>
              </div>
              <div className="lt-bulk">
                <span>Redondear precios</span>
                {ROUND_STEPS.map((st) => (
                  <button key={st} type="button" className={`lt-chip${roundStep === st ? " on" : ""}`} onClick={() => setRoundStep(roundStep === st ? "" : st)}>$ {Number(st).toLocaleString("es-AR")}</button>
                ))}
                <button type="button" className="lt-btn ghost sm" disabled={!roundStep} onClick={applyRounding}>Aplicar</button>
              </div>
            </div>
          )}
        </div>

        <div className="lt-foot">
          <div className="lt-total">
            <span>Total</span>
            <strong>{formatArs(total)}</strong>
            {lines.length ? <small>ganancia {formatArs(total - cost)}</small> : null}
          </div>
          <span className="lt-spacer" />
          <button type="button" className="lt-btn ghost" disabled={!ready} onClick={() => void submit("DETALLADO")}>
            {busy === "DETALLADO" ? "Generando…" : "PDF detallado"}
          </button>
          <button type="button" className="lt-btn" disabled={!ready} onClick={() => void submit("SIMPLE")}>
            {busy === "SIMPLE" ? "Generando…" : "Crear y descargar PDF"}
          </button>
        </div>
      </section>

      <aside className="lt-side">
        <h2>Últimos del local</h2>
        {recent.length === 0 ? <p className="lt-muted">Sin presupuestos todavía.</p> : (
          <ul className="lt-recent">
            {recent.map((q) => {
              const v = getActiveVersion(q);
              return (
                <li key={q.id}>
                  <div className="lt-recent-main">
                    <strong>{q.visibleNumber}</strong>
                    <span className="lt-recent-name">{q.internalName}</span>
                    <span className="lt-muted">{q.customer?.name ?? "Sin cliente"}</span>
                  </div>
                  <div className="lt-recent-side">
                    <strong>{formatArs(v?.totalSaleCents)}</strong>
                    {v ? <span className={`lt-state ${v.state.toLowerCase()}`}>{STATE_LABEL[v.state]}</span> : null}
                    <span className="lt-recent-actions">
                      <button type="button" disabled={busy !== null} onClick={() => void rowPdf(q, "SIMPLE")}>PDF</button>
                      <button type="button" disabled={busy !== null} onClick={() => void rowPdf(q, "DETALLADO")}>Detallado</button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
