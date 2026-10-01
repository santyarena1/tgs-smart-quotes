"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  CompanySettings,
  PdfCustomBlock,
  PdfLayoutBlockKey,
  PdfLayoutConfig,
  PdfLayoutDocument,
  PdfLayoutSettings,
  PdfLayoutStyle,
  PdfSettings,
} from "../lib/types";
import { Alert, Loading, PageHeader, errorMessage } from "./shared";
import { PDF_SECTIONS, buildLayers, moveCustomLayer } from "../lib/pdf-layers";
import { PDF_PRESETS, matchingPresetId, type PdfPreset } from "../lib/pdf-presets";

const BLOCKS: Array<{
  key: PdfLayoutBlockKey; label: string; text?: boolean; resize?: boolean; column?: boolean;
  fixedContent?: "companyName" | "taxCondition" | "fiscal" | "builtPc" | "services" | "rma" | "footer";
}> = [
  { key: "logo", label: "Logo", resize: true },
  { key: "companyName", label: "Nombre de la empresa", text: true, resize: true, fixedContent: "companyName" },
  { key: "companyTaxData", label: "Condición fiscal", text: true, resize: true, fixedContent: "taxCondition" },
  { key: "quoteTitle", label: "Título PRESUPUESTO", text: true, resize: true },
  { key: "quoteMeta", label: "Número y fecha del encabezado", text: true, resize: true },
  { key: "quoteData", label: "Datos del presupuesto", text: true, resize: true },
  { key: "companyFiscalData", label: "Datos fiscales", text: true, resize: true, fixedContent: "fiscal" },
  { key: "servicesBlock", label: "Servicios incluidos", text: true, resize: true, fixedContent: "services" },
  { key: "itemsTable", label: "Tabla de artículos", text: true, resize: true, fixedContent: "builtPc" },
  { key: "itemsTable.colCode", label: "Columna Código", column: true },
  { key: "itemsTable.colName", label: "Columna Artículo", column: true },
  { key: "itemsTable.colQty", label: "Columna Cantidad", column: true },
  { key: "itemsTable.colAmount", label: "Columna Importe", column: true },
  { key: "totalsBlock", label: "Totales", text: true, resize: true },
  { key: "financingBlock", label: "Financiación", text: true, resize: true },
  { key: "observation", label: "Observación", text: true, resize: true },
  { key: "rmaBlock", label: "Políticas de RMA", text: true, resize: true, fixedContent: "rma" },
  { key: "footerText", label: "Pie de página", text: true, resize: true, fixedContent: "footer" },
];
const ALIGNS: Array<{ value: NonNullable<PdfLayoutStyle["textAlign"]>; label: string; icon: string }> = [
  { value: "left", label: "Izquierda", icon: "⇤" },
  { value: "center", label: "Centrado", icon: "↔" },
  { value: "right", label: "Derecha", icon: "⇥" },
  { value: "justify", label: "Justificado", icon: "☰" },
];
const ZOOMS = [0.5, 0.75, 1, 1.25] as const;
const HISTORY_LIMIT = 60;
type SidebarTab = "field" | "document" | "fields";

function ColorControl({ label, value, fallback, onChange }: {
  label: string; value?: string; fallback: string; onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="pdf-field">
      <span>{label}</span>
      <div className="pdf-color-row">
        <input type="color" aria-label={label} value={value ?? fallback} onChange={(e) => onChange(e.target.value)} />
        <code>{value ?? "Original"}</code>
        {value ? <button type="button" className="pdf-clear" aria-label={`Quitar ${label}`} onClick={() => onChange(undefined)}>×</button> : null}
      </div>
    </div>
  );
}

function NumberControl({ label, value, min, max, step = 1, onChange }: {
  label: string; value?: number; min: number; max: number; step?: number; onChange: (value: number | undefined) => void;
}) {
  return (
    <label>{label}
      <input type="number" min={min} max={max} step={step} placeholder="Original" value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Math.min(max, Math.max(min, Number(e.target.value))))} />
    </label>
  );
}

const FONTS = ["Segoe UI", "Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana"];
type EditorPdfLayoutStyle = PdfLayoutStyle & {hidden?: boolean};
type EditorPdfLayoutConfig = Omit<PdfLayoutConfig, "blocks"> & {
  blocks: Partial<Record<PdfLayoutBlockKey, EditorPdfLayoutStyle>>;
};
const EMPTY: EditorPdfLayoutConfig = { version: 1, blocks: {} };
const CSS_PX_PER_MM = 96 / 25.4;
const PAGE_WIDTH = 210 * CSS_PX_PER_MM;
const PAGE_HEIGHT = 297 * CSS_PX_PER_MM;
const PRINT_AREA = {
  left: 12 * CSS_PX_PER_MM,
  top: 14 * CSS_PX_PER_MM,
  width: PAGE_WIDTH - 2 * 12 * CSS_PX_PER_MM,
  height: PAGE_HEIGHT - 2 * 14 * CSS_PX_PER_MM,
};
const SNAP_THRESHOLD = 5;

type BoxMap = Record<string, Box>;
type Box = { left: number; top: number; width: number; height: number };
type AlignmentGuides = { x?: number; y?: number };

