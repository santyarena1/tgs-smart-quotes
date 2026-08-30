"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiUpload, downloadAuthenticated } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Quote } from "../lib/types";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Pill,
  errorMessage,
} from "./shared";
import { ProductContentEditor } from "./ProductContentEditor";
import { IntegrationsCard } from "./IntegrationsCard";

type ProductSummary = { id: string; description: string | null };

type WordpressConfig = {
  wpBaseUrl: string;
  wpHmacSecretSet: boolean;
  autoRepublish: boolean;
};

type ConfigDraft = {
  wpBaseUrl: string;
  wpHmacSecret: string;
  clearWpHmacSecret: boolean;
  autoRepublish: boolean;
};

type PublicationStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "FAILED";

type Publication = {
  status: PublicationStatus;
  url: string | null;
  lastError: string | null;
};

type TestResult = { ok: boolean; detail?: string };

const emptyDraft: ConfigDraft = {
  wpBaseUrl: "",
  wpHmacSecret: "",
  clearWpHmacSecret: false,
  autoRepublish: true,
};

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

/**
 * Publicación de PCs armadas en la tienda online.
 *
 * Módulo simple y autocontenido: conecta con la config existente de
 * WordPress (misma tabla que usa el resto del sistema) y lista los
 * presupuestos marcados como "PC armada" para publicarlos o
 * despublicarlos con un clic, sin tener que copiar IDs a mano.
 */
