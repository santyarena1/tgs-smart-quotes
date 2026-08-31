"use client";

import { useState } from "react";
import { api, apiUpload } from "../lib/api";
import { Alert, Field, errorMessage } from "./shared";

/**
 * Ficha de un componente escrito a mano, que no está en el catálogo.
 *
 * A diferencia de ProductContentEditor (que edita el producto y se reutiliza
 * en todas las PCs que lo incluyan), lo que se carga acá vive en el ítem de
 * este presupuesto: sirve para esta PC y no ensucia el catálogo.
 */

type SearchImage = { url: string; title?: string; source?: string };
type Modo = "remove-bg" | "as-is";

type Props = {
  itemId: string;
  itemName: string;
  description: string | null;
  imageUrl: string | null;
  esHero: boolean;
  onChanged: (cambios: { description?: string | null; imageUrl?: string | null }) => void;
  onUseAsHero: (imageUrl: string) => void;
};

export function QuoteItemContentEditor({
  itemId,
  itemName,
  description,
  imageUrl,
  esHero,
  onChanged,
  onUseAsHero,
}: Props) {
  const [descDraft, setDescDraft] = useState(description ?? "");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState(itemName);
  const [results, setResults] = useState<SearchImage[]>([]);
  const [picked, setPicked] = useState<SearchImage | null>(null);
  const [searching, setSearching] = useState(false);

  const correr = async (accion: () => Promise<{ webImageUrl?: string | null; aviso?: string | null }>, mensaje: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await accion();
      onChanged({ imageUrl: res.webImageUrl ?? null });
      // Si el recorte falló, la imagen se guardó igual con su fondo: se avisa
      // en vez de dejar al usuario sin foto.
      setNotice(res.aviso ? `${mensaje} ${res.aviso}` : mensaje);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const guardarDescripcion = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const limpia = descDraft.trim() || null;
      await api(`/external-module/quote-items/${itemId}/content`, {
        method: "PUT",
        body: { description: limpia },
      });
      onChanged({ description: limpia });
      setNotice("Descripción guardada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const buscar = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await api<{ images: SearchImage[] }>("/external-module/serper/images", {
        query: { q: query },
      });
      setResults(res.images);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const subir = (modo: Modo) => {
    if (!file) return;
    void correr(async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await apiUpload<{ webImageUrl: string | null; aviso: string | null }>(
        `/external-module/quote-items/${itemId}/image/upload?mode=${modo}`,
        form,
      );
      setFile(null);
      return res;
    }, "Imagen guardada.");
  };

  const usarResultado = (modo: Modo) => {
    if (!picked) return;
    void correr(async () => {
      const res = await api<{ webImageUrl: string | null; aviso: string | null }>(
        `/external-module/quote-items/${itemId}/image/from-url`,
        { method: "POST", body: { url: picked.url, mode: modo } },
      );
      setPicked(null);
      setResults([]);
      return res;
    }, "Imagen guardada.");
  };

  const borrarImagen = () => {
    if (!confirm("¿Borrar la foto de este componente?")) return;
    void correr(async () => {
      await api(`/external-module/quote-items/${itemId}/image`, { method: "DELETE" });
      return { webImageUrl: null };
    }, "Foto borrada.");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <span className="muted" style={{ fontSize: 12.5 }}>
        Este componente no está en el catálogo, así que su foto y su descripción se guardan
        <strong> solo para esta PC</strong>.
      </span>

      <Field label="Descripción">
        <textarea
          rows={2}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          placeholder="Ej: Fuente 850W full modular con certificación 80 Plus Gold."
        />
      </Field>
      <div>
        <button
          type="button"
          className="btn-dark btn-sm"
          disabled={saving || descDraft.trim() === (description ?? "").trim()}
          onClick={() => void guardarDescripcion()}
        >
          {saving ? "Guardando…" : "Guardar descripción"}
        </button>
      </div>

      <Field label="Foto">
        {imageUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <img
              src={imageUrl}
              alt={itemName}
              style={{ width: 84, height: 84, objectFit: "contain", background: "#fff", borderRadius: 8 }}
            />
            {esHero ? (
              <span className="pill violet">Foto del hero</span>
            ) : (
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onUseAsHero(imageUrl)}>
                Usar en el hero
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={borrarImagen}>
              Borrar foto
            </button>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>Todavía no tiene foto.</span>
        )}
      </Field>

      <Field label="Subir una foto">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <>
              <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => subir("remove-bg")}>
                Quitar fondo y guardar
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => subir("as-is")}>
                Guardar tal cual
              </button>
            </>
          ) : null}
        </div>
      </Field>

      <Field label="O buscarla en Google">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Qué buscar"
            style={{ flex: "1 1 200px" }}
          />
          <button type="button" className="btn-ghost btn-sm" disabled={searching || !query.trim()} onClick={() => void buscar()}>
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </Field>

      {results.length ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {results.slice(0, 12).map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              onClick={() => setPicked(img)}
              style={{
                padding: 3,
                borderRadius: 8,
                cursor: "pointer",
                background: "#fff",
                border: picked?.url === img.url ? "2px solid var(--accent, #E31B23)" : "1px solid var(--border, #ddd)",
              }}
            >
              <img src={img.url} alt="" style={{ width: 66, height: 66, objectFit: "contain", display: "block" }} />
            </button>
          ))}
        </div>
      ) : null}

      {picked ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => usarResultado("remove-bg")}>
            Quitar fondo y guardar
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => usarResultado("as-is")}>
            Guardar tal cual
          </button>
        </div>
      ) : null}
    </div>
  );
}
