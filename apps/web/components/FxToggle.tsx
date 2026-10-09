"use client";

import { useEffect, useState } from "react";

/** Interruptor de efectos visuales (fondo animado y animaciones decorativas). Se recuerda por navegador. */
export function FxToggle({ variant }: { variant: "side" | "icon" }) {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(document.documentElement.dataset.fx !== "off");
  }, []);

  function toggle() {
    const next = !on;
    document.documentElement.dataset.fx = next ? "on" : "off";
    try { window.localStorage.setItem("tgs.fx", next ? "on" : "off"); } catch { /* sin storage: dura hasta recargar */ }
    setOn(next);
  }

  const title = on ? "Desactivar efectos" : "Activar efectos";
  if (variant === "icon") {
    return (
      <button type="button" className={`lt-switch tgs-red${on ? " on" : ""}`} role="switch" aria-checked={on} onClick={toggle} title={title}>
        <span className="lt-switch-track"><span className="lt-switch-knob" /></span>
        <span>Efectos</span>
      </button>
    );
  }
  return (
    <button type="button" className="side-lite-switch side-switch" role="switch" aria-checked={on} onClick={toggle} title={title}>
      <span className="side-lite-track"><span className="side-lite-knob" /></span>
      <span className="side-lite-label">EFECTOS</span>
    </button>
  );
}
