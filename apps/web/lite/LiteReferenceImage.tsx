"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { errorMessage } from "../components/shared";

export type ReferenceImage = { url: string; key: string };

type Generated = ReferenceImage & { usedPhoto: boolean; caseName: string | null; costUsdCents: string | number };

/**
 * Imagen de referencia de cómo quedaría la PC con lo que se está presupuestando. Es opcional: se genera,
 * se mira y el usuario decide si la incluye en el presupuesto (y por lo tanto en el PDF) o la descarta.
 */
export function LiteReferenceImage({ items, current, onApply, onClose }: {
  items: Array<{ name: string; quantity: number; imageUrl?: string | null }>;
  /** La que ya está incluida en el presupuesto, si hay. */
  current: ReferenceImage | null;
  onApply: (image: ReferenceImage | null) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<Generated | ReferenceImage | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo recién generado que todavía no es del presupuesto se borra si no se incluye.
  const pending = useRef<string | null>(null);

  const isCurrent = Boolean(preview && current && preview.key === current.key);
  const meta = preview && "usedPhoto" in preview ? preview : null;

  function discardPending() {
    const key = pending.current;
    pending.current = null;
    if (key) void api("/quote-reference-image", { method: "DELETE", body: { key } }).catch(() => undefined);
  }

  useEffect(() => () => discardPending(), []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<Generated>("/quote-reference-image/generate", { method: "POST", body: { items: items.map((i) => ({ name: i.name.trim(), quantity: i.quantity, imageUrl: i.imageUrl ?? null })) } });
      discardPending();
      pending.current = res.key;
      setPreview(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function include() {
    if (!preview) return;
    // Lo incluido pasa a ser del presupuesto: ya no se borra al cerrar.
    if (pending.current === preview.key) pending.current = null;
    onApply({ url: preview.url, key: preview.key });
    onClose();
  }

  function remove() {
    discardPending();
    onApply(null);
    onClose();
  }

  const cost = meta ? Number(meta.costUsdCents) : null;

  return (
    <div className="lt-modal" role="dialog" aria-modal="true" aria-label="Imagen de referencia" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="lt-card lt-modal-card lt-ref-card" onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
        <h2>Imagen de referencia</h2>
        <p className="lt-muted lt-modal-intro">Una imagen ilustrativa de cómo quedaría la PC con lo que estás presupuestando. Es opcional: vos elegís si va en el presupuesto y en el PDF.</p>
        {error ? <div className="lt-alert err" role="alert">{error}</div> : null}

        <div className={`lt-ref-stage${busy ? " busy" : ""}`}>
          {preview ? <img src={preview.url} alt="Imagen de referencia de la PC" /> : <div className="lt-ref-empty">Todavía no hay imagen. Generala con los {items.length} ítems del presupuesto.</div>}
          {busy ? <div className="lt-ref-wait" role="status">Generando la imagen… puede tardar hasta un minuto</div> : null}
        </div>

        {meta ? (
          <p className="lt-muted lt-hint">
            {meta.usedPhoto ? `Parte de la foto del gabinete (${meta.caseName ?? "gabinete"}).` : "Generada desde la descripción: el gabinete elegido no tiene foto."}
            {cost !== null && Number.isFinite(cost) ? ` Costo aproximado: US$ ${(cost / 100).toFixed(2)}.` : ""}
          </p>
        ) : !preview ? <p className="lt-muted lt-hint">Se genera con IA (aprox. US$ 0,04 a 0,25 por imagen) y parte de la foto del gabinete si la tiene.</p> : null}

        <div className="lt-modal-foot lt-ref-foot">
          {preview && current ? <button type="button" className="lt-btn ghost" disabled={busy} onClick={remove}>Quitar del presupuesto</button> : null}
          {preview && !current ? <button type="button" className="lt-btn ghost" disabled={busy} onClick={() => { discardPending(); setPreview(null); }}>Descartar</button> : null}
          <span className="lt-spacer" />
          <button type="button" className="lt-btn ghost" disabled={busy} onClick={() => void generate()}>{preview ? "Regenerar" : "Generar imagen"}</button>
          {preview ? (
            isCurrent
              ? <button type="button" className="lt-btn" disabled={busy} onClick={onClose}>Listo, queda incluida</button>
              : <button type="button" className="lt-btn" disabled={busy} onClick={include}>Incluir en el presupuesto</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
