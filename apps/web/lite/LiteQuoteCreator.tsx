"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { bpsToPct, centsToInput, formatArs, lineTotalCents, parseArsToCents, roundCentsToPesosStep, saleFromCostAndPct } from "../lib/money";
import { providerColor, useNodoProviders, useNodoSearch, useSourceSelection, useWebSearch, WEB_COLOR, type NodoProvider, type NodoResult, type SourceSelection, type WebResult } from "../lib/nodo";
import { SourceBar } from "../components/SourceBar";
import { OriginTag, type ItemSource } from "../components/OriginTag";
import { providerLogo, WEB_LOGO } from "../lib/nodo-logos";
import { DEFAULT_IVA_PCT, fetchIvaSuggestion, isValidIvaPct, ivaBpsFromPct, ivaPctFromBps, IVA_PRESETS, teachIva } from "../lib/iva";
import { applyDraftCost, applyDraftMarkup, applyDraftSale, itemPricePayload } from "../lib/quote-item-pricing";
import { getActiveVersion, getQuoteItems, type Collection, type CompanySettings, type Customer, type FinancingPlan, type PcLine, type Product, type Quote, type QuoteState } from "../lib/types";
import { errorMessage, MoneyInput } from "../components/shared";
import { useLite } from "./LiteContext";
import { LiteFinancing } from "./LiteFinancing";
import { LiteNewCustomer } from "./LiteNewCustomer";
import { LiteNewProduct } from "./LiteNewProduct";
import { LiteReferenceBubble, LiteReferenceModal, type ReferenceImage } from "./LiteReferenceImage";
import { suggestReferenceStyle, useReferenceImageJob, type ReferenceStyle } from "./useReferenceImageJob";
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
  /** IVA incluido en el precio, en %. Lo sugiere NODO o la memoria por categoría; se puede cambiar. */
  ivaPct: string;
  /** true = sugerido automáticamente (la memoria todavía puede corregirlo); false = lo eligió el usuario. */
  ivaAuto: boolean;
  /** Foto del producto (la trae NODO): sirve para la imagen de referencia de la PC. */
  imageUrl?: string | null;
  /** De dónde salió (distribuidor o web). Solo se muestra al armar: no se guarda ni va al PDF. */
  source?: ItemSource;
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
    ivaPct: p.ivaBps != null ? ivaPctFromBps(p.ivaBps) : DEFAULT_IVA_PCT,
    ivaAuto: p.ivaBps == null,
  };
}

/** Un producto de un distribuidor (NODO) entra como ítem libre: nombre y costo + IVA en pesos. */
function lineFromNodo(r: NodoResult, lineId = "", color = "#64748b"): Line {
  const costArs = centsToInput(r.costIvaCents);
  return {
    key: crypto.randomUUID(),
    productId: "",
    lineId,
    name: r.name.toLocaleUpperCase("es-AR"),
    quantity: "1",
    costArs,
    markupPct: DEFAULT_MARKUP,
    saleArs: saleFromCostAndPct(costArs, DEFAULT_MARKUP),
    priceMode: "markup",
    // NODO informa la alícuota de cada producto: ese dato manda.
    ivaPct: r.ivaBps != null ? ivaPctFromBps(r.ivaBps) : DEFAULT_IVA_PCT,
    ivaAuto: r.ivaBps == null,
    imageUrl: r.imageUrl ?? null,
    source: { label: r.providerName, color },
  };
}

/** Producto de la tienda web: el precio de la web es de venta, así que entra con ese precio y el costo sin cargar. */
function lineFromWeb(r: WebResult, lineId = ""): Line {
  return {
    key: crypto.randomUUID(),
    productId: "",
    lineId,
    name: r.name.toLocaleUpperCase("es-AR"),
    quantity: "1",
    costArs: "0",
    markupPct: "0",
    saleArs: centsToInput(r.priceCents),
    priceMode: "sale",
    ivaPct: DEFAULT_IVA_PCT,
    ivaAuto: true,
    source: { label: "Web", color: WEB_COLOR },
  };
}

