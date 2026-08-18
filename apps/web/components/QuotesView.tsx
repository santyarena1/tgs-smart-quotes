"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, downloadAuthenticated } from "../lib/api";
import {
  bpsToPct,
  centsToInput,
  displayArs,
  formatArs,
  formatBps,
  lineTotalCents,
  parseArsToCents,
  pctFromCostAndSale,
  pctToBps,
  roundCentsToPesosStep,
  saleFromCostAndPct,
} from "../lib/money";
import type {
  Collection,
  Combo,
  Customer,
  PcLine,
  Product,
  Quote,
  QuoteFromRequestSeed,
  QuotePdfRow,
  QuoteRequest,
  QuoteState,
  QuoteVersion,
  TimelineEvent,
} from "../lib/types";
import { getActiveVersion, getQuoteItems } from "../lib/types";
import {
  Alert,
  Checkbox,
  Drawer,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Pill,
  SearchInput,
  Stat,
  StatStrip,
  Tone,
  errorMessage,
  useKeyboardNav,
} from "./shared";

type ItemDraft = {
  key: string;
  productId: string;
  name: string;
  lineId: string;
  quantity: string;
  costArs: string;
  markupPct: string;
  saleArs: string;
  observation: string;
  priceMode: "markup" | "sale";
};

type CatalogPickerItem = {
  mpn: string;
  title: string;
  priceCents: string;
  salePriceCents: string | null;
  stockQuantity: number;
  availability: string;
  brand: string | null;
  productType: string | null;
  imageUrl: string | null;
};

type CatalogPickerResponse = {
  items: CatalogPickerItem[];
  total: number;
};

type QuoteLocalDraft = {
  items: ItemDraft[];
  internalName: string;
  customerId: string;
  requestId: string;
  isBuiltPc: boolean;
  observation: string;
};

const quoteDraftKey = (id: string | null) => `tgs-quote-draft-${id ?? "new"}`;

function readQuoteDraft(key: string): QuoteLocalDraft | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as Partial<QuoteLocalDraft>;
    if (
      typeof draft.internalName !== "string" ||
      typeof draft.customerId !== "string" ||
      typeof draft.requestId !== "string" ||
      typeof draft.isBuiltPc !== "boolean" ||
      typeof draft.observation !== "string" ||
      !Array.isArray(draft.items)
    ) return null;
    const validItems = draft.items.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<ItemDraft>;
      return (
        typeof row.key === "string" &&
        typeof row.productId === "string" &&
        typeof row.name === "string" &&
        typeof row.lineId === "string" &&
        typeof row.quantity === "string" &&
        typeof row.costArs === "string" &&
        typeof row.markupPct === "string" &&
        typeof row.saleArs === "string" &&
        typeof row.observation === "string" &&
        (row.priceMode === "markup" || row.priceMode === "sale")
      );
    });
    return validItems ? (draft as QuoteLocalDraft) : null;
  } catch {
    return null;
  }
}

function removeQuoteDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // El guardado remoto no debe fallar si el navegador bloquea localStorage.
  }
}

type QuoteSort = "created-desc" | "created-asc" | "price-asc" | "price-desc";

const blankItem = (): ItemDraft => ({
  key: crypto.randomUUID(),
  productId: "",
  name: "",
  lineId: "",
  quantity: "1",
  costArs: "",
  markupPct: "30",
  saleArs: "",
  observation: "",
  priceMode: "markup",
});

function isSlotEmpty(item: ItemDraft): boolean {
  return !item.productId && !item.name.trim() && !item.costArs.trim();
}

function emptyLineSlot(lineId: string): ItemDraft {
  return { ...blankItem(), lineId };
}

function itemFromProduct(p: Product, quantity = "1", lineId = ""): ItemDraft {
  return {
    key: crypto.randomUUID(),
    productId: p.id,
    name: p.name,
    lineId: lineId || p.defaultLineId || "",
    quantity,
    costArs: centsToInput(p.costCents),
    markupPct: bpsToPct(p.markupBps),
    saleArs: centsToInput(p.salePriceCents),
    observation: "",
    priceMode: "markup",
  };
}

function itemFromCatalog(p: CatalogPickerItem, lineId = ""): ItemDraft {
  const costArs = centsToInput(p.priceCents);
  const markupPct = "30";
  return {
    key: crypto.randomUUID(),
    productId: "",
    name: p.title,
    lineId,
    quantity: "1",
    costArs,
    // El precio de AcuStock es costo distribuidor; aplicamos el margen general del alta manual.
    markupPct,
    saleArs: saleFromCostAndPct(costArs, markupPct),
    observation: "",
    priceMode: "markup",
  };
}

/**
 * Una fila por cada línea PC (vacía o con producto) + extras.
 * Las vacías se ven en el editor; no se envían al guardar/PDF.
 */
function buildPcSlots(
  lines: PcLine[],
  existing: ItemDraft[],
  productById: Map<string, Product>,
): ItemDraft[] {
  if (!lines.length) return existing.filter((i) => !isSlotEmpty(i));

  const used = new Set<string>();
  const result: ItemDraft[] = [];

  for (const line of lines) {
    const tagged = existing.filter(
      (i) => !used.has(i.key) && !isSlotEmpty(i) && i.lineId === line.id,
    );
    if (tagged.length) {
      for (const item of tagged) {
        used.add(item.key);
        result.push({ ...item, lineId: line.id });
      }
      continue;
    }

    const byDefault = existing.filter((i) => {
      if (used.has(i.key) || isSlotEmpty(i) || i.lineId) return false;
      const product = i.productId ? productById.get(i.productId) : undefined;
      return product?.defaultLineId === line.id;
    });
    if (byDefault.length) {
      for (const item of byDefault) {
        used.add(item.key);
        result.push({ ...item, lineId: line.id });
      }
      continue;
    }

    const keepEmpty = existing.find(
      (i) => !used.has(i.key) && isSlotEmpty(i) && i.lineId === line.id,
    );
    if (keepEmpty) {
      used.add(keepEmpty.key);
      result.push({ ...keepEmpty, lineId: line.id });
    } else {
      result.push(emptyLineSlot(line.id));
    }
  }

  for (const item of existing) {
    if (used.has(item.key) || isSlotEmpty(item)) continue;
    result.push(item);
  }

  return result;
}

const QUOTE_STATES: QuoteState[] = [
  "BORRADOR",
  "ENVIADO",
  "ACEPTADO",
  "RECHAZADO",
  "REEMPLAZADO",
  "NO_CONCRETADO",
];

const STATE_TONE: Record<QuoteState, Tone> = {
  BORRADOR: "warn",
  ENVIADO: "info",
  ACEPTADO: "ok",
  RECHAZADO: "bad",
  REEMPLAZADO: "neutral",
  NO_CONCRETADO: "neutral",
};

const STATE_LABEL: Record<QuoteState, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
  REEMPLAZADO: "Reemplazado",
  NO_CONCRETADO: "No concretado",
};

function filledItems(items: ItemDraft[]): ItemDraft[] {
  return items.filter((item) => !isSlotEmpty(item));
}

function itemsToPayload(items: ItemDraft[]) {
  return filledItems(items).map((item, position) => {
    const base = {
      productId: item.productId || null,
      name: item.name.trim(),
      lineId: item.lineId || null,
      quantity: Number(item.quantity),
      costCents: parseArsToCents(item.costArs),
      position,
      observation: item.observation.trim() || null,
    };
    if (item.priceMode === "sale") {
      return { ...base, markupBps: 0, salePriceCents: parseArsToCents(item.saleArs) };
    }
    return { ...base, markupBps: pctToBps(item.markupPct) };
  });
}

function validateItems(items: ItemDraft[]): string | null {
  const rows = filledItems(items);
  if (rows.length === 0) return "Agregá al menos un producto al presupuesto.";
  for (const [index, item] of rows.entries()) {
    if (!item.name.trim()) return `El ítem ${index + 1} necesita un nombre.`;
    if (!item.costArs.trim()) return `El ítem ${index + 1} necesita un costo.`;
    if (!Number(item.quantity) || Number(item.quantity) < 1) {
      return `El ítem ${index + 1} necesita una cantidad válida.`;
    }
    try {
      parseArsToCents(item.costArs);
      if (item.priceMode === "sale") parseArsToCents(item.saleArs);
      else pctToBps(item.markupPct);
    } catch {
      return `Revisá los importes del ítem ${index + 1}.`;
    }
  }
  return null;
}

