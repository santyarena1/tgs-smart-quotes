"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiUpload } from "../lib/api";
import {
  Alert,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Pill,
  errorMessage,
} from "./shared";

type Product = {
  id: string;
  name: string;
  active: boolean;
  description: string | null;
};

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

/**
 * Ficha reutilizable por componente: imagen y descripción. Una vez cargadas
 * acá, se usan automáticamente en cualquier presupuesto que incluya ese
 * componente al publicarlo en la tienda — no hay que volver a cargarlas
 * cada vez.
 */
export function ComponentContentView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [pickedResult, setPickedResult] = useState<SearchImage | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setLoadingProducts(true);
    api<Product[]>("/products")
      .then(setProducts)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoadingProducts(false));
  }, []);

  const loadAssets = useCallback(async (productId: string) => {
    setAssets(await api<Asset[]>(`/external-module/products/${productId}/assets`));
  }, []);

  const selectProduct = async (product: Product) => {
    setSelected(product);
    setDescriptionDraft(product.description ?? "");
    setSearchResults([]);
    setPickedResult(null);
    setFile(null);
    setError(null);
    setNotice(null);
    try {
      await loadAssets(product.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await loadAssets(selected.id);
      setNotice(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveDescription = async () => {
    if (!selected) return;
    setSavingDescription(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/external-module/products/${selected.id}/content`, {
        method: "PUT",
        body: { description: descriptionDraft.trim() || null },
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, description: descriptionDraft.trim() || null } : p)),
      );
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
    if (!file || !selected) return;
    void runAction(async () => {
      const form = new FormData();
      form.append("file", file);
      await apiUpload(`/external-module/products/${selected.id}/assets/upload?mode=${mode}`, form);
      setFile(null);
    }, mode === "remove-bg" ? "Imagen enviada a quitar fondo." : "Imagen guardada.");
  };

  const useSearchResult = (mode: UploadMode) => {
    if (!pickedResult || !selected) return;
    void runAction(async () => {
      await api(`/external-module/products/${selected.id}/assets/from-url`, {
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

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        eyebrow="Catálogo"
        title="Fichas de Componentes"
        subtitle="Imagen y descripción por componente — se reutilizan solas en cualquier presupuesto que lo incluya."
      />

      {error ? <div style={{ marginTop: 16 }}><Alert tone="error">{error}</Alert></div> : null}
      {notice ? <div style={{ marginTop: 16 }}><Alert tone="ok">{notice}</Alert></div> : null}

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h3 className="panel-title">Componente</h3>
        <Field label="Buscar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre del componente" />
        </Field>
        {loadingProducts ? (
          <Loading label="Cargando catálogo…" />
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, maxHeight: 220, overflowY: "auto" }}>
            {filteredProducts.slice(0, 60).map((p) => (
              <button
                key={p.id}
                type="button"
                className={selected?.id === p.id ? "btn-dark btn-sm" : "btn-ghost btn-sm"}
                onClick={() => void selectProduct(p)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {!selected ? null : (
        <>
          <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 12 }}>
            <h3 className="panel-title">Descripción — {selected.name}</h3>
            <Field label="Descripción breve" hint="Se muestra debajo del nombre de este componente en la ficha web de cualquier PC que lo incluya.">
              <textarea
                rows={3}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="Ej: Placa de video de gama media-alta, ideal para 1440p."
              />
            </Field>
            <div>
              <button type="button" className="btn-dark btn-sm" disabled={savingDescription} onClick={() => void saveDescription()}>
                {savingDescription ? "Guardando…" : "Guardar descripción"}
              </button>
            </div>
          </section>

          <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 16 }}>
            <h3 className="panel-title">Subir imagen</h3>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div>
                <img src={URL.createObjectURL(file)} alt="Previsualización" style={{ width: 160, height: 160, objectFit: "contain" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => uploadFile("remove-bg")}>
                    Quitar fondo
                  </button>
                  <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => uploadFile("as-is")}>
                    Usar tal cual (ya sin fondo)
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 16 }}>
            <h3 className="panel-title">Buscar imagen (Serper)</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Ej: ${selected.name}`} />
              <button type="button" className="btn-dark btn-sm" disabled={searching || !query.trim()} onClick={() => void searchImages()}>
                {searching ? "Buscando…" : "Buscar"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
              {searchResults.map((img, i) => (
                <button
                  key={`${img.url}-${i}`}
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPickedResult(img)}
                  style={{ padding: 4 }}
                >
                  <img src={img.url} alt={img.title ?? "Resultado"} style={{ width: "100%", height: 100, objectFit: "contain" }} />
                </button>
              ))}
            </div>
            {pickedResult ? (
              <div>
                <img src={pickedResult.url} alt="Seleccionada" style={{ width: 180, height: 180, objectFit: "contain" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => useSearchResult("remove-bg")}>
                    Quitar fondo
                  </button>
                  <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => useSearchResult("as-is")}>
                    Usar tal cual
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="card card-pad" style={{ marginTop: 20 }}>
            <h3 className="panel-title">Imágenes cargadas</h3>
            {busy ? <Loading label="Procesando…" /> : null}
            {assets.length === 0 ? (
              <EmptyState title="Todavía no hay imágenes para este componente" />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16, marginTop: 12 }}>
                {assets.map((asset) => (
                  <article key={asset.id} className="card card-pad">
                    <img src={asset.url ?? asset.sourceUrl ?? ""} alt="Componente" style={{ width: "100%", height: 160, objectFit: "contain" }} />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {asset.isPrimary ? <Pill tone="violet">Principal</Pill> : null}
                      <Pill tone={asset.status === "READY" ? "ok" : asset.status === "FAILED" ? "bad" : "warn"}>{asset.status}</Pill>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      {!asset.isPrimary ? (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => void setPrimary(asset)}>
                          Marcar principal
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
        </>
      )}
    </div>
  );
}
