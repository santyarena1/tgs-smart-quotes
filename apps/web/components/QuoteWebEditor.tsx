"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiUpload, generateFamilyThumbnailAi } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Quote } from "../lib/types";
import { Alert, Checkbox, Field, Loading, Modal, Pill, Tabs, errorMessage } from "./shared";
import { ProductContentEditor } from "./ProductContentEditor";
import { QuoteItemContentEditor } from "./QuoteItemContentEditor";
import { QuotePreview } from "./QuotePreview";
import {
  loadPublication,
  publicationStatusLabel,
  publicationStatusTone,
  PublishRunPanel,
  usePublishRun,
  type Publication,
} from "./publication";

type ProductSummary = { id: string; description: string | null };
type HeroOption = { id: string; url: string | null; productId: string; productName: string };

type Game = { name: string; tier: string; resolution?: string | null; settings?: string | null; fps?: string | null; note?: string | null };
type Enrichment = {
  descriptionHtml: string | null;
  gamesJson?: Game[] | null;
  programsJson?: unknown[] | null;
  compatibilityJson?: string[] | null;
  title?: string | null;
  tagline?: string | null;
  shortDescription?: string | null;
  highlightsJson?: string[] | null;
  audience?: string | null;
} | null;

type StepId = "contenido" | "componentes" | "preview";

function countByProduct(options: HeroOption[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const option of options) counts[option.productId] = (counts[option.productId] ?? 0) + 1;
  return counts;
}

type Props = {
  quoteId: string;
  onClose: () => void;
  /** Se llama después de publicar/despublicar o cambiar el título, para refrescar la lista. */
  onChanged?: () => void;
};

/**
 * Pantalla para dejar una PC lista para publicar.
 *
 * Está organizada como un recorrido de tres pasos (contenido → componentes →
 * vista previa) con un checklist arriba que dice qué falta antes de publicar,
 * en vez de una sola pantalla larga donde no se sabía por dónde empezar.
 */
