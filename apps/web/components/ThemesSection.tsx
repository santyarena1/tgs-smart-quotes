"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { applySkin, readStoredSkin, SKINS, type SkinId } from "../lib/skins";
import { errorMessage } from "./shared";
import { SkinPicker } from "./SkinPicker";

/** Configuración → Temas: cada usuario elige el suyo. Solo cambia el aspecto, nunca la estructura. */
export function ThemesSection() {
  const [skin, setSkin] = useState<SkinId>("tgs");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSkin(readStoredSkin()); }, []);

  async function choose(id: SkinId) {
    if (id === skin || saving) return;
    const previous = skin;
    setSkin(id);
    applySkin(id);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api("/me/ui-skin", { method: "PUT", body: { skin: id } });
      setNotice(`Tema “${SKINS.find((s) => s.id === id)?.name}” guardado para tu usuario.`);
    } catch (err) {
      setSkin(previous);
      applySkin(previous);
      setError(`No se pudo guardar el tema: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="themes-section">
      <header className="themes-head">
        <h2>Temas</h2>
        <p>
          Elegí cómo se ve la aplicación. El tema es <strong>solo tuyo</strong>: cada usuario tiene el suyo y no afecta a nadie más.
          Cambia únicamente el aspecto (colores, tipografías, animaciones, barras y detalles), nunca el funcionamiento ni la estructura.
          Sirve para el modo normal y para LITE, y cada tema tiene su modo claro y oscuro.
        </p>
      </header>
      {error ? <div className="alert error" role="alert">{error}</div> : null}
      {notice ? <div className="alert ok" role="status">{notice}</div> : null}
      <SkinPicker value={skin} onSelect={(id) => void choose(id)} disabled={saving} />
      <p className="themes-foot muted">El interruptor «Efectos» apaga el fondo animado y las animaciones decorativas en los temas que los tienen.</p>
    </section>
  );
}
