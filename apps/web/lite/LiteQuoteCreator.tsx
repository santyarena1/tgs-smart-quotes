"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { bpsToPct, centsToInput, formatArs, lineTotalCents, parseArsToCents, roundCentsToPesosStep } from "../lib/money";
import { applyDraftCost, applyDraftMarkup, applyDraftSale, itemPricePayload } from "../lib/quote-item-pricing";
import { getActiveVersion, getQuoteItems, type Collection, type CompanySettings, type Customer, type FinancingPlan, type PcLine, type Product, type Quote, type QuoteState } from "../lib/types";
import { errorMessage, MoneyInput } from "../components/shared";
import { useLite } from "./LiteContext";
import { LiteFinancing } from "./LiteFinancing";
import { LiteNewCustomer } from "./LiteNewCustomer";
import { LiteNewProduct } from "./LiteNewProduct";
import { LiteQuoteList } from "./LiteQuoteList";
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

type TradeIn = { key: string; name: string; valueArs: string };

const tradeInCents = (t: TradeIn): bigint => {
  try { return t.valueArs.trim() ? BigInt(parseArsToCents(t.valueArs)) : 0n; } catch { return 0n; }
};

const DEFAULT_MARKUP = "30";
const ROUND_STEPS = ["100", "500", "1000", "5000"];

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

function SlotPicker({ products, preferLineId, onPick, onCreate }: {
  products: Product[];
  preferLineId: string;
  onPick: (p: Product) => void;
  onCreate: (name: string) => void;
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
  function pick(p: Product) {
    setOpen(false);
    setQ("");
    onPick(p);
  }
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
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") {
            e.preventDefault();
            if (hits[0]) pick(hits[0]);
            else if (q.trim()) { setOpen(false); onCreate(q.trim()); }
          }
        }}
      />
      {open && (hits.length || q.trim()) ? (
        <ul className="lt-results" role="listbox">
          {hits.map((p) => (
            <li key={p.id} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <span className="lt-res-name">{p.name}</span>
              <span className="lt-res-price">{formatArs(p.salePriceCents)}</span>
            </li>
          ))}
          {q.trim() ? (
            <li className="free" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); setOpen(false); onCreate(q.trim()); }}>
              <span className="lt-res-name">+ Crear “{q.trim()}” como producto nuevo</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

const DRAFT_KEY = "tgs.lite.draft.v1";

/** Lleva el total de la venta a `targetCents` escalando los precios de venta de forma proporcional.
 *  El residuo de redondeo se absorbe en un ítem de cantidad 1 (el de mayor importe). */
function retargetLines(lines: Line[], targetCents: bigint): { lines: Line[]; reached: bigint } | null {
  const priced = lines.map((l) => {
    let unit = 0n;
    try { unit = BigInt(parseArsToCents(l.saleArs)); } catch { /* ítem incompleto */ }
    return { l, unit, qty: BigInt(Math.max(0, Math.trunc(Number(l.quantity) || 0))) };
  });
  const current = priced.reduce((sum, x) => sum + x.unit * x.qty, 0n);
  if (current <= 0n) return null;
  const next = priced.map((x) => ({ ...x, unit: (x.unit * targetCents + current / 2n) / current }));
  let residue = targetCents - next.reduce((sum, x) => sum + x.unit * x.qty, 0n);
  if (residue !== 0n) {
    const candidates = next.filter((x) => x.qty === 1n && x.unit + residue >= 0n).sort((x, y) => (y.unit > x.unit ? 1 : -1));
    if (candidates[0]) { candidates[0].unit += residue; residue = 0n; }
  }
  const reached = next.reduce((sum, x) => sum + x.unit * x.qty, 0n);
  return { lines: next.map((x) => applyDraftSale(x.l, centsToInput(x.unit.toString()))), reached };
}

/** Venta por debajo del costo: se marca en rojo para no mandar un presupuesto con pérdida. */
function sellsBelowCost(line: Line): boolean {
  try {
    return BigInt(parseArsToCents(line.saleArs)) < BigInt(parseArsToCents(line.costArs));
  } catch {
    return false;
  }
}

const LineRow = memo(function LineRow({ line: l, onPatch, onRemove, onDuplicate, onDone }: {
  line: Line;
  onPatch: (key: string, fn: (line: Line) => Line) => void;
  onRemove: (key: string) => void;
  onDuplicate: (key: string) => void;
  /** Enter en cualquier celda: vuelve al buscador para cargar el siguiente producto. */
  onDone: () => void;
}) {
  const below = sellsBelowCost(l);
  return (
    <div
      className="lt-line"
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && e.target instanceof HTMLInputElement) { e.preventDefault(); onDone(); }
      }}
    >
      <input className="lt-cell" value={l.name} onChange={(e) => onPatch(l.key, (x) => ({ ...x, name: e.target.value }))} aria-label="Nombre" />
      <input className="lt-cell num" type="number" min={1} value={l.quantity} onChange={(e) => onPatch(l.key, (x) => ({ ...x, quantity: e.target.value }))} aria-label="Cantidad" />
      <MoneyInput className="lt-cell num" value={l.costArs} onChange={(v) => onPatch(l.key, (x) => applyDraftCost(x, v))} aria-label="Costo" placeholder="0" />
      <input className={`lt-cell num${below ? " neg" : ""}`} inputMode="decimal" value={l.markupPct} title={below ? "Vendés por debajo del costo" : undefined} onChange={(e) => onPatch(l.key, (x) => applyDraftMarkup(x, e.target.value))} aria-label="Margen" />
      <MoneyInput className={`lt-cell num${below ? " neg" : ""}`} value={l.saleArs} onChange={(v) => onPatch(l.key, (x) => applyDraftSale(x, v))} aria-label="Venta" placeholder="0" />
      <strong className="lt-line-total r">{formatArs(lineTotalCents(l.saleArs, l.quantity))}</strong>
      <span className="lt-row-actions">
        <button type="button" className="lt-x" onClick={() => onDuplicate(l.key)} aria-label="Duplicar ítem" title="Duplicar">⧉</button>
        <button type="button" className="lt-x" onClick={() => onRemove(l.key)} aria-label="Quitar ítem" title="Quitar">×</button>
      </span>
    </div>
  );
});

