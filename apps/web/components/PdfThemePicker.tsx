"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PdfLayoutConfig, PdfLayoutSettings } from "../lib/types";
import { PDF_PRESETS, matchingPresetId } from "../lib/pdf-presets";
import { errorMessage } from "./shared";

/** Estilos de presupuesto que se eligen con un toque desde Configuración (los demás se ven en el Editor de PDF). */
const CHOICES = ["original", "halloween", "navidad"] as const;

/** Elegir el estilo del presupuesto (Original, Halloween, Navidad) sin entrar al editor de diseño. */
export function PdfThemePicker() {
  const [layout, setLayout] = useState<PdfLayoutConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<PdfLayoutSettings>("/settings/pdf-layout")
      .then((row) => { if (alive) setLayout(row.layout); })
      .catch((e) => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, []);

  const active = layout ? matchingPresetId(layout.document) : null;

  async function choose(id: (typeof CHOICES)[number]) {
    if (!layout || busy) return;
    const preset = PDF_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setBusy(true);
    setError(null);
    try {
      const { document: _previous, ...rest } = layout;
      const next: PdfLayoutConfig = preset.document ? { ...rest, document: { ...preset.document } } : rest;
      const row = await api<PdfLayoutSettings>("/settings/pdf-layout", { method: "PUT", body: next });
      setLayout(row.layout);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-grid">
      <h3 className="panel-title">Tema del presupuesto</h3>
      <p className="muted">Se aplica al instante a los PDF nuevos. Para más estilos y ajustes finos, usá el Editor de PDF.</p>
      <div className="pdf-presets" role="radiogroup" aria-label="Tema del presupuesto">
        {CHOICES.map((id) => {
          const preset = PDF_PRESETS.find((p) => p.id === id)!;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active === id}
              disabled={!layout || busy}
              className={active === id ? "pdf-preset active" : "pdf-preset"}
              title={preset.description}
              onClick={() => choose(id)}
            >
              <span className="pdf-preset-swatches" aria-hidden="true">
                <i style={{ background: preset.document?.accentColor ?? "#d4171e" }} />
                <i style={{ background: preset.document?.tableHeaderBg ?? "#111111" }} />
                <i style={{ background: preset.document?.cardBackground ?? "#fafafa" }} />
              </span>
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </button>
          );
        })}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
