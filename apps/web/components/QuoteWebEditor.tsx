"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiUpload } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Quote } from "../lib/types";
import { Alert, Checkbox, Field, Loading, PageHeader, Pill, errorMessage } from "./shared";
import { ProductContentEditor } from "./ProductContentEditor";

type ProductSummary = { id: string; description: string | null };

type PublicationStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "FAILED";
type Publication = { status: PublicationStatus; url: string | null; lastError: string | null };

type Enrichment = {
  descriptionHtml: string | null;
} | null;

function statusLabel(status: PublicationStatus | undefined): string {
  if (status === "PUBLISHED") return "Publicado";
  if (status === "FAILED") return "Error al publicar";
  if (status === "UNPUBLISHED") return "Despublicado";
  return "Sin publicar";
}

function statusTone(status: PublicationStatus | undefined): "ok" | "bad" | "neutral" {
  if (status === "PUBLISHED") return "ok";
  if (status === "FAILED") return "bad";
  return "neutral";
}

type Props = {
  quoteId: string;
  onClose: () => void;
  /** Se llama después de publicar/despublicar o cambiar el título, para refrescar la lista. */
  onChanged?: () => void;
};

/**
 * Pantalla dedicada para dejar una PC lista para publicar: título, contenido
 * generado por IA (descripción y consumo, editable), foto y descripción de
 * cada componente, miniatura y sincronización automática de precio.
 */
