"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, downloadAuthenticated } from "../lib/api";
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
  SearchInput,
  Tabs,
  errorMessage,
} from "./shared";
import { IntegrationsCard } from "./IntegrationsCard";
import { QuoteWebEditor } from "./QuoteWebEditor";
import { EMPTY_PUBLICATION, loadPublication, publicationStatusLabel, publicationStatusTone, type Publication } from "./publication";

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

/** El test de conexión ahora informa además la versión del plugin instalado. */
type TestResult = { ok: boolean; detail?: string; version?: string | null };

type FilterId = "todos" | "publicados" | "pendientes" | "errores";

const emptyDraft: ConfigDraft = {
  wpBaseUrl: "",
  wpHmacSecret: "",
  clearWpHmacSecret: false,
  autoRepublish: true,
};

/**
 * Publicación de PCs armadas en la tienda online.
 *
 * La pantalla arranca por lo que se usa todos los días —el listado de PCs y su
 * estado— y deja la configuración (conexión con WordPress e integraciones de
 * imágenes) plegada detrás de un panel, porque se toca una vez y molestaba
 * arriba de todo. El estado de la conexión igual queda siempre visible.
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  /** Publicaciones por presupuesto (familia), no por versión: si se crea una
      versión nueva, la publicación sigue estando y avisa que quedó atrás. */
  const [publications, setPublications] = useState<Record<string, Publication>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("todos");
  const [busyQuoteId, setBusyQuoteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

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
      // Una sola petición para todas: una por PC pasaba el rate limit.
      const all = await api<Record<string, Publication>>("/external-module/publications").catch(() => ({}) as Record<string, Publication>);
      setPublications(Object.fromEntries(pcQuotes.map((quote) => [quote.id, all[quote.id] ?? EMPTY_PUBLICATION] as const)));
    } catch (err) {
      setQuotesError(errorMessage(err));
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  const testConnection = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadQuotes();
  }, [loadConfig, loadQuotes]);

  // Diagnóstico automático al entrar: si la tienda no responde o el plugin no
  // está, se ve al toque y no después de intentar publicar y que falle.
  useEffect(() => {
    if (!configLoading && config) void testConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoading]);

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
      void testConnection();
    } catch (err) {
      setConfigError(errorMessage(err));
    } finally {
      setConfigSaving(false);
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

  /** Publica (o actualiza a) la versión activa, sin preparar nada. */
  const publish = async (quote: Quote) => {
    const versionId = getActiveVersion(quote)?.id;
    if (!versionId) return;
    setBusyQuoteId(quote.id);
    setRowError((prev) => ({ ...prev, [quote.id]: "" }));
    try {
      const next = await api<Publication>(`/external-module/quote-families/${quote.id}/publish`, {
        method: "POST",
        body: { versionId },
      });
      setPublications((prev) => ({ ...prev, [quote.id]: next }));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [quote.id]: errorMessage(err) }));
      setPublications((prev) => ({ ...prev, [quote.id]: prev[quote.id] ?? { status: "FAILED", url: null, lastError: null } }));
      void loadPublication(quote.id).then((pub) => setPublications((prev) => ({ ...prev, [quote.id]: pub })));
    } finally {
      setBusyQuoteId(null);
    }
  };

  const unpublish = async (quote: Quote) => {
    setBusyQuoteId(quote.id);
    setRowError((prev) => ({ ...prev, [quote.id]: "" }));
    try {
      const next = await api<Publication>(`/external-module/quote-families/${quote.id}/unpublish`, { method: "POST" });
      setPublications((prev) => ({ ...prev, [quote.id]: next }));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [quote.id]: errorMessage(err) }));
    } finally {
      setBusyQuoteId(null);
    }
  };

  const counts = useMemo(() => {
    let publicados = 0;
    let errores = 0;
    for (const quote of quotes) {
      const status = publications[quote.id]?.status;
      if (status === "PUBLISHED") publicados += 1;
      else if (status === "FAILED") errores += 1;
    }
    return { total: quotes.length, publicados, errores, pendientes: quotes.length - publicados - errores };
  }, [quotes, publications]);

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (term && !`${quote.internalName} ${quote.webTitle ?? ""} ${quote.visibleNumber}`.toLowerCase().includes(term)) return false;
      const status = publications[quote.id]?.status;
      if (filter === "publicados") return status === "PUBLISHED";
      if (filter === "errores") return status === "FAILED";
      if (filter === "pendientes") return status !== "PUBLISHED" && status !== "FAILED";
      return true;
    });
  }, [quotes, search, filter, publications]);

  if (editingQuoteId) {
    return (
      <QuoteWebEditor
        quoteId={editingQuoteId}
        onClose={() => setEditingQuoteId(null)}
        onChanged={() => void loadQuotes()}
      />
    );
  }

  const connectionTone = testing ? "info" : testResult?.ok ? "ok" : testResult ? "bad" : "neutral";
  const connectionText = testing
    ? "Probando conexión…"
    : testResult?.ok
      ? `Tienda conectada${testResult.version ? ` · plugin v${testResult.version}` : ""}`
      : testResult
        ? "Problema de conexión con la tienda"
        : "Conexión sin verificar";

  return (
    <div>
      <PageHeader
        eyebrow="Tienda online"
        title="Publicación Web"
        subtitle="Publicá presupuestos de PC armada como productos en thegamershop.com.ar."
      />

      {/* Barra de estado de la conexión: siempre visible, con el detalle del
          problema si lo hay, y la configuración plegada detrás del botón. */}
      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Pill tone={connectionTone}>{connectionText}</Pill>
            {config?.wpBaseUrl ? <span className="muted" style={{ fontSize: 12.5 }}>{config.wpBaseUrl}</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-ghost btn-sm" disabled={testing} onClick={() => void testConnection()}>
              {testing ? "Probando…" : "Probar conexión"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSettingsOpen((v) => !v)}>
              {settingsOpen ? "Ocultar configuración" : "Configuración"}
            </button>
          </div>
        </div>

        {testResult && !testResult.ok && testResult.detail ? (
          <Alert tone="error">{testResult.detail}</Alert>
        ) : null}

        {settingsOpen ? (
          configLoading ? (
            <Loading label="Cargando conexión…" />
          ) : (
            <div style={{ display: "grid", gap: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
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
                <button type="button" className="btn-ghost" disabled={downloading} onClick={() => void downloadPlugin()}>
                  {downloading ? "Descargando…" : "Descargar plugin de WordPress"}
                </button>
              </div>

              <IntegrationsCard />
            </div>
          )
        ) : null}
      </section>

      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            PCs armadas ({counts.total})
          </h3>
          <div style={{ maxWidth: 280, width: "100%" }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o número" />
          </div>
        </div>

        <Tabs<FilterId>
          tabs={[
            { id: "todos", label: `Todas (${counts.total})` },
            { id: "publicados", label: `Publicadas (${counts.publicados})` },
            { id: "pendientes", label: `Sin publicar (${counts.pendientes})` },
            { id: "errores", label: `Con error (${counts.errores})` },
          ]}
          active={filter}
          onChange={setFilter}
        />

        {quotesError ? <Alert tone="error">{quotesError}</Alert> : null}
        {quotesLoading ? (
          <Loading label="Cargando presupuestos…" />
        ) : filteredQuotes.length === 0 ? (
          <EmptyState title={quotes.length === 0 ? "No hay PCs armadas todavía" : "No hay resultados con este filtro"}>
            {quotes.length === 0
              ? 'Marcá un presupuesto como "PC armada" para poder publicarlo acá.'
              : "Probá con otro filtro o limpiá la búsqueda."}
          </EmptyState>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredQuotes.map((quote) => {
              const version = getActiveVersion(quote)!;
              const publication = publications[quote.id];
              const busy = busyQuoteId === quote.id;
              const rowErr = rowError[quote.id];
              const isPublished = publication?.status === "PUBLISHED";
              const isStale = Boolean(isPublished && publication?.isStale);
              return (
                <article key={quote.id} className="card card-pad">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 240 }}>
                      {quote.thumbnailUrl ? (
                        <img
                          src={quote.thumbnailUrl}
                          alt=""
                          style={{ width: 46, height: 46, objectFit: "contain", background: "#fff", borderRadius: 8, flex: "0 0 auto" }}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: 8,
                            flex: "0 0 auto",
                            display: "grid",
                            placeItems: "center",
                            background: "var(--surface-2, rgba(0,0,0,.05))",
                            color: "var(--muted, #888)",
                            fontSize: 11,
                          }}
                        >
                          s/foto
                        </span>
                      )}
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{quote.webTitle || quote.internalName || quote.visibleNumber}</strong>
                        <span className="muted">
                          {quote.webTitle ? `${quote.internalName} · ` : ""}
                          {quote.visibleNumber} · v{version.version} · {formatArs(version.totalSaleCents)}
                          {isPublished && publication?.publishedVersionNumber
                            ? ` · en la tienda: v${publication.publishedVersionNumber}`
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Pill tone={publicationStatusTone(publication)}>{publicationStatusLabel(publication)}</Pill>
                      {isPublished && publication?.url ? (
                        <a href={publication.url} target="_blank" rel="noreferrer">
                          Ver en la tienda
                        </a>
                      ) : null}
                      <button type="button" className="btn-dark btn-sm" onClick={() => setEditingQuoteId(quote.id)}>
                        {isPublished ? "Abrir" : "Preparar y publicar"}
                      </button>
                      {isStale ? (
                        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void publish(quote)}>
                          {busy ? "Actualizando…" : `Actualizar a v${version.version}`}
                        </button>
                      ) : null}
                      {isPublished ? (
                        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void unpublish(quote)}>
                          {busy ? "Despublicando…" : "Despublicar"}
                        </button>
                      ) : (
                        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void publish(quote)}>
                          {busy ? "Publicando…" : "Publicar sin preparar"}
                        </button>
                      )}
                    </div>
                  </div>

                  {rowErr ? (
                    <div style={{ marginTop: 10 }}>
                      <Alert tone="error">{rowErr}</Alert>
                    </div>
                  ) : publication?.lastError ? (
                    <div style={{ marginTop: 10 }}>
                      <Alert tone="error">
                        {publication.status === "PUBLISHED" ? "La última actualización falló (sigue publicada): " : ""}
                        {publication.lastError}
                      </Alert>
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
