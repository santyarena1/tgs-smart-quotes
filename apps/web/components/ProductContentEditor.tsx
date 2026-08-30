"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiUpload } from "../lib/api";
import { Alert, EmptyState, Field, Loading, Pill, errorMessage } from "./shared";

type Asset = {
  id: string;
  productId: string;
  sourceUrl: string | null;
  url: string | null;
  isPrimary: boolean;
  approved: boolean;
  status: "PENDING" | "READY" | "FAILED";
};

type SearchImage = { url: string; title?: string; source?: string };
type UploadMode = "remove-bg" | "as-is";

type Props = {
  productId: string;
  productName: string;
  initialDescription?: string | null;
  /** Estilo compacto para embeber dentro de otra pantalla (ej. dentro de un presupuesto). */
  compact?: boolean;
  onDescriptionSaved?: (description: string | null) => void;
  onAssetsChange?: (assets: Asset[]) => void;
};

/**
 * Ficha de un componente (imagen + descripción), reutilizable. Se usa tanto
 * en el catálogo general ("Fichas de Componentes") como embebida dentro de
 * un presupuesto puntual, para poder completar lo que falte sin salir de
 * la pantalla del presupuesto.
 */
export function ProductContentEditor({
  productId,
  productName,
  initialDescription,
  compact,
  onDescriptionSaved,
  onAssetsChange,
}: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [descriptionDraft, setDescriptionDraft] = useState(initialDescription ?? "");
  const [busy, setBusy] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState(productName);
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [pickedResult, setPickedResult] = useState<SearchImage | null>(null);
  const [searching, setSearching] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const rows = await api<Asset[]>(`/external-module/products/${productId}/assets`);
      setAssets(rows);
      onAssetsChange?.(rows);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingAssets(false);
    }
  }, [productId, onAssetsChange]);

  useEffect(() => {
    setDescriptionDraft(initialDescription ?? "");
    setSearchResults([]);
    setPickedResult(null);
    setFile(null);
    setError(null);
    setNotice(null);
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await loadAssets();
      setNotice(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveDescription = async () => {
    setSavingDescription(true);
    setError(null);
    setNotice(null);
    try {
      const clean = descriptionDraft.trim() || null;
      await api(`/external-module/products/${productId}/content`, {
        method: "PUT",
        body: { description: clean },
      });
      onDescriptionSaved?.(clean);
      setNotice("Descripción guardada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingDescription(false);
    }
  };

  const searchImages = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await api<{ images: SearchImage[] }>("/external-module/serper/images", {
        query: { q: query },
      });
      setSearchResults(res.images);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const uploadFile = (mode: UploadMode) => {
    if (!file) return;
    void runAction(async () => {
      const form = new FormData();
      form.append("file", file);
      await apiUpload(`/external-module/products/${productId}/assets/upload?mode=${mode}`, form);
      setFile(null);
    }, mode === "remove-bg" ? "Imagen enviada a quitar fondo." : "Imagen guardada.");
  };

  const useSearchResult = (mode: UploadMode) => {
    if (!pickedResult) return;
    void runAction(async () => {
      await api(`/external-module/products/${productId}/assets/from-url`, {
        method: "POST",
        body: { url: pickedResult.url, origin: "SERPER", mode },
      });
      setPickedResult(null);
    }, mode === "remove-bg" ? "Imagen enviada a quitar fondo." : "Imagen guardada.");
  };

  const setPrimary = (asset: Asset) =>
    runAction(
      () => api(`/external-module/assets/${asset.id}`, { method: "PATCH", body: { isPrimary: true } }),
      "Imagen marcada como principal.",
    );

  const approve = (asset: Asset) =>
    runAction(
      () => api(`/external-module/assets/${asset.id}`, { method: "PATCH", body: { approved: true } }),
      "Imagen aprobada.",
    );

  const removeBg = (asset: Asset) =>
    runAction(() => api(`/external-module/assets/${asset.id}/remove-bg`, { method: "POST" }), "Quitando fondo…");

  const deleteAsset = (asset: Asset) => {
    if (!confirm("¿Borrar esta imagen?")) return;
    void runAction(() => api(`/external-module/assets/${asset.id}`, { method: "DELETE" }), "Imagen borrada.");
  };

  const gap = compact ? 12 : 16;

  return (
    <div style={{ display: "grid", gap }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <section className={compact ? "" : "card card-pad"} style={{ display: "grid", gap: 10 }}>
        {compact ? null : <h3 className="panel-title">Descripción — {productName}</h3>}
        <Field
          label={compact ? "Descripción" : "Descripción breve"}
          hint="Se muestra debajo del nombre de este componente en la ficha web de cualquier PC que lo incluya."
        >
          <textarea
            rows={compact ? 2 : 3}
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            placeholder="Ej: Placa de video de gama media-alta, ideal para 1440p."
          />
        </Field>
        <div>
          <button
            type="button"
            className="btn-dark btn-sm"
            disabled={savingDescription || descriptionDraft.trim() === (initialDescription ?? "").trim()}
            onClick={() => void saveDescription()}
          >
            {savingDescription ? "Guardando…" : "Guardar descripción"}
          </button>
        </div>
      </section>

      <section className={compact ? "" : "card card-pad"} style={{ display: "grid", gap: 10 }}>
        {compact ? null : <h3 className="panel-title">Subir imagen</h3>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div>
                <img src={URL.createObjectURL(file)} alt="Previsualización" style={{ width: 120, height: 120, objectFit: "contain" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => uploadFile("remove-bg")}>
                    Quitar fondo
                  </button>
                  <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => uploadFile("as-is")}>
                    Usar tal cual
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Buscar "${productName}"`} />
              <button type="button" className="btn-dark btn-sm" disabled={searching || !query.trim()} onClick={() => void searchImages()}>
                {searching ? "Buscando…" : "Buscar en Google"}
              </button>
            </div>
            {searchResults.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 8 }}>
                {searchResults.map((img, i) => (
                  <button
                    key={`${img.url}-${i}`}
                    type="button"
                    className="btn-ghost"
                    onClick={() => setPickedResult(img)}
                    style={{ padding: 4 }}
                  >
                    <img src={img.url} alt={img.title ?? "Resultado"} style={{ width: "100%", height: 70, objectFit: "contain" }} />
                  </button>
                ))}
              </div>
            ) : null}
            {pickedResult ? (
              <div>
                <img src={pickedResult.url} alt="Seleccionada" style={{ width: 120, height: 120, objectFit: "contain" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => useSearchResult("remove-bg")}>
                    Quitar fondo
                  </button>
                  <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => useSearchResult("as-is")}>
                    Usar tal cual
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={compact ? "" : "card card-pad"} style={{ display: "grid", gap: 10 }}>
        {compact ? <span className="field-label">Imágenes cargadas</span> : <h3 className="panel-title">Imágenes cargadas</h3>}
        {loadingAssets ? (
          <Loading label="Cargando imágenes…" />
        ) : busy ? (
          <Loading label="Procesando…" />
        ) : assets.length === 0 ? (
          <EmptyState title="Todavía no hay imágenes para este componente" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${compact ? 130 : 200}px,1fr))`, gap: 12 }}>
            {assets.map((asset) => (
              <article key={asset.id} className="card card-pad">
                <img src={asset.url ?? asset.sourceUrl ?? ""} alt="Componente" style={{ width: "100%", height: compact ? 100 : 160, objectFit: "contain" }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {asset.isPrimary ? <Pill tone="violet">Principal</Pill> : null}
                  <Pill tone={asset.status === "READY" ? "ok" : asset.status === "FAILED" ? "bad" : "warn"}>{asset.status}</Pill>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {!asset.isPrimary ? (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void setPrimary(asset)}>
                      Principal
                    </button>
                  ) : null}
                  {!asset.approved ? (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void approve(asset)}>
                      Aprobar
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost btn-sm" onClick={() => void removeBg(asset)}>
                    Quitar fondo
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => void deleteAsset(asset)}>
                    Borrar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