function validate(lines: Line[]): string | null {
  if (!lines.length) return "Agregá al menos un producto.";
  for (const [i, line] of lines.entries()) {
    if (!line.name.trim()) return `El ítem ${i + 1} necesita un nombre.`;
    if (!line.costArs.trim()) return `El ítem ${i + 1} necesita un costo.`;
    if (!Number(line.quantity) || Number(line.quantity) < 1) return `El ítem ${i + 1} necesita una cantidad válida.`;
    if (!isValidIvaPct(line.ivaPct)) return `Revisá el IVA del ítem ${i + 1}.`;
    try {
      parseArsToCents(line.costArs);
      itemPricePayload(line);
    } catch {
      return `Revisá los importes del ítem ${i + 1}.`;
    }
  }
  return null;
}

/** Resultado de un distribuidor (NODO) con el color del distribuidor. */
function NodoRow({ r, providers, active, onHover, onPick }: {
  r: NodoResult;
  providers: NodoProvider[];
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={active}
      className={`lt-nodo${active ? " active" : ""}`}
      style={{ "--nc": providerColor(providers, r.providerId) } as React.CSSProperties}
      onMouseEnter={onHover}
      onMouseDown={(e) => { e.preventDefault(); onPick(); }}
    >
      <span className="lt-res-left">
        {providerLogo(r.providerName) ? <img className="lt-logo" src={providerLogo(r.providerName)!} alt="" width={28} height={28} /> : null}
        <span className="lt-res-main">
          <span className="lt-res-name">{r.name}</span>
          <span className="lt-res-sub">
            <span className="lt-prov">{r.providerName}</span>
            {r.sku ? ` · ${r.sku}` : ""}{r.stock !== null ? ` · stock ${r.stock}` : ""}{r.stale ? " · precio desactualizado" : ""}
          </span>
        </span>
      </span>
      <span className="lt-res-price" title={r.originalCurrency === "USD" ? `US$ ${r.originalCostIva.toLocaleString("es-AR")} × ${r.fxRate}` : undefined}>
        {formatArs(r.costIvaCents)}
        <small>costo + IVA</small>
      </span>
    </li>
  );
}

/** Resultado de la tienda web (precio de venta publicado). */
function WebRow({ r, active, onHover, onPick }: { r: WebResult; active: boolean; onHover: () => void; onPick: () => void }) {
  return (
    <li
      role="option"
      aria-selected={active}
      className={`lt-nodo${active ? " active" : ""}`}
      style={{ "--nc": WEB_COLOR } as React.CSSProperties}
      onMouseEnter={onHover}
      onMouseDown={(e) => { e.preventDefault(); onPick(); }}
    >
      <span className="lt-res-left">
        <img className="lt-logo" src={WEB_LOGO} alt="" width={28} height={28} />
        <span className="lt-res-main">
          <span className="lt-res-name">{r.name}</span>
          <span className="lt-res-sub">
            <span className="lt-prov">Web</span>
            {r.sku ? ` · ${r.sku}` : ""}
          </span>
        </span>
      </span>
      <span className="lt-res-price">
        {formatArs(r.priceCents)}
        <small>precio de venta</small>
      </span>
    </li>
  );
}

/** Avisos de las búsquedas externas (cargando, error, sin resultados). */
function NodoNotes({ loading, error, query, hasOther }: { loading: boolean; error: string | null; query: string; hasOther: boolean }) {
  return (
    <>
      {loading ? <li className="lt-res-note">Buscando…</li> : null}
      {error ? <li className="lt-res-note err">{error}</li> : null}
      {!loading && !error && !hasOther && query.trim().length >= 2 ? <li className="lt-res-note">Sin resultados.</li> : null}
    </>
  );
}

