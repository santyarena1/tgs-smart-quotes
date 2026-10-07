"use client";

import type { CSSProperties } from "react";
import { providerColor, WEB_COLOR, type NodoProvider, type SourceSelection } from "../lib/nodo";

const OWN_COLOR = "#14b8a6"; // turquesa

type Pill = { key: string; label: string; color: string; on: boolean; stale?: boolean; toggle: () => void; only: () => void };

/**
 * Fila única para elegir en qué buscar antes de escribir. Cada fuente se enciende (con su color) o se apaga con un toque;
 * doble toque = "solo esta". Va en una sola línea con scroll horizontal para no ocupar espacio.
 */
export function SourceBar({ providers, sel }: { providers: NodoProvider[]; sel: SourceSelection }) {
  if (!providers.length) return null;
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
            style={{ "--nc": p.color } as CSSProperties}
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