export function QuoteWebEditor({ quoteId, onClose, onChanged }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyPublish, setBusyPublish] = useState(false);
  const [step, setStep] = useState<StepId>("contenido");

  /** Título y bajada con los que sale en la tienda (no es el nombre interno). */
  const [titleDraft, setTitleDraft] = useState("");
  const [taglineDraft, setTaglineDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const [thumbNotice, setThumbNotice] = useState<string | null>(null);
  const [thumbOpen, setThumbOpen] = useState(false);

  const [enrichment, setEnrichment] = useState<Enrichment>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [gamesDraft, setGamesDraft] = useState<Game[]>([]);
  const [compatDraft, setCompatDraft] = useState<string[]>([]);
  const [shortDescriptionDraft, setShortDescriptionDraft] = useState("");
  const [highlightsDraft, setHighlightsDraft] = useState("");
  const [audienceDraft, setAudienceDraft] = useState("");
  const [loadingEnrichment, setLoadingEnrichment] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingEnrichment, setSavingEnrichment] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [productsById, setProductsById] = useState<Record<string, ProductSummary>>({});
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
  /** Fotos ya cargadas en los componentes, para poder elegir la del hero. */
  const [heroOptions, setHeroOptions] = useState<HeroOption[]>([]);
  const [settingHero, setSettingHero] = useState(false);
  const [heroAssetId, setHeroAssetId] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  /** Contenido web propio de los items escritos a mano (sin catalogo). */
  const [itemContent, setItemContent] = useState<Record<string, { description?: string | null; imageUrl?: string | null }>>({});
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);
  /** Se incrementa al publicar/guardar para forzar que la vista previa se rearme. */
  const [previewNonce, setPreviewNonce] = useState(0);

  const version = quote ? getActiveVersion(quote) : null;

  const refreshPublication = useCallback(async () => {
    setPublication(await loadPublication(quoteId));
  }, [quoteId]);

  const applyEnrichment = (value: Enrichment) => {
    setEnrichment(value);
    setDescriptionDraft(value?.descriptionHtml ?? "");
    setShortDescriptionDraft(value?.shortDescription ?? "");
    setHighlightsDraft(Array.isArray(value?.highlightsJson) ? value.highlightsJson.join("\n") : "");
    setAudienceDraft(value?.audience ?? "");
    // Lo que genera la IA se deja editable a propósito: son estimaciones y
    // conviene poder corregirlas antes de que salgan publicadas.
    setGamesDraft(Array.isArray(value?.gamesJson) ? value.gamesJson : []);
    setCompatDraft(Array.isArray(value?.compatibilityJson) ? value.compatibilityJson : []);
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
      setTitleDraft(q.webTitle ?? "");
      setTaglineDraft(q.webTagline ?? "");
      setProductsById(Object.fromEntries(products.map((p) => [p.id, p])));
      const v = getActiveVersion(q);
      setPublication(await loadPublication(quoteId));
      if (v) {
        const familia = q as { heroAssetId?: string | null; heroImageUrl?: string | null };
        setHeroAssetId(familia.heroAssetId ?? null);
        setHeroImageUrl(familia.heroImageUrl ?? null);
        setItemContent(
          Object.fromEntries(
            v.items.map((it) => [
              it.id ?? "",
              {
                description: (it as { webDescription?: string | null }).webDescription ?? null,
                imageUrl: (it as { webImageUrl?: string | null }).webImageUrl ?? null,
              },
            ]),
          ),
        );
        // Las fotos listas de cada componente salen de hero-options (una sola
        // petición): pedir las imágenes producto por producto pasaba el rate
        // limit con PCs de muchos componentes.
        try {
          const options = await api<HeroOption[]>(`/external-module/quote-families/${quoteId}/hero-options`);
          setHeroOptions(options);
          setAssetCounts(countByProduct(options));
        } catch {
          setHeroOptions([]);
          setAssetCounts({});
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

  /* Al terminar "Preparar y publicar" se recarga todo: el pipeline pudo haber
     agregado fotos, textos, título y miniatura. */
  const pipeline = usePublishRun(quoteId, () => {
    void load();
    if (version) void loadEnrichment(version.id);
    onChanged?.();
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (version) void loadEnrichment(version.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id]);

  /** Publica (o actualiza) en la tienda la versión activa, sin preparar nada. */
  const publish = async (versionId?: string | null) => {
    if (!quote) return;
    setBusyPublish(true);
    setActionError(null);
    try {
      const next = await api<Publication>(`/external-module/quote-families/${quote.id}/publish`, {
        method: "POST",
        body: { versionId: versionId ?? version?.id ?? null },
      });
      setPublication(next);
      setPreviewNonce((n) => n + 1);
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
      await refreshPublication();
    } finally {
      setBusyPublish(false);
    }
  };

  const unpublish = async () => {
    if (!quote) return;
    setBusyPublish(true);
    setActionError(null);
    try {
      const next = await api<Publication>(`/external-module/quote-families/${quote.id}/unpublish`, { method: "POST" });
      setPublication(next);
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyPublish(false);
    }
  };

  const saveTitle = async (override?: { webTitle?: string; webTagline?: string }) => {
    if (!quote) return;
    const webTitle = (override?.webTitle ?? titleDraft).trim();
    const webTagline = (override?.webTagline ?? taglineDraft).trim();
    setSavingTitle(true);
    setActionError(null);
    try {
      await api(`/external-module/quote-families/${quote.id}/publish-settings`, {
        method: "PUT",
        body: { webTitle: webTitle || null, webTagline: webTagline || null },
      });
      setTitleDraft(webTitle);
      setTaglineDraft(webTagline);
      setQuote((prev) => (prev ? { ...prev, webTitle: webTitle || null, webTagline: webTagline || null } : prev));
      setPreviewNonce((n) => n + 1);
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSavingTitle(false);
    }
  };

  /** Rehace título (formato de specs) y bajada con IA y los guarda, pisando lo que había. */
  const regenerateTitle = async () => {
    if (!quote || !version) return;
    setGeneratingTitle(true);
    setActionError(null);
    try {
      const next = await api<{ webTitle: string | null; webTagline: string | null; ai: { usedAi: boolean } }>(
        `/external-module/quote-families/${quote.id}/generate-title`,
        { method: "POST", body: { versionId: version.id, apply: true } },
      );
      setTitleDraft(next.webTitle ?? "");
      setTaglineDraft(next.webTagline ?? "");
      setQuote((prev) => (prev ? { ...prev, webTitle: next.webTitle, webTagline: next.webTagline } : prev));
      setPreviewNonce((n) => n + 1);
      onChanged?.();
      if (!next.ai.usedAi) setActionError("El título se armó por reglas; la bajada necesita la IA activada (Ajustes → IA).");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setGeneratingTitle(false);
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

  // Miniatura según Ajustes → Miniaturas (plantilla TGS o escena con IA):
  // cada click la vuelve a armar, así que se puede insistir hasta que guste.
  // regenerateCase: vuelve a procesar el gabinete con IA partiendo SIEMPRE de
  // la foto original (nunca de un resultado anterior), por si salió raro.
  const generateThumbnailAi = async (regenerateCase = false) => {
    if (!quote) return;
    setGeneratingThumb(true);
    setActionError(null);
    setThumbNotice(null);
    try {
      const next = await generateFamilyThumbnailAi(quote.id, { regenerateCase });
      setQuote((prev) => (prev ? { ...prev, thumbnailUrl: next.thumbnailUrl } : prev));
      setThumbNotice(next.detail);
      setPreviewNonce((n) => n + 1);
      // Se abre en grande apenas está lista, para verla sin recargar.
      setThumbOpen(true);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setGeneratingThumb(false);
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
      setPreviewNonce((n) => n + 1);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setUploadingThumb(false);
    }
  };

  /** Usa una de las fotos ya cargadas como imagen del hero. */
  const setHeroImage = async (assetId: string | null, imageUrl?: string) => {
    if (!quote) return;
    setSettingHero(true);
    setActionError(null);
    try {
      const body = imageUrl ? { imageUrl } : { assetId };
      await api(`/external-module/quote-families/${quote.id}/hero-image`, { method: "PUT", body });
      setHeroAssetId(imageUrl ? null : assetId);
      setHeroImageUrl(imageUrl ?? null);
      setPreviewNonce((n) => n + 1);
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSettingHero(false);
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
      setPreviewNonce((n) => n + 1);
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
          // Se descartan las filas vacías para no publicar juegos sin nombre.
          games: gamesDraft
            .map((game) => ({
              name: game.name.trim(),
              tier: game.tier.trim(),
              resolution: game.resolution?.trim() || null,
              settings: game.settings?.trim() || null,
              fps: game.fps?.trim() || null,
              note: game.note?.trim() || null,
            }))
            .filter((game) => game.name && game.tier),
          compatibility: compatDraft.map((line) => line.trim()).filter(Boolean),
          programs: (enrichment?.programsJson as { name: string; note: string }[] | undefined) ?? [],
          shortDescription: shortDescriptionDraft.trim() || null,
          highlights: highlightsDraft.split("\n").map((line) => line.trim()).filter(Boolean),
          audience: audienceDraft.trim() || null,
        },
      });
      applyEnrichment(value);
      setPreviewNonce((n) => n + 1);
      setAiNotice("Guardado.");
    } catch (err) {
      setAiError(errorMessage(err));
    } finally {
      setSavingEnrichment(false);
    }
  };

  const items = version?.items ?? [];
  const heroImage = heroOptions.find((option) => option.id === heroAssetId) ?? null;

  /**
   * Qué falta para que la ficha salga completa. No bloquea la publicación
   * (se puede publicar igual), pero avisa antes en vez de después.
   */
  const checklist = useMemo(() => {
    // Se cuentan todos los componentes: los del catálogo por su producto y los
    // escritos a mano por el contenido guardado en el propio ítem.
    const total = items.length;
    const withPhoto = items.filter((item) =>
      item.productId
        ? (assetCounts[item.productId] ?? 0) > 0
        : Boolean(itemContent[item.id ?? ""]?.imageUrl),
    ).length;
    const withDescription = items.filter((item) =>
      item.productId
        ? Boolean(productsById[item.productId]?.description?.trim())
        : Boolean(itemContent[item.id ?? ""]?.description?.trim()),
    ).length;
    return [
      {
        id: "titulo",
        label: "Título en la tienda",
        ok: Boolean(quote?.webTitle?.trim()),
        detail: quote?.webTitle?.trim()
          ? quote.webTitle
          : "Sin título comercial: se publica con el nombre interno. \"Preparar y publicar\" propone uno con IA",
      },
      {
        id: "descripcion",
        label: "Descripción de la PC",
        ok: Boolean(enrichment?.descriptionHtml?.trim()),
        detail: enrichment?.descriptionHtml?.trim()
          ? "Lista"
          : "Generala con IA o escribila en el paso Contenido",
      },
      {
        id: "miniatura",
        label: "Imagen destacada",
        ok: Boolean(quote?.thumbnailUrl),
        detail: quote?.thumbnailUrl ? "Cargada" : "Sin miniatura, la ficha va a salir sin foto principal",
      },
      {
        id: "fotos",
        label: "Fotos de los componentes",
        ok: total > 0 && withPhoto === total,
        detail: total ? `${withPhoto} de ${total} con foto` : "No hay componentes",
      },
      {
        id: "descripciones",
        label: "Descripciones de los componentes",
        ok: total > 0 && withDescription === total,
        detail: total
          ? `${withDescription} de ${total} con descripción`
          : "No hay componentes",
      },
    ];
  }, [items, assetCounts, productsById, itemContent, quote?.webTitle, quote?.thumbnailUrl, enrichment?.descriptionHtml]);

  const pending = checklist.filter((entry) => !entry.ok).length;

  if (loading) {
    return (
      <div style={{ marginTop: 20 }}>
        <Loading label="Cargando presupuesto…" />
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
  const isStale = Boolean(isPublished && publication?.isStale);
  const busy = busyPublish || pipeline.starting || pipeline.running;
  const publishedLabel = isPublished && publication?.publishedVersionNumber
    ? `En la tienda: v${publication.publishedVersionNumber}${isStale ? ` · esta es la v${version.version}` : ""}`
    : null;

  return (
    <div>
      <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
        ← Volver al listado
      </button>

      {/* Cabecera: identidad de la PC + la acción principal siempre a mano */}
      <div
        className="card card-pad"
        style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}
      >
        <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{quote.webTitle || quote.internalName || quote.visibleNumber}</h2>
          <span className="muted">
            {quote.internalName} · {quote.visibleNumber} · v{version.version} · {formatArs(version.totalSaleCents)}
          </span>
          {publishedLabel ? <span className="muted" style={{ fontSize: 12.5 }}>{publishedLabel}</span> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Pill tone={publicationStatusTone(publication)}>{publicationStatusLabel(publication)}</Pill>
          {isPublished && publication?.url ? (
            <a href={publication.url} target="_blank" rel="noreferrer">
              Ver en la tienda
            </a>
          ) : null}
          {/* La acción principal completa lo que falta y publica. Publicar
              "a secas" queda como opción secundaria para cuando ya está todo. */}
          <button
            type="button"
            className="btn-dark btn-sm"
            disabled={busy}
            onClick={() => void pipeline.start({ versionId: version.id, publish: true })}
            title="Busca imágenes que falten, genera textos y título con IA, arma la miniatura y publica"
          >
            {pipeline.running ? "Preparando…" : isStale ? `Preparar y actualizar a v${version.version}` : isPublished ? "Preparar y actualizar" : "Preparar y publicar"}
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void publish(version.id)}>
            {busyPublish ? "Publicando…" : isStale ? `Actualizar a v${version.version} sin preparar` : isPublished ? "Actualizar sin preparar" : "Publicar sin preparar"}
          </button>
          {isPublished ? (
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void unpublish()}>
              Despublicar
            </button>
          ) : null}
        </div>
      </div>

      {isStale ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="info">
            La tienda sigue mostrando la v{publication?.publishedVersionNumber} tal como se publicó. La v{version.version} no se
            envía hasta que la actualices desde acá.
          </Alert>
        </div>
      ) : null}

      {actionError || pipeline.error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="error">{actionError ?? pipeline.error}</Alert>
        </div>
      ) : publication?.lastError ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="error">
            {publication.status === "PUBLISHED" ? "La última actualización falló (el producto sigue publicado): " : ""}
            {publication.lastError}
          </Alert>
        </div>
      ) : null}

      {pipeline.run ? <PublishRunPanel run={pipeline.run} onDismiss={pipeline.dismiss} /> : null}

      {/* Checklist: qué falta antes de publicar */}
      <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            {pending === 0 ? "Todo listo para publicar" : `Falta completar ${pending} ${pending === 1 ? "cosa" : "cosas"}`}
          </h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Podés publicar igual: esto es una guía, no un bloqueo.
          </span>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {checklist.map((entry) => (
            <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flex: "0 0 auto",
                  background: entry.ok ? "rgba(34,197,94,.16)" : "rgba(234,179,8,.18)",
                  color: entry.ok ? "#15803d" : "#a16207",
                }}
              >
                {entry.ok ? "✓" : "!"}
              </span>
              <strong style={{ fontSize: 13.5 }}>{entry.label}</strong>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {entry.detail}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 16 }}>
        <Tabs<StepId>
          tabs={[
            { id: "contenido", label: "1 · Contenido" },
            { id: "componentes", label: `2 · Componentes (${items.length})` },
            { id: "preview", label: "3 · Vista previa" },
          ]}
          active={step}
          onChange={setStep}
        />
      </div>

      {step === "contenido" ? (
        <>
          <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 className="panel-title" style={{ margin: 0 }}>Datos generales</h3>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={generatingTitle || savingTitle}
                title="Rehace el título con formato de specs y la bajada con IA, y los guarda"
                onClick={() => void regenerateTitle()}
              >
                {generatingTitle ? "Generando…" : "Regenerar título y bajada con IA"}
              </button>
            </div>
            <Field
              label="Título en la tienda"
              hint={`Formato: PC GAMER | procesador - RAM - disco - placa de video | Windows. Se arma solo desde los componentes al preparar la publicación. El nombre interno (${quote.internalName}) no cambia; si lo dejás vacío se publica con el nombre interno.`}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={titleDraft}
                  style={{ flex: "1 1 260px" }}
                  placeholder="Ej: PC GAMER | RYZEN 5 7600X - RAM 16GB - 512GB M.2 - RTX 3070 8GB | WINDOWS 11"
                  onChange={(e) => setTitleDraft(e.target.value)}
                />
                {enrichment?.title && enrichment.title !== titleDraft.trim() ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={savingTitle}
                    title={enrichment.title}
                    onClick={() => void saveTitle({ webTitle: enrichment.title ?? "" })}
                  >
                    Usar título con formato de specs
                  </button>
                ) : null}
              </div>
            </Field>
            <Field label="Bajada" hint="Una oración debajo del título, con el beneficio principal.">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={taglineDraft}
                  style={{ flex: "1 1 260px" }}
                  placeholder="Ej: Juegos actuales en alto sin bajar la resolución."
                  onChange={(e) => setTaglineDraft(e.target.value)}
                />
                {enrichment?.tagline && enrichment.tagline !== taglineDraft.trim() ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={savingTitle}
                    title={enrichment.tagline}
                    onClick={() => void saveTitle({ webTagline: enrichment.tagline ?? "" })}
                  >
                    Usar propuesta de la IA
                  </button>
                ) : null}
              </div>
            </Field>
            <div>
              <button
                type="button"
                className="btn-dark btn-sm"
                disabled={savingTitle || (titleDraft.trim() === (quote.webTitle ?? "") && taglineDraft.trim() === (quote.webTagline ?? ""))}
                onClick={() => void saveTitle()}
              >
                {savingTitle ? "Guardando…" : "Guardar título y bajada"}
              </button>
            </div>

            <Checkbox
              label="Actualizar precio automáticamente desde el catálogo (y re-publicar sola si ya estaba en la tienda)"
              checked={Boolean(quote.autoRepublish)}
              disabled={savingAuto}
              onChange={(v) => void toggleAutoRepublish(v)}
            />

            <Field
              label="Miniatura"
              hint="Es la imagen chica que se ve en el listado de productos de la tienda y en 'Recomendadas de la casa'. La foto grande del hero se elige aparte, en el paso Componentes."
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {quote.thumbnailUrl ? (
                  <button
                    type="button"
                    title="Ver en grande"
                    onClick={() => setThumbOpen(true)}
                    style={{ padding: 0, border: "1px solid var(--line, #ddd)", background: "#fff", borderRadius: 8, cursor: "zoom-in", lineHeight: 0 }}
                  >
                    <img
                      src={quote.thumbnailUrl}
                      alt="Miniatura actual"
                      style={{ width: 96, height: 96, objectFit: "contain", borderRadius: 8 }}
                    />
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: 12.5 }}>Sin miniatura cargada.</span>
                )}
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
                <button type="button" className="btn-ghost btn-sm" disabled={generatingThumb || uploadingThumb} onClick={() => void generateThumbnailAi()}>
                  {generatingThumb ? "Generando…" : quote.thumbnailUrl ? "Regenerar miniatura" : "Generar miniatura"}
                </button>
                {thumbNotice ? <span className="muted" style={{ fontSize: 12.5 }}>{thumbNotice}</span> : null}
              </div>
            </Field>
          </section>

          <Modal open={thumbOpen && Boolean(quote.thumbnailUrl)} title="Miniatura" onClose={() => setThumbOpen(false)} wide>
            <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
              {quote.thumbnailUrl ? (
                <img src={quote.thumbnailUrl} alt="Miniatura" style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: 10, background: "#111" }} />
              ) : null}
              {thumbNotice ? <span className="muted" style={{ fontSize: 12.5 }}>{thumbNotice}</span> : null}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn-dark btn-sm" disabled={generatingThumb} onClick={() => void generateThumbnailAi()}>
                  {generatingThumb ? "Generando…" : "Regenerar"}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={generatingThumb}
                  title="Vuelve a procesar el gabinete con IA desde la foto original (solo si está activo en Ajustes → Miniaturas)"
                  onClick={() => void generateThumbnailAi(true)}
                >
                  Rehacer gabinete con IA
                </button>
                {quote.thumbnailUrl ? (
                  <a className="btn-ghost btn-sm" href={quote.thumbnailUrl} target="_blank" rel="noopener">
                    Abrir en pestaña nueva
                  </a>
                ) : null}
              </div>
            </div>
          </Modal>

          <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 className="panel-title" style={{ margin: 0 }}>
                Descripción de la PC
              </h3>
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
                <Field label="Texto que se muestra en la ficha">
                  <textarea
                    rows={5}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="Se completa al generar con IA, o escribila vos."
                  />
                </Field>
                <Field
                  label="Descripción corta"
                  hint="1 o 2 oraciones. La usan los buscadores y los catálogos de redes (Google, Instagram, Facebook)."
                >
                  <textarea rows={2} value={shortDescriptionDraft} onChange={(e) => setShortDescriptionDraft(e.target.value)} />
                </Field>
                <Field label="Puntos fuertes" hint="Uno por línea. Salen como lista con tilde debajo del título.">
                  <textarea rows={4} value={highlightsDraft} onChange={(e) => setHighlightsDraft(e.target.value)} />
                </Field>
                <Field label="Para quién es" hint="Una oración. Se muestra arriba de la sección de juegos.">
                  <input value={audienceDraft} onChange={(e) => setAudienceDraft(e.target.value)} />
                </Field>
                {/* Juegos y compatibilidad: la IA los estima, así que se
                    muestran para revisarlos y corregirlos antes de publicar. */}
                <Field
                  label="Juegos y rendimiento"
                  hint="Los estima la IA a partir de los componentes: no son mediciones reales. Por juego: nombre, resolución, calidad, rango de FPS y el texto que se muestra. Lo que borres no se publica."
                >
                  <div style={{ display: "grid", gap: 8 }}>
                    {gamesDraft.length === 0 ? (
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        Todavía no hay juegos cargados. Generá con IA o agregalos a mano.
                      </span>
                    ) : (
                      gamesDraft.map((game, index) => (
                        <div key={index} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <input
                            value={game.name}
                            placeholder="Juego"
                            style={{ flex: "1 1 180px" }}
                            onChange={(e) =>
                              setGamesDraft((prev) =>
                                prev.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)),
                              )
                            }
                          />
                          <input
                            value={game.resolution ?? ""}
                            placeholder="1080p"
                            style={{ flex: "0 1 90px" }}
                            onChange={(e) =>
                              setGamesDraft((prev) =>
                                prev.map((row, i) => (i === index ? { ...row, resolution: e.target.value } : row)),
                              )
                            }
                          />
                          <input
                            value={game.settings ?? ""}
                            placeholder="Alto"
                            style={{ flex: "0 1 90px" }}
                            onChange={(e) =>
                              setGamesDraft((prev) =>
                                prev.map((row, i) => (i === index ? { ...row, settings: e.target.value } : row)),
                              )
                            }
                          />
                          <input
                            value={game.fps ?? ""}
                            placeholder="90-120 FPS"
                            style={{ flex: "0 1 110px" }}
                            onChange={(e) =>
                              setGamesDraft((prev) =>
                                prev.map((row, i) => (i === index ? { ...row, fps: e.target.value } : row)),
                              )
                            }
                          />
                          <input
                            value={game.tier}
                            placeholder="Ej: 1080p Alto (estimado)"
                            style={{ flex: "1 1 180px" }}
                            onChange={(e) =>
                              setGamesDraft((prev) =>
                                prev.map((row, i) => (i === index ? { ...row, tier: e.target.value } : row)),
                              )
                            }
                          />
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => setGamesDraft((prev) => prev.filter((_, i) => i !== index))}
                          >
                            Quitar
                          </button>
                        </div>
                      ))
                    )}
                    <div>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setGamesDraft((prev) => [...prev, { name: "", tier: "", resolution: "", settings: "", fps: "", note: "" }])}
                      >
                        + Agregar juego
                      </button>
                    </div>
                  </div>
                </Field>

                <Field
                  label="Notas de compatibilidad"
                  hint="También las estima la IA y son orientativas. Sacá cualquiera que no sea cierta."
                >
                  <div style={{ display: "grid", gap: 8 }}>
                    {compatDraft.length === 0 ? (
                      <span className="muted" style={{ fontSize: 12.5 }}>Sin notas cargadas.</span>
                    ) : (
                      compatDraft.map((line, index) => (
                        <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            value={line}
                            style={{ flex: 1 }}
                            onChange={(e) =>
                              setCompatDraft((prev) => prev.map((row, i) => (i === index ? e.target.value : row)))
                            }
                          />
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => setCompatDraft((prev) => prev.filter((_, i) => i !== index))}
                          >
                            Quitar
                          </button>
                        </div>
                      ))
                    )}
                    <div>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setCompatDraft((prev) => [...prev, ""])}
                      >
                        + Agregar nota
                      </button>
                    </div>
                  </div>
                </Field>

                <div>
                  <button type="button" className="btn-dark btn-sm" disabled={savingEnrichment} onClick={() => void saveEnrichment()}>
                    {savingEnrichment ? "Guardando…" : "Guardar contenido"}
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      {step === "componentes" ? (
        <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Componentes de la PC
          </h3>
          <span className="muted">
            La foto y la descripción de cada componente se reutilizan en cualquier otra PC que lo incluya.
          </span>
          {/* El hero se define acá, marcando una de estas fotos: es lo que
              esperaba el usuario, en vez de un campo aparte más arriba. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--surface-2, rgba(0,0,0,.04))",
            }}
          >
            <strong style={{ fontSize: 13 }}>Foto grande de la ficha (hero):</strong>
            {heroImage ? (
              <>
                <img
                  src={heroImage.url ?? ""}
                  alt=""
                  style={{ width: 40, height: 40, objectFit: "contain", background: "#fff", borderRadius: 6 }}
                />
                <span className="muted" style={{ fontSize: 12.5 }}>{heroImage.productName}</span>
                <button type="button" className="btn-ghost btn-sm" disabled={settingHero} onClick={() => void setHeroImage(null)}>
                  Quitar
                </button>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 12.5 }}>
                Ninguna elegida — abrí un componente y marcá una foto con "Usar en el hero". Mientras tanto se usa la miniatura.
              </span>
            )}
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
            {items.map((item, i) => {
              const itemKey = item.productId ?? item.id ?? String(i);
              const itemEditing = editingItemKey === itemKey;
              const product = item.productId ? productsById[item.productId] : undefined;
              const hasDescription = Boolean(product?.description?.trim());
              const knownAssetCount = item.productId ? assetCounts[item.productId] : undefined;
              return (
                <div key={itemKey} className="card card-pad" style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5 }}>
                      <strong>{item.quantity} ×</strong> {item.frozenName ?? item.name}
                    </span>
                    {item.productId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Pill tone={knownAssetCount && knownAssetCount > 0 ? "ok" : "warn"}>
                          {knownAssetCount && knownAssetCount > 0 ? `${knownAssetCount} imagen(es)` : "Sin imágenes"}
                        </Pill>
                        <Pill tone={hasDescription ? "ok" : "warn"}>
                          {hasDescription ? "Con descripción" : "Sin descripción"}
                        </Pill>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setEditingItemKey(itemEditing ? null : itemKey)}
                        >
                          {itemEditing ? "Cerrar" : "Editar ficha"}
                        </button>
                      </div>
                    ) : (
                      /* Componente escrito a mano: se edita igual, pero lo que
                         se carga queda guardado en este presupuesto. */
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Pill tone={itemContent[item.id ?? ""]?.imageUrl ? "ok" : "warn"}>
                          {itemContent[item.id ?? ""]?.imageUrl ? "Con foto" : "Sin foto"}
                        </Pill>
                        <Pill tone={itemContent[item.id ?? ""]?.description ? "ok" : "warn"}>
                          {itemContent[item.id ?? ""]?.description ? "Con descripción" : "Sin descripción"}
                        </Pill>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setEditingItemKey(itemEditing ? null : itemKey)}
                        >
                          {itemEditing ? "Cerrar" : "Editar ficha"}
                        </button>
                      </div>
                    )}
                  </div>

                  {itemEditing && !item.productId && item.id ? (
                    <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                      <QuoteItemContentEditor
                        itemId={item.id as string}
                        itemName={item.frozenName ?? item.name}
                        description={itemContent[item.id ?? ""]?.description ?? null}
                        imageUrl={itemContent[item.id ?? ""]?.imageUrl ?? null}
                        esHero={Boolean(
                          itemContent[item.id ?? ""]?.imageUrl &&
                            heroImageUrl === itemContent[item.id ?? ""]?.imageUrl,
                        )}
                        onUseAsHero={(url) => void setHeroImage(null, url)}
                        onChanged={(cambios) => {
                          const id = item.id as string;
                          setItemContent((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], ...cambios },
                          }));
                          setPreviewNonce((n) => n + 1);
                        }}
                      />
                    </div>
                  ) : null}
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
                          setPreviewNonce((n) => n + 1);
                        }}
                        heroAssetId={heroAssetId}
                        onUseAsHero={(assetId) => void setHeroImage(assetId)}
                        onAssetsChange={(assets) => {
                          const pid = item.productId as string;
                          setAssetCounts((prev) => ({ ...prev, [pid]: assets.length }));
                          // Las fotos disponibles para el hero cambian con las
                          // imágenes del componente.
                          void api<HeroOption[]>(`/external-module/quote-families/${quoteId}/hero-options`)
                            .then((options) => {
                              setHeroOptions(options);
                              setAssetCounts(countByProduct(options));
                            })
                            .catch(() => undefined);
                          setPreviewNonce((n) => n + 1);
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === "preview" ? (
        <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 className="panel-title" style={{ margin: 0 }}>
              Así se va a publicar
            </h3>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Es el mismo contenido que se le manda a la tienda. Los colores y qué secciones se muestran
              los define la variante de diseño en WordPress.
            </span>
          </div>
          <QuotePreview key={`${version.id}-${previewNonce}`} familyId={quote.id} versionId={version.id} />
        </section>
      ) : null}
    </div>
  );
}
