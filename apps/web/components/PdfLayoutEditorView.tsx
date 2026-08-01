"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  PdfLayoutBlockKey,
  PdfLayoutConfig,
  PdfLayoutSettings,
  PdfLayoutStyle,
} from "../lib/types";
import { Alert, Loading, PageHeader, errorMessage } from "./shared";

const BLOCKS: Array<{
  key: PdfLayoutBlockKey; label: string; text?: boolean; resize?: boolean; column?: boolean;
}> = [
  { key: "logo", label: "Logo", resize: true },
  { key: "companyName", label: "Nombre de la empresa", text: true, resize: true },
  { key: "companyTaxData", label: "Condición fiscal", text: true, resize: true },
  { key: "quoteTitle", label: "Título PRESUPUESTO", text: true, resize: true },
  { key: "quoteMeta", label: "Número y fecha del encabezado", text: true, resize: true },
  { key: "quoteData", label: "Datos del presupuesto", text: true, resize: true },
  { key: "companyFiscalData", label: "Datos fiscales", text: true, resize: true },
  { key: "servicesBlock", label: "Servicios incluidos", text: true, resize: true },
  { key: "itemsTable", label: "Tabla de artículos", text: true, resize: true },
  { key: "itemsTable.colCode", label: "Columna Código", column: true },
  { key: "itemsTable.colName", label: "Columna Artículo", column: true },
  { key: "itemsTable.colQty", label: "Columna Cantidad", column: true },
  { key: "itemsTable.colAmount", label: "Columna Importe", column: true },
  { key: "totalsBlock", label: "Totales", text: true, resize: true },
  { key: "financingBlock", label: "Financiación", text: true, resize: true },
  { key: "observation", label: "Observación", text: true, resize: true },
  { key: "rmaBlock", label: "Políticas de RMA", text: true, resize: true },
  { key: "footerText", label: "Pie de página", text: true, resize: true },
];
const FONTS = ["Segoe UI", "Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana"];
const EMPTY: PdfLayoutConfig = { version: 1, blocks: {} };
const CSS_PX_PER_MM = 96 / 25.4;
const PAGE_WIDTH = 210 * CSS_PX_PER_MM;
const PAGE_HEIGHT = 297 * CSS_PX_PER_MM;

type Box = { left: number; top: number; width: number; height: number };

export function PdfLayoutEditorView() {
  const [draft, setDraft] = useState<PdfLayoutConfig>(EMPTY);
  const [saved, setSaved] = useState<PdfLayoutConfig>(EMPTY);
  const [html, setHtml] = useState("");
  const [selected, setSelected] = useState<PdfLayoutBlockKey>("logo");
  const [boxes, setBoxes] = useState<Partial<Record<PdfLayoutBlockKey, Box>>>({});
  const [logoAspectRatio, setLogoAspectRatio] = useState<number | null>(null);
  const [scale, setScale] = useState(0.8);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewRequestRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await api<PdfLayoutSettings>("/settings/pdf-layout");
      setDraft(row.layout);
      setSaved(row.layout);
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
    const resize = () => setScale(Math.min(1, Math.max(0.35, host.clientWidth / PAGE_WIDTH)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(async () => {
      const requestId = ++previewRequestRef.current;
      setPreviewing(true);
      try {
        const result = await api<{ html: string }>("/settings/pdf-layout/preview", {
          method: "POST",
          body: { layout: draft },
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
  }, [draft, loading]);

  const syncBoxes = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const next: Partial<Record<PdfLayoutBlockKey, Box>> = {};
    for (const block of BLOCKS) {
      const element = doc.querySelector<HTMLElement>(`[data-pdf-block="${block.key}"]`);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
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
      if (meta?.column || next[current]) return current;
      return BLOCKS.find((block) => next[block.key])?.key ?? current;
    });
  }, []);

  const handleFrameLoad = useCallback(() => {
    syncBoxes();
    window.requestAnimationFrame(syncBoxes);
    window.setTimeout(syncBoxes, 150);
  }, [syncBoxes]);

  const selectedMeta = BLOCKS.find((block) => block.key === selected)!;
  const style = draft.blocks[selected] ?? {};
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  function patchStyle(patch: Partial<PdfLayoutStyle>) {
    setDraft((current) => ({
      ...current,
      blocks: {
        ...current.blocks,
        [selected]: { ...(current.blocks[selected] ?? {}), ...patch },
      },
    }));
    setNotice(null);
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
    key: PdfLayoutBlockKey,
    mode: "move" | "resize",
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelected(key);
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = draft.blocks[key] ?? {};
    const box = boxes[key];
    if (!box) return;
    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - startX) / scale;
      const dy = (move.clientY - startY) / scale;
      const initialX = initial.x ?? 0;
      const initialY = initial.y ?? 0;
      const nextX = Math.max(-200, Math.min(200, Math.round(initialX + dx)));
      const nextY = Math.max(-300, Math.min(300, Math.round(initialY + dy)));
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
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const row = await api<PdfLayoutSettings>("/settings/pdf-layout", { method: "PUT", body: draft });
      setDraft(row.layout);
      setSaved(row.layout);
      setNotice("Diseño del PDF guardado.");
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

  return (
    <div className="pdf-editor-view">
      <PageHeader
        eyebrow="Diseño"
        title="Editor visual del PDF"
        subtitle="Arrastrá y redimensioná los campos existentes. El mismo diseño se usa en PDF Simple y Detallado."
        actions={
          <div className="row-actions">
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
            <span>{previewing ? "Actualizando…" : `${Math.round(scale * 100)}%`}</span>
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
                      onClick={() => setSelected(block.key)}
                    >
                      <span>{block.label}</span>
                      {block.resize ? (
                        <i onPointerDown={(event) => startPointer(event, block.key, "resize")} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
        <aside className="pdf-properties">
          <h2>{selectedMeta.label}</h2>
          <p>Los campos vacíos conservan el valor original del diseño.</p>
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
              <label>Color <input type="color" value={style.color ?? "#111111"} onChange={(e) => patchStyle({ color: e.target.value })} /></label>
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
          <button type="button" className="btn-ghost" onClick={() => {
            setDraft((current) => {
              const blocks = { ...current.blocks };
              delete blocks[selected];
              return { ...current, blocks };
            });
          }}>Restaurar este campo</button>
          <hr />
          <h3>Todos los campos</h3>
          <div className="pdf-field-list">
          {BLOCKS.map((block) => (
            <button
              key={block.key}
              type="button"
              className={selected === block.key ? "pdf-field-link active" : "pdf-field-link"}
              disabled={!block.column && !boxes[block.key]}
              onClick={() => setSelected(block.key)}
            >
              {block.label}
              <span>
                {block.column
                  ? `${draft.blocks[block.key]?.width ?? "Original"}`
                  : boxes[block.key]
                    ? "Visible"
                    : "No aparece"}
              </span>
            </button>
          ))}
          </div>
          <small>El servidor valida que el ancho total quede entre 620 y 720 px.</small>
        </aside>
      </div>
    </div>
  );
}