export function QuoteWebEditor({ quoteId, onClose, onChanged }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyPublish, setBusyPublish] = useState(false);

  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  const [enrichment, setEnrichment] = useState<Enrichment>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [loadingEnrichment, setLoadingEnrichment] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingEnrichment, setSavingEnrichment] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [productsById, setProductsById] = useState<Record<string, ProductSummary>>({});
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);

  const version = quote ? getActiveVersion(quote) : null;

  const applyEnrichment = (value: Enrichment) => {
    setEnrichment(value);
    setDescriptionDraft(value?.descriptionHtml ?? "");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [q, products] = await Promise.all([
        api<Quote>(`/quotes/${quoteId}`),
        api<ProductSummary[]>("/products"),
      ]);
      setQuote(q);
      setTitleDraft(q.internalName);
      setProductsById(Object.fromEntries(products.map((p) => [p.id, p])));
      const v = getActiveVersion(q);
      if (v) {
        try {
          const pub = await api<Publication | null>(`/external-module/quotes/${v.id}/publication`);
          setPublication(pub ?? { status: "DRAFT", url: null, lastError: null });
        } catch {
          setPublication({ status: "DRAFT", url: null, lastError: null });
        }
      }
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  const loadEnrichment = useCallback(async (versionId: string) => {
    setLoadingEnrichment(true);
    try {
      const value = await api<Enrichment>(`/external-module/quotes/${versionId}/enrichment`);
      applyEnrichment(value);
    } catch (err) {
      setAiError(errorMessage(err));
    } finally {
      setLoadingEnrichment(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (version) void loadEnrichment(version.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id]);

  const publish = async () => {
    if (!version) return;
    setBusyPublish(true);
    setActionError(null);
    try {
      const next = await api<Publication>(`/external-module/quotes/${version.id}/publish`, { method: "POST" });
      setPublication(next);
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyPublish(false);
    }
  };

  const unpublish = async () => {
    if (!version) return;
    setBusyPublish(true);
    setActionError(null);
    try {
      const next = await api<Publication>(`/external-module/quotes/${version.id}/unpublish`, { method: "POST" });
      setPublication(next);
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyPublish(false);
    }
  };

  const saveTitle = async () => {
    if (!quote) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === quote.internalName) return;
    setSavingTitle(true);
    setActionError(null);
    try {
      await api(`/quotes/${quote.id}`, { method: "PUT", body: { internalName: nextTitle } });
      setQuote((prev) => (prev ? { ...prev, internalName: nextTitle } : prev));
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSavingTitle(false);
    }
  };

  const toggleAutoRepublish = async (value: boolean) => {
    if (!quote) return;
    setSavingAuto(true);
    setActionError(null);
    try {
      await api(`/external-module/quote-families/${quote.id}/publish-settings`, {
        method: "PUT",
        body: { autoRepublish: value },
      });
      setQuote((prev) => (prev ? { ...prev, autoRepublish: value } : prev));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSavingAuto(false);
    }
  };

  const uploadThumbnail = async (file: File) => {
    if (!quote) return;
    setUploadingThumb(true);
    setActionError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const next = await apiUpload<{ thumbnailUrl: string | null }>(
        `/external-module/quote-families/${quote.id}/thumbnail`,
        form,
      );
      setQuote((prev) => (prev ? { ...prev, thumbnailUrl: next.thumbnailUrl } : prev));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setUploadingThumb(false);
    }
  };

  const generateEnrichment = async () => {
    if (!version) return;
    setGenerating(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const value = await api<Enrichment>(`/external-module/quotes/${version.id}/enrich`, { method: "POST" });
      applyEnrichment(value);
      setAiNotice("Contenido generado con IA. Podés editarlo antes de guardar.");
    } catch (err) {
      setAiError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const saveEnrichment = async () => {
    if (!version) return;
    setSavingEnrichment(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const value = await api<Enrichment>(`/external-module/quotes/${version.id}/enrichment`, {
        method: "PUT",
        body: {
          descriptionHtml: descriptionDraft.trim() || null,
        },
      });
      applyEnrichment(value);
      setAiNotice("Guardado.");
    } catch (err) {
      setAiError(errorMessage(err));
    } finally {
      setSavingEnrichment(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="Tienda online" title="Publicación Web" subtitle="Cargando presupuesto…" />
        <div style={{ marginTop: 20 }}>
          <Loading label="Cargando…" />
        </div>
      </div>
    );
  }

  if (loadError || !quote || !version) {
    return (
      <div>
        <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
          ← Volver al listado
        </button>
        <div style={{ marginTop: 16 }}>
          <Alert tone="error">{loadError ?? "No se pudo cargar el presupuesto."}</Alert>
        </div>
      </div>
    );
  }

  const isPublished = publication?.status === "PUBLISHED";

  return (
    <div>
      <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
        ← Volver al listado
      </button>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0 }}>{quote.internalName || quote.visibleNumber}</h2>
          <span className="muted">
            {quote.visibleNumber} · v{version.version} · {formatArs(version.totalSaleCents)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Pill tone={statusTone(publication?.status)}>{statusLabel(publication?.status)}</Pill>
          {publication?.url ? (
            <a href={publication.url} target="_blank" rel="noreferrer">
              Ver en la tienda
            </a>
          ) : null}
          {isPublished ? (
            <button type="button" className="btn-ghost btn-sm" disabled={busyPublish} onClick={() => void unpublish()}>
              {busyPublish ? "Despublicando…" : "Despublicar"}
            </button>
          ) : (
            <button type="button" className="btn-dark btn-sm" disabled={busyPublish} onClick={() => void publish()}>
              {busyPublish ? "Publicando…" : "Publicar"}
            </button>
          )}
        </div>
      </div>

      {actionError ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : publication?.status === "FAILED" && publication.lastError ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="error">{publication.lastError}</Alert>
        </div>
      ) : null}

      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <h3 className="panel-title">Datos generales</h3>
        <Field label="Título">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
            <button
              type="button"
              className="btn-dark btn-sm"
              disabled={savingTitle || titleDraft.trim() === quote.internalName}
              onClick={() => void saveTitle()}
            >
              {savingTitle ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </Field>

        <Checkbox
          label="Actualizar precio automáticamente desde el catálogo (y re-publicar sola si ya estaba en la tienda)"
          checked={Boolean(quote.autoRepublish)}
          disabled={savingAuto}
          onChange={(v) => void toggleAutoRepublish(v)}
        />

        <Field label="Miniatura" hint="Se usa como imagen destacada del producto en la tienda y como imagen de esta PC en 'Recomendadas de la casa'.">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {quote.thumbnailUrl ? (
              <img src={quote.thumbnailUrl} alt="Miniatura actual" style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", borderRadius: 8 }} />
            ) : null}
            <input
              type="file"
              accept="image/*"
              disabled={uploadingThumb}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadThumbnail(file);
              }}
            />
            {uploadingThumb ? <span className="muted">Subiendo…</span> : null}
          </div>
        </Field>
      </section>

      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 className="panel-title">Descripción (con IA)</h3>
          <button type="button" className="btn-ghost btn-sm" disabled={generating} onClick={() => void generateEnrichment()}>
            {generating ? "Generando…" : enrichment ? "Regenerar con IA" : "Generar con IA"}
          </button>
        </div>
        {loadingEnrichment ? (
          <Loading label="Cargando…" />
        ) : (
          <>
            {aiError ? <Alert tone="error">{aiError}</Alert> : null}
            {aiNotice ? <Alert tone="ok">{aiNotice}</Alert> : null}
            <Field label="Descripción (se muestra en el hero de la ficha)">
              <textarea
                rows={3}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="Se completa al generar con IA, o escribila vos."
              />
            </Field>
            <div>
              <button type="button" className="btn-dark btn-sm" disabled={savingEnrichment} onClick={() => void saveEnrichment()}>
                {savingEnrichment ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 10 }}>
        <h3 className="panel-title">Componentes ({version.items.length})</h3>
        <span className="muted">Foto y descripción de cada uno — se reutilizan en cualquier otra PC que lo incluya.</span>
        <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
          {version.items.map((item, i) => {
            const itemKey = item.productId ?? item.id ?? String(i);
            const itemEditing = editingItemKey === itemKey;
            const product = item.productId ? productsById[item.productId] : undefined;
            const hasDescription = Boolean(product?.description?.trim());
            const knownAssetCount = item.productId ? assetCounts[item.productId] : undefined;
            return (
              <div key={itemKey} className="card card-pad" style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="muted">
                    {item.quantity} × {item.frozenName ?? item.name}
                  </span>
                  {item.productId ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Pill tone={hasDescription ? "ok" : "warn"}>
                        {hasDescription ? "Con descripción" : "Sin descripción"}
                      </Pill>
                      {typeof knownAssetCount === "number" ? (
                        <Pill tone={knownAssetCount > 0 ? "ok" : "warn"}>
                          {knownAssetCount > 0 ? `${knownAssetCount} imagen(es)` : "Sin imágenes"}
                        </Pill>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setEditingItemKey(itemEditing ? null : itemKey)}
                      >
                        {itemEditing ? "Cerrar" : "Editar ficha"}
                      </button>
                    </div>
                  ) : (
                    <span className="muted">Sin producto de catálogo vinculado</span>
                  )}
                </div>
                {itemEditing && item.productId ? (
                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                    <ProductContentEditor
                      productId={item.productId}
                      productName={item.frozenName ?? item.name}
                      initialDescription={product?.description ?? null}
                      compact
                      onDescriptionSaved={(description) => {
                        const pid = item.productId as string;
                        setProductsById((prev) => ({ ...prev, [pid]: { id: pid, description } }));
                      }}
                      onAssetsChange={(assets) => {
                        const pid = item.productId as string;
                        setAssetCounts((prev) => ({ ...prev, [pid]: assets.length }));
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
