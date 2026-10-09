"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SKIN, SKINS, type SkinDef, type SkinId } from "../lib/skins";

/** Texto legible sobre un color de acento (blanco sobre oscuros, casi negro sobre claros). */
const onAccent = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#0b0b0d" : "#ffffff";
};

/** Vista previa en miniatura de un tema (usa su paleta y su tipografía; no depende del tema activo). */
function Preview({ skin, dark }: { skin: SkinDef; dark: boolean }) {
  const p = dark ? skin.dark : skin.light;
  return (
    <div className="skin-preview" style={{ background: p.bg, borderColor: p.line }} aria-hidden="true">
      <div className="skin-prev-side" style={{ background: p.side, borderColor: p.line }}>
        <i style={{ background: p.accent }} />
        <i style={{ background: p.muted, opacity: 0.45 }} />
        <i style={{ background: p.muted, opacity: 0.45 }} />
        <i style={{ background: p.muted, opacity: 0.45 }} />
      </div>
      <div className="skin-prev-main">
        <b style={{ color: p.ink, fontFamily: skin.fonts.display }}>Presupuestos</b>
        <div className="skin-prev-card" style={{ background: p.card, borderColor: p.line }}>
          <span style={{ background: p.muted, opacity: 0.5 }} />
          <span style={{ background: p.muted, opacity: 0.3, width: "55%" }} />
          <em style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})`, fontFamily: skin.fonts.body, color: onAccent(p.accent) }}>Crear</em>
        </div>
        <div className="skin-prev-chips">
          <u style={{ background: p.accent }} />
          <u style={{ background: p.accent2, opacity: 0.8 }} />
          <u style={{ background: p.muted, opacity: 0.4 }} />
        </div>
      </div>
    </div>
  );
}

/** Tarjetas para elegir tema. Se usa en Configuración → Temas y en el aviso de la primera vez. */
export function SkinPicker({ value, onSelect, compact = false, disabled = false }: { value: SkinId; onSelect: (id: SkinId) => void; compact?: boolean; disabled?: boolean }) {
  // Las miniaturas siguen el modo claro/oscuro actual para que se vea cómo quedaría.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`skin-grid${compact ? " compact" : ""}`} role="radiogroup" aria-label="Temas">
      {SKINS.map((skin, i) => {
        const active = skin.id === value;
        return (
          <button
            key={skin.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`skin-card${active ? " active" : ""}`}
            style={{ animationDelay: `${i * 55}ms` }}
            onClick={() => onSelect(skin.id)}
          >
            <Preview skin={skin} dark={dark} />
            <span className="skin-card-head">
              <strong>{skin.name}</strong>
              {skin.id === DEFAULT_SKIN ? <small className="skin-tag">Predeterminado</small> : null}
              {active ? <small className="skin-tag on">En uso</small> : null}
            </span>
            <span className="skin-card-tagline">{skin.tagline}</span>
            {compact ? null : (
              <>
                <span className="skin-card-desc">{skin.description}</span>
                <span className="skin-card-meta"><b>{skin.effects}</b><b>{skin.bar}</b></span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
