"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [retargetArs, setRetargetArs] = useState("");
  const [roundStepPesos, setRoundStepPesos] = useState<"" | "100" | "500" | "1000" | "5000">("");
  const [stateReason, setStateReason] = useState("");
  const [filter, setFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<QuoteState | "">("");
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [pdfs, setPdfs] = useState<QuotePdfRow[]>([]);
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

  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Línea PC a la que se está agregando/cambiando producto (opcional). */
  const [pickingLineId, setPickingLineId] = useState<string | null>(null);
  /** Si hay key, se reemplaza ese ítem; si no, se agrega uno nuevo en la línea. */
  const [replaceItemKey, setReplaceItemKey] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const initialOpenRef = useRef<string | null>(null);

  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState({ name: "", costArs: "", markupPct: "30" });
  const [creatingProd, setCreatingProd] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [quotesPayload, custs, prods, reqs, cols, comboRows, lines] = await Promise.all([
        api<{ items: Quote[] } | Quote[]>("/quotes/search", {
          query: {
            q: filter.trim() || undefined,
            state: stateFilter || undefined,
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
    } catch (err) {
      setError(errorMessage(err));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filter, stateFilter]);

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
    (quote: Quote) => {
      setDetail(quote);
      setSelectedId(quote.id);
      setInternalName(quote.internalName);
      setCustomerId(quote.customerId ?? "");
      setRequestId(quote.requestId ?? "");
      setIsBuiltPc(quote.isBuiltPc);
      setCollectionIds(
        (quote.collections ?? [])
          .map((row) => row.collectionId ?? row.collection?.id ?? "")
          .filter(Boolean),
      );
      const version = getActiveVersion(quote);
      setObservation(version?.publicObservation ?? "");
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
      setItems(
        quote.isBuiltPc && pcLines.length
          ? buildPcSlots(pcLines, mapped, productById)
          : mapped.filter((i) => !isSlotEmpty(i)),
      );
      setEditingKey(null);
      setPickingLineId(null);
      setReplaceItemKey(null);
    },
    [pcLines, productById],
  );

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
      let quote = await api<Quote>(`/quotes/${id}`);
      const current = getActiveVersion(quote);
      // Si la versión activa ya no es borrador, abrir = crear nueva versión editable automáticamente.
      if (current && current.state !== "BORRADOR") {
        await api(`/quotes/${id}/version`, {
          method: "POST",
          body: {
            reason: `Edición desde v${current.version} (${STATE_LABEL[current.state]})`,
          },
        });
        quote = await api<Quote>(`/quotes/${id}`);
        setOpenedAsNewVersion(true);
        setNotice(
          `Se abrió una nueva versión (v${getActiveVersion(quote)?.version}) en borrador. La anterior queda intacta.`,
        );
      }
      applyDetail(quote);
      await loadSideData(id);
      setDrawerOpen(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reloadDetail(id: string) {
    applyDetail(await api<Quote>(`/quotes/${id}`));
    await loadSideData(id);
  }

  async function generatePdf(kind: "SIMPLE" | "DETALLADO") {
    if (!selectedId || !detail) return;
    setPdfBusy(kind);
    setError(null);
    try {
      // Guardar borrador antes de generar para que el PDF refleje lo que se ve.
      const draftNow = !detail || getActiveVersion(detail)?.state === "BORRADOR";
      if (draftNow && items.length) {
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

  async function downloadPdfRow(row: QuotePdfRow) {
    if (!selectedId || !detail) return;
    setError(null);
    try {
      await downloadAuthenticated(
        `/quotes/${selectedId}/pdfs/${row.id}`,
        `${detail.visibleNumber}-V${row.versionNumber ?? "?"}-${row.kind}.pdf`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function setStateQuick(state: QuoteState, confirmMsg: string) {
    if (!selectedId) return;
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      if (state === "ENVIADO") {
        const draftNow = !detail || getActiveVersion(detail)?.state === "BORRADOR";
        if (draftNow && items.length) {
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
      }
      await api(`/quotes/${selectedId}/state`, {
        method: "POST",
        body: { state, reason: stateReason.trim() || null },
      });
      setNotice(`Estado: ${STATE_LABEL[state]}.`);
      setStateReason("");
      setOpenedAsNewVersion(false);
      await reloadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
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
    setSelectedId(null);
    setDetail(null);
    setInternalName("");
    setCustomerId("");
    setRequestId("");
    setIsBuiltPc(false);
    setCollectionIds([]);
    setObservation("");
    setItems([]);
    setEditingKey(null);
    setPickingLineId(null);
    setReplaceItemKey(null);
    setRetargetArs("");
    setStateReason("");
    setPickerQuery("");
    setError(null);
    setNotice(null);
    setOpenedAsNewVersion(false);
    setTimeline([]);
    setPdfs([]);
    setDrawerOpen(true);
  }

  function openNewFromRequest(seed: QuoteFromRequestSeed) {
    setSelectedId(null);
    setDetail(null);
    setInternalName(seed.internalName);
    setCustomerId(seed.customerId ?? "");
    setRequestId(seed.requestId);
    setIsBuiltPc(false);
    setCollectionIds([]);
    setObservation("");
    setItems([]);
    setEditingKey(null);
    setPickingLineId(null);
    setReplaceItemKey(null);
    setRetargetArs("");
    setStateReason("");
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

  function openAddToLine(lineId: string) {
    const empty = items.find((i) => i.lineId === lineId && isSlotEmpty(i));
    setPickingLineId(lineId);
    setReplaceItemKey(empty?.key ?? null);
    setPickerQuery("");
    setPickerOpen(true);
    setEditingKey(null);
  }

  function openReplaceOnLine(itemKey: string, lineId: string) {
    setPickingLineId(lineId);
    setReplaceItemKey(itemKey);
    setPickerQuery("");
    setPickerOpen(true);
    setEditingKey(null);
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
    | { kind: "create" }
    | { kind: "free" };

  const pickerOptions = useMemo((): PickerOption[] => {
    const opts: PickerOption[] = [];
    if (pickingLineId) {
      const seen = new Set<string>();
      for (const product of [...lineSuggestions, ...pickerMatches]) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        opts.push({ kind: "product", product });
      }
      if (pickerQuery.trim()) opts.push({ kind: "create" });
      return opts;
    }
    if (!pickerQuery.trim()) return [];
    for (const combo of pickerComboMatches) opts.push({ kind: "combo", combo });
    for (const product of pickerMatches) opts.push({ kind: "product", product });
    opts.push({ kind: "create" }, { kind: "free" });
    return opts;
  }, [pickingLineId, pickerQuery, pickerComboMatches, pickerMatches, lineSuggestions]);

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
      setNotice(
        requestId
          ? "Presupuesto creado y solicitud marcada como Lista."
          : collectionIds.length
            ? `Presupuesto creado y agregado a ${collectionIds.length} colección(es).`
            : "Presupuesto creado.",
      );
      await loadList();
      if (created.id) await reloadDetail(created.id);
    } catch (err) {
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
          internalName: internalName.trim(),
          customerId: customerId || null,
          requestId: requestId || null,
          isBuiltPc,
          publicObservation: observation.trim() || null,
          collectionIds,
          items: itemsToPayload(items),
        },
      });
      setNotice(
        requestId
          ? "Borrador actualizado. Solicitud en Lista si seguía en preparación."
          : "Borrador actualizado.",
      );
      await reloadDetail(selectedId);
      await loadList();
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
  const filtered = list;

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
        if (rounded === saleCents) return item;
        changed += 1;
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
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="▤" title="Sin presupuestos">
          {filter ? "No hay coincidencias." : "Creá tu primer presupuesto para empezar."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Nombre</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((quote) => {
                const version = getActiveVersion(quote);
                const cname =
                  quote.customer?.name ??
                  customers.find((c) => c.id === quote.customerId)?.name ??
                  "—";
                return (
                  <tr key={quote.id} className="clickable" onClick={() => void openQuote(quote.id)}>
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
                    <td className="num">{formatArs(version?.totalSaleCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                {busy ? "Guardando…" : "Guardar borrador"}
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
            <Field label="Nombre interno" htmlFor="q-name">
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
                      ) : pickerComboMatches.length > 0 ? (
                        <p className="picker-section-label">Productos</p>
                      ) : null}
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
                  {!pickerOptions.some((o) => o.kind === "product" || o.kind === "combo") ? (
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
            <div className="table-wrap mt">
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
                  <Pill tone={STATE_TONE[activeVersion.state]}>
                    v{activeVersion.version} · {STATE_LABEL[activeVersion.state]}
                  </Pill>
                ) : null}
              </div>

              <div className="quote-ops-grid">
                <section>
                  <h4 className="ops-subtitle">Acciones de estado</h4>
                  <Field label="Nota opcional" htmlFor="state-reason">
                    <input
                      id="state-reason"
                      value={stateReason}
                      onChange={(e) => setStateReason(e.target.value)}
                      placeholder="Ej: cliente confirmó por WhatsApp"
                    />
                  </Field>
                  <div className="form-actions">
                    {isDraft ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void setStateQuick(
                            "ENVIADO",
                            "¿Marcar esta versión como enviada? Quedará inmutable.",
                          )
                        }
                      >
                        Marcar enviado
                      </button>
                    ) : null}
                    {activeVersion?.state === "ENVIADO" || isDraft ? (
                      <>
                        <button
                          type="button"
                          className="btn-dark"
                          disabled={busy}
                          onClick={() =>
                            void setStateQuick("ACEPTADO", "¿Marcar como aceptado?")
                          }
                        >
                          Aceptado
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          disabled={busy}
                          onClick={() =>
                            void setStateQuick("RECHAZADO", "¿Marcar como rechazado?")
                          }
                        >
                          Rechazado
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            void setStateQuick(
                              "NO_CONCRETADO",
                              "¿Marcar como no concretado?",
                            )
                          }
                        >
                          No concretado
                        </button>
                      </>
                    ) : null}
                  </div>
                </section>

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
                  <h4 className="ops-subtitle">PDFs generados</h4>
                  {!pdfs.length ? (
                    <p className="muted">Todavía no hay PDFs en este presupuesto.</p>
                  ) : (
                    <ul className="pdf-history">
                      {pdfs.map((row) => (
                        <li key={row.id}>
                          <div>
                            <strong>
                              v{row.versionNumber ?? "?"} · {row.kind}
                            </strong>
                            <span className="cell-sub">
                              {row.versionState ? STATE_LABEL[row.versionState] : ""}
                              {row.isActiveVersion ? " · activa" : ""}
                              {" · "}
                              {new Date(row.createdAt).toLocaleString("es-AR")}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => void downloadPdfRow(row)}
                          >
                            Descargar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="ops-subtitle">Timeline</h4>
                  {!timeline.length ? (
                    <p className="muted">Sin eventos todavía.</p>
                  ) : (
                    <ol className="timeline">
                      {[...timeline].reverse().map((event) => (
                        <li key={event.id}>
                          <strong>{event.type.replaceAll("_", " ")}</strong>
                          <span className="cell-sub">
                            {new Date(event.createdAt).toLocaleString("es-AR")}
                          </span>
                        </li>
                      ))}
                    </ol>
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