export function LiteQuoteCreator() {
  const { writesElsewhere } = useLite();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<{ id: string; visibleNumber: string; observation: string | null } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [finPlans, setFinPlans] = useState<FinancingPlan[]>([]);
  const [listInterestBps, setListInterestBps] = useState(0);
  const [finLoaded, setFinLoaded] = useState(false);
  const [newProd, setNewProd] = useState<{ name: string; lineId: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeShowValues, setTradeShowValues] = useState(true);
  const [totalEditOpen, setTotalEditOpen] = useState(false);
  const [totalEditValue, setTotalEditValue] = useState("");
  const [tradeIns, setTradeIns] = useState<TradeIn[]>([]);
  const [removed, setRemoved] = useState<{ line: Line; index: number } | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const linesRef = useRef<Line[]>([]);
  const submitRef = useRef<(kind: PdfKind) => Promise<void>>(async () => {});

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

  useEffect(() => {
    void Promise.all([
      api<FinancingPlan[]>("/financing").catch(() => [] as FinancingPlan[]),
      api<CompanySettings>("/settings/company").catch(() => null),
    ]).then(([plans, company]) => {
      setFinPlans(plans.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder));
      setListInterestBps(company?.listInterestBps ?? 0);
      setFinLoaded(true);
    });
  }, []);

  // Borrador: si se recarga la página o se cierra la pestaña, el presupuesto en curso no se pierde.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { lines?: Line[]; name?: string; customerId?: string; isBuiltPc?: boolean; collectionIds?: string[]; tradeIns?: TradeIn[]; tradeShowValues?: boolean };
        if (d.lines?.length) {
          setLines(d.lines);
          setName(d.name ?? "");
          setCustomerId(d.customerId ?? "");
          setIsBuiltPc(Boolean(d.isBuiltPc));
          setCollectionIds(d.collectionIds ?? []);
          setTradeIns(d.tradeIns ?? []);
          setTradeShowValues(d.tradeShowValues ?? true);
          setNotice("Recuperé el presupuesto que dejaste sin guardar.");
        }
      }
    } catch { /* sin storage o borrador roto */ }
    setDraftReady(true);
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!draftReady || editing) return;
    const timer = window.setTimeout(() => {
      try {
        if (lines.length) window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, name, customerId, isBuiltPc, collectionIds, tradeIns, tradeShowValues }));
        else window.localStorage.removeItem(DRAFT_KEY);
      } catch { /* sin storage */ }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftReady, editing, lines, name, customerId, isBuiltPc, collectionIds, tradeIns, tradeShowValues]);

  useEffect(() => {
    if (!removed) return;
    const timer = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(timer);
  }, [removed]);

  // Atajos: "/" va al buscador, Ctrl+Enter crea y descarga el PDF desde cualquier lado.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submitRef.current("SIMPLE"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    const pool = tokens.length
      ? products.filter((p) => { const n = norm(p.name); return tokens.every((t) => n.includes(t)); })
      : [...products].sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
    return pool.slice(0, 7);
  }, [products, query]);
  useEffect(() => setActive(0), [query]);
  const recent = useMemo(
    () => [...products].filter((p) => p.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "")).slice(0, 6),
    [products],
  );

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

  const tradeInTotal = useMemo(
    () => tradeIns.reduce((sum, t) => sum + tradeInCents(t), 0n),
    [tradeIns],
  );
  const net = total > tradeInTotal ? total - tradeInTotal : 0n;

  function openTotalEdit() {
    if (!lines.length) { setError("Cargá productos antes de editar el total."); return; }
    setError(null);
    setTotalEditValue(centsToInput(total.toString()));
    setTotalEditOpen(true);
  }
  function applyTotalEdit() {
    let target: bigint;
    try { target = BigInt(parseArsToCents(totalEditValue)); } catch { setError("El total que escribiste no es válido."); return; }
    if (target <= 0n) { setError("El total tiene que ser mayor a cero."); return; }
    const result = retargetLines(lines, target);
    if (!result) { setError("Los ítems no tienen precio para ajustar."); return; }
    setLines(result.lines);
    setTotalEditOpen(false);
    setError(null);
    setNotice(result.reached === target
      ? `Total de la venta ajustado a ${formatArs(target)}.`
      : `Total ajustado a ${formatArs(result.reached)} (el más cercano posible con las cantidades cargadas).`);
  }

  function openTradeIn() {
    if (!tradeIns.length) setTradeIns([{ key: crypto.randomUUID(), name: "", valueArs: "" }]);
    setTradeOpen(true);
  }
  /** Al cerrar se descartan las filas vacías para no dejar basura en el borrador. */
  function closeTradeIn() {
    setTradeIns((current) => current.filter((t) => t.name.trim() || t.valueArs.trim()));
    setTradeOpen(false);
    searchRef.current?.focus();
  }
  const patchTradeIn = (key: string, fn: (t: TradeIn) => TradeIn) =>
    setTradeIns((current) => current.map((t) => (t.key === key ? fn(t) : t)));

  const patch = useCallback((key: string, fn: (line: Line) => Line) => {
    setLines((current) => current.map((l) => (l.key === key ? fn(l) : l)));
  }, []);
  linesRef.current = lines;
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const removeLine = useCallback((key: string) => {
    const index = linesRef.current.findIndex((l) => l.key === key);
    if (index < 0) return;
    setRemoved({ line: linesRef.current[index]!, index });
    setLines((current) => current.filter((l) => l.key !== key));
  }, []);
  const duplicateLine = useCallback((key: string) => {
    setLines((current) => {
      const index = current.findIndex((l) => l.key === key);
      if (index < 0) return current;
      const copy = { ...current[index]!, key: crypto.randomUUID() };
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
  }, []);
  function undoRemove() {
    if (!removed) return;
    setLines((current) => {
      const next = [...current];
      next.splice(Math.min(removed.index, next.length), 0, removed.line);
      return next;
    });
    setRemoved(null);
  }

  function addProduct(p: Product, lineId?: string) {
    // En PC armada el producto va a su componente (el elegido o el habitual); sin componente queda como extra.
    const target = lineId ?? (isBuiltPc && pcLines.some((l) => l.id === p.defaultLineId) ? p.defaultLineId ?? "" : "");
    setLines((current) => [...current, lineFromProduct(p, target)]);
    setQuery("");
    setSearchOpen(false);
  }

  function startCreate(name: string, lineId = "") {
    setSearchOpen(false);
    setNewProd({ name, lineId });
  }

  function onProductCreated(product: Product) {
    setProducts((current) => [...current, product]);
    addProduct(product, newProd?.lineId || undefined);
    setNotice(`Producto “${product.name}” creado y agregado.`);
    setNewProd(null);
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
    setQuery("");
    setSearchOpen(false);
    setIsBuiltPc(next);
  }

  async function submit(kind: PdfKind) {
    if (busy) return;
    const invalid = validate(lines);
    if (invalid) { setError(invalid); return; }
    const given = tradeIns.filter((t) => t.name.trim() || t.valueArs.trim());
    for (const t of given) {
      if (!t.name.trim()) { setError("Poné el nombre de cada producto del cliente."); return; }
      if (tradeInCents(t) <= 0n) { setError(`Poné el valor de “${t.name.trim()}” (producto del cliente).`); return; }
    }
    if (given.length && tradeInTotal > total) { setError("Lo que entrega el cliente supera el total del presupuesto."); return; }
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
      const created = await api<Quote>(editing ? `/quotes/${editing.id}` : "/quotes", {
        method: editing ? "PUT" : "POST",
        body: {
          internalName,
          customerId: customerId || null,
          requestId: null,
          isBuiltPc,
          ...(editing ? { reason: null } : { kind: "PC" }),
          publicObservation: editing?.observation ?? null,
          // null limpia lo que hubiera guardado una versión anterior.
          tradeIns: given.length
            ? { showValues: tradeShowValues, items: given.map((t) => ({ name: t.name.trim(), valueCents: tradeInCents(t).toString() })) }
            : null,
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
      resetForm();
      try {
        await downloadQuotePdf(created.id, created.visibleNumber, kind);
        setNotice(`${created.visibleNumber} ${editing ? "actualizado" : "creado"} · PDF ${kind === "SIMPLE" ? "simple" : "detallado"} descargado.`);
      } catch (err) {
        setNotice(`${created.visibleNumber} ${editing ? "actualizado" : "creado"}, pero el PDF falló: ${errorMessage(err)}`);
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  submitRef.current = submit;

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setQuery("");
      setSearchOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active];
      if (hit) addProduct(hit);
      else if (query.trim()) startCreate(query.trim());
    }
  }

  function resetForm() {
    setLines([]);
    setName("");
    setCustomerId("");
    setBulkMarkup("");
    setCollectionIds([]);
    setIsBuiltPc(false);
    setRoundStep("");
    setTradeOpen(false);
    setTradeIns([]);
    setTradeShowValues(true);
    setEditing(null);
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* sin storage */ }
    searchRef.current?.focus();
  }

  /** Carga un presupuesto existente en el formulario para modificarlo (guardar crea una versión nueva). */
  async function startEdit(summary: Quote) {
    if (busy) return;
    setError(null);
    setNotice(null);
    try {
      const quote = await api<Quote>(`/quotes/${summary.id}`);
      setName(quote.internalName);
      setCustomerId(quote.customerId ?? "");
      setIsBuiltPc(quote.isBuiltPc);
      setCollectionIds((quote.collections ?? []).map((row) => row.collectionId ?? row.collection?.id ?? "").filter(Boolean));
      setLines(getQuoteItems(quote).map((item) => ({
        key: crypto.randomUUID(),
        productId: item.productId ?? "",
        lineId: item.lineId ?? "",
        name: item.name,
        quantity: String(item.quantity),
        costArs: centsToInput(item.costCents),
        markupPct: bpsToPct(item.markupBps),
        saleArs: centsToInput(item.salePriceCents ?? "0"),
        // El precio guardado manda: no recalcular la venta desde un % redondeado.
        priceMode: "sale" as const,
      })));
      const savedTrade = getActiveVersion(quote)?.tradeIns;
      setTradeIns(savedTrade?.items.map((i) => ({ key: crypto.randomUUID(), name: i.name, valueArs: centsToInput(i.valueCents) })) ?? []);
      setTradeShowValues(savedTrade?.showValues ?? true);
      setEditing({ id: quote.id, visibleNumber: quote.visibleNumber, observation: getActiveVersion(quote)?.publicObservation ?? null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const renderLine = (l: Line) => <LineRow key={l.key} line={l} onPatch={patch} onRemove={removeLine} onDuplicate={duplicateLine} onDone={focusSearch} />;

  const extras = lines.filter((l) => !l.lineId || !pcLines.some((pc) => pc.id === l.lineId));

  const ready = lines.length > 0 && !busy;

  return (
    <div className="lt-grid">
      {newCustomerOpen ? (
        <LiteNewCustomer
          onCancel={() => setNewCustomerOpen(false)}
          onCreated={(customer) => {
            setCustomers((current) => [...current, customer].sort((x, y) => x.name.localeCompare(y.name)));
            setCustomerId(customer.id);
            setNewCustomerOpen(false);
            setNotice(`Cliente “${customer.name}” creado y seleccionado.`);
          }}
        />
      ) : null}
      {tradeOpen ? (
        <div className="lt-modal" role="dialog" aria-modal="true" aria-label="Productos entregados por el cliente" onMouseDown={(e) => { if (e.target === e.currentTarget) closeTradeIn(); }}>
          <div className="lt-card lt-modal-card lt-trade-modal" onKeyDown={(e) => { if (e.key === "Escape") closeTradeIn(); }}>
            <div className="lt-trade-head">
              <h2>Productos entregados por el cliente</h2>
              <p>Cargá a cuánto tomás cada uno. Se resta del total y de las cuotas.</p>
            </div>

            <div className="lt-trade-rows">
              {tradeIns.map((t, i) => (
                <div className="lt-trade-row" key={t.key}>
                  <input className="lt-input" autoFocus={i === tradeIns.length - 1 && !t.name} value={t.name} placeholder="Producto" onChange={(e) => patchTradeIn(t.key, (x) => ({ ...x, name: e.target.value }))} aria-label="Producto del cliente" />
                  <MoneyInput
                    className="lt-input num"
                    value={t.valueArs}
                    placeholder="$ valor"
                    onChange={(v) => patchTradeIn(t.key, (x) => ({ ...x, valueArs: v }))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      // Enter en la última fila completa abre otra; en una vacía cierra.
                      if (i === tradeIns.length - 1 && t.name.trim() && tradeInCents(t) > 0n) setTradeIns((c) => [...c, { key: crypto.randomUUID(), name: "", valueArs: "" }]);
                      else closeTradeIn();
                    }}
                    aria-label="Valor del producto del cliente"
                  />
                  <button type="button" className="lt-x" onClick={() => setTradeIns((c) => c.filter((x) => x.key !== t.key))} aria-label="Quitar producto del cliente">×</button>
                </div>
              ))}
            </div>
            <button type="button" className="lt-trade-add" onClick={() => setTradeIns((c) => [...c, { key: crypto.randomUUID(), name: "", valueArs: "" }])}>+ Agregar otro</button>

            <label className="lt-trade-check">
              <input type="checkbox" checked={tradeShowValues} onChange={(e) => setTradeShowValues(e.target.checked)} />
              <span>Mostrar a cuánto lo tomamos en el presupuesto</span>
            </label>

            <div className={`lt-trade-summary${tradeInTotal > total ? " over" : ""}`}>
              <div><span>A descontar</span><strong>− {formatArs(tradeInTotal)}</strong></div>
              <div><span>{tradeInTotal > total ? "Supera el total" : "Precio final"}</span><strong>{formatArs(net)}</strong></div>
            </div>

            <div className="lt-modal-foot">
              <button type="button" className="lt-trade-clear" onClick={() => { setTradeIns([]); setTradeOpen(false); }}>Quitar todo</button>
              <button type="button" className="lt-btn lt-btn-amber" onClick={closeTradeIn}>Listo</button>
            </div>
          </div>
        </div>
      ) : null}
      {totalEditOpen ? (
        <div className="lt-modal" role="dialog" aria-modal="true" aria-label="Total de la venta" onMouseDown={(e) => { if (e.target === e.currentTarget) setTotalEditOpen(false); }}>
          <form className="lt-card lt-modal-card" onSubmit={(e) => { e.preventDefault(); applyTotalEdit(); }} onKeyDown={(e) => { if (e.key === "Escape") setTotalEditOpen(false); }}>
            <h2>Total de la venta</h2>
            <p className="lt-muted">Escribí el total que querés. Los precios de los ítems se ajustan en proporción para llegar a ese valor{tradeInTotal > 0n ? " (antes de restar lo que entrega el cliente)" : ""}.</p>
            <label className="lt-field">Total
              <MoneyInput className="lt-input num" autoFocus value={totalEditValue} onChange={setTotalEditValue} placeholder="0" aria-label="Total de la venta" />
            </label>
            <div className="lt-modal-foot">
              <button type="button" className="lt-btn ghost" onClick={() => setTotalEditOpen(false)}>Cancelar</button>
              <button type="submit" className="lt-btn">Aplicar total</button>
            </div>
          </form>
        </div>
      ) : null}
      {newProd ? <LiteNewProduct initialName={newProd.name} lineId={newProd.lineId} onCreated={onProductCreated} onCancel={() => setNewProd(null)} /> : null}
      <LiteFinancing totalCents={net} plans={finPlans} listInterestBps={listInterestBps} loaded={finLoaded} />
      <section className="lt-col">
        <div className="lt-head">
          <h1>{editing ? `Editando ${editing.visibleNumber}` : "Nuevo presupuesto"}</h1>
          <p><kbd>/</kbd> busca · <kbd>Enter</kbd> agrega y vuelve al buscador · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> crea y descarga el PDF.</p>
        </div>

        {editing ? (
          <div className="lt-note lt-editing">
            <span>Modificás {editing.visibleNumber}: al guardar se registra como versión nueva (si ya fue enviado, el original queda intacto).</span>
            <button type="button" className="lt-btn ghost sm" onClick={resetForm}>Cancelar edición</button>
          </div>
        ) : null}
        {writesElsewhere ? <div className="lt-note">Estás viendo otro local: los presupuestos nuevos se guardan en el tuyo.</div> : null}
        {error ? <div className="lt-alert err" role="alert">{error}</div> : null}
        {notice ? <div className="lt-alert ok" role="status">{notice}</div> : null}
        {removed ? (
          <div className="lt-alert undo" role="status">
            <span>Quitaste “{removed.line.name || "ítem"}”.</span>
            <button type="button" className="lt-btn ghost sm" onClick={undoRemove}>Deshacer</button>
          </div>
        ) : null}

        <div className="lt-card">
          <div className="lt-meta">
            <input className="lt-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (opcional: usa el cliente o el primer ítem)" aria-label="Nombre interno" />
            <div className="lt-customer">
              <select className="lt-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Cliente">
              <option value="">Sin cliente</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
              <button type="button" className="lt-btn ghost" onClick={() => setNewCustomerOpen(true)} title="Crear cliente nuevo">+ Cliente</button>
            </div>
          </div>

          <div className="lt-toggles">
            <button type="button" className={`lt-pc${isBuiltPc ? " on" : ""}`} role="switch" aria-checked={isBuiltPc} onClick={() => toggleBuiltPc(!isBuiltPc)}>
              <span className="lt-switch-track"><span className="lt-switch-knob" /></span>
              <span className="lt-pc-copy"><strong>PC armada</strong><small>{isBuiltPc ? "Un renglón por componente" : "Activalo para cargar por componentes"}</small></span>
            </button>
          <button type="button" className={`lt-pc trade${tradeInTotal > 0n ? " on" : ""}`} onClick={openTradeIn} aria-haspopup="dialog">
            <span className="lt-trade-ico" aria-hidden="true">⇄</span>
            <span className="lt-pc-copy"><strong>Productos del cliente</strong><small>{tradeInTotal > 0n ? `− ${formatArs(tradeInTotal)} a cuenta` : "Entrega algo como parte de pago"}</small></span>
          </button>
          </div>

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
              autoComplete="off"
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
              onKeyDown={onSearchKey}
              placeholder={isBuiltPc ? "PC armada: elegí el producto en cada componente" : "Buscar producto…  (↑↓ Enter)"}
              disabled={isBuiltPc}
              aria-label="Buscar producto"
            />
            {!isBuiltPc && searchOpen && (query.trim() || products.length) ? (
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
                  <li className="free" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); startCreate(query.trim()); }}>
                    <span className="lt-res-name">+ Crear “{query.trim()}” como producto nuevo</span>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          {recent.length && !isBuiltPc ? (
            <div className="lt-recents" aria-label="Productos recientes">
              <span className="lt-muted">Recientes</span>
              {recent.map((p) => (
                <button key={p.id} type="button" className="lt-chip" onClick={() => { addProduct(p); searchRef.current?.focus(); }} title={formatArs(p.salePriceCents)}>
                  + {p.name.length > 28 ? `${p.name.slice(0, 27)}…` : p.name}
                </button>
              ))}
            </div>
          ) : null}

          {lines.length === 0 && !isBuiltPc ? (
            <div className="lt-empty">Todavía no hay ítems. Buscá arriba, tocá un reciente o apretá <kbd>/</kbd> para empezar.</div>
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
                            onCreate={(n) => startCreate(n, pc.id)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                  {extras.length ? <div className="lt-comp"><div className="lt-comp-name">Extras</div>{extras.map(renderLine)}</div> : null}
                </>
              ) : lines.map(renderLine)}
            </div>
          )}
        </div>

        <div className="lt-foot">
          {lines.length ? (
            <div className="lt-tools">
              <div className="lt-tool">
                <span>Margen</span>
                <input className="lt-cell num" inputMode="decimal" value={bulkMarkup} onChange={(e) => setBulkMarkup(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && bulkMarkup.trim()) { e.preventDefault(); setLines((c) => c.map((l) => applyDraftMarkup(l, bulkMarkup.trim()))); } }}
                  placeholder="% margen" aria-label="Margen general" />
                <button type="button" className="lt-btn ghost sm" disabled={!bulkMarkup.trim()} onClick={() => setLines((c) => c.map((l) => applyDraftMarkup(l, bulkMarkup.trim())))}>Aplicar</button>
              </div>
              <div className="lt-tool">
                <span>Redondeo</span>
                {ROUND_STEPS.map((st) => (
                  <button key={st} type="button" className={`lt-chip${roundStep === st ? " on" : ""}`} onClick={() => setRoundStep(roundStep === st ? "" : st)}>$ {Number(st).toLocaleString("es-AR")}</button>
                ))}
                <button type="button" className="lt-btn ghost sm" disabled={!roundStep} onClick={applyRounding}>Aplicar</button>
              </div>
            </div>
          ) : null}
          <div className="lt-foot-main">
            <div className="lt-total">
              <span>{tradeInTotal > 0n ? "A pagar" : "Total"}</span>
              <strong>{formatArs(net)}</strong>
              <button type="button" className="lt-total-edit" onClick={openTotalEdit} title="Modificar a mano el total de la venta" aria-label="Modificar el total de la venta">✎</button>
              {tradeInTotal > 0n ? <small className="lt-total-sub">({formatArs(total)} − {formatArs(tradeInTotal)})</small> : null}
              {lines.length ? <small className="lt-total-meta"><span className="lt-cost">Costo {formatArs(cost)}</span> · <span className="lt-gain">Ganancia {formatArs(total - cost)}</span></small> : null}
            </div>
            <span className="lt-spacer" />
            <button type="button" className="lt-btn ghost" disabled={!ready} onClick={() => void submit("DETALLADO")}>
              {busy === "DETALLADO" ? "Generando…" : "PDF detallado"}
            </button>
            <button type="button" className="lt-btn" disabled={!ready} onClick={() => void submit("SIMPLE")}>
              {busy === "SIMPLE" ? "Generando…" : editing ? "Guardar y descargar PDF" : "Crear y descargar PDF"}
            </button>
          </div>
        </div>
      </section>

      <LiteQuoteList
        refreshKey={refreshKey}
        editingId={editing?.id ?? null}
        onEdit={(q) => void startEdit(q)}
        onDeleted={(q) => { if (editing?.id === q.id) resetForm(); setNotice(`${q.visibleNumber} eliminado.`); }}
      />
    </div>
  );
}
