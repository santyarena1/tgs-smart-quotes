"use client";

import type { Dispatch, SetStateAction } from "react";
import type { FixedLines } from "../lib/web-quote";
import type { WebFreeRow } from "../lib/web-quote-flow";
import { MoneyInput } from "./shared";

/** Opciones del Presupuesto Web (líneas fijas destildables e ítems libres). Lo usan la versión común y LITE. */
export function WebQuoteOptions({ fixed, setFixed, free, setFree }: {
  fixed: FixedLines;
  setFixed: Dispatch<SetStateAction<FixedLines>>;
  free: WebFreeRow[];
  setFree: Dispatch<SetStateAction<WebFreeRow[]>>;
}) {
  const toggle = (key: keyof FixedLines) => (e: React.ChangeEvent<HTMLInputElement>) => setFixed((f) => ({ ...f, [key]: e.target.checked }));
  return (
    <>
      <p className="web-intro">Cada componente se actualiza al precio final de thegamershop.com.ar. Elegí qué se suma al presupuesto:</p>
      <div className="web-opts">
        <label className="web-opt">
          <input type="checkbox" checked={fixed.assembly} onChange={toggle("assembly")} />
          <span className="web-opt-body">
            <strong>Armado de PC, configuración y pruebas de rendimiento</strong>
            <small>$ 45.000 básica · $ 75.000 con placa de video · $ 90.000 con placa de video y refrigeración líquida</small>
          </span>
        </label>
        <label className="web-opt">
          <input type="checkbox" checked={fixed.windows} onChange={toggle("windows")} />
          <span className="web-opt-body">
            <strong>Licencia Windows 11 Pro</strong>
            <small>$ 65.000 · suma al total</small>
          </span>
        </label>
        <label className="web-opt">
          <input type="checkbox" checked={fixed.warranty} onChange={toggle("warranty")} />
          <span className="web-opt-body">
            <strong>Garantía extendida TGS</strong>
            <small>7 % del total de los componentes (sin armado ni licencia) · suma al total</small>
          </span>
        </label>
        <label className="web-opt">
          <input type="checkbox" checked={fixed.wifi} onChange={toggle("wifi")} />
          <span className="web-opt-body">
            <strong>Placa WiFi PCIe (opcional)</strong>
            <small>$ 18.200 en la PC básica · $ 47.400 en las demás · no suma al total, sale chica debajo del precio. Se omite si la PC ya trae WiFi</small>
          </span>
        </label>
      </div>
      <h4 className="web-sub">Ítems libres</h4>
      {free.map((f) => (
        <div key={f.key} className="web-free">
          <input
            placeholder="Descripción (ej. Cable HDMI)"
            value={f.name}
            onChange={(e) => setFree((cur) => cur.map((x) => (x.key === f.key ? { ...x, name: e.target.value } : x)))}
          />
          <MoneyInput
            className="money-input"
            placeholder="Precio"
            value={f.priceArs}
            onChange={(v) => setFree((cur) => cur.map((x) => (x.key === f.key ? { ...x, priceArs: v } : x)))}
          />
          <button type="button" className="btn-danger btn-sm" onClick={() => setFree((cur) => cur.filter((x) => x.key !== f.key))}>
            Quitar
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={() => setFree((cur) => [...cur, { key: crypto.randomUUID(), name: "", priceArs: "" }])}>
        + Agregar ítem libre
      </button>
    </>
  );
}