export function PublicacionWebView() {
  const [config, setConfig] = useState<WordpressConfig | null>(null);
  const [draft, setDraft] = useState<ConfigDraft>(emptyDraft);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [publications, setPublications] = useState<Record<string, Publication>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const [savingAutoId, setSavingAutoId] = useState<string | null>(null);
  const [uploadingThumbId, setUploadingThumbId] = useState<string | null>(null);
  const [productsById, setProductsById] = useState<Record<string, ProductSummary>>({});
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const view = await api<WordpressConfig>("/settings/external-module/config");
      setConfig(view);
      setDraft({
        wpBaseUrl: view.wpBaseUrl,
        wpHmacSecret: "",
        clearWpHmacSecret: false,
        autoRepublish: view.autoRepublish,
      });
    } catch (err) {
      setConfigError(errorMessage(err));
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadQuotes = useCallback(async () => {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const rows = await api<Quote[]>("/quotes");
      const pcQuotes = rows.filter((quote) => quote.isBuiltPc && getActiveVersion(quote));
      setQuotes(pcQuotes);
      const entries = await Promise.all(
        pcQuotes.map(async (quote) => {
          const versionId = getActiveVersion(quote)!.id;
          try {
            const publication = await api<Publication | null>(
              `/external-module/quotes/${versionId}/publication`,
            );
            return [versionId, publication ?? { status: "DRAFT" as const, url: null, lastError: null }] as const;
          } catch {
            return [versionId, { status: "DRAFT" as const, url: null, lastError: null }] as const;
          }
        }),
      );
      setPublications(Object.fromEntries(entries));
    } catch (err) {
      setQuotesError(errorMessage(err));
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  const loadProductsSummary = useCallback(async () => {
    try {
      const rows = await api<ProductSummary[]>("/products");
      setProductsById(Object.fromEntries(rows.map((p) => [p.id, p])));
    } catch {
      // No es crítico: si falla, simplemente no mostramos el estado de "sin descripción".
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadQuotes();
    void loadProductsSummary();
  }, [loadConfig, loadQuotes, loadProductsSummary]);

  const saveConfig = async () => {
    setConfigSaving(true);
    setConfigError(null);
    setConfigNotice(null);
    try {
      const next = await api<WordpressConfig>("/settings/external-module/config", {
        method: "PUT",
        body: {
          wpBaseUrl: draft.wpBaseUrl,
          autoRepublish: draft.autoRepublish,
          wpHmacSecret: draft.wpHmacSecret || undefined,
          clearWpHmacSecret: draft.clearWpHmacSecret,
        },
      });
      setConfig(next);
      setDraft({
        wpBaseUrl: next.wpBaseUrl,
        wpHmacSecret: "",
        clearWpHmacSecret: false,
        autoRepublish: next.autoRepublish,
      });
      setConfigNotice("Conexión guardada.");
      setTestResult(null);
    } catch (err) {
      setConfigError(errorMessage(err));
    } finally {
      setConfigSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api<TestResult>("/settings/external-module/config/test/wordpress", {
        method: "POST",
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, detail: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  const downloadPlugin = async () => {
    setDownloading(true);
    setConfigError(null);
    try {
      await downloadAuthenticated("/external-module/wp-plugin/download", "tgs-smart-quotes.zip");
    } catch (err) {
      setConfigError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const publish = async (quote: Quote) => {
    const versionId = getActiveVersion(quote)?.id;
    if (!versionId) return;
    setBusyVersionId(versionId);
    setRowError((prev) => ({ ...prev, [versionId]: "" }));
    try {
      const next = await api<Publication>(`/external-module/quotes/${versionId}/publish`, {
        method: "POST",
      });
      setPublications((prev) => ({ ...prev, [versionId]: next }));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [versionId]: errorMessage(err) }));
    } finally {
      setBusyVersionId(null);
    }
  };

  const unpublish = async (quote: Quote) => {
    const versionId = getActiveVersion(quote)?.id;
    if (!versionId) return;
    setBusyVersionId(versionId);
    setRowError((prev) => ({ ...prev, [versionId]: "" }));
    try {
      const next = await api<Publication>(`/external-module/quotes/${versionId}/unpublish`, {
        method: "POST",
      });
      setPublications((prev) => ({ ...prev, [versionId]: next }));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [versionId]: errorMessage(err) }));
    } finally {
      setBusyVersionId(null);
    }
  };

  const saveTitle = async (quote: Quote) => {
    const nextTitle = (titleDrafts[quote.id] ?? quote.internalName).trim();
    if (!nextTitle || nextTitle === quote.internalName) return;
    setSavingTitleId(quote.id);
    setRowError((prev) => ({ ...prev, [quote.id]: "" }));
    try {
      await api(`/quotes/${quote.id}`, { method: "PUT", body: { internalName: nextTitle } });
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, internalName: nextTitle } : q)));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [quote.id]: errorMessage(err) }));
    } finally {
      setSavingTitleId(null);
    }
  };

  const toggleAutoRepublish = async (quote: Quote, value: boolean) => {
    setSavingAutoId(quote.id);
    try {
      await api(`/external-module/quote-families/${quote.id}/publish-settings`, {
        method: "PUT",
        body: { autoRepublish: value },
      });
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, autoRepublish: value } : q)));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [quote.id]: errorMessage(err) }));
    } finally {
      setSavingAutoId(null);
    }
  };

  const uploadThumbnail = async (quote: Quote, file: File) => {
    setUploadingThumbId(quote.id);
    setRowError((prev) => ({ ...prev, [quote.id]: "" }));
    try {
      const form = new FormData();
      form.append("file", file);
      const next = await apiUpload<{ thumbnailUrl: string | null }>(
        `/external-module/quote-families/${quote.id}/thumbnail`,
        form,
      );
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, thumbnailUrl: next.thumbnailUrl } : q)));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [quote.id]: errorMessage(err) }));
    } finally {
      setUploadingThumbId(null);
    }
  };

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return quotes;
    return quotes.filter((quote) =>
      `${quote.internalName} ${quote.visibleNumber}`.toLowerCase().includes(term),
    );
  }, [quotes, search]);

  return (
    <div>
      <PageHeader
        eyebrow="Tienda online"
        title="Publicación Web"
        subtitle="Publicá presupuestos de PC armada como productos en thegamershop.com.ar."
      />

      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <h3 className="panel-title">Conexión con WordPress</h3>
        {configLoading ? (
          <Loading label="Cargando conexión…" />
        ) : (
          <>
            {configError ? <Alert tone="error">{configError}</Alert> : null}
            {configNotice ? <Alert tone="ok">{configNotice}</Alert> : null}
            <div className="form-grid">
              <Field label="URL de la tienda">
                <input
                  type="url"
                  required
                  value={draft.wpBaseUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, wpBaseUrl: e.target.value }))}
                  placeholder="https://thegamershop.com.ar"
                />
              </Field>
              <Field
                label="Secreto HMAC"
                hint={
                  config?.wpHmacSecretSet
                    ? "Hay un secreto guardado. Solo cargá uno nuevo si lo vas a cambiar."
                    : "Tiene que coincidir con el secreto configurado en el plugin de WordPress."
                }
              >
                <input
                  type="password"
                  value={draft.wpHmacSecret}
                  placeholder={config?.wpHmacSecretSet ? "•••• guardado" : "Ingresar secreto"}
                  onChange={(e) => setDraft((d) => ({ ...d, wpHmacSecret: e.target.value }))}
                />
                {config?.wpHmacSecretSet ? (
                  <Checkbox
                    label="Borrar secreto guardado"
                    checked={draft.clearWpHmacSecret}
                    onChange={(v) => setDraft((d) => ({ ...d, clearWpHmacSecret: v }))}
                  />
                ) : null}
              </Field>
            </div>
            <Checkbox
              label="Republicar automáticamente al modificar un presupuesto publicado"
              checked={draft.autoRepublish}
              onChange={(v) => setDraft((d) => ({ ...d, autoRepublish: v }))}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn-dark" disabled={configSaving} onClick={() => void saveConfig()}>
                {configSaving ? "Guardando…" : "Guardar conexión"}
              </button>
              <button type="button" className="btn-ghost" disabled={testing} onClick={() => void testConnection()}>
                {testing ? "Probando…" : "Probar conexión"}
              </button>
              <button type="button" className="btn-ghost" disabled={downloading} onClick={() => void downloadPlugin()}>
                {downloading ? "Descargando…" : "Descargar plugin de WordPress"}
              </button>
            </div>
            {testResult ? (
              <Alert tone={testResult.ok ? "ok" : "error"}>
                {testResult.ok ? "La tienda respondió correctamente." : testResult.detail ?? "No se pudo conectar."}
              </Alert>
            ) : null}
          </>
        )}
      </section>

      <IntegrationsCard />

      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 className="panel-title">PCs armadas</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o número"
            style={{ maxWidth: 280 }}
          />
        </div>
        {quotesError ? <Alert tone="error">{quotesError}</Alert> : null}
        {quotesLoading ? (
          <Loading label="Cargando presupuestos…" />
        ) : filteredQuotes.length === 0 ? (
          <EmptyState title="No hay PCs armadas todavía">
            Marcá un presupuesto como "PC armada" para poder publicarlo acá.
          </EmptyState>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredQuotes.map((quote) => {
              const version = getActiveVersion(quote)!;
              const publication = publications[version.id];
              const busy = busyVersionId === version.id;
              const rowErr = rowError[version.id] || rowError[quote.id];
              const isPublished = publication?.status === "PUBLISHED";
              const expanded = expandedId === quote.id;
              const titleDraft = titleDrafts[quote.id] ?? quote.internalName;
              return (
                <article key={quote.id} className="card card-pad">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
                      <strong>{quote.internalName || quote.visibleNumber}</strong>
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
                        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void unpublish(quote)}>
                          {busy ? "Despublicando…" : "Despublicar"}
                        </button>
                      ) : (
                        <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => void publish(quote)}>
                          {busy ? "Publicando…" : "Publicar"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setExpandedId(expanded ? null : quote.id);
                          setEditingItemKey(null);
                        }}
                      >
                        {expanded ? "Ocultar detalles" : "Vista previa / editar"}
                      </button>
                    </div>
                  </div>

                  {rowErr ? (
                    <div style={{ marginTop: 10 }}>
                      <Alert tone="error">{rowErr}</Alert>
                    </div>
                  ) : publication?.status === "FAILED" && publication.lastError ? (
                    <div style={{ marginTop: 10 }}>
                      <Alert tone="error">{publication.lastError}</Alert>
                    </div>
                  ) : null}

                  {expanded ? (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", display: "grid", gap: 14 }}>
                      <Field label="Título">
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            value={titleDraft}
                            onChange={(e) => setTitleDrafts((prev) => ({ ...prev, [quote.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="btn-dark btn-sm"
                            disabled={savingTitleId === quote.id || titleDraft.trim() === quote.internalName}
                            onClick={() => void saveTitle(quote)}
                          >
                            {savingTitleId === quote.id ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
                      </Field>

                      <div style={{ display: "grid", gap: 8 }}>
                        <span className="field-label">
                          Componentes ({version.items.length}) — ficha (foto y descripción) de cada uno
                        </span>
                        <div style={{ display: "grid", gap: 8 }}>
                          {version.items.map((item, i) => {
                            const itemKey = `${quote.id}:${item.productId ?? item.id ?? i}`;
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
                      </div>

                      <Checkbox
                        label="Actualizar precio automáticamente desde el catálogo (y re-publicar sola si ya estaba en la tienda)"
                        checked={Boolean(quote.autoRepublish)}
                        disabled={savingAutoId === quote.id}
                        onChange={(v) => void toggleAutoRepublish(quote, v)}
                      />

                      <Field label="Miniatura" hint="Se usa como imagen destacada del producto en la tienda y como imagen de esta PC en 'Recomendadas de la casa'.">
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {quote.thumbnailUrl ? (
                            <img src={quote.thumbnailUrl} alt="Miniatura actual" style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", borderRadius: 8 }} />
                          ) : null}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingThumbId === quote.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadThumbnail(quote, file);
                            }}
                          />
                          {uploadingThumbId === quote.id ? <span className="muted">Subiendo…</span> : null}
                        </div>
                      </Field>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