function SlotPicker({ products, preferLineId, providers, sel, onPick, onPickNodo, onPickWeb, onCreate }: {
  products: Product[];
  preferLineId: string;
  providers: NodoProvider[];
  sel: SourceSelection;
  onPick: (p: Product) => void;
  onPickNodo: (r: NodoResult) => void;
  onPickWeb: (r: WebResult) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ownHits = useMemo(() => {
    if (!sel.own) return [];
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    const pool = products.filter((p) => tokens.every((t) => norm(p.name).includes(t)));
    // Sin texto, primero los productos habituales de este componente.
    if (!tokens.length) return pool.filter((p) => p.defaultLineId === preferLineId).slice(0, 6);
    return pool.sort((a, b) => Number(b.defaultLineId === preferLineId) - Number(a.defaultLineId === preferLineId)).slice(0, 6);
  }, [products, q, preferLineId, sel.own]);
  const nodo = useNodoSearch(q, sel.activeIds, providers.length);
  const web = useWebSearch(q, sel.web);
  const hits = ownHits;
  function pick(p: Product) {
    setOpen(false);
    setQ("");
    onPick(p);
  }
  function pickNodo(r: NodoResult) {
    setOpen(false);
    setQ("");
    onPickNodo(r);
  }
  function pickWeb(r: WebResult) {
    setOpen(false);
    setQ("");
    onPickWeb(r);
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
            else if (web.items[0]) pickWeb(web.items[0]);
            else if (nodo.items[0]) pickNodo(nodo.items[0]);
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
          {web.items.map((r) => (
            <WebRow key={`w${r.id}`} r={r} active={false} onHover={() => {}} onPick={() => pickWeb(r)} />
          ))}
          {nodo.items.map((r) => (
            <NodoRow key={r.offerId} r={r} providers={providers} active={false} onHover={() => {}} onPick={() => pickNodo(r)} />
          ))}
          <NodoNotes loading={nodo.loading || web.loading} error={nodo.error ?? web.error} query={q} hasOther={hits.length > 0 || nodo.items.length > 0 || web.items.length > 0} />
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
      <div className="lt-name-cell">
        <input className="lt-cell" value={l.name} onChange={(e) => onPatch(l.key, (x) => ({ ...x, name: e.target.value }))} aria-label="Nombre" />
        {l.source ? <OriginTag source={l.source} /> : null}
      </div>
      <input className="lt-cell num" type="number" min={1} value={l.quantity} onChange={(e) => onPatch(l.key, (x) => ({ ...x, quantity: e.target.value }))} aria-label="Cantidad" />
      <MoneyInput className="lt-cell num" value={l.costArs} onChange={(v) => onPatch(l.key, (x) => applyDraftCost(x, v))} aria-label="Costo" placeholder="0" />
      <input className={`lt-cell num${below ? " neg" : ""}`} inputMode="decimal" value={l.markupPct} title={below ? "Vendés por debajo del costo" : undefined} onChange={(e) => onPatch(l.key, (x) => applyDraftMarkup(x, e.target.value))} aria-label="Margen" />
      <MoneyInput className={`lt-cell num${below ? " neg" : ""}`} value={l.saleArs} onChange={(v) => onPatch(l.key, (x) => applyDraftSale(x, v))} aria-label="Venta" placeholder="0" />
      <select
        className={`lt-cell num lt-iva${l.ivaAuto ? " auto" : ""}`}
        value={l.ivaPct}
        title={l.ivaAuto ? "IVA sugerido según la categoría del producto (podés cambiarlo)" : "IVA elegido"}
        onChange={(e) => onPatch(l.key, (x) => ({ ...x, ivaPct: e.target.value, ivaAuto: false }))}
        aria-label="IVA"
      >
        {(IVA_PRESETS.includes(l.ivaPct) ? IVA_PRESETS : [...IVA_PRESETS, l.ivaPct]).map((v) => <option key={v} value={v}>{v.replace(".", ",")} %</option>)}
      </select>
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
  /** Modal para crear la empresa cliente cuando se pide un presupuesto formal sin una empresa elegida. */
  const [formalCompanyOpen, setFormalCompanyOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Fuentes de búsqueda: productos propios y los distribuidores que estén prendidos. */
  const { providers, error: providersError, setEnabled: setProvidersEnabled } = useNodoProviders();
  const sel = useSourceSelection(providers, setProvidersEnabled);
  const nodo = useNodoSearch(query, isBuiltPc ? [] : sel.activeIds, providers.length);
  const web = useWebSearch(query, sel.web && !isBuiltPc);
  const [finPlans, setFinPlans] = useState<FinancingPlan[]>([]);
  const [listInterestBps, setListInterestBps] = useState(0);
  const [finLoaded, setFinLoaded] = useState(false);
  const [newProd, setNewProd] = useState<{ name: string; lineId: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  // Imagen de referencia: opcional. `refImage` es la que queda incluida; `refSavedKey` la que ya tiene el presupuesto que se edita.
  const [refImage, setRefImage] = useState<ReferenceImage | null>(null);
  const [refSavedKey, setRefSavedKey] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const refJob = useReferenceImageJob();
  useEffect(() => {
    const base = document.title.replace(/^(⏳|✅) /, "");
    if (refJob.job.status === "generating") document.title = `⏳ ${base}`;
    else if (refJob.job.status === "ready") document.title = `✅ ${base}`;
    return () => { document.title = base; };
  }, [refJob.job.status]);
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

  // /lite?edit=<id> (desde Colecciones) abre ese presupuesto para modificarlo.
  useEffect(() => {
    if (!draftReady) return;
    const id = new URLSearchParams(window.location.search).get("edit");
    if (!id) return;
    window.history.replaceState(null, "", window.location.pathname);
    void startEdit({ id } as Quote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady]);

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
  const ownHits = useMemo(() => (sel.own ? results : []), [sel.own, results]);
  const entries = useMemo(
    () => [
      ...ownHits.map((p) => ({ kind: "own" as const, p })),
      ...web.items.map((w) => ({ kind: "web" as const, w })),
      ...nodo.items.map((r) => ({ kind: "nodo" as const, r })),
    ],
    [ownHits, web.items, nodo.items],
  );
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

  /** Si el IVA de la línea no es un dato firme (producto sin IVA cargado o web), le pone el que la memoria aprendió para su categoría. */
  function suggestIvaFor(line: Line) {
    if (!line.ivaAuto) return;
    void fetchIvaSuggestion(line.name).then((s) => {
      if (!s) return;
      setLines((current) => current.map((l) => (l.key === line.key && l.ivaAuto ? { ...l, ivaPct: ivaPctFromBps(s.ivaBps) } : l)));
    });
  }

  function addProduct(p: Product, lineId?: string) {
    // En PC armada el producto va a su componente (el elegido o el habitual); sin componente queda como extra.
    const target = lineId ?? (isBuiltPc && pcLines.some((l) => l.id === p.defaultLineId) ? p.defaultLineId ?? "" : "");
    const line = lineFromProduct(p, target);
    setLines((current) => [...current, line]);
    suggestIvaFor(line);
    setQuery("");
    setSearchOpen(false);
  }

  function addWeb(r: WebResult, lineId = "") {
    const line = lineFromWeb(r, lineId);
    setLines((current) => [...current, line]);
    suggestIvaFor(line);
    setQuery("");
    setSearchOpen(false);
    setNotice(`“${r.name}” agregado desde la web con su precio de venta ${formatArs(r.priceCents)}. Falta cargar el costo.`);
  }

  function addNodo(r: NodoResult, lineId = "") {
    const line = lineFromNodo(r, lineId, providerColor(providers, r.providerId));
    setLines((current) => [...current, line]);
    suggestIvaFor(line);
    setQuery("");
    setSearchOpen(false);
    setNotice(`“${r.name}” agregado desde ${r.providerName}: costo + IVA ${formatArs(r.costIvaCents)}.`);
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

  async function submit(kind: PdfKind, customerOverride?: Customer) {
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
      const effectiveCustomerId = customerOverride?.id ?? customerId;
      const customerName = customerOverride?.name ?? customers.find((c) => c.id === customerId)?.name;
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
          customerId: effectiveCustomerId || null,
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
            ivaBps: ivaBpsFromPct(l.ivaPct),
            ...itemPricePayload(l),
          })),
        },
      });
      // La imagen de referencia se deja en el presupuesto antes de armar el PDF, para que ya salga en él.
      let refNote = "";
      if (refImage || refSavedKey) {
        try {
          await api(`/quote-reference-image/${created.id}`, { method: "PUT", body: { image: refImage } });
        } catch (err) {
          refNote = ` La imagen de referencia no se pudo guardar: ${errorMessage(err)}`;
        }
      }
      // Lo que se eligió a mano también enseña a la memoria de IVA por categoría.
      teachIva(ordered.filter((l) => !l.ivaAuto).map((l) => ({ name: l.name.trim(), ivaBps: ivaBpsFromPct(l.ivaPct) })));
      resetForm();
      try {
        await downloadQuotePdf(created.id, created.visibleNumber, kind);
        setNotice(`${created.visibleNumber} ${editing ? "actualizado" : "creado"} · ${kind === "FORMAL" ? "Presupuesto formal" : `PDF ${kind === "SIMPLE" ? "simple" : "detallado"}`} descargado.${refNote}`);
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

  /** Presupuesto formal: pide una empresa como cliente. Si ya hay una elegida sigue directo; si no, abre el alta de la empresa. */
  function startFormal() {
    if (busy) return;
    const invalid = validate(lines);
    if (invalid) { setError(invalid); return; }
    setError(null);
    if (customers.find((c) => c.id === customerId)?.kind === "EMPRESA") { void submit("FORMAL"); return; }
    setFormalCompanyOpen(true);
  }

  submitRef.current = submit;

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const size = entries.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(size - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setQuery("");
      setSearchOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = entries[active];
      if (hit?.kind === "own") addProduct(hit.p);
      else if (hit?.kind === "web") addWeb(hit.w);
      else if (hit?.kind === "nodo") addNodo(hit.r);
      else if (query.trim()) startCreate(query.trim());
    }
  }

  /** Huella de lo que lleva el presupuesto: sirve para avisar si se cambió algo después de generar la imagen. */
  const refSig = lines.map((l) => `${l.name.trim()}×${l.quantity}`).join("|");
  const refItems = () => lines.map((l) => ({ name: l.name, quantity: Number(l.quantity) || 1, imageUrl: l.imageUrl ?? null, productId: l.productId || null }));
  const refStale = (refJob.job.status === "ready" || refJob.job.status === "generating") && refJob.job.sig !== refSig;

  /** Cambia la imagen incluida; la que se reemplaza y nunca se guardó en el presupuesto se borra del almacenamiento. */
  function applyRefImage(next: ReferenceImage | null) {
    if (refImage && refImage.key !== refSavedKey && refImage.key !== next?.key) {
      void api("/quote-reference-image", { method: "DELETE", body: { key: refImage.key } }).catch(() => undefined);
    }
    setRefImage(next);
  }

  function generateRef(style: ReferenceStyle) {
    if (lines.length === 0) return;
    void refJob.start(refItems(), refSig, style);
  }

  function includeRef() {
    const image = refJob.keep();
    if (image) applyRefImage({ url: image.url, key: image.key });
    setRefOpen(false);
    setNotice("Imagen de referencia incluida: va en el presupuesto y en el PDF.");
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
    refJob.discard();
    setRefImage(null);
    setRefSavedKey(null);
    setRefOpen(false);
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
        ivaPct: item.ivaBps != null ? ivaPctFromBps(item.ivaBps) : DEFAULT_IVA_PCT,
        ivaAuto: item.ivaBps == null,
      })));
      const savedTrade = getActiveVersion(quote)?.tradeIns;
      setTradeIns(savedTrade?.items.map((i) => ({ key: crypto.randomUUID(), name: i.name, valueArs: centsToInput(i.valueCents) })) ?? []);
      setTradeShowValues(savedTrade?.showValues ?? true);
      setRefImage(quote.referenceImageUrl && quote.referenceImageKey ? { url: quote.referenceImageUrl, key: quote.referenceImageKey } : null);
      setRefSavedKey(quote.referenceImageKey ?? null);
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
      {formalCompanyOpen ? (
        <LiteNewCustomer
          initialKind="EMPRESA"
          lockKind
          title="Empresa para el presupuesto formal"
          intro="El presupuesto formal va a nombre de una empresa. Cargá sus datos y se genera al instante; si ya la tenés cargada, cerrá esto y elegila en Cliente."
          submitLabel="Crear empresa y generar presupuesto"
          onCancel={() => setFormalCompanyOpen(false)}
          onCreated={(customer) => {
            setCustomers((current) => [...current, customer].sort((x, y) => x.name.localeCompare(y.name)));
            setCustomerId(customer.id);
            setFormalCompanyOpen(false);
            void submit("FORMAL", customer);
          }}
        />
      ) : null}
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
      {refOpen ? (
        <LiteReferenceModal
          job={refJob.job}
          current={refImage}
          stale={refStale}
          itemCount={lines.length}
          suggested={suggestReferenceStyle(refItems())}
          onGenerate={generateRef}
          onCancel={refJob.discard}
          onInclude={includeRef}
          onDiscard={refJob.discard}
          onRemove={() => { applyRefImage(null); setRefOpen(false); }}
          onClose={() => setRefOpen(false)}
        />
      ) : null}
      {!refOpen ? (
        <LiteReferenceBubble
          job={refJob.job}
          stale={refStale}
          onOpen={() => setRefOpen(true)}
          onInclude={includeRef}
          onDiscard={refJob.discard}
          onRetry={() => generateRef(refJob.job.status === "error" ? refJob.job.style : suggestReferenceStyle(refItems()))}
        />
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
              {customers.some((c) => c.kind === "EMPRESA") ? (
                <optgroup label="Empresas">
                  {customers.filter((c) => c.kind === "EMPRESA").map((c) => <option key={c.id} value={c.id}>{c.name}{c.cuit ? ` · ${c.cuit}` : ""}</option>)}
                </optgroup>
              ) : null}
              <optgroup label={customers.some((c) => c.kind === "EMPRESA") ? "Consumidores finales" : "Clientes"}>
                {customers.filter((c) => c.kind !== "EMPRESA").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
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
          <button type="button" className={`lt-pc ref ${refJob.job.status}${refImage ? " on" : ""}`} onClick={() => setRefOpen(true)} aria-haspopup="dialog" title={lines.length === 0 ? "Primero cargá productos: la imagen se arma con ellos" : undefined}>
            <span className="lt-trade-ico" aria-hidden="true">{refJob.job.status === "generating" ? <span className="lt-refx-spin sm"><span className="lt-refx-spin-core" /></span> : refJob.job.status === "ready" ? "✓" : "▣"}</span>
            <span className="lt-pc-copy"><strong>Imagen de referencia</strong><small>{refJob.job.status === "generating" ? "Generando en segundo plano…" : refJob.job.status === "ready" ? "Lista para revisar" : refImage ? "Incluida en el presupuesto y el PDF" : "Opcional · cómo quedaría la PC"}</small></span>
          </button>
          </div>

          {collections.length ? (
            <div className="lt-colls lt-colls-flat" role="group" aria-label="Colecciones">
              <span className="lt-colls-title">Colecciones</span>
              {collections.map((c) => (
                <label key={c.id} className={`lt-coll-opt${collectionIds.includes(c.id) ? " on" : ""}`}>
                  <input type="checkbox" hidden checked={collectionIds.includes(c.id)} onChange={(e) => toggleCollection(c.id, e.target.checked)} />
                  <span className="lt-coll-mark" aria-hidden="true">{collectionIds.includes(c.id) ? "✓" : "+"}</span>
                  {c.icon ? `${c.icon} ` : ""}{c.name}
                </label>
              ))}
            </div>
          ) : null}

          <SourceBar providers={providers} sel={sel} error={providersError} />
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
            {!isBuiltPc && searchOpen && (query.trim() || ownHits.length) ? (
              <ul className="lt-results" role="listbox">
                {entries.map((en, i) => en.kind === "own" ? (
                  <li
                    key={en.p.id}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? "active" : ""}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); addProduct(en.p); }}
                  >
                    <span className="lt-res-name">{en.p.name}</span>
                    <span className="lt-res-price">{formatArs(en.p.salePriceCents)}</span>
                  </li>
                ) : en.kind === "web" ? (
                  <WebRow key={`w${en.w.id}`} r={en.w} active={i === active} onHover={() => setActive(i)} onPick={() => addWeb(en.w)} />
                ) : (
                  <NodoRow key={en.r.offerId} r={en.r} providers={providers} active={i === active} onHover={() => setActive(i)} onPick={() => addNodo(en.r)} />
                ))}
                <NodoNotes loading={nodo.loading || web.loading} error={nodo.error ?? web.error} query={query} hasOther={entries.length > 0} />
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
                <span>Producto</span><span>Cant.</span><span>Costo</span><span>Margen %</span><span>Venta</span><span>IVA</span><span className="r">Total</span><span />
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
                            providers={providers}
                            sel={sel}
                            onPick={(p) => addProduct(p, pc.id)}
                            onPickNodo={(r) => addNodo(r, pc.id)}
                            onPickWeb={(r) => addWeb(r, pc.id)}
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
            <button type="button" className="lt-btn tone-blue" disabled={!ready} onClick={startFormal} title="Presupuesto formal para empresas: a nombre de una empresa, con precio unitario y sin los textos de la tienda">
              {busy === "FORMAL" ? "Generando…" : "Presupuesto Formal"}
            </button>
            <button type="button" className="lt-btn tone-yellow" disabled={!ready} onClick={() => void submit("DETALLADO")}>
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
