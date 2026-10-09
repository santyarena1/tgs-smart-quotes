"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { applySkin, readStoredSkin, type SkinId } from "../lib/skins";
import { SkinPicker } from "./SkinPicker";

/**
 * Aviso de la primera vez: se implementó el sistema de temas. Aparece una sola vez por usuario (mientras
 * su tema no esté guardado en el servidor); al cerrarlo, con cualquier opción, queda guardado y no vuelve.
 */
export function SkinWelcomeModal({ onDone }: { onDone: () => void }) {
  const [skin, setSkin] = useState<SkinId>(() => readStoredSkin());
  const [busy, setBusy] = useState(false);

  function pick(id: SkinId) {
    setSkin(id);
    applySkin(id); // se ve al instante
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try { await api("/me/ui-skin", { method: "PUT", body: { skin } }); } catch { /* si falla, vuelve a avisar en el próximo ingreso */ }
    onDone();
  }

  return (
    <div className="rcw-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="skin-welcome-title" onMouseDown={(e) => { if (e.target === e.currentTarget) void finish(); }}>
      <div className="rcw-card skin-welcome" tabIndex={-1} ref={(el) => el?.focus()} onKeyDown={(e) => { if (e.key === "Escape") void finish(); }}>
        <div className="rcw-icon" aria-hidden="true"><span>!</span><i /><i /></div>
        <p className="skin-welcome-kicker">ATENCIÓN</p>
        <h2 id="skin-welcome-title">Se implementó un sistema de temas</h2>
        <p className="rcw-lead">
          Ahora podés elegir cómo se ve la aplicación. Tu tema es <strong>solo tuyo</strong> y cambia únicamente el aspecto, nunca el funcionamiento.
          Probá los de abajo: se aplican al instante. Podés cambiarlo cuando quieras desde <strong>Configuración → Temas</strong>.
        </p>
        <SkinPicker value={skin} onSelect={pick} compact />
        <div className="rcw-actions">
          <button type="button" className="rcw-go" disabled={busy} onClick={() => void finish()}>Continuar con este tema</button>
        </div>
        <p className="skin-welcome-once">Este aviso aparece una sola vez.</p>
      </div>
    </div>
  );
}