export function QuotesView({
  seedFromRequest = null,
  onSeedConsumed,
  initialSelectedId = null,
  onInitialSelectedConsumed,
}: {
  seedFromRequest?: QuoteFromRequestSeed | null;
  onSeedConsumed?: () => void;
  initialSelectedId?: string | null;
  onInitialSelectedConsumed?: () => void;
} = {}) {
  const [list, setList] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [pcLines, setPcLines] = useState<PcLine[]>([]);
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Quote | null>(null);

  const [internalName, setInternalName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [isBuiltPc, setIsBuiltPc] = useState(false);
  const [observation, setObservation] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [editorDraftKey, setEditorDraftKey] = useState<string | null>(null);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const draftFallbackRef = useRef<QuoteLocalDraft | null>(null);
  const draftBaselineRef = useRef("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [retargetArs, setRetargetArs] = useState("");
  const [roundStepPesos, setRoundStepPesos] = useState<"" | "100" | "500" | "1000" | "5000">("");
  const [filter, setFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<QuoteState | "">("");
  const [branchFilter, setBranchFilter] = useState("");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [sort, setSort] = useState<QuoteSort>("created-desc");
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [, setPdfs] = useState<QuotePdfRow[]>([]);
  const [pdfBusy, setPdfBusy] = useState<"SIMPLE" | "DETALLADO" | null>(null);
  const [similar, setSimilar] = useState<
    { familyId: string; visibleNumber: string; internalName: string; score: number }[]
  >([]);
  const [habitual, setHabitual] = useState<
    {
      productId: string | null;
      name: string;
      lineId?: string | null;
      support: number;
      sampleSize: number;
    }[]
  >([]);
  const [openedAsNewVersion, setOpenedAsNewVersion] = useState(false);
  const [versionEditQuote, setVersionEditQuote] = useState<Quote | null>(null);
  const [versionReason, setVersionReason] = useState("");
  const [saveReason, setSaveReason] = useState("");
  const [historyQuote, setHistoryQuote] = useState<Quote | null>(null);
  const [previewVersion, setPreviewVersion] = useState<QuoteVersion | null>(null);
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);

  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogPickerMatches, setCatalogPickerMatches] = useState<CatalogPickerItem[]>([]);
  const [catalogPickerLoading, setCatalogPickerLoading] = useState(false);
  /** Línea PC a la que se está agregando/cambiando producto (opcional). */
  const [pickingLineId, setPickingLineId] = useState<string | null>(null);
  /** Si hay key, se reemplaza ese ítem; si no, se agrega uno nuevo en la línea. */
  const [replaceItemKey, setReplaceItemKey] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);
  const initialOpenRef = useRef<string | null>(null);

  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState({ name: "", costArs: "", markupPct: "30" });
  const [creatingProd, setCreatingProd] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [quotesPayload, custs, prods, reqs, cols, comboRows, lines, branchRows] = await Promise.all([
        api<{ items: Quote[] } | Quote[]>("/quotes/search", {
          query: {
            q: filter.trim() || undefined,
            state: stateFilter || undefined,
            branchId: branchFilter || undefined,
            page: 1,
            pageSize: 100,
            sort: "lastActivityAt",
            order: "desc",
          },
        }),
        api<Customer[]>("/customers").catch(() => [] as Customer[]),
        api<Product[]>("/products").catch(() => [] as Product[]),
        api<QuoteRequest[]>("/requests").catch(() => [] as QuoteRequest[]),
        api<Collection[]>("/collections").catch(() => [] as Collection[]),
        api<Combo[]>("/combos").catch(() => [] as Combo[]),
        api<PcLine[]>("/pc-lines").catch(() => [] as PcLine[]),
        api<{ items: { id: string; name: string }[] }>("/branches").catch(() => ({ items: [] })),
      ]);
      const quotes = Array.isArray(quotesPayload)
        ? quotesPayload
        : (quotesPayload.items ?? []);
      setList(quotes);
      setCustomers(custs);
      setProducts(prods.filter((p) => p.active));
      setCombos(comboRows.filter((c) => c.active && c.items.length > 0));
      setPcLines([...lines].filter((l) => l.active).sort((a, b) => a.sortOrder - b.sortOrder));
      setRequests(reqs);
      setCollections(cols.filter((c) => !c.archived));
      setBranches(branchRows.items ?? []);
    } catch (err) {
      setError(errorMessage(err));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filter, stateFilter, branchFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadList();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [loadList]);

  useEffect(() => {
    if (!initialSelectedId || initialOpenRef.current === initialSelectedId) return;
    initialOpenRef.current = initialSelectedId;
    void openQuote(initialSelectedId).finally(() => onInitialSelectedConsumed?.());
  }, [initialSelectedId]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setPickingLineId(null);
        setReplaceItemKey(null);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const lineById = useMemo(
    () => new Map(pcLines.map((l) => [l.id, l])),
    [pcLines],
  );

  const applyDetail = useCallback(
    (quote: Quote, restoreLocalDraft = true) => {
      setDetail(quote);
      setSelectedId(quote.id);
      setCollectionIds(
        (quote.collections ?? [])
          .map((row) => row.collectionId ?? row.collection?.id ?? "")
          .filter(Boolean),
      );
      const version = getActiveVersion(quote);
      const mapped = getQuoteItems(quote).map((item) => ({
        key: crypto.randomUUID(),
        productId: item.productId ?? "",
        name: item.name,
        lineId: item.lineId ?? "",
        quantity: String(item.quantity),
        costArs: centsToInput(item.costCents),
        markupPct: bpsToPct(item.markupBps),
        saleArs: centsToInput(item.salePriceCents ?? "0"),
        observation: item.observation ?? "",
        priceMode: "markup" as const,
      }));
      const fallback: QuoteLocalDraft = {
        internalName: quote.internalName,
        customerId: quote.customerId ?? "",
        requestId: quote.requestId ?? "",
        isBuiltPc: quote.isBuiltPc,
        observation: version?.publicObservation ?? "",
        items: quote.isBuiltPc && pcLines.length
          ? buildPcSlots(pcLines, mapped, productById)
          : mapped.filter((i) => !isSlotEmpty(i)),
      };
      const key = quoteDraftKey(quote.id);
      const baseline = JSON.stringify(fallback);
      const stored = restoreLocalDraft ? readQuoteDraft(key) : null;
      const recovered = stored && JSON.stringify(stored) !== baseline ? stored : null;
      if (stored && !recovered) removeQuoteDraft(key);
      const form = recovered ?? fallback;
      draftFallbackRef.current = fallback;
      draftBaselineRef.current = baseline;
      setEditorDraftKey(key);
      setDraftRecovered(Boolean(recovered));
      setInternalName(form.internalName);
      setCustomerId(form.customerId);
      setRequestId(form.requestId);
      setIsBuiltPc(form.isBuiltPc);
      setObservation(form.observation);
      setItems(form.items);
      setEditingKey(null);
      setPickingLineId(null);
      setReplaceItemKey(null);
      setSaveReason("");
    },
    [pcLines, productById],
  );

  useEffect(() => {
    if (!drawerOpen || !editorDraftKey) return;
    const draft: QuoteLocalDraft = {
      items,
      internalName,
      customerId,
      requestId,
      isBuiltPc,
      observation,
    };
    try {
      const serialized = JSON.stringify(draft);
      if (serialized === draftBaselineRef.current) removeQuoteDraft(editorDraftKey);
      else window.localStorage.setItem(editorDraftKey, serialized);
    } catch {
      // El presupuesto sigue siendo editable aunque el navegador bloquee localStorage.
    }
  }, [drawerOpen, editorDraftKey, items, internalName, customerId, requestId, isBuiltPc, observation]);

  async function loadSideData(id: string) {
    const [timelinePayload, pdfPayload, similarPayload, habitualPayload] = await Promise.all([
      api<{ events?: TimelineEvent[]; pdfs?: QuotePdfRow[] }>(`/quotes/${id}/timeline`).catch(
        () => ({ events: [] as TimelineEvent[], pdfs: [] as QuotePdfRow[] }),
      ),
      api<{ items?: QuotePdfRow[] }>(`/quotes/${id}/pdfs`).catch(() => ({ items: [] as QuotePdfRow[] })),
      api<{ items?: { familyId: string; visibleNumber: string; internalName: string; score: number }[] }>(
        `/quotes/${id}/similar`,
        { query: { limit: 5 } },
      ).catch(() => ({ items: [] })),
      api<{ items?: { productId: string | null; name: string; lineId?: string | null; support: number; sampleSize: number }[] }>(
        `/quotes/${id}/habitual-components`,
        { query: { limit: 8 } },
      ).catch(() => ({ items: [] })),
    ]);
    setTimeline(timelinePayload.events ?? []);
    const fromList = pdfPayload.items ?? [];
    const fromTimeline = timelinePayload.pdfs ?? [];
    setPdfs(fromList.length ? fromList : fromTimeline);
    setSimilar(similarPayload.items ?? []);
    setHabitual(habitualPayload.items ?? []);
  }

  async function openQuote(id: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    setOpenedAsNewVersion(false);
    try {
      const quote = await api<Quote>(`/quotes/${id}`);
      applyDetail(quote);
      await loadSideData(id);
      setDrawerOpen(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function editQuote(quote: Quote) {
    await openQuote(quote.id);
  }

  async function confirmVersionEdit() {
    if (!versionEditQuote) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/quotes/${versionEditQuote.id}/version`, {
        method: "POST",
        body: { reason: versionReason.trim() || null },
      });
      const id = versionEditQuote.id;
      setVersionEditQuote(null);
      setOpenedAsNewVersion(true);
      await openQuote(id);
      setOpenedAsNewVersion(true);
      setNotice("Nueva versión en borrador creada. La versión anterior permanece intacta.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function printQuote(quote: Quote) {
    const tab = window.open("about:blank", "_blank");
    try {
      await api(`/quotes/${quote.id}/pdf`, { method: "POST", body: { kind: "SIMPLE" } });
      if (tab) tab.location.href = `/api/quotes/${quote.id}/pdf/SIMPLE`;
      else window.open(`/api/quotes/${quote.id}/pdf/SIMPLE`, "_blank", "noopener");
    } catch (err) {
      tab?.close();
      setError(errorMessage(err));
    }
  }

  async function deleteQuote(quote: Quote) {
    if (!window.confirm(`¿Eliminar ${quote.visibleNumber} y todas sus versiones?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/quotes/${quote.id}`, { method: "DELETE" });
      setNotice(`${quote.visibleNumber} eliminado.`);
      await loadList();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function showHistory(quote: Quote) {
    setError(null);
    try {
      setHistoryQuote(await api<Quote>(`/quotes/${quote.id}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function restoreVersion(familyId: string, version: QuoteVersion) {
    if (!window.confirm(`¿Restaurar la versión ${version.version}? Pasará a ser la versión activa (no se crea ninguna versión nueva).`)) return;
    setBusy(true);
    setError(null);
    try {
      const restored = await api<Quote>(`/quotes/${familyId}/version/${version.version}/restore`, {
        method: "POST",
      });
      setPreviewVersion(null);
      setPreviewFamilyId(null);
      if (historyQuote?.id === familyId) setHistoryQuote(null);
      if (selectedId === familyId) {
        applyDetail(restored);
        await loadSideData(familyId);
        setDrawerOpen(true);
      }
      await loadList();
      setNotice(`Versión ${version.version} restaurada como activa.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteVersion(familyId: string, version: QuoteVersion) {
    if (!window.confirm(`¿Eliminar la versión ${version.version}? No se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/quotes/${familyId}/version/${version.version}`, { method: "DELETE" });
      const refreshed = await api<Quote>(`/quotes/${familyId}`);
      if (historyQuote?.id === familyId) setHistoryQuote(refreshed);
      if (selectedId === familyId) applyDetail(refreshed, false);
      if (previewVersion?.version === version.version) {
        setPreviewVersion(null);
        setPreviewFamilyId(null);
      }
      setNotice(`Versión ${version.version} eliminada.`);
      await loadList();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reloadDetail(id: string, restoreLocalDraft = true) {
    applyDetail(await api<Quote>(`/quotes/${id}`), restoreLocalDraft);
    await loadSideData(id);
  }

  async function generatePdf(kind: "SIMPLE" | "DETALLADO") {
    if (!selectedId || !detail) return;
    setPdfBusy(kind);
    setError(null);
    try {
      // Guardar borrador antes de generar solo si hay ediciones sin guardar (comparado contra
      // el snapshot cargado del servidor, `draftBaselineRef`): así imprimir nunca crea una
      // versión nueva por sí solo, únicamente cuando efectivamente había algo distinto a guardar.
      const draftNow = !detail || getActiveVersion(detail)?.state === "BORRADOR";
      const currentSnapshot = JSON.stringify({
        items, internalName, customerId, requestId, isBuiltPc, observation,
      });
      const hasUnsavedChanges = currentSnapshot !== draftBaselineRef.current;
      if (draftNow && hasUnsavedChanges && items.length) {
        await api(`/quotes/${selectedId}`, {
          method: "PUT",
          body: {
            internalName: internalName.trim(),
            customerId: customerId || null,
            requestId: requestId || null,
            isBuiltPc,
            publicObservation: observation.trim() || null,
            items: itemsToPayload(items),
          },
        });
      }
      await api(`/quotes/${selectedId}/pdf`, { method: "POST", body: { kind, force: true } });
      const version = getActiveVersion(detail)?.version ?? detail.activeVersion;
      await downloadAuthenticated(
        `/quotes/${selectedId}/pdf/${kind}`,
        `${detail.visibleNumber}-V${version}-${kind}.pdf`,
      );
      setNotice(`PDF ${kind === "SIMPLE" ? "simple" : "detallado"} listo.`);
      await reloadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadVersionPdf(version: QuoteVersion, kind: "SIMPLE" | "DETALLADO" = "SIMPLE") {
    if (!selectedId || !detail) return;
    setPdfBusy(kind);
    setError(null);
    try {
      await api(`/quotes/${selectedId}/versions/${version.version}/pdf`, { method: "POST", body: { kind } });
      await downloadAuthenticated(
        `/quotes/${selectedId}/versions/${version.version}/pdf/${kind}`,
        `${detail.visibleNumber}-V${version.version}-${kind}.pdf`,
      );
      setNotice(`PDF ${kind === "SIMPLE" ? "simple" : "detallado"} de la versión ${version.version} listo.`);
      await reloadDetail(selectedId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPdfBusy(null);
    }
  }

  async function toggleBuiltPc(next: boolean) {
    if (next && !pcLines.length) {
      setError("Configurá al menos una línea en Catálogo → Líneas PC antes de armar una PC.");
      return;
    }

    setIsBuiltPc(next);
    setPickingLineId(null);
    setReplaceItemKey(null);
    setPickerOpen(false);
    setPickerQuery("");

    if (next) {
      setItems((prev) => buildPcSlots(pcLines, prev, productById));
    } else {
      setItems((prev) => prev.filter((item) => !isSlotEmpty(item)));
    }

    const draftNow = !detail || getActiveVersion(detail)?.state === "BORRADOR";
    if (!selectedId || !draftNow) {
      setNotice(
        next
          ? "PC armada: las líneas aparecen en el presupuesto. Si quedan vacías, no salen en el PDF."
          : "PC armada desactivada.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/quotes/${selectedId}`, {
        method: "PUT",
        body: { isBuiltPc: next },
      });
      setDetail((prev) => (prev ? { ...prev, isBuiltPc: next } : prev));
      setNotice(
        next
          ? "PC armada activada. Completá las líneas; las vacías no se incluyen en el PDF."
          : "PC armada desactivada.",
      );
      await loadList();
    } catch (err) {
      setIsBuiltPc(!next);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncPrices() {
    if (!selectedId) return;
    if (!window.confirm("¿Actualizar precios del borrador desde el catálogo?")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/quotes/${selectedId}/prices`, {
        method: "POST",
        body: { mode: "all", updateMaster: false },
      });
      setNotice("Precios sincronizados desde el catálogo.");
      await reloadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openNew() {
    const key = quoteDraftKey(null);
    const fallback: QuoteLocalDraft = {
      internalName: "",
      customerId: "",
      requestId: "",
      isBuiltPc: false,
      observation: "",
      items: [],
    };
    const baseline = JSON.stringify(fallback);
    const stored = readQuoteDraft(key);
    const recovered = stored && JSON.stringify(stored) !== baseline ? stored : null;
    if (stored && !recovered) removeQuoteDraft(key);
    const form = recovered ?? fallback;
    draftFallbackRef.current = fallback;
    draftBaselineRef.current = baseline;
    setEditorDraftKey(key);
    setDraftRecovered(Boolean(recovered));
    setSelectedId(null);
    setDetail(null);
    setInternalName(form.internalName);
    setCustomerId(form.customerId);
    setRequestId(form.requestId);
    setIsBuiltPc(form.isBuiltPc);
    setCollectionIds([]);
    setObservation(form.observation);
    setItems(form.items);
    setEditingKey(null);
    setPickingLineId(null);
    setReplaceItemKey(null);
    setRetargetArs("");
    setPickerQuery("");
    setError(null);
    setNotice(null);
    setOpenedAsNewVersion(false);
    setTimeline([]);
    setPdfs([]);
    setDrawerOpen(true);
  }

  function openNewFromRequest(seed: QuoteFromRequestSeed) {
    const key = quoteDraftKey(null);
    const fallback: QuoteLocalDraft = {
      internalName: seed.internalName,
      customerId: seed.customerId ?? "",
      requestId: seed.requestId,
      isBuiltPc: false,
      observation: "",
      items: [],
    };
    const baseline = JSON.stringify(fallback);
    const stored = readQuoteDraft(key);
    const recovered = stored && JSON.stringify(stored) !== baseline ? stored : null;
    if (stored && !recovered) removeQuoteDraft(key);
    const form = recovered ?? fallback;
    draftFallbackRef.current = fallback;
    draftBaselineRef.current = baseline;
    setEditorDraftKey(key);
    setDraftRecovered(Boolean(recovered));
    setSelectedId(null);
    setDetail(null);
    setInternalName(form.internalName);
    setCustomerId(form.customerId);
    setRequestId(form.requestId);
    setIsBuiltPc(form.isBuiltPc);
    setCollectionIds([]);
    setObservation(form.observation);
    setItems(form.items);
    setEditingKey(null);
    setPickingLineId(null);
    setReplaceItemKey(null);
    setRetargetArs("");
    setPickerQuery("");
    setError(null);
    setOpenedAsNewVersion(false);
    setTimeline([]);
    setPdfs([]);
    setNotice(
      "Solicitud asociada (cliente de WhatsApp vinculado). Al guardar el presupuesto pasará a Lista.",
    );
    setDrawerOpen(true);
  }

  useEffect(() => {
    if (!seedFromRequest) return;
    openNewFromRequest(seedFromRequest);
    onSeedConsumed?.();
  }, [seedFromRequest, onSeedConsumed]);

  function discardRecoveredDraft() {
    if (!editorDraftKey) return;
    removeQuoteDraft(editorDraftKey);
    setDraftRecovered(false);
    const fallback = draftFallbackRef.current;
    if (!fallback) return;
    setInternalName(fallback.internalName);
    setCustomerId(fallback.customerId);
    setRequestId(fallback.requestId);
    setIsBuiltPc(fallback.isBuiltPc);
    setObservation(fallback.observation);
    setItems(fallback.items);
    setEditingKey(null);
    setPickingLineId(null);
    setReplaceItemKey(null);
  }

  /* ————— items ————— */

  async function rememberProductLine(product: Product, lineId: string) {
    if (!lineId || product.defaultLineId === lineId) return;
    try {
      const updated = await api<Product>(`/products/${product.id}`, {
        method: "PUT",
        body: {
          name: product.name,
          costCents: product.costCents,
          markupBps: product.markupBps,
          usesGeneralMarkup: product.usesGeneralMarkup,
          defaultLineId: lineId,
          active: product.active,
          reason: "Asignación de línea PC desde presupuesto",
        },
      });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? { ...p, defaultLineId: updated.defaultLineId ?? lineId }
            : p,
        ),
      );
    } catch {
      // No bloqueamos el armado si falla el recuerdo de línea.
    }
  }

  function assignProductToLine(product: Product, lineId: string, replaceKey: string | null = null) {
    setItems((prev) => {
      const drafted = itemFromProduct(product, "1", lineId);
      let next: ItemDraft[];
      if (replaceKey) {
        next = prev.map((item) =>
          item.key === replaceKey
            ? { ...drafted, quantity: item.quantity || "1", key: item.key }
            : item,
        );
      } else {
        const emptyIdx = prev.findIndex((i) => i.lineId === lineId && isSlotEmpty(i));
        if (emptyIdx >= 0) {
          next = prev.map((item, i) =>
            i === emptyIdx ? { ...drafted, key: item.key } : item,
          );
        } else {
          next = [...prev, drafted];
        }
      }
      return buildPcSlots(pcLines, next, productById);
    });
    setPickingLineId(null);
    setReplaceItemKey(null);
    setPickerQuery("");
    setPickerOpen(false);
    setEditingKey(null);
    void rememberProductLine(product, lineId);
    setNotice(
      `“${product.name}” en ${lineById.get(lineId)?.name ?? "línea"}. Quedó recordado para próximos armados.`,
    );
  }

  function addCatalogItem(product: CatalogPickerItem) {
    const lineId = pickingLineId ?? "";
    const drafted = itemFromCatalog(product, lineId);
    setItems((prev) => {
      if (replaceItemKey) {
        const next = prev.map((item) =>
          item.key === replaceItemKey
            ? { ...drafted, quantity: item.quantity || "1", key: item.key }
            : item,
        );
        return isBuiltPc ? buildPcSlots(pcLines, next, productById) : next;
      }
      if (isBuiltPc && lineId) {
        const emptyIdx = prev.findIndex((item) => item.lineId === lineId && isSlotEmpty(item));
        const next =
          emptyIdx >= 0
            ? prev.map((item, index) =>
                index === emptyIdx ? { ...drafted, key: item.key } : item,
              )
            : [...prev, drafted];
        return buildPcSlots(pcLines, next, productById);
      }
      return [...prev, drafted];
    });
    setPickerQuery("");
    setPickerOpen(false);
    setPickingLineId(null);
    setReplaceItemKey(null);
    setEditingKey(null);
  }

  function focusPickerInput() {
    window.requestAnimationFrame(() => pickerInputRef.current?.focus());
  }

  function openAddToLine(lineId: string) {
    const empty = items.find((i) => i.lineId === lineId && isSlotEmpty(i));
    setPickingLineId(lineId);
    setReplaceItemKey(empty?.key ?? null);
    setPickerQuery("");
    setPickerOpen(true);
    setEditingKey(null);
    focusPickerInput();
  }

  function openReplaceOnLine(itemKey: string, lineId: string) {
    setPickingLineId(lineId);
    setReplaceItemKey(itemKey);
    setPickerQuery("");
    setPickerOpen(true);
    setEditingKey(null);
    focusPickerInput();
  }

  function addItem(item: ItemDraft, startEditing = false) {
    const lineId =
      item.lineId ||
      (item.productId ? productById.get(item.productId)?.defaultLineId ?? "" : "");
    const draft = lineId ? { ...item, lineId } : item;
    setItems((prev) => {
      if (isBuiltPc && pcLines.length) {
        if (draft.lineId) {
          const emptyIdx = prev.findIndex((i) => i.lineId === draft.lineId && isSlotEmpty(i));
          if (emptyIdx >= 0) {
            const next = prev.map((row, i) =>
              i === emptyIdx ? { ...draft, key: row.key, lineId: draft.lineId } : row,
            );
            return buildPcSlots(pcLines, next, productById);
          }
        }
        return buildPcSlots(pcLines, [...prev, draft], productById);
      }
      return [...prev, draft];
    });
    if (draft.productId && draft.lineId) {
      const product = productById.get(draft.productId);
      if (product) void rememberProductLine(product, draft.lineId);
    }
    if (startEditing) setEditingKey(draft.key);
    setPickerQuery("");
    setPickerOpen(false);
    setPickingLineId(null);
    setReplaceItemKey(null);
  }

  function addCombo(combo: Combo) {
    const byId = new Map(products.map((p) => [p.id, p]));
    const expanded: ItemDraft[] = [];
    const missing: string[] = [];
    for (const row of [...combo.items].sort((a, b) => a.position - b.position)) {
      const product =
        byId.get(row.productId) ??
        (row.product?.active
          ? ({
              id: row.product.id,
              name: row.product.name,
              costCents: row.product.costCents,
              salePriceCents: row.product.salePriceCents,
              markupBps: row.product.markupBps,
              usesGeneralMarkup: true,
              defaultLineId: row.product.defaultLineId ?? null,
              active: true,
            } satisfies Product)
          : null);
      if (!product) {
        missing.push(row.product?.name ?? row.productId);
        continue;
      }
      expanded.push(
        itemFromProduct(product, String(row.quantity || 1), product.defaultLineId ?? ""),
      );
    }
    if (!expanded.length) {
      setError(
        missing.length
          ? `El combo “${combo.name}” no tiene productos activos disponibles`
          : `El combo “${combo.name}” no tiene productos`,
      );
      return;
    }
    setItems((prev) => {
      const next = [...prev.filter((i) => !isSlotEmpty(i)), ...expanded];
      return isBuiltPc && pcLines.length ? buildPcSlots(pcLines, next, productById) : next;
    });
    for (const draft of expanded) {
      if (draft.productId && draft.lineId) {
        const product = byId.get(draft.productId);
        if (product) void rememberProductLine(product, draft.lineId);
      }
    }
    setPickerQuery("");
    setPickerOpen(false);
    setPickingLineId(null);
    setReplaceItemKey(null);
    if (missing.length) {
      setNotice(
        `Se agregaron ${expanded.length} ítems de “${combo.name}”. Omitidos (inactivos): ${missing.join(", ")}`,
      );
    } else {
      setNotice(`Se agregaron ${expanded.length} ítems del combo “${combo.name}”`);
    }
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const target = prev.find((x) => x.key === key);
      if (isBuiltPc && target?.lineId && pcLines.some((l) => l.id === target.lineId)) {
        return prev.map((x) =>
          x.key === key ? { ...emptyLineSlot(target.lineId), key: x.key } : x,
        );
      }
      return prev.filter((x) => x.key !== key);
    });
    if (editingKey === key) setEditingKey(null);
    if (replaceItemKey === key) {
      setReplaceItemKey(null);
      setPickingLineId(null);
      setPickerOpen(false);
    }
  }

  function move(key: string, dir: -1 | 1) {
    setItems((prev) => {
      const index = prev.findIndex((x) => x.key === key);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const current = prev[index];
      const swap = prev[target];
      if (!current || !swap) return prev;
      const next = [...prev];
      next[index] = swap;
      next[target] = current;
      return next;
    });
  }

  function setName(key: string, value: string) {
    setItems((prev) => prev.map((x) => (x.key === key ? { ...x, name: value } : x)));
  }

  function setQuantity(key: string, value: string) {
    setItems((prev) => prev.map((x) => (x.key === key ? { ...x, quantity: value } : x)));
  }

  function setCost(key: string, value: string) {
    setItems((prev) =>
      prev.map((x) => {
        if (x.key !== key) return x;
        const next = { ...x, costArs: value };
        if (next.priceMode === "sale") next.markupPct = pctFromCostAndSale(value, next.saleArs);
        else next.saleArs = saleFromCostAndPct(value, next.markupPct);
        return next;
      }),
    );
  }

  function setMarkupPct(key: string, value: string) {
    setItems((prev) =>
      prev.map((x) =>
        x.key === key
          ? {
              ...x,
              markupPct: value,
              priceMode: "markup",
              saleArs: saleFromCostAndPct(x.costArs, value),
            }
          : x,
      ),
    );
  }

  function setSale(key: string, value: string) {
    setItems((prev) =>
      prev.map((x) =>
        x.key === key
          ? {
              ...x,
              saleArs: value,
              priceMode: "sale",
              markupPct: pctFromCostAndSale(x.costArs, value),
            }
          : x,
      ),
    );
  }

  /* ————— product picker ————— */

  const activeLineId = pickingLineId ?? "";

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (pickingLineId) {
      const preferred = products.filter((p) => p.defaultLineId === pickingLineId);
      const others = products.filter((p) => p.defaultLineId !== pickingLineId);
      const rank = (list: Product[]) =>
        [...list].sort((a, b) => {
          const ta = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
          const tb = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
          return tb - ta || a.name.localeCompare(b.name);
        });
      const filterQ = (list: Product[]) =>
        q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
      if (!q) return rank(preferred).slice(0, 10);
      return [...rank(filterQ(preferred)), ...rank(filterQ(others))].slice(0, 12);
    }
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [pickerQuery, products, pickingLineId]);

  const pickerComboMatches = useMemo(() => {
    if (pickingLineId) return [];
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return [];
    return combos.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [pickerQuery, combos, pickingLineId]);

  useEffect(() => {
    const query = pickerQuery.trim();
    setCatalogPickerMatches([]);
    if (!query) {
      setCatalogPickerLoading(false);
      return;
    }

    const controller = new AbortController();
    setCatalogPickerLoading(true);
    const timer = window.setTimeout(() => {
      void api<CatalogPickerResponse>("/catalog", {
        query: { q: query, pageSize: 40, sort: "price_asc" },
        signal: controller.signal,
      })
        .then((payload) => setCatalogPickerMatches(payload.items))
        .catch(() => {
          if (!controller.signal.aborted) setCatalogPickerMatches([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setCatalogPickerLoading(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pickerQuery]);

  const lineSuggestions = useMemo(() => {
    if (!pickingLineId) return [] as Product[];
    const present = new Set(filledItems(items).map((i) => i.productId).filter(Boolean));
    const fromHabitual = habitual
      .filter((h) => h.lineId === pickingLineId && h.productId && !present.has(h.productId))
      .map((h) => productById.get(h.productId!))
      .filter((p): p is Product => Boolean(p));
    const fromMemory = products.filter(
      (p) => p.defaultLineId === pickingLineId && !present.has(p.id),
    );
    const seen = new Set<string>();
    const out: Product[] = [];
    for (const p of [...fromHabitual, ...fromMemory]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      if (out.length >= 6) break;
    }
    return out;
  }, [pickingLineId, habitual, items, productById, products]);

  type PickerOption =
    | { kind: "combo"; combo: Combo }
    | { kind: "product"; product: Product }
    | { kind: "catalog"; product: CatalogPickerItem }
    | { kind: "create" }
    | { kind: "free" };

  const pickerOptions = useMemo((): PickerOption[] => {
    const opts: PickerOption[] = [];
    const hasQuery = Boolean(pickerQuery.trim());
    const priceOf = (cents: string | null | undefined) => {
      try {
        return cents ? BigInt(cents) : 0n;
      } catch {
        return 0n;
      }
    };
    // Mientras no se escribió nada, se muestran sugerencias por uso/recencia (no hay orden por
    // precio que aplicar). En cuanto hay texto, es una búsqueda real: se ordena por precio asc.
    type Merged =
      | { kind: "product"; product: Product; price: bigint }
      | { kind: "catalog"; product: CatalogPickerItem; price: bigint };
    if (pickingLineId) {
      if (!hasQuery) {
        const seen = new Set<string>();
        for (const product of [...lineSuggestions, ...pickerMatches]) {
          if (seen.has(product.id)) continue;
          seen.add(product.id);
          opts.push({ kind: "product", product });
        }
        for (const product of catalogPickerMatches) opts.push({ kind: "catalog", product });
        return opts;
      }
      const seen = new Set<string>();
      const merged: Merged[] = [];
      for (const product of pickerMatches) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        merged.push({ kind: "product", product, price: priceOf(product.salePriceCents) });
      }
      for (const product of catalogPickerMatches) {
        merged.push({ kind: "catalog", product, price: priceOf(product.salePriceCents ?? product.priceCents) });
      }
      merged.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
      for (const m of merged) opts.push(m.kind === "product" ? { kind: "product", product: m.product } : { kind: "catalog", product: m.product });
      opts.push({ kind: "create" });
      return opts;
    }
    if (!hasQuery) return [];
    for (const combo of pickerComboMatches) opts.push({ kind: "combo", combo });
    const seen = new Set<string>();
    const merged: Merged[] = [];
    for (const product of pickerMatches) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      merged.push({ kind: "product", product, price: priceOf(product.salePriceCents) });
    }
    for (const product of catalogPickerMatches) {
      merged.push({ kind: "catalog", product, price: priceOf(product.salePriceCents ?? product.priceCents) });
    }
    merged.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
    for (const m of merged) opts.push(m.kind === "product" ? { kind: "product", product: m.product } : { kind: "catalog", product: m.product });
    opts.push({ kind: "create" }, { kind: "free" });
    return opts;
  }, [
    pickingLineId,
    pickerQuery,
    pickerComboMatches,
    pickerMatches,
    catalogPickerMatches,
    lineSuggestions,
  ]);

  const selectPickerOption = useCallback(
    (index: number) => {
      const opt = pickerOptions[index];
      if (!opt) return;
      if (opt.kind === "combo") addCombo(opt.combo);
      else if (opt.kind === "product") {
        if (pickingLineId) {
          assignProductToLine(opt.product, pickingLineId, replaceItemKey);
        } else {
          addItem(itemFromProduct(opt.product));
        }
      } else if (opt.kind === "catalog") {
        addCatalogItem(opt.product);
      } else if (opt.kind === "create") openCreateProduct();
      else addItem({ ...blankItem(), name: pickerQuery.trim() }, true);
    },
    [pickerOptions, pickerQuery, pickingLineId, replaceItemKey],
  );

  const {
    activeIndex: pickerActive,
    setActiveIndex: setPickerActive,
    onKeyDown: onPickerKeyDown,
  } = useKeyboardNav({
    itemCount: pickerOptions.length,
    enabled: pickerOpen && pickerOptions.length > 0,
    resetKey: `${pickerQuery}|${pickingLineId ?? ""}|${replaceItemKey ?? ""}`,
    onSelect: selectPickerOption,
    onEscape: () => {
      setPickerOpen(false);
      setPickerQuery("");
      setPickingLineId(null);
      setReplaceItemKey(null);
    },
  });

  useEffect(() => {
    if (pickerActive < 0) return;
    const el = document.getElementById(`picker-opt-${pickerActive}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [pickerActive]);

  function openCreateProduct() {
    setNewProd({ name: pickerQuery.trim(), costArs: "", markupPct: "30" });
    setPickerOpen(false);
    setNewProdOpen(true);
  }

  async function createProductAndAdd(e: FormEvent) {
    e.preventDefault();
    setCreatingProd(true);
    setError(null);
    const lineIdForCreate = pickingLineId;
    const replaceKey = replaceItemKey;
    try {
      const created = await api<Product>("/products", {
        method: "POST",
        body: {
          name: newProd.name.trim(),
          costCents: parseArsToCents(newProd.costArs),
          markupBps: pctToBps(newProd.markupPct),
          usesGeneralMarkup: false,
          defaultLineId: lineIdForCreate,
          active: true,
        },
      });
      setProducts((prev) => [...prev, created]);
      if (lineIdForCreate) {
        assignProductToLine(created, lineIdForCreate, replaceKey);
      } else {
        addItem(itemFromProduct(created));
      }
      setNewProdOpen(false);
      setNotice(`Producto "${created.name}" creado y agregado al presupuesto.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatingProd(false);
    }
  }

  function applyHabitualSuggestion(row: {
    productId: string | null;
    name: string;
    lineId?: string | null;
  }) {
    if (!row.productId) return;
    const product = productById.get(row.productId);
    if (!product) {
      setError(`No encontré “${row.name}” activo en el catálogo.`);
      return;
    }
    const lineId =
      row.lineId && pcLines.some((l) => l.id === row.lineId)
        ? row.lineId
        : product.defaultLineId && pcLines.some((l) => l.id === product.defaultLineId)
          ? product.defaultLineId
          : "";
    if (isBuiltPc && lineId) {
      assignProductToLine(product, lineId, null);
      return;
    }
    addItem(itemFromProduct(product, "1", lineId));
  }

  /* ————— quote actions ————— */

  async function createQuote(e: FormEvent) {
    e.preventDefault();
    const invalid = validateItems(items);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const pdfTab = window.open("about:blank", "_blank");
    setError(null);
    setNotice(null);
    try {
      const created = await api<Quote>("/quotes", {
        method: "POST",
        body: {
          internalName: internalName.trim(),
          customerId: customerId || null,
          requestId: requestId || null,
          isBuiltPc,
          publicObservation: observation.trim() || null,
          collectionIds,
          items: itemsToPayload(items),
        },
      });
      if (editorDraftKey) removeQuoteDraft(editorDraftKey);
      setDraftRecovered(false);
      setNotice(
        requestId
          ? "Presupuesto creado y solicitud marcada como Lista."
          : collectionIds.length
            ? `Presupuesto creado y agregado a ${collectionIds.length} colección(es).`
            : "Presupuesto creado.",
      );
      await loadList();
      if (created.id) {
        applyDetail(created, false);
        setSelectedId(created.id);
        await api(`/quotes/${created.id}/pdf`, {
          method: "POST",
          body: { kind: "SIMPLE" },
        });
        if (pdfTab) pdfTab.location.href = `/api/quotes/${created.id}/pdf/SIMPLE`;
        else window.open(`/api/quotes/${created.id}/pdf/SIMPLE`, "_blank", "noopener");
        await reloadDetail(created.id);
      }
    } catch (err) {
      pdfTab?.close();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const invalid = validateItems(items);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/quotes/${selectedId}`, {
        method: "PUT",
        body: {
          reason: saveReason.trim() || null,
          internalName: internalName.trim(),
          customerId: customerId || null,
          requestId: requestId || null,
          isBuiltPc,
          publicObservation: observation.trim() || null,
          collectionIds,
          items: itemsToPayload(items),
        },
      });
      setSaveReason("");
      setNotice(
        requestId
          ? "Nueva versión guardada. Solicitud en Lista si seguía en preparación."
          : "Nueva versión guardada; la anterior quedó intacta.",
      );
      const savedDraftKey = quoteDraftKey(selectedId);
      removeQuoteDraft(savedDraftKey);
      setDraftRecovered(false);
      await reloadDetail(selectedId, false);
      await loadList();
      // Al guardar, generar y abrir el PDF directamente para descargarlo.
      try {
        await api(`/quotes/${selectedId}/pdf`, { method: "POST", body: { kind: "SIMPLE", force: true } });
        await downloadAuthenticated(
          `/quotes/${selectedId}/pdf/SIMPLE`,
          `${detail?.visibleNumber ?? "presupuesto"}-SIMPLE.pdf`,
        );
        setNotice("Cambios guardados. Descargando PDF…");
      } catch {
        /* el guardado ya fue exitoso; si el PDF falla se puede regenerar desde el botón de PDF */
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function duplicateQuote(id: string | null = selectedId) {
    if (!id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const duplicated = await api<Quote>(`/quotes/${id}/duplicate`, {
        method: "POST",
      });
      setSelectedId(duplicated.id);
      applyDetail(duplicated);
      await Promise.all([loadSideData(duplicated.id), loadList()]);
      setDrawerOpen(true);
      setNotice("Presupuesto duplicado");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCollection(id: string, checked: boolean) {
    const next = checked
      ? [...new Set([...collectionIds, id])]
      : collectionIds.filter((cid) => cid !== id);
    setCollectionIds(next);
    // Si el presupuesto ya existe, la membresía se puede actualizar aunque no sea borrador.
    if (!selectedId || !detail) return;
    const draftNow = getActiveVersion(detail)?.state === "BORRADOR";
    if (draftNow) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/quotes/${selectedId}/collections`, {
        method: "PUT",
        body: { collectionIds: next },
      });
      setNotice("Colecciones actualizadas.");
      await reloadDetail(selectedId);
      await loadList();
    } catch (err) {
      setCollectionIds(collectionIds);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function retarget() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/quotes/${selectedId}/retarget`, {
        method: "POST",
        body: { targetTotalCents: parseArsToCents(retargetArs) },
      });
      setNotice("Total ajustado.");
      setRetargetArs("");
      await reloadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const activeVersion = detail ? getActiveVersion(detail) : null;
  const isDraft = !detail || activeVersion?.state === "BORRADOR";
  const filtered = useMemo(() => {
    const compareBigInt = (left: string | undefined, right: string | undefined) => {
      let leftValue = 0n;
      let rightValue = 0n;
      try {
        leftValue = BigInt(left ?? 0);
      } catch {
        /* use zero */
      }
      try {
        rightValue = BigInt(right ?? 0);
      } catch {
        /* use zero */
      }
      return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    };

    return [...list].sort((left, right) => {
      const leftVersion = getActiveVersion(left);
      const rightVersion = getActiveVersion(right);
      if (sort === "price-asc") {
        return compareBigInt(leftVersion?.totalSaleCents, rightVersion?.totalSaleCents);
      }
      if (sort === "price-desc") {
        return compareBigInt(rightVersion?.totalSaleCents, leftVersion?.totalSaleCents);
      }
      const leftCreatedAt = leftVersion?.createdAt ? new Date(leftVersion.createdAt).getTime() : 0;
      const rightCreatedAt = rightVersion?.createdAt ? new Date(rightVersion.createdAt).getTime() : 0;
      return sort === "created-asc"
        ? leftCreatedAt - rightCreatedAt
        : rightCreatedAt - leftCreatedAt;
    });
  }, [list, sort]);

  const stats = useMemo(() => {
    let sent = 0;
    let accepted = 0;
    let amount = 0n;
    for (const q of list) {
      const v = getActiveVersion(q);
      if (v?.state === "ENVIADO") sent += 1;
      if (v?.state === "ACEPTADO") {
        accepted += 1;
        try {
          amount += BigInt(v.totalSaleCents);
        } catch {
          /* ignore */
        }
      }
    }
    return { sent, accepted, amount: amount.toString() };
  }, [list]);

  const draftTotal = useMemo(() => {
    let total = 0n;
    for (const item of filledItems(items)) {
      try {
        total += BigInt(lineTotalCents(item.saleArs, item.quantity));
      } catch {
        /* ignore */
      }
    }
    return total.toString();
  }, [items]);

  function applyRounding() {
    const step = Number(roundStepPesos);
    if (!step) {
      setError("Elegí un redondeo antes de aplicarlo.");
      return;
    }
    let changed = 0;
    const next = items.map((item) => {
      if (isSlotEmpty(item)) return item;
      try {
        const saleCents = parseArsToCents(item.saleArs);
        const rounded = roundCentsToPesosStep(saleCents, step);
        if (rounded !== saleCents) changed += 1;
        const saleArs = centsToInput(rounded);
        return {
          ...item,
          saleArs,
          priceMode: "sale" as const,
          markupPct: pctFromCostAndSale(item.costArs, saleArs),
        };
      } catch {
        return item;
      }
    });
    setItems(next);
    setError(null);
    setNotice(
      changed
        ? `Precios redondeados a múltiplos de $ ${step.toLocaleString("es-AR")}.`
        : "Los precios ya estaban redondeados.",
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Presupuestos"
        subtitle="Creá, versioná y seguí el estado de cada presupuesto. El editor se abre a pantalla completa."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => void loadList()}>
              Recargar
            </button>
            <button type="button" onClick={openNew}>
              + Nuevo presupuesto
            </button>
          </>
        }
      />

      <StatStrip>
        <Stat label="Total presupuestos" value={list.length} accent="var(--ink)" />
        <Stat label="Enviados" value={stats.sent} accent="var(--info)" />
        <Stat label="Aceptados" value={stats.accepted} accent="var(--ok)" />
        <Stat
          label="Ventas aceptadas"
          value={<span className="money">{formatArs(stats.amount)}</span>}
          accent="var(--red)"
        />
      </StatStrip>

      {error && !drawerOpen ? <Alert>{error}</Alert> : null}
      {notice && !drawerOpen ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="toolbar">
        <SearchInput
          value={filter}
          onChange={setFilter}
          placeholder="Buscar por número, nombre, cliente o producto"
        />
        <select
          aria-label="Filtrar por estado"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as QuoteState | "")}
        >
          <option value="">Todos los estados</option>
          {QUOTE_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por local"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
        >
          <option value="">Todos los locales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Ordenar presupuestos"
          value={sort}
          onChange={(e) => setSort(e.target.value as QuoteSort)}
        >
          <option value="created-desc">Más nuevos</option>
          <option value="created-asc">Más viejos</option>
          <option value="price-asc">Precio: menor a mayor</option>
          <option value="price-desc">Precio: mayor a menor</option>
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="▤" title="Sin presupuestos">
          {filter ? "No hay coincidencias." : "Creá tu primer presupuesto para empezar."}
        </EmptyState>
      ) : (
        <>
        <div className="table-wrap desktop-list">
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Nombre</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Local</th>
                <th>Creado por</th>
                <th className="right">Total</th>
                <th>Acciones rápidas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((quote) => {
                const version = getActiveVersion(quote);
                const cname =
                  quote.customer?.name ??
                  customers.find((c) => c.id === quote.customerId)?.name ??
                  "—";
                const productsLine = getQuoteItems(quote)
                  .filter((item) => (item.name ?? "").trim())
                  .map((item) =>
                    item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
                  )
                  .join("  ·  ");
                return (
                  <Fragment key={quote.id}>
                    <tr className="clickable quote-row-main" onClick={() => void openQuote(quote.id)}>
                      <td>
                        <span className="cell-strong">{quote.visibleNumber}</span>
                        <span className="cell-sub">v{version?.version ?? quote.activeVersion}</span>
                      </td>
                      <td>{quote.internalName}</td>
                      <td>{cname}</td>
                      <td>
                        {version ? (
                          <Pill tone={STATE_TONE[version.state]}>{STATE_LABEL[version.state]}</Pill>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span
                          className="badge"
                          title="Local de creación — la impresión puede usar cualquier local según quién imprima"
                        >
                          {quote.branch?.name ?? "—"}
                        </span>
                      </td>
                      <td>{version?.creator?.displayName || version?.creator?.username || "—"}</td>
                      <td className="num">{formatArs(version?.totalSaleCents)}</td>
                      <td>
                        <div className="form-actions" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => void printQuote(quote)}>
                            Imprimir
                          </button>
                          <button type="button" onClick={() => void editQuote(quote)}>
                            Editar
                          </button>
                          <button type="button" onClick={() => void duplicateQuote(quote.id)}>
                            Duplicar
                          </button>
                          <button type="button" onClick={() => void showHistory(quote)}>
                            Versiones
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => void deleteQuote(quote)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                    {productsLine ? (
                      <tr
                        className="clickable quote-row-products"
                        onClick={() => void openQuote(quote.id)}
                      >
                        <td colSpan={8} className="quote-products-cell">
                          {productsLine}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list" aria-label="Presupuestos">
          {filtered.map((quote) => {
            const version = getActiveVersion(quote);
            const cname = quote.customer?.name ?? customers.find((c) => c.id === quote.customerId)?.name ?? "—";
            const productsLine = getQuoteItems(quote).filter((item) => (item.name ?? "").trim()).map((item) => item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name).join(" · ");
            return <article className="mobile-list-card" key={quote.id} onClick={() => void openQuote(quote.id)}>
              <div className="mobile-card-head">
                <div><strong>{quote.visibleNumber}</strong><span className="cell-sub">v{version?.version ?? quote.activeVersion} · {cname}</span></div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <span
                    className="badge"
                    title="Local de creación — la impresión puede usar cualquier local según quién imprima"
                  >
                    {quote.branch?.name ?? "—"}
                  </span>
                  {version ? <Pill tone={STATE_TONE[version.state]}>{STATE_LABEL[version.state]}</Pill> : null}
                </div>
              </div>
              <div className="mobile-card-title">{quote.internalName}</div>
              {productsLine ? <p className="mobile-card-detail">{productsLine}</p> : null}
              <div className="mobile-card-total"><span>Total</span><strong>{formatArs(version?.totalSaleCents)}</strong></div>
              <div className="mobile-card-actions" onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => void printQuote(quote)}>Imprimir</button>
                <button type="button" onClick={() => void editQuote(quote)}>Editar</button>
                <button type="button" onClick={() => void duplicateQuote(quote.id)}>Duplicar</button>
                <button type="button" className="btn-ghost" onClick={() => void showHistory(quote)}>Versiones</button>
                <button type="button" className="btn-danger" onClick={() => void deleteQuote(quote)}>Eliminar</button>
              </div>
            </article>;
          })}
        </div>
        </>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={detail ? detail.visibleNumber : "Nuevo presupuesto"}
        badge={
          activeVersion ? (
            <>
              <Pill tone={STATE_TONE[activeVersion.state]}>{STATE_LABEL[activeVersion.state]}</Pill>
              <span className="badge">v{activeVersion.version}</span>
            </>
          ) : (
            <span className="badge">Borrador nuevo</span>
          )
        }
        footer={
          <>
            {!detail ? (
              <button type="submit" form="quote-form" disabled={busy}>
                {busy ? "Creando…" : "Crear presupuesto"}
              </button>
            ) : null}
            {detail && isDraft ? (
              <button type="submit" form="quote-form" disabled={busy}>
                {busy ? "Guardando…" : "Guardar y descargar PDF"}
              </button>
            ) : null}
            <span className="quote-foot-total">
              <span className="quote-foot-total-label">Total del presupuesto</span>
              <strong>{formatArs(draftTotal)}</strong>
            </span>
            <span className="spacer" />
            <button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>
              Cerrar
            </button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        {draftRecovered ? (
          <p className="section-note">
            Se recuperó un borrador sin guardar.{" "}
            <button type="button" className="btn-ghost" onClick={discardRecoveredDraft}>
              Descartarlo
            </button>
          </p>
        ) : null}

        {activeVersion ? (
          <div className="totals-bar">
            <div>
              <span>Costo total</span>
              <strong>{formatArs(activeVersion.totalCostCents)}</strong>
            </div>
            <div>
              <span>Venta total</span>
              <strong className="accent">{formatArs(activeVersion.totalSaleCents)}</strong>
            </div>
            <div>
              <span>Ganancia</span>
              <strong className="good">{formatArs(activeVersion.profitCents)}</strong>
            </div>
            <div>
              <span>Markup efectivo</span>
              <strong>{formatBps(activeVersion.effectiveMarkupBps)}</strong>
            </div>
          </div>
        ) : null}

        <form
          id="quote-form"
          className="form-grid card card-pad"
          onSubmit={detail ? saveDraft : createQuote}
        >
          <h3 className="panel-title">Datos generales</h3>
          <div className="grid-2">
            <Field label="Nombre interno" hint="Solo para vos: es como aparece el presupuesto en la lista. No sale en el PDF ni lo ve el cliente." htmlFor="q-name">
              <input
                id="q-name"
                value={internalName}
                onChange={(e) => setInternalName(e.target.value)}
                required
                disabled={Boolean(detail) && !isDraft}
              />
            </Field>
            <Field label="Cliente">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={Boolean(detail) && !isDraft}
              >
                <option value="">Sin cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Solicitud vinculada">
              <select
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                disabled={Boolean(detail) && !isDraft}
              >
                <option value="">Sin solicitud</option>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <Checkbox
                label="Es PC armada"
                checked={isBuiltPc}
                onChange={(v) => void toggleBuiltPc(v)}
                disabled={(Boolean(detail) && !isDraft) || busy}
              />
              <p className="section-note" style={{ marginTop: "0.35rem" }}>
                {isBuiltPc
                  ? "Las líneas se listan en el presupuesto. Si no les asignás producto, no aparecen en el PDF."
                  : "PDF simple: ítems sin precio unitario (solo totales). PDF detallado: cantidad, unitario y subtotal."}
              </p>
            </div>
          </div>
          <Field label="Observación pública" htmlFor="q-obs">
            <textarea
              id="q-obs"
              rows={2}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              disabled={Boolean(detail) && !isDraft}
            />
          </Field>
          {detail && isDraft ? (
            <Field
              label="Nombre de este cambio (opcional)"
              hint="Se ve en el historial de versiones, ayuda a identificar qué se modificó."
              htmlFor="q-save-reason"
            >
              <input
                id="q-save-reason"
                value={saveReason}
                onChange={(e) => setSaveReason(e.target.value)}
                placeholder="Ej: cambié la fuente por una más económica"
              />
            </Field>
          ) : null}
          <div>
            <h4 className="panel-title" style={{ marginBottom: "0.5rem", fontSize: "0.95rem" }}>
              Colecciones
            </h4>
            {collections.length === 0 ? (
              <p className="section-note">
                No hay colecciones activas. Creá una desde el menú Colecciones.
              </p>
            ) : (
              <div className="check-grid" style={{ maxHeight: 180, overflow: "auto" }}>
                {collections.map((c) => (
                  <Checkbox
                    key={c.id}
                    label={`${c.icon ? `${c.icon} ` : ""}${c.name}`}
                    checked={collectionIds.includes(c.id)}
                    onChange={(v) => void toggleCollection(c.id, v)}
                    disabled={busy}
                  />
                ))}
              </div>
            )}
            <p className="section-note" style={{ marginTop: "0.35rem" }}>
              {detail && !isDraft
                ? "Los cambios de colección se guardan al instante (no dependen del borrador)."
                : "Al guardar el presupuesto quedará en las colecciones marcadas."}
            </p>
          </div>
        </form>

        <div className="card card-pad">
          <div className="items-head">
            <h3 className="panel-title" style={{ margin: 0 }}>
              Ítems ({filledItems(items).length}
              {isBuiltPc ? ` / ${items.length}` : ""})
              {isBuiltPc ? <span className="badge" style={{ marginLeft: "0.5rem" }}>PC armada</span> : null}
            </h3>
          </div>
          {isBuiltPc ? (
            <Alert tone="info">
              {pcLines.length > 0 ? (
                <>
                  Cada línea aparece abajo en el presupuesto. Completá las que necesites: las vacías
                  no se guardan ni salen en el PDF, pero sirven para ir aprendiendo el armado.
                </>
              ) : (
                <>Configurá líneas en Catálogo → Líneas PC para armar el esquema de la PC.</>
              )}
            </Alert>
          ) : null}

          {!isDraft ? (
            <Alert tone="info">
              La versión activa no es borrador: no se puede editar. Creá una nueva versión para
              modificar ítems.
            </Alert>
          ) : (
            <div className="picker" ref={pickerRef}>
              <div className="picker-input">
                <div className="search">
                  <span className="ico" aria-hidden="true">
                    ⌕
                  </span>
                  <input
                    ref={pickerInputRef}
                    value={pickerQuery}
                    onChange={(e) => {
                      setPickerQuery(e.target.value);
                      setPickerOpen(true);
                    }}
                    onFocus={() => setPickerOpen(true)}
                    onKeyDown={onPickerKeyDown}
                    placeholder={
                      pickingLineId
                        ? `Buscar para ${lineById.get(activeLineId)?.name ?? "línea"}… (↑↓ Enter)`
                        : isBuiltPc
                          ? "Buscar producto o combo, o tocá “Elegir” en una línea…"
                          : "Buscar producto o combo… (↑↓ Enter)"
                    }
                    aria-label="Buscar producto o combo"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      pickerActive >= 0 ? `picker-opt-${pickerActive}` : undefined
                    }
                    autoComplete="off"
                  />
                </div>
                {pickingLineId ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setPickingLineId(null);
                      setReplaceItemKey(null);
                      setPickerQuery("");
                      setPickerOpen(false);
                    }}
                  >
                    Cancelar línea
                  </button>
                ) : !isBuiltPc ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => addItem(blankItem(), true)}
                  >
                    + Ítem libre
                  </button>
                ) : null}
              </div>

              {pickerOpen && (pickerQuery.trim() || pickingLineId) ? (
                <div className="picker-results" role="listbox">
                  {pickerComboMatches.length > 0 ? (
                    <div className="picker-section">
                      <p className="picker-section-label">Combos</p>
                      {pickerComboMatches.map((combo) => {
                        const idx = pickerOptions.findIndex(
                          (o) => o.kind === "combo" && o.combo.id === combo.id,
                        );
                        return (
                          <button
                            key={combo.id}
                            id={`picker-opt-${idx}`}
                            type="button"
                            role="option"
                            aria-selected={pickerActive === idx}
                            className={`picker-option combo${pickerActive === idx ? " is-active" : ""}`}
                            onMouseEnter={() => setPickerActive(idx)}
                            onClick={() => addCombo(combo)}
                          >
                            <span className="po-name">
                              <span className="po-tag">Combo</span>
                              {combo.name}
                            </span>
                            <span className="po-price">
                              {combo.items.length} producto{combo.items.length === 1 ? "" : "s"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {pickerOptions.some((o) => o.kind === "product") ? (
                    <div className="picker-section">
                      {pickingLineId && !pickerQuery.trim() ? (
                        <p className="picker-section-label">
                          {lineSuggestions.length
                            ? "Sugeridos / usados en esta línea"
                            : "Productos de esta línea"}
                        </p>
                      ) : (
                        <p className="picker-section-label">Productos de presupuestos</p>
                      )}
                      {pickerOptions
                        .map((opt, idx) => ({ opt, idx }))
                        .filter(
                          (
                            row,
                          ): row is { opt: { kind: "product"; product: Product }; idx: number } =>
                            row.opt.kind === "product",
                        )
                        .map(({ opt, idx }) => {
                          const p = opt.product;
                          return (
                            <button
                              key={p.id}
                              id={`picker-opt-${idx}`}
                              type="button"
                              role="option"
                              aria-selected={pickerActive === idx}
                              className={`picker-option${pickerActive === idx ? " is-active" : ""}`}
                              onMouseEnter={() => setPickerActive(idx)}
                              onClick={() =>
                                pickingLineId
                                  ? assignProductToLine(p, activeLineId, replaceItemKey)
                                  : addItem(itemFromProduct(p))
                              }
                            >
                              <span className="po-name">{p.name}</span>
                              <span className="po-price">
                                {formatArs(p.salePriceCents)} · {formatBps(p.markupBps)}
                                {activeLineId && p.defaultLineId === activeLineId
                                  ? " · esta línea"
                                  : ""}
                                {p.lastUsedAt
                                  ? ` · usado ${new Date(p.lastUsedAt).toLocaleDateString("es-AR")}`
                                  : ""}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  ) : null}
                  {catalogPickerMatches.length > 0 ? (
                    <div className="picker-section">
                      <p className="picker-section-label">Catálogo AcuStock</p>
                      {pickerOptions
                        .map((opt, idx) => ({ opt, idx }))
                        .filter(
                          (
                            row,
                          ): row is {
                            opt: { kind: "catalog"; product: CatalogPickerItem };
                            idx: number;
                          } => row.opt.kind === "catalog",
                        )
                        .map(({ opt, idx }) => {
                          const p = opt.product;
                          return (
                            <button
                              key={p.mpn}
                              id={`picker-opt-${idx}`}
                              type="button"
                              role="option"
                              aria-selected={pickerActive === idx}
                              className={`picker-option${pickerActive === idx ? " is-active" : ""}`}
                              onMouseEnter={() => setPickerActive(idx)}
                              onClick={() => addCatalogItem(p)}
                            >
                              <span className="po-name">
                                <span className="po-tag">AcuStock</span>
                                {p.title}
                                {p.mpn || p.brand ? (
                                  <span className="cell-sub">
                                    {[p.mpn ? `SKU: ${p.mpn}` : "", p.brand ?? ""]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                ) : null}
                              </span>
                              <span className="po-price">
                                {formatArs(p.priceCents)}
                                {` · stock ${p.stockQuantity}`}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  ) : null}
                  {catalogPickerLoading ? (
                    <p className="picker-empty">Buscando en catálogo…</p>
                  ) : null}
                  {!catalogPickerLoading &&
                  !pickerOptions.some(
                    (o) => o.kind === "product" || o.kind === "combo" || o.kind === "catalog",
                  ) ? (
                    <p className="picker-empty">
                      {pickingLineId && !pickerQuery.trim()
                        ? "Escribí para buscar un producto para esta línea."
                        : "No hay productos ni combos que coincidan."}
                    </p>
                  ) : null}
                  <div className="picker-create">
                    {(() => {
                      const createIdx = pickerOptions.findIndex((o) => o.kind === "create");
                      const freeIdx = pickerOptions.findIndex((o) => o.kind === "free");
                      return (
                        <>
                          {createIdx >= 0 ? (
                            <button
                              id={`picker-opt-${createIdx}`}
                              type="button"
                              role="option"
                              aria-selected={pickerActive === createIdx}
                              className={`picker-option${pickerActive === createIdx ? " is-active" : ""}`}
                              onMouseEnter={() => setPickerActive(createIdx)}
                              onClick={openCreateProduct}
                            >
                              <span className="po-name">
                                + Crear producto “{pickerQuery.trim()}”
                                {activeLineId
                                  ? ` en ${lineById.get(activeLineId)?.name ?? "línea"}`
                                  : ""}
                              </span>
                              <span className="po-price">y agregarlo</span>
                            </button>
                          ) : null}
                          {freeIdx >= 0 ? (
                            <button
                              id={`picker-opt-${freeIdx}`}
                              type="button"
                              role="option"
                              aria-selected={pickerActive === freeIdx}
                              className={`picker-option${pickerActive === freeIdx ? " is-active" : ""}`}
                              onMouseEnter={() => setPickerActive(freeIdx)}
                              onClick={() =>
                                addItem({ ...blankItem(), name: pickerQuery.trim() }, true)
                              }
                            >
                              <span className="po-name">Agregar solo a este presupuesto</span>
                              <span className="po-price">sin crear producto</span>
                            </button>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {items.length === 0 ? (
            <EmptyState icon="⌕" title="Sin ítems">
              {isBuiltPc
                ? "Configurá líneas en Catálogo → Líneas PC y activá PC armada de nuevo."
                : "Buscá un producto o combo arriba para agregarlo. Si no existe, podés crearlo en el momento."}
            </EmptyState>
          ) : (
            <>
            <div className="table-wrap mt quote-items-desktop">
              <table className="items-table">
                <thead>
                  <tr>
                    {isBuiltPc ? <th>Línea</th> : null}
                    <th>Nombre</th>
                    <th className="right">Cantidad</th>
                    <th className="right">Costo</th>
                    <th className="right">% Markup</th>
                    <th className="right">Precio de venta</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const editing = editingKey === item.key;
                    const empty = isSlotEmpty(item);
                    const lineName = item.lineId
                      ? lineById.get(item.lineId)?.name
                      : null;
                    const picking =
                      replaceItemKey === item.key ||
                      (Boolean(pickingLineId) &&
                        item.lineId === pickingLineId &&
                        empty);
                    return (
                      <tr
                        key={item.key}
                        className={[
                          editing ? "editing" : "",
                          empty ? "pc-slot-empty" : "",
                          picking ? "pc-slot-active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined}
                      >
                        {isBuiltPc ? (
                          <td className="pc-line-cell">
                            <span className="pc-line-name">{lineName ?? "Extra"}</span>
                          </td>
                        ) : null}
                        <td className="item-name-cell">
                          {empty && isDraft ? (
                            <button
                              type="button"
                              className="btn-ghost pc-slot-pick"
                              onClick={() =>
                                item.lineId
                                  ? openReplaceOnLine(item.key, item.lineId)
                                  : undefined
                              }
                            >
                              {picking ? "Elegí un producto arriba…" : "Elegir producto…"}
                            </button>
                          ) : editing ? (
                            <input
                              className="name-input"
                              value={item.name}
                              onChange={(e) => setName(item.key, e.target.value)}
                              placeholder="Nombre del ítem"
                              autoFocus
                            />
                          ) : (
                            <>
                              <span className="cell-strong">{item.name || "(sin nombre)"}</span>
                              {item.productId ? null : (
                                <span className="cell-sub">ítem libre</span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="right num">
                          {empty ? (
                            "—"
                          ) : editing ? (
                            <input
                              className="qty-input"
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => setQuantity(item.key, e.target.value)}
                            />
                          ) : (
                            item.quantity
                          )}
                        </td>
                        <td className="right num">
                          {empty ? (
                            "—"
                          ) : editing ? (
                            <input
                              className="money-input"
                              value={item.costArs}
                              onChange={(e) => setCost(item.key, e.target.value)}
                              placeholder="0,00"
                            />
                          ) : (
                            displayArs(item.costArs)
                          )}
                        </td>
                        <td className="right num">
                          {empty ? (
                            "—"
                          ) : editing ? (
                            <input
                              className="pct-input"
                              value={item.markupPct}
                              onChange={(e) => setMarkupPct(item.key, e.target.value)}
                              placeholder="30"
                            />
                          ) : (
                            `${item.markupPct || "0"} %`
                          )}
                        </td>
                        <td className="right num">
                          {empty ? (
                            "—"
                          ) : editing ? (
                            <input
                              className="money-input"
                              value={item.saleArs}
                              onChange={(e) => setSale(item.key, e.target.value)}
                              placeholder="0,00"
                            />
                          ) : (
                            displayArs(item.saleArs)
                          )}
                        </td>
                        <td className="actions">
                          {isDraft ? (
                            <div className="item-actions">
                              {!isBuiltPc ? (
                                <>
                                  <button
                                    type="button"
                                    className="move-btn"
                                    title="Mover arriba"
                                    aria-label="Mover arriba"
                                    disabled={index === 0}
                                    onClick={() => move(item.key, -1)}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="move-btn"
                                    title="Mover abajo"
                                    aria-label="Mover abajo"
                                    disabled={index === items.length - 1}
                                    onClick={() => move(item.key, 1)}
                                  >
                                    ↓
                                  </button>
                                </>
                              ) : null}
                              {!empty ? (
                                <button
                                  type="button"
                                  className="btn-ghost btn-sm"
                                  onClick={() => setEditingKey(editing ? null : item.key)}
                                >
                                  {editing ? "Listo" : "Editar"}
                                </button>
                              ) : null}
                              {isBuiltPc && item.lineId ? (
                                <button
                                  type="button"
                                  className="btn-ghost btn-sm"
                                  onClick={() => openReplaceOnLine(item.key, item.lineId)}
                                >
                                  {empty ? "Elegir" : "Cambiar"}
                                </button>
                              ) : null}
                              {!empty ? (
                                <button
                                  type="button"
                                  className="btn-danger btn-sm"
                                  onClick={() => removeItem(item.key)}
                                >
                                  {isBuiltPc && item.lineId ? "Vaciar" : "Eliminar"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="items-total-row">
                    <td colSpan={isBuiltPc ? 5 : 4} className="items-total-label">
                      Total del presupuesto
                    </td>
                    <td className="right num items-total-value">{formatArs(draftTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="quote-items-mobile mt">
              {items.map((item, index) => {
                const editing = editingKey === item.key;
                const empty = isSlotEmpty(item);
                const lineName = item.lineId ? lineById.get(item.lineId)?.name : null;
                const picking = replaceItemKey === item.key || (Boolean(pickingLineId) && item.lineId === pickingLineId && empty);
                return <article className={`item-card${empty ? " pc-slot-empty" : ""}`} key={item.key}>
                  <div className="item-card-top">
                    <span className="item-index">{index + 1}</span>
                    <div>{isBuiltPc ? <span className="cell-sub">{lineName ?? "Extra"}</span> : null}<strong>{empty ? "Componente sin elegir" : item.name || "(sin nombre)"}</strong></div>
                  </div>
                  {empty && isDraft ? <button type="button" className="btn-ghost" onClick={() => item.lineId ? openReplaceOnLine(item.key, item.lineId) : undefined}>{picking ? "Elegí un producto arriba…" : "Elegir producto…"}</button> : null}
                  {!empty && editing ? <>
                    <Field label="Nombre"><input value={item.name} onChange={(e) => setName(item.key, e.target.value)} /></Field>
                    <div className="item-fields">
                      <Field label="Cantidad"><input type="number" min={1} value={item.quantity} onChange={(e) => setQuantity(item.key, e.target.value)} /></Field>
                      <Field label="Costo"><input value={item.costArs} onChange={(e) => setCost(item.key, e.target.value)} /></Field>
                      <Field label="Markup %"><input value={item.markupPct} onChange={(e) => setMarkupPct(item.key, e.target.value)} /></Field>
                      <Field label="Precio de venta"><input value={item.saleArs} onChange={(e) => setSale(item.key, e.target.value)} /></Field>
                    </div>
                  </> : !empty ? <div className="item-fields mobile-item-values">
                    <div><span>Cantidad</span><strong>{item.quantity}</strong></div><div><span>Costo</span><strong>{displayArs(item.costArs)}</strong></div><div><span>Markup</span><strong>{item.markupPct || "0"} %</strong></div><div><span>Venta</span><strong>{displayArs(item.saleArs)}</strong></div>
                  </div> : null}
                  {!empty ? <div className="item-foot"><span>Subtotal</span><strong className="item-subtotal">{formatArs(lineTotalCents(item.saleArs, item.quantity))}</strong></div> : null}
                  {isDraft ? <div className="mobile-card-actions">
                    {!isBuiltPc ? <><button type="button" className="move-btn" disabled={index === 0} onClick={() => move(item.key, -1)}>↑ Subir</button><button type="button" className="move-btn" disabled={index === items.length - 1} onClick={() => move(item.key, 1)}>↓ Bajar</button></> : null}
                    {!empty ? <button type="button" className="btn-ghost" onClick={() => setEditingKey(editing ? null : item.key)}>{editing ? "Listo" : "Editar"}</button> : null}
                    {isBuiltPc && item.lineId ? <button type="button" className="btn-ghost" onClick={() => openReplaceOnLine(item.key, item.lineId)}>{empty ? "Elegir" : "Cambiar"}</button> : null}
                    {!empty ? <button type="button" className="btn-danger" onClick={() => removeItem(item.key)}>{isBuiltPc && item.lineId ? "Vaciar" : "Eliminar"}</button> : null}
                  </div> : null}
                </article>;
              })}
              <div className="mobile-items-total"><span>Total del presupuesto</span><strong>{formatArs(draftTotal)}</strong></div>
            </div>
            </>
          )}

          {filledItems(items).length > 0 && isDraft ? (
            <div className="quote-round-bar">
              <div className="quote-round-copy">
                <strong>Redondeo de precios</strong>
                <span className="section-note" style={{ margin: 0 }}>
                  Ajusta el precio de venta de cada ítem al múltiplo elegido.
                </span>
              </div>
              <div className="quote-round-actions">
                <select
                  value={roundStepPesos}
                  onChange={(e) =>
                    setRoundStepPesos(e.target.value as typeof roundStepPesos)
                  }
                  aria-label="Paso de redondeo"
                >
                  <option value="">Sin redondeo</option>
                  <option value="100">A $ 100</option>
                  <option value="500">A $ 500</option>
                  <option value="1000">A $ 1.000</option>
                  <option value="5000">A $ 5.000</option>
                </select>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!roundStepPesos || busy}
                  onClick={applyRounding}
                >
                  Aplicar redondeo
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {detail ? (
          <>
            <div className="card card-pad quote-ops" style={{ marginTop: "1rem" }}>
              <div className="quote-ops-head">
                <div>
                  <h3 className="panel-title">Estado, PDF e historial</h3>
                  <p className="section-note">
                    {openedAsNewVersion
                      ? "Abriste una versión enviada/cerrada: se creó un borrador nuevo automáticamente."
                      : isDraft
                        ? "Estás en un borrador editable. Generá PDF o marcá el resultado comercial."
                        : "Esta versión ya no se edita; al reabrir se crea un borrador nuevo."}
                  </p>
                </div>
                {activeVersion ? (
                  <div className="form-actions">
                    <button type="button" disabled={busy} onClick={() => void duplicateQuote()}>
                      {busy ? "Procesando…" : "Duplicar"}
                    </button>
                    <Pill tone={STATE_TONE[activeVersion.state]}>
                      v{activeVersion.version} · {STATE_LABEL[activeVersion.state]}
                    </Pill>
                  </div>
                ) : null}
              </div>

              <div className="quote-ops-grid">
                {detail ? <section>
                  <h4 className="ops-subtitle">Estado comercial</h4>
                  {activeVersion ? <Pill tone={STATE_TONE[activeVersion.state]}>{STATE_LABEL[activeVersion.state]}</Pill> : null}
                  <p className="section-note">El estado se actualiza desde la conversación de WhatsApp.</p>
                </section> : null}

                <section>
                  <h4 className="ops-subtitle">Generar PDF (versión actual)</h4>
                  <p className="section-note">
                    Sin vencimiento. Simple = PC agrupada; Detallado = precios por ítem.
                  </p>
                  <div className="form-actions">
                    <button
                      type="button"
                      disabled={!!pdfBusy || !selectedId || !isDraft}
                      onClick={() => void generatePdf("SIMPLE")}
                    >
                      {pdfBusy === "SIMPLE" ? "Generando…" : "Generar simple"}
                    </button>
                    <button
                      type="button"
                      className="btn-dark"
                      disabled={!!pdfBusy || !selectedId || !isDraft}
                      onClick={() => void generatePdf("DETALLADO")}
                    >
                      {pdfBusy === "DETALLADO" ? "Generando…" : "Generar detallado"}
                    </button>
                  </div>
                  {!isDraft ? (
                    <p className="muted" style={{ marginTop: "0.5rem" }}>
                      Para regenerar, reabrí el presupuesto (crea borrador nuevo).
                    </p>
                  ) : null}
                </section>

                <section>
                  <h4 className="ops-subtitle">Ajustes del borrador</h4>
                  <Field label="Total de venta objetivo (ARS)" htmlFor="retarget">
                    <input
                      id="retarget"
                      value={retargetArs}
                      onChange={(e) => setRetargetArs(e.target.value)}
                      disabled={!isDraft}
                      placeholder="Ej: 1200000"
                    />
                  </Field>
                  <div className="form-actions">
                    <button
                      type="button"
                      disabled={busy || !isDraft || !retargetArs.trim()}
                      onClick={() => void retarget()}
                    >
                      Ajustar total
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy || !isDraft}
                      onClick={() => void syncPrices()}
                    >
                      Sync precios catálogo
                    </button>
                  </div>
                </section>
              </div>

              <div className="quote-history">
                <div>
                  <h4 className="ops-subtitle">Versiones y PDF</h4>
                  <p className="muted">Elegí una versión para ver sus componentes, descargar el PDF o restaurarla.</p>
                  {!detail.versions?.length ? (
                    <p className="muted">Todavía no hay versiones.</p>
                  ) : (
                    <ul className="pdf-history">
                      {detail.versions.map((version) => (
                        <li key={version.id}>
                          <div>
                            <strong>v{version.version} · {STATE_LABEL[version.state]}{version.version === detail.activeVersion ? " · Actual" : ""}</strong>
                            <br />
                            <span className="cell-sub">{version.reason || "Sin nombre de cambio"}</span>
                            <br />
                            <span className="cell-sub">
                              {version.items.map((item) => item.frozenName ?? item.name).join(", ")}
                              {" · "}
                              {formatArs(version.totalSaleCents)}
                            </span>
                          </div>
                          <div className="form-actions">
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              onClick={() => {
                                setPreviewFamilyId(detail.id);
                                setPreviewVersion(version);
                              }}
                            >
                              Ver componentes
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              disabled={!!pdfBusy}
                              onClick={() => void downloadVersionPdf(version, "SIMPLE")}
                            >
                              PDF simple
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              disabled={!!pdfBusy}
                              onClick={() => void downloadVersionPdf(version, "DETALLADO")}
                            >
                              PDF detallado
                            </button>
                            {version.version !== detail.activeVersion ? (
                              <button
                                type="button"
                                className="btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => void restoreVersion(detail.id, version)}
                              >
                                Restaurar
                              </button>
                            ) : null}
                            {version.state === "BORRADOR" && version.version !== detail.activeVersion ? (
                              <button
                                type="button"
                                className="btn-danger btn-sm"
                                disabled={busy}
                                onClick={() => void deleteVersion(detail.id, version)}
                              >
                                Eliminar
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="two-col" style={{ marginTop: "1rem" }}>
              <div className="card card-pad">
                <h3 className="panel-title">Presupuestos similares</h3>
                {!similar.length ? (
                  <p className="muted">Sin coincidencias relevantes.</p>
                ) : (
                  <ul className="similar-list">
                    {similar.map((row) => (
                      <li key={row.familyId}>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => void openQuote(row.familyId)}
                        >
                          {row.visibleNumber} · {row.internalName}
                        </button>
                        <strong>{row.score}%</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card card-pad">
                <h3 className="panel-title">Componentes habituales</h3>
                {!habitual.length ? (
                  <p className="muted">Sin historial suficiente.</p>
                ) : (
                  <ul className="habitual-list">
                    {habitual.map((row) => (
                      <li key={`${row.productId ?? row.name}`}>
                        <span>
                          {row.name}
                          <span className="cell-sub">
                            {" "}
                            soporte {row.support}/{row.sampleSize}
                            {row.lineId && lineById.get(row.lineId)
                              ? ` · ${lineById.get(row.lineId)!.name}`
                              : ""}
                          </span>
                        </span>
                        {isDraft && row.productId ? (
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => applyHabitualSuggestion(row)}
                          >
                            Agregar
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null}
      </Drawer>

      <Modal
        open={!!versionEditQuote}
        title="Crear nueva versión"
        onClose={() => setVersionEditQuote(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setVersionEditQuote(null)}>
              Cancelar
            </button>
            <button type="button" disabled={busy} onClick={() => void confirmVersionEdit()}>
              {busy ? "Creando…" : "Crear versión y editar"}
            </button>
          </>
        }
      >
        <p>
          La versión actual queda congelada. Se creará una copia editable en borrador.
        </p>
        <Field label="Nombre de este cambio (opcional)" htmlFor="version-reason">
          <input
            id="version-reason"
            value={versionReason}
            onChange={(event) => setVersionReason(event.target.value)}
            placeholder="Ej: Agregué SSD más grande"
            autoFocus
          />
        </Field>
      </Modal>

      <Modal
        open={!!historyQuote}
        title={`Versiones de ${historyQuote?.visibleNumber ?? ""}`}
        onClose={() => {
          setHistoryQuote(null);
          setPreviewVersion(null);
        }}
        wide
      >
        <div className="pdf-history">
          {(historyQuote?.versions ?? []).map((version) => (
            <div className="card card-pad" key={version.id}>
              <div className="form-actions">
                <Pill tone={STATE_TONE[version.state]}>
                  v{version.version} · {STATE_LABEL[version.state]}
                </Pill>
                {version.version === historyQuote?.activeVersion ? <span className="badge">Última</span> : null}
              </div>
              <strong>{version.reason || "Sin nombre de cambio"}</strong>
              <span className="cell-sub">
                {version.createdAt ? new Date(version.createdAt).toLocaleString("es-AR") : "Sin fecha"}
                {" · "}
                {version.creator?.displayName || version.creator?.username || "Sin creador"}
              </span>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    if (!historyQuote) return;
                    setPreviewFamilyId(historyQuote.id);
                    setPreviewVersion(version);
                  }}
                >
                  Ver contenido
                </button>
                {version.version !== historyQuote?.activeVersion ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => historyQuote && void restoreVersion(historyQuote.id, version)}
                  >
                    Restaurar
                  </button>
                ) : null}
                {version.state === "BORRADOR" && version.version !== historyQuote?.activeVersion ? (
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    disabled={busy}
                    onClick={() => historyQuote && void deleteVersion(historyQuote.id, version)}
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!previewVersion}
        title={`Preview versión ${previewVersion?.version ?? ""}`}
        onClose={() => {
          setPreviewVersion(null);
          setPreviewFamilyId(null);
        }}
        wide
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setPreviewVersion(null)}>
              Cerrar
            </button>
            <button
              type="button"
              disabled={busy || !previewVersion || !previewFamilyId}
              onClick={() => previewVersion && previewFamilyId && void restoreVersion(previewFamilyId, previewVersion)}
            >
              {busy ? "Restaurando…" : "Restaurar versión"}
            </button>
          </>
        }
      >
        <p>{previewVersion?.reason || "Sin nombre de cambio"}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ítem</th><th>Cantidad</th><th className="right">Unitario</th><th className="right">Subtotal</th></tr>
            </thead>
            <tbody>
              {(previewVersion?.items ?? []).map((item) => (
                <tr key={item.id ?? `${item.position}-${item.name}`}>
                  <td>{item.name ?? item.frozenName}</td>
                  <td>{item.quantity}</td>
                  <td className="num">{formatArs(item.salePriceCents ?? item.frozenSalePriceCents)}</td>
                  <td className="num">{formatArs(item.subtotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <strong>Total: {formatArs(previewVersion?.totalSaleCents)}</strong>
      </Modal>

      <Modal
        open={newProdOpen}
        title="Crear producto"
        onClose={() => setNewProdOpen(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setNewProdOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="quick-product" disabled={creatingProd}>
              {creatingProd ? "Creando…" : "Crear y agregar"}
            </button>
          </>
        }
      >
        <form id="quick-product" className="form-grid" onSubmit={createProductAndAdd}>
          <p className="section-note">
            Se guarda en el catálogo y se agrega como ítem de este presupuesto.
          </p>
          <Field label="Nombre" htmlFor="np-name">
            <input
              id="np-name"
              value={newProd.name}
              onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
              required
              autoFocus
            />
          </Field>
          <div className="grid-2">
            <Field label="Costo (ARS)" htmlFor="np-cost" hint="Ej: 150000,50">
              <input
                id="np-cost"
                value={newProd.costArs}
                onChange={(e) => setNewProd({ ...newProd, costArs: e.target.value })}
                required
              />
            </Field>
            <Field
              label="% Markup"
              htmlFor="np-markup"
              hint={
                newProd.costArs && newProd.markupPct
                  ? `Venta: ${displayArs(saleFromCostAndPct(newProd.costArs, newProd.markupPct))}`
                  : undefined
              }
            >
              <input
                id="np-markup"
                value={newProd.markupPct}
                onChange={(e) => setNewProd({ ...newProd, markupPct: e.target.value })}
                required
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