export function PdfLayoutEditorView() {
  const [draft, setDraft] = useState<EditorPdfLayoutConfig>(EMPTY);
  const [saved, setSaved] = useState<EditorPdfLayoutConfig>(EMPTY);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [savedCompany, setSavedCompany] = useState<CompanySettings | null>(null);
  const [pdf, setPdf] = useState<PdfSettings | null>(null);
  const [savedPdf, setSavedPdf] = useState<PdfSettings | null>(null);
  const [html, setHtml] = useState("");
  const [selected, setSelected] = useState<string>("logo");
  const [boxes, setBoxes] = useState<BoxMap>({});
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({});
  const [logoAspectRatio, setLogoAspectRatio] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState(0.8);
  const [zoomMode, setZoomMode] = useState<"fit" | number>("fit");
  const [tab, setTab] = useState<SidebarTab>("field");
  const [historyTick, setHistoryTick] = useState(0);
  const historyRef = useRef<{ stack: EditorPdfLayoutConfig[]; index: number }>({ stack: [], index: -1 });
  const scale = zoomMode === "fit" ? fitScale : zoomMode;
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewRequestRef = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [row, companyRow, pdfRow] = await Promise.all([
        api<PdfLayoutSettings>("/settings/pdf-layout"),
        api<CompanySettings>("/settings/company"),
        api<PdfSettings>("/settings/pdf"),
      ]);
      setDraft(row.layout);
      setSaved(row.layout);
      historyRef.current = { stack: [row.layout], index: 0 };
      setHistoryTick((tick) => tick + 1);
      setCompany(companyRow);
      setSavedCompany(companyRow);
      setPdf(pdfRow);
      setSavedPdf(pdfRow);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const resize = () => setFitScale(Math.min(1, Math.max(0.35, host.clientWidth / PAGE_WIDTH)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) return;

      const direction = {
        ArrowLeft: {x: -1, y: 0},
        ArrowRight: {x: 1, y: 0},
        ArrowUp: {x: 0, y: -1},
        ArrowDown: {x: 0, y: 1},
      }[event.key];
      if (!direction) return;

      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const current = draftRef.current;
      const custom = current.customBlocks?.find((block) => block.id === selected);
      if (custom?.before) return;
      if (custom) {
        const nextX = Math.max(0, Math.min(800, custom.x + direction.x * step));
        const nextY = Math.max(0, Math.min(1200, custom.y + direction.y * step));
        const nextDraft = {
          ...current,
          customBlocks: current.customBlocks!.map((block) => block.id === selected ? {...block, x: nextX, y: nextY} : block),
        };
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        setBoxes((currentBoxes) => {
          const box = currentBoxes[selected];
          return box ? {...currentBoxes, [selected]: {...box, left: box.left + nextX - custom.x, top: box.top + nextY - custom.y}} : currentBoxes;
        });
        setNotice(null);
        return;
      }
      const style = current.blocks[selected as PdfLayoutBlockKey] ?? {};
      const currentX = style.x ?? 0;
      const currentY = style.y ?? 0;
      const nextX = Math.max(-200, Math.min(200, currentX + direction.x * step));
      const nextY = Math.max(-300, Math.min(300, currentY + direction.y * step));
      const deltaX = nextX - currentX;
      const deltaY = nextY - currentY;
      const nextDraft = {
        ...current,
        blocks: {
          ...current.blocks,
          [selected]: {...style, x: nextX, y: nextY},
        },
      };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setBoxes((currentBoxes) => {
        const box = currentBoxes[selected];
        if (!box) return currentBoxes;
        return {
          ...currentBoxes,
          [selected]: {
            ...box,
            left: box.left + deltaX,
            top: box.top + deltaY,
          },
        };
      });
      setNotice(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  /** Guarda un punto de historial si el borrador cambió (los arrastres se agrupan por debounce). */
  const commitHistory = useCallback(() => {
    const history = historyRef.current;
    if (history.index < 0) return;
    const current = draftRef.current;
    if (JSON.stringify(history.stack[history.index]) === JSON.stringify(current)) return;
    history.stack = [...history.stack.slice(0, history.index + 1), current].slice(-HISTORY_LIMIT);
    history.index = history.stack.length - 1;
    setHistoryTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(commitHistory, 450);
    return () => window.clearTimeout(timer);
  }, [draft, commitHistory]);

  const undo = useCallback(() => {
    commitHistory();
    const history = historyRef.current;
    if (history.index <= 0) return;
    history.index -= 1;
    const previous = history.stack[history.index]!;
    draftRef.current = previous;
    setDraft(previous);
    setHistoryTick((tick) => tick + 1);
  }, [commitHistory]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    if (history.index >= history.stack.length - 1) return;
    history.index += 1;
    const next = history.stack[history.index]!;
    draftRef.current = next;
    setDraft(next);
    setHistoryTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (loading || !company || !pdf) return;
    const timer = window.setTimeout(async () => {
      const requestId = ++previewRequestRef.current;
      setPreviewing(true);
      try {
        const result = await api<{ html: string }>("/settings/pdf-layout/preview", {
          method: "POST",
          body: {
            layout: draft,
            companyText: {
              name: company.name,
              taxCondition: company.taxCondition,
              cuit: company.cuit,
              grossIncome: company.grossIncome,
              activityStart: company.activityStart,
              address: company.address,
              phones: company.phones,
              footerText: company.footerText,
              rmaUrl: company.rmaUrl,
            },
            pdfText: {
              builtPcTitle: pdf.builtPcTitle,
              builtPcDescription: pdf.builtPcDescription,
              assemblyText: pdf.assemblyText,
              installText: pdf.installText,
              windowsText: pdf.windowsText,
              driversText: pdf.driversText,
              estimatedDelay: pdf.estimatedDelay,
              rmaText: pdf.rmaText,
            },
          },
        });
        if (requestId !== previewRequestRef.current) return;
        setHtml(result.html);
        setError(null);
      } catch (err) {
        if (requestId !== previewRequestRef.current) return;
        setError(errorMessage(err));
      } finally {
        if (requestId === previewRequestRef.current) setPreviewing(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [company, draft, loading, pdf]);

  const syncBoxes = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const next: BoxMap = {};
    const hidden = new Set<string>();
    const customKeys = (draftRef.current.customBlocks ?? []).map((block) => ({key: block.id}));
    for (const block of [...BLOCKS, ...customKeys]) {
      const element = doc.querySelector<HTMLElement>(`[data-pdf-block="${"label" in block ? block.key : "custom:" + block.key}"]`);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        hidden.add(block.key);
        continue;
      }
      next[block.key] = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      if (block.key === "logo" && element instanceof doc.defaultView!.HTMLImageElement) {
        const ratio =
          element.naturalWidth > 0 && element.naturalHeight > 0
            ? element.naturalWidth / element.naturalHeight
            : rect.width / rect.height;
        if (Number.isFinite(ratio) && ratio > 0) {
          setLogoAspectRatio(ratio);
          // Sanea layouts anteriores que guardaban ancho y alto independientes.
          setDraft((current) => {
            const old = current.blocks.logo;
            if (!old?.height) return current;
            const { height, ...rest } = old;
            const width = old.width ?? Math.round(height * ratio);
            return {
              ...current,
              blocks: {...current.blocks, logo: {...rest, width}},
            };
          });
        }
      }
    }
    setBoxes(next);
    setSelected((current) => {
      const meta = BLOCKS.find((block) => block.key === current);
      if (meta?.column || meta?.fixedContent || hidden.has(current) || next[current]) return current;
      if (draftRef.current.customBlocks?.some((block) => block.id === current)) return current;
      return BLOCKS.find((block) => next[block.key])?.key ?? current;
    });
  }, []);

  const handleFrameLoad = useCallback(() => {
    syncBoxes();
    window.requestAnimationFrame(syncBoxes);
    window.setTimeout(syncBoxes, 150);
  }, [syncBoxes]);

  const selectedCustom = draft.customBlocks?.find((block) => block.id === selected);
  const selectedMeta = BLOCKS.find((block) => block.key === selected) ?? BLOCKS[0]!;
  const style = draft.blocks[selected as PdfLayoutBlockKey] ?? {};
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved)
      || JSON.stringify(company) !== JSON.stringify(savedCompany)
      || JSON.stringify(pdf) !== JSON.stringify(savedPdf),
    [company, draft, pdf, saved, savedCompany, savedPdf],
  );

  function patchStyle(patch: Partial<EditorPdfLayoutStyle>) {
    setDraft((current) => ({
      ...current,
      blocks: {
        ...current.blocks,
        [selected]: { ...(current.blocks[selected as PdfLayoutBlockKey] ?? {}), ...patch },
      },
    }));
    setNotice(null);
  }

  const doc: PdfLayoutDocument = draft.document ?? {};
  const activePreset = matchingPresetId(draft.document);
  const canUndo = historyTick >= 0 && historyRef.current.index > 0;
  const canRedo = historyTick >= 0 && historyRef.current.index < historyRef.current.stack.length - 1;

  function patchDocument(patch: Partial<PdfLayoutDocument>) {
    setDraft((current) => {
      const merged = Object.fromEntries(
        Object.entries({ ...(current.document ?? {}), ...patch }).filter(([, value]) => value !== undefined),
      ) as PdfLayoutDocument;
      const { document: _previous, ...rest } = current;
      return Object.keys(merged).length ? { ...rest, document: merged } : rest;
    });
    setNotice(null);
  }

  function applyPreset(preset: PdfPreset) {
    setDraft((current) => {
      const { document: _previous, ...rest } = current;
      return preset.document ? { ...rest, document: { ...preset.document } } : rest;
    });
    setNotice(null);
  }

  function patchCustom(id: string, patch: Partial<PdfCustomBlock>) {
    setDraft((current) => ({
      ...current,
      customBlocks: (current.customBlocks ?? []).map((block) => block.id === id ? {...block, ...patch} : block),
    }));
    setNotice(null);
  }

  function addTextBlock() {
    const id = `t${Date.now().toString(36)}`;
    // Entra al final del documento (última capa); se reubica desde "Campos" sin tocar el resto.
    const block: PdfCustomBlock = {id, text: "Nuevo texto", x: 0, y: 0, width: 720, fontSize: 12, before: "end"};
    setDraft((current) => ({...current, customBlocks: [...(current.customBlocks ?? []), block]}));
    setSelected(id);
    setTab("field");
    setNotice(null);
  }

  function moveLayer(id: string, delta: -1 | 1) {
    setDraft((current) => ({ ...current, customBlocks: moveCustomLayer(current.customBlocks ?? [], id, delta) }));
    setNotice(null);
  }

  function removeCustom(id: string) {
    setDraft((current) => {
      const customBlocks = (current.customBlocks ?? []).filter((block) => block.id !== id);
      const {customBlocks: _old, ...rest} = current;
      return customBlocks.length ? {...rest, customBlocks} : rest;
    });
    setSelected("logo");
  }

  function patchLogoWidth(width: number | undefined) {
    setDraft((current) => {
      const {height: _height, ...logo} = current.blocks.logo ?? {};
      return {
        ...current,
        blocks: {...current.blocks, logo: {...logo, width}},
      };
    });
    setNotice(null);
  }

  function startPointer(
    event: React.PointerEvent,
    rawKey: string,
    mode: "move" | "resize",
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelected(rawKey);
    const startX = event.clientX;
    const startY = event.clientY;
    const box = boxes[rawKey];
    if (!box) return;
    const customStart = draft.customBlocks?.find((block) => block.id === rawKey);
    if (customStart?.before && mode === "move") return;
    if (customStart) {
      setAlignmentGuides({});
      const onCustomMove = (move: PointerEvent) => {
        const dx = (move.clientX - startX) / scale;
        const dy = (move.clientY - startY) / scale;
        const nextX = Math.max(0, Math.min(800, Math.round(customStart.x + dx)));
        const nextY = Math.max(0, Math.min(1200, Math.round(customStart.y + dy)));
        const nextWidth = Math.max(24, Math.min(720, Math.round(customStart.width + dx)));
        setBoxes((current) => ({
          ...current,
          [rawKey]: mode === "move"
            ? {...box, left: box.left + nextX - customStart.x, top: box.top + nextY - customStart.y}
            : {...box, width: box.width + nextWidth - customStart.width},
        }));
        patchCustom(rawKey, mode === "move" ? {x: nextX, y: nextY} : {width: nextWidth});
      };
      const onCustomUp = () => {
        window.removeEventListener("pointermove", onCustomMove);
        window.removeEventListener("pointerup", onCustomUp);
        window.removeEventListener("pointercancel", onCustomUp);
      };
      window.addEventListener("pointermove", onCustomMove);
      window.addEventListener("pointerup", onCustomUp);
      window.addEventListener("pointercancel", onCustomUp);
      return;
    }
    const key = rawKey as PdfLayoutBlockKey;
    const initial = draft.blocks[key] ?? {};
    setAlignmentGuides({});
    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - startX) / scale;
      const dy = (move.clientY - startY) / scale;
      const initialX = initial.x ?? 0;
      const initialY = initial.y ?? 0;
      let nextX = Math.max(-200, Math.min(200, Math.round(initialX + dx)));
      let nextY = Math.max(-300, Math.min(300, Math.round(initialY + dy)));
      const initialWidth = initial.width ?? box.width;
      const initialHeight = initial.height ?? box.height;
      const logoRatio = key === "logo" ? (logoAspectRatio ?? box.width / box.height) : null;
      const logoDelta =
        logoRatio && Math.abs(dy * logoRatio) > Math.abs(dx) ? dy * logoRatio : dx;
      const nextWidth = Math.min(
        720,
        Math.max(24, Math.round(initialWidth + (logoRatio ? logoDelta : dx))),
      );
      const nextHeight = logoRatio
        ? nextWidth / logoRatio
        : Math.min(1000, Math.max(12, Math.round(initialHeight + dy)));
      let guides: AlignmentGuides = {};
      if (mode === "move") {
        const movingLeft = box.left + nextX - initialX;
        const movingTop = box.top + nextY - initialY;
        const movingX = [movingLeft, movingLeft + box.width / 2, movingLeft + box.width];
        const movingY = [movingTop, movingTop + box.height / 2, movingTop + box.height];
        const targetX = [
          PRINT_AREA.left,
          PRINT_AREA.left + PRINT_AREA.width / 2,
          PRINT_AREA.left + PRINT_AREA.width,
        ];
        const targetY = [
          PRINT_AREA.top,
          PRINT_AREA.top + PRINT_AREA.height / 2,
          PRINT_AREA.top + PRINT_AREA.height,
        ];
        for (const [otherKey, otherBox] of Object.entries(boxes)) {
          if (otherKey === key || !otherBox) continue;
          targetX.push(otherBox.left, otherBox.left + otherBox.width / 2, otherBox.left + otherBox.width);
          targetY.push(otherBox.top, otherBox.top + otherBox.height / 2, otherBox.top + otherBox.height);
        }
        let snapX: { delta: number; guide: number } | undefined;
        let snapY: { delta: number; guide: number } | undefined;
        for (const movingEdge of movingX) {
          for (const targetEdge of targetX) {
            const delta = targetEdge - movingEdge;
            if (Math.abs(delta) <= SNAP_THRESHOLD && (!snapX || Math.abs(delta) < Math.abs(snapX.delta))) {
              snapX = {delta, guide: targetEdge};
            }
          }
        }
        for (const movingEdge of movingY) {
          for (const targetEdge of targetY) {
            const delta = targetEdge - movingEdge;
            if (Math.abs(delta) <= SNAP_THRESHOLD && (!snapY || Math.abs(delta) < Math.abs(snapY.delta))) {
              snapY = {delta, guide: targetEdge};
            }
          }
        }
        if (snapX) {
          const snappedX = Math.max(-200, Math.min(200, nextX + snapX.delta));
          if (snappedX === nextX + snapX.delta) {
            nextX = snappedX;
            guides.x = snapX.guide;
          }
        }
        if (snapY) {
          const snappedY = Math.max(-300, Math.min(300, nextY + snapY.delta));
          if (snappedY === nextY + snapY.delta) {
            nextY = snappedY;
            guides.y = snapY.guide;
          }
        }
      }
      setAlignmentGuides(guides);
      setBoxes((current) => ({
        ...current,
        [key]: mode === "move"
          ? {
              ...box,
              left: box.left + nextX - initialX,
              top: box.top + nextY - initialY,
            }
          : {
              ...box,
              width: box.width + nextWidth - initialWidth,
              height: box.height + nextHeight - initialHeight,
            },
      }));
      setDraft((current) => ({
        ...current,
        blocks: {
          ...current.blocks,
          [key]: mode === "move"
            ? {
                ...(current.blocks[key] ?? {}),
                x: nextX,
                y: nextY,
              }
            : {
                ...(current.blocks[key] ?? {}),
                width: nextWidth,
                ...(key === "logo" ? {height: undefined} : {height: nextHeight}),
              },
        },
      }));
    };
    const onUp = () => {
      setAlignmentGuides({});
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  async function save() {
    if (!company || !pdf) return;
    setSaving(true);
    setError(null);
    try {
      const {id: _companyId, updatedAt: _companyUpdatedAt, ...companyBody} = company;
      const {id: _pdfId, updatedAt: _pdfUpdatedAt, ...pdfBody} = pdf;
      delete (pdfBody as Record<string, unknown>).layoutJson;
      const [row, savedCompanyRow, savedPdfRow] = await Promise.all([
        api<PdfLayoutSettings>("/settings/pdf-layout", {method: "PUT", body: draft}),
        api<CompanySettings>("/settings/company", {method: "PUT", body: companyBody}),
        api<PdfSettings>("/settings/pdf", {method: "PUT", body: pdfBody}),
      ]);
      setDraft(row.layout);
      setSaved(row.layout);
      setCompany(savedCompanyRow);
      setSavedCompany(savedCompanyRow);
      setPdf(savedPdfRow);
      setSavedPdf(savedPdfRow);
      setNotice("Diseño y textos del PDF guardados.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft(EMPTY);
    setNotice("Se restauró la vista previa. Presioná Guardar para confirmar.");
  }

  if (loading) return <Loading label="Cargando editor de PDF…" />;
  if (!company || !pdf) return <Alert>{error ?? "No se pudieron cargar los textos del PDF."}</Alert>;

  return (
    <div className="pdf-editor-view">
      <PageHeader
        eyebrow="Diseño"
        title="Editor visual del PDF"
        subtitle="Arrastrá y redimensioná los campos y agregá bloques de texto propios. El mismo diseño se usa en PDF Simple y Detallado."
        actions={
          <div className="row-actions">
            <button className="btn-ghost" type="button" onClick={addTextBlock}>+ Agregar texto</button>
            <button className="btn-ghost" type="button" onClick={reset}>Restablecer valores por defecto</button>
            <button className="btn-primary" type="button" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}
      <div className="pdf-mobile-notice" role="status">
        <strong>El editor visual de PDF se usa mejor desde una computadora</strong>
        <p>La hoja A4 necesita una pantalla grande para arrastrar y redimensionar los campos con precisión. Abrí esta sección desde una computadora para editar el diseño.</p>
      </div>
      <div className="pdf-editor-grid">
        <section className="pdf-preview-panel">
          <div className="pdf-preview-toolbar">
            <span>Vista previa A4 · muestra detallada</span>
            <div className="pdf-toolbar-tools">
              <button type="button" className="btn-ghost btn-sm" disabled={!canUndo} onClick={undo} title="Deshacer (Ctrl+Z)">↶ Deshacer</button>
              <button type="button" className="btn-ghost btn-sm" disabled={!canRedo} onClick={redo} title="Rehacer (Ctrl+Y)">↷ Rehacer</button>
              <select aria-label="Zoom" value={String(zoomMode)} onChange={(e) => setZoomMode(e.target.value === "fit" ? "fit" : Number(e.target.value))}>
                <option value="fit">Ajustar ({Math.round(fitScale * 100)}%)</option>
                {ZOOMS.map((zoom) => <option key={zoom} value={zoom}>{Math.round(zoom * 100)}%</option>)}
              </select>
              <span>{previewing ? "Actualizando…" : ""}</span>
            </div>
          </div>
          <div ref={hostRef} className="pdf-page-host" style={{ height: PAGE_HEIGHT * scale }}>
            <div
              className="pdf-page-scaled"
              style={{
                width: PAGE_WIDTH,
                height: PAGE_HEIGHT,
                left: Math.max(0, (hostRef.current?.clientWidth ?? 0) / 2 - (PAGE_WIDTH * scale) / 2),
                transform: `scale(${scale})`,
              }}
            >
              <iframe
                ref={frameRef}
                title="Vista previa del presupuesto"
                srcDoc={html}
                style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
                onLoad={handleFrameLoad}
              />
              <div className="pdf-block-overlay">
                <div
                  className="pdf-print-area"
                  style={PRINT_AREA}
                  aria-hidden="true"
                >
                  <span>Área imprimible</span>
                </div>
                {BLOCKS.filter((block) => !block.column).map((block) => {
                  const box = boxes[block.key];
                  if (!box) return null;
                  return (
                    <button
                      key={block.key}
                      type="button"
                      title={block.label}
                      className={selected === block.key ? "pdf-block-box selected" : "pdf-block-box"}
                      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                      onPointerDown={(event) => startPointer(event, block.key, "move")}
                      onClick={() => { setSelected(block.key); setTab("field"); }}
                    >
                      <span>{block.label}</span>
                      {block.resize ? (
                        <i onPointerDown={(event) => startPointer(event, block.key, "resize")} />
                      ) : null}
                    </button>
                  );
                })}
                {(draft.customBlocks ?? []).map((block) => {
                  const box = boxes[block.id];
                  if (!box) return null;
                  return (
                    <button
                      key={block.id}
                      type="button"
                      title="Texto"
                      className={selected === block.id ? "pdf-block-box selected" : "pdf-block-box"}
                      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                      onPointerDown={(event) => startPointer(event, block.id, "move")}
                      onClick={() => setSelected(block.id)}
                    >
                      <span>Texto</span>
                      <i onPointerDown={(event) => startPointer(event, block.id, "resize")} />
                    </button>
                  );
                })}
                {alignmentGuides.x !== undefined ? (
                  <div className="pdf-alignment-guide vertical" style={{left: alignmentGuides.x}} />
                ) : null}
                {alignmentGuides.y !== undefined ? (
                  <div className="pdf-alignment-guide horizontal" style={{top: alignmentGuides.y}} />
                ) : null}
              </div>
            </div>
          </div>
        </section>
        <aside className="pdf-properties">
          <div className="pdf-tabs" role="tablist">
            {([["field", "Campo"], ["document", "Documento"], ["fields", "Campos"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "document" ? (
            <>
          <h2>Estilo del documento</h2>
          <p>Se aplica a todo el PDF (Simple y Detallado). Lo que dejes en “Original” conserva el diseño de la plantilla.</p>
          <div className="pdf-presets">
            {PDF_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={activePreset === preset.id ? "pdf-preset active" : "pdf-preset"}
                title={preset.description}
                onClick={() => applyPreset(preset)}
              >
                <span className="pdf-preset-swatches" aria-hidden="true">
                  <i style={{ background: preset.document?.accentColor ?? "#d4171e" }} />
                  <i style={{ background: preset.document?.tableHeaderBg ?? "#111111" }} />
                  <i style={{ background: preset.document?.cardBackground ?? "#fafafa" }} />
                </span>
                <strong>{preset.name}</strong>
                <small>{preset.description}</small>
              </button>
            ))}
          </div>
          <hr />
          <h3>Colores y texto</h3>
          <ColorControl label="Color de acento" value={doc.accentColor} fallback="#d4171e" onChange={(v) => patchDocument({ accentColor: v })} />
          <ColorControl label="Color del texto" value={doc.textColor} fallback="#1a1a1a" onChange={(v) => patchDocument({ textColor: v })} />
          <label>Tipografía general
            <select value={doc.fontFamily ?? ""} onChange={(e) => patchDocument({ fontFamily: e.target.value || undefined })}>
              <option value="">Original</option>
              {FONTS.map((font) => <option key={font}>{font}</option>)}
            </select>
          </label>
          <hr />
          <h3>Tabla de artículos</h3>
          <ColorControl label="Fondo de la cabecera" value={doc.tableHeaderBg} fallback="#111111" onChange={(v) => patchDocument({ tableHeaderBg: v })} />
          <ColorControl label="Texto de la cabecera" value={doc.tableHeaderColor} fallback="#ffffff" onChange={(v) => patchDocument({ tableHeaderColor: v })} />
          <ColorControl label="Color de las líneas" value={doc.tableBorderColor} fallback="#e5e5e5" onChange={(v) => patchDocument({ tableBorderColor: v })} />
          <label>Altura de las filas
            <select value={doc.tableDensity ?? ""} onChange={(e) => patchDocument({ tableDensity: (e.target.value || undefined) as PdfLayoutDocument["tableDensity"] })}>
              <option value="">Original</option>
              <option value="compact">Compacta</option>
              <option value="normal">Normal</option>
              <option value="comfortable">Amplia</option>
            </select>
          </label>
          <label className="pdf-check">
            <input type="checkbox" checked={doc.tableZebra === true} onChange={(e) => patchDocument({ tableZebra: e.target.checked ? true : undefined })} />
            Filas alternadas (cebra)
          </label>
          <hr />
          <h3>Tarjetas y recuadros</h3>
          <NumberControl label="Bordes redondeados (px)" value={doc.cardRadius} min={0} max={24} onChange={(v) => patchDocument({ cardRadius: v })} />
          <ColorControl label="Fondo" value={doc.cardBackground} fallback="#fafafa" onChange={(v) => patchDocument({ cardBackground: v })} />
          <ColorControl label="Color del borde" value={doc.cardBorderColor} fallback="#d8d8d8" onChange={(v) => patchDocument({ cardBorderColor: v })} />
          <button type="button" className="btn-ghost" disabled={!Object.keys(doc).length} onClick={() => applyPreset(PDF_PRESETS[0]!)}>
            Quitar estilo del documento
          </button>
            </>
          ) : tab === "fields" ? (
            <>
          <h2>Capas</h2>
          <p className="section-note">De arriba hacia abajo. Los campos propios se intercalan entre las secciones fijas: subilos o bajalos y el resto se acomoda solo.</p>
          <ol className="pdf-layer-list">
            {(() => {
              const layers = buildLayers(draft.customBlocks);
              return layers.map((layer, index) => layer.kind === "section" ? (
                <li key={layer.key} className="pdf-layer section">
                  <span className="pdf-layer-n">{index + 1}</span>
                  <span className="pdf-layer-name">{layer.label}</span>
                  <small>Sección fija</small>
                </li>
              ) : (
                <li key={layer.block.id} className={`pdf-layer custom${selected === layer.block.id ? " active" : ""}`} style={layer.block.hidden ? { opacity: 0.55 } : undefined}>
                  <span className="pdf-layer-n">{index + 1}</span>
                  <button type="button" className="pdf-layer-name" onClick={() => { setSelected(layer.block.id); setTab("field"); }}>
                    {layer.block.text.slice(0, 26) || "Texto vacío"}
                  </button>
                  <span className="pdf-layer-move">
                    <button type="button" aria-label="Subir capa" title="Subir" disabled={index === 0} onClick={() => moveLayer(layer.block.id, -1)}>↑</button>
                    <button type="button" aria-label="Bajar capa" title="Bajar" disabled={index === layers.length - 1} onClick={() => moveLayer(layer.block.id, 1)}>↓</button>
                  </span>
                </li>
              ));
            })()}
          </ol>
          <button className="btn-ghost" type="button" onClick={addTextBlock}>+ Agregar campo de texto</button>
          {(draft.customBlocks ?? []).filter((block) => !block.before).length ? <h3 className="pdf-layer-sub">Campos libres (posición X/Y)</h3> : null}
          <div className="pdf-field-list">
          {(draft.customBlocks ?? []).filter((block) => !block.before).map((block, index) => (
            <button
              key={block.id}
              type="button"
              className={selected === block.id ? "pdf-field-link active" : "pdf-field-link"}
              onClick={() => { setSelected(block.id); setTab("field"); }}
              style={block.hidden ? {opacity: 0.55} : undefined}
            >
              {`Texto libre ${index + 1}: ${block.text.slice(0, 18) || "vacío"}`}
              <span>{block.hidden ? "Oculto" : "Posición libre"}</span>
            </button>
          ))}
          </div>
          <h3 className="pdf-layer-sub">Campos de la hoja</h3>
          <div className="pdf-field-list">
          {BLOCKS.map((block) => {
            const isHidden = draft.blocks[block.key]?.hidden === true;
            return (
              <button
                key={block.key}
                type="button"
                className={selected === block.key ? "pdf-field-link active" : "pdf-field-link"}
                disabled={!isHidden && !block.column && !block.fixedContent && !boxes[block.key]}
                onClick={() => { setSelected(block.key); setTab("field"); }}
                style={isHidden ? {opacity: 0.55} : undefined}
              >
                {block.label}{isHidden ? " (oculto)" : ""}
                <span>
                  {isHidden
                    ? "Oculto"
                    : block.fixedContent
                    ? "Texto fijo"
                    : block.column
                    ? `${draft.blocks[block.key]?.width ?? "Original"}`
                    : boxes[block.key]
                      ? "Visible"
                      : "No aparece"}
                </span>
              </button>
            );
          })}
          </div>
            </>
          ) : (<>
          {selectedCustom ? (
            <div className="pdf-custom-editor">
              <h2>Bloque de texto</h2>
              <label>Contenido
                <textarea rows={5} value={selectedCustom.text} onChange={(e) => patchCustom(selectedCustom.id, { text: e.target.value })} />
              </label>
              <label>Ubicación (capa)
                <select
                  value={selectedCustom.before ?? "free"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "free") patchCustom(selectedCustom.id, { before: undefined, width: Math.min(selectedCustom.width, 480), x: selectedCustom.x || 40, y: selectedCustom.y || 40 });
                    else patchCustom(selectedCustom.id, { before: v as NonNullable<PdfCustomBlock["before"]> });
                  }}
                >
                  {PDF_SECTIONS.map((section) => <option key={section.key} value={section.key}>Antes de: {section.label}</option>)}
                  <option value="end">Al final del documento</option>
                  <option value="free">Libre (posición X/Y)</option>
                </select>
              </label>
              {selectedCustom.before ? (
                <p className="section-note">En el flujo: se ubica por capa y empuja el contenido, sin superponerse. Cambiá el orden desde la pestaña Campos.</p>
              ) : (
              <div className="pdf-property-pair">
                <label>Posición X <input type="number" min={0} max={800} value={selectedCustom.x} onChange={(e) => patchCustom(selectedCustom.id, { x: Math.max(0, Math.min(800, Number(e.target.value) || 0)) })} /></label>
                <label>Posición Y <input type="number" min={0} max={1200} value={selectedCustom.y} onChange={(e) => patchCustom(selectedCustom.id, { y: Math.max(0, Math.min(1200, Number(e.target.value) || 0)) })} /></label>
              </div>
              )}
              <div className="pdf-property-pair">
                <label>Ancho <input type="number" min={24} max={720} value={selectedCustom.width} onChange={(e) => patchCustom(selectedCustom.id, { width: Math.max(24, Math.min(720, Number(e.target.value) || 24)) })} /></label>
                <label>Tamaño de letra <input type="number" min={6} max={72} value={selectedCustom.fontSize ?? 12} onChange={(e) => patchCustom(selectedCustom.id, { fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 12)) })} /></label>
              </div>
              <label>Color <input type="color" value={selectedCustom.color ?? "#111111"} onChange={(e) => patchCustom(selectedCustom.id, { color: e.target.value })} /></label>
              <label>Tipografía
                <select value={selectedCustom.fontFamily ?? ""} onChange={(e) => patchCustom(selectedCustom.id, { fontFamily: e.target.value || undefined })}>
                  <option value="">Original</option>
                  {FONTS.map((font) => <option key={font}>{font}</option>)}
                </select>
              </label>
              <div className="pdf-property-pair">
                <label>Peso
                  <select value={selectedCustom.fontWeight ?? ""} onChange={(e) => patchCustom(selectedCustom.id, { fontWeight: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">Normal</option>
                    <option value="600">Seminegrita</option><option value="700">Negrita</option><option value="800">Extra negrita</option>
                  </select>
                </label>
                <label>Alineación
                  <select value={selectedCustom.align ?? "left"} onChange={(e) => patchCustom(selectedCustom.id, { align: e.target.value as "left" | "center" | "right" })}>
                    <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn-ghost" onClick={() => patchCustom(selectedCustom.id, { hidden: !selectedCustom.hidden })}>
                {selectedCustom.hidden ? "Mostrar bloque" : "Ocultar bloque"}
              </button>
              <button type="button" className="btn-danger" onClick={() => removeCustom(selectedCustom.id)}>Eliminar bloque</button>
            </div>
          ) : (
          <>
          <h2>{selectedMeta.label}</h2>
          {selectedMeta.fixedContent ? (
            <div className="pdf-fixed-content-editor">
              <div className="pdf-content-kind fixed">Texto fijo editable</div>
              {selectedMeta.fixedContent === "companyName" ? (
                <label>Nombre de la empresa
                  <input value={company.name} onChange={(event) => setCompany({...company, name: event.target.value})} />
                </label>
              ) : null}
              {selectedMeta.fixedContent === "taxCondition" ? (
                <label>Condición fiscal
                  <input value={company.taxCondition} onChange={(event) => setCompany({...company, taxCondition: event.target.value})} />
                </label>
              ) : null}
              {selectedMeta.fixedContent === "fiscal" ? (
                <>
                  <label>CUIT <input value={company.cuit} onChange={(event) => setCompany({...company, cuit: event.target.value})} /></label>
                  <label>Ingresos Brutos <input value={company.grossIncome} onChange={(event) => setCompany({...company, grossIncome: event.target.value})} /></label>
                  <label>Inicio de actividad <input value={company.activityStart} onChange={(event) => setCompany({...company, activityStart: event.target.value})} /></label>
                  <label>Domicilio <textarea rows={2} value={company.address} onChange={(event) => setCompany({...company, address: event.target.value})} /></label>
                </>
              ) : null}
              {selectedMeta.fixedContent === "builtPc" ? (
                <>
                  <p className="pdf-content-note">La tabla contiene datos variables. Sólo estos textos de la línea principal de PC armada son fijos.</p>
                  <label>Título de PC armada <textarea rows={2} value={pdf.builtPcTitle} onChange={(event) => setPdf({...pdf, builtPcTitle: event.target.value})} /></label>
                  <label>Descripción de PC armada <textarea rows={2} value={pdf.builtPcDescription} onChange={(event) => setPdf({...pdf, builtPcDescription: event.target.value})} /></label>
                </>
              ) : null}
              {selectedMeta.fixedContent === "services" ? (
                <>
                  <label>Texto de armado <textarea rows={2} value={pdf.assemblyText} onChange={(event) => setPdf({...pdf, assemblyText: event.target.value})} /></label>
                  <label>Texto de instalación <textarea rows={2} value={pdf.installText} onChange={(event) => setPdf({...pdf, installText: event.target.value})} /></label>
                  <label>Texto de Windows <textarea rows={2} value={pdf.windowsText} onChange={(event) => setPdf({...pdf, windowsText: event.target.value})} /></label>
                  <label>Texto de drivers <textarea rows={2} value={pdf.driversText} onChange={(event) => setPdf({...pdf, driversText: event.target.value})} /></label>
                  <label>Plazo estimado <textarea rows={2} value={pdf.estimatedDelay} onChange={(event) => setPdf({...pdf, estimatedDelay: event.target.value})} /></label>
                </>
              ) : null}
              {selectedMeta.fixedContent === "rma" ? (
                <>
                  <label>Texto de aceptación de garantía
                    <textarea rows={7} value={pdf.rmaText} onChange={(event) => setPdf({...pdf, rmaText: event.target.value})} />
                  </label>
                  <label>URL de políticas RMA
                    <input type="url" value={company.rmaUrl} onChange={(event) => setCompany({...company, rmaUrl: event.target.value})} />
                  </label>
                  <small>Usá <code>{"{rmaUrl}"}</code> para elegir dónde aparece el enlace. Si no lo incluís, se agrega al final.</small>
                </>
              ) : null}
              {selectedMeta.fixedContent === "footer" ? (
                <>
                  <label>Texto del pie <textarea rows={3} value={company.footerText} onChange={(event) => setCompany({...company, footerText: event.target.value})} /></label>
                  <label>Domicilio <textarea rows={2} value={company.address} onChange={(event) => setCompany({...company, address: event.target.value})} /></label>
                  <label>Teléfonos <input value={company.phones} onChange={(event) => setCompany({...company, phones: event.target.value})} /></label>
                </>
              ) : null}
            </div>
          ) : (
            <div className="pdf-content-kind variable">Contenido variable o texto de plantilla</div>
          )}
          <p>Los controles vacíos de diseño conservan el estilo original.</p>
          {!selectedMeta.column ? (
            <div className="pdf-property-pair">
              <label>Posición X <input type="number" min={-200} max={200} value={style.x ?? ""} onChange={(e) => patchStyle({ x: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
              <label>Posición Y <input type="number" min={-300} max={300} value={style.y ?? ""} onChange={(e) => patchStyle({ y: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
            </div>
          ) : null}
          {selectedMeta.resize || selectedMeta.column ? (
            <div className="pdf-property-pair">
              <label>{selected === "logo" ? "Tamaño (ancho)" : "Ancho"} <input type="number" min={24} max={720} value={style.width ?? ""} onChange={(e) => {
                const width = e.target.value === "" ? undefined : Number(e.target.value);
                if (selected === "logo") patchLogoWidth(width);
                else patchStyle({width});
              }} /></label>
              {!selectedMeta.column && selected !== "logo" ? <label>Alto <input type="number" min={12} max={1000} value={style.height ?? ""} onChange={(e) => patchStyle({ height: e.target.value === "" ? undefined : Number(e.target.value) })} /></label> : null}
            </div>
          ) : null}
          {selected === "logo" ? (
            <small>
              La altura se calcula automáticamente según la proporción original
              {logoAspectRatio ? ` (${logoAspectRatio.toFixed(2)}:1)` : ""}.
            </small>
          ) : null}
          {selectedMeta.text ? (
            <>
              <label>Tamaño de letra <input type="number" min={6} max={48} value={style.fontSize ?? ""} onChange={(e) => patchStyle({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
              <ColorControl label="Color del texto" value={style.color} fallback="#111111" onChange={(v) => patchStyle({ color: v })} />
              <label>Tipografía
                <select value={style.fontFamily ?? ""} onChange={(e) => patchStyle({ fontFamily: e.target.value || undefined })}>
                  <option value="">Original</option>
                  {FONTS.map((font) => <option key={font}>{font}</option>)}
                </select>
              </label>
              <label>Peso
                <select value={style.fontWeight ?? ""} onChange={(e) => patchStyle({ fontWeight: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Original</option>
                  <option value="400">Normal</option><option value="600">Seminegrita</option><option value="700">Negrita</option><option value="800">Extra negrita</option>
                </select>
              </label>
            </>
          ) : null}
          {!selectedMeta.column ? (
            <>
              <hr />
              <h3>Apariencia</h3>
              {selectedMeta.text ? (
                <>
                  <div className="pdf-field">
                    <span>Alineación</span>
                    <div className="pdf-segmented" role="group" aria-label="Alineación del texto">
                      {ALIGNS.map((align) => (
                        <button
                          key={align.value}
                          type="button"
                          title={align.label}
                          aria-pressed={style.textAlign === align.value}
                          className={style.textAlign === align.value ? "active" : ""}
                          onClick={() => patchStyle({ textAlign: style.textAlign === align.value ? undefined : align.value })}
                        >{align.icon}</button>
                      ))}
                    </div>
                  </div>
                  <div className="pdf-property-pair">
                    <label className="pdf-check"><input type="checkbox" checked={style.italic === true} onChange={(e) => patchStyle({ italic: e.target.checked ? true : undefined })} /> Cursiva</label>
                    <label className="pdf-check"><input type="checkbox" checked={style.uppercase === true} onChange={(e) => patchStyle({ uppercase: e.target.checked ? true : undefined })} /> MAYÚSCULAS</label>
                  </div>
                  <NumberControl label="Interlineado" value={style.lineHeight} min={1} max={3} step={0.05} onChange={(v) => patchStyle({ lineHeight: v })} />
                </>
              ) : null}
              <ColorControl label="Fondo" value={style.background} fallback="#ffffff" onChange={(v) => patchStyle({ background: v })} />
              <div className="pdf-property-pair">
                <NumberControl label="Borde (px)" value={style.borderWidth} min={0} max={8} step={0.5} onChange={(v) => patchStyle({ borderWidth: v })} />
                <ColorControl label="Color del borde" value={style.borderColor} fallback="#cccccc" onChange={(v) => patchStyle({ borderColor: v })} />
              </div>
              <div className="pdf-property-pair">
                <NumberControl label="Redondeo (px)" value={style.borderRadius} min={0} max={24} onChange={(v) => patchStyle({ borderRadius: v })} />
                <NumberControl label="Espaciado interno (px)" value={style.padding} min={0} max={40} onChange={(v) => patchStyle({ padding: v })} />
              </div>
            </>
          ) : null}
          <button type="button" className="btn-ghost" onClick={() => {
            setDraft((current) => {
              const blocks = { ...current.blocks };
              delete blocks[selected as PdfLayoutBlockKey];
              return { ...current, blocks };
            });
          }}>Restaurar este campo</button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => patchStyle({hidden: !style.hidden})}
          >
            {style.hidden ? "Mostrar campo" : "Ocultar campo"}
          </button>
          </>
          )}
          <small>El servidor valida que el ancho total quede entre 620 y 720 px.</small>
        </>)}
        </aside>
      </div>
    </div>
  );
}
