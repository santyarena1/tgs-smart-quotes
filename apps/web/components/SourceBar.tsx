"use client";

import type { CSSProperties } from "react";
import { providerColor, WEB_COLOR, type NodoProvider, type SourceSelection } from "../lib/nodo";

const OWN_COLOR = "#14b8a6"; // turquesa

/** Texto sobre el color de la pastilla: blanco o casi negro, el que más contraste dé (los colores claros llevan texto oscuro). */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const vsWhite = 1.05 / (lum + 0.05);
  const vsDark = (lum + 0.05) / 0.06;
  return vsWhite >= vsDark ? "#ffffff" : "#111827";
}

type Pill = { key: string; label: string; color: string; on: boolean; stale?: boolean; toggle: () => void; only: () => void };

/**
 * Fila única para elegir en qué buscar antes de escribir. Cada fuente se enciende (con su color) o se apaga con un toque;
 * doble toque = "solo esta". Va en una sola línea con scroll horizontal para no ocupar espacio.
 */
export function SourceBar({ providers, sel, error }: { providers: NodoProvider[]; sel: SourceSelection; error?: string | null }) {
  if (!providers.length) {
    return error ? <p className="src-error" role="status">Los distribuidores no están disponibles: {error}</p> : null;
  }
  const pills: Pill[] = [
    { key: "own", label: "Mis productos", color: OWN_COLOR, on: sel.own, toggle: sel.toggleOwn, only: () => sel.only("own") },
    { key: "web", label: "Web", color: WEB_COLOR, on: sel.web, toggle: sel.toggleWeb, only: () => sel.only("web") },
    ...providers.map((p) => ({
      key: p.id,
      label: p.name,
      color: providerColor(providers, p.id),
      on: sel.activeIds.includes(p.id),
      stale: p.stale,
      toggle: () => sel.toggleProvider(p.id),
      only: () => sel.only(p.id),
    })),
  ];
  const allOn = sel.own && sel.web && sel.activeIds.length === providers.length;
  const noneOn = !sel.own && !sel.web && sel.activeIds.length === 0;

  return (
    <div className="src-bar" role="group" aria-label="Buscar en">
      <div className="src-scroll">
        {pills.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`src-pill${p.on ? " on" : ""}`}
            style={{ "--nc": p.color, "--nt": textOn(p.color) } as CSSProperties}
            aria-pressed={p.on}
            title={`${p.stale ? "Precios desactualizados · " : ""}Clic: prender o apagar · doble clic: solo este`}
            onClick={p.toggle}
            onDoubleClick={p.only}
          >
            <span className="src-led" aria-hidden="true" />
            {p.label}
            {p.stale ? <span className="src-stale" aria-hidden="true">⚠</span> : null}
          </button>
        ))}
      </div>
      <div className="src-quick">
        <button type="button" className="src-all" disabled={allOn} onClick={sel.all} title="Prender todas las fuentes">Todos</button>
        <button type="button" className="src-all" disabled={noneOn} onClick={sel.none} title="Apagar todas las fuentes">Ninguno</button>
      </div>
    </div>
  );
}
