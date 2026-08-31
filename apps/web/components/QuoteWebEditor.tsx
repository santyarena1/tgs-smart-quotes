"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiUpload } from "../lib/api";
import { formatArs } from "../lib/money";
import { getActiveVersion, type Quote } from "../lib/types";
import { Alert, Checkbox, Field, Loading, Pill, Tabs, errorMessage } from "./shared";
import { ProductContentEditor } from "./ProductContentEditor";
import { QuotePreview } from "./QuotePreview";

type ProductSummary = { id: string; description: string | null };
type HeroOption = { id: string; url: string | null; productId: string; productName: string };

type PublicationStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "FAILED";
type Publication = { status: PublicationStatus; url: string | null; lastError: string | null };

type Game = { name: string; tier: string };
type Enrichment = {
  descriptionHtml: string | null;
  gamesJson?: Game[] | null;
  programsJson?: unknown[] | null;
  compatibilityJson?: string[] | null;
} | null;

type StepId = "contenido" | "componentes" | "preview";

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

  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  const [enrichment, setEnrichment] = useState<Enrichment>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [gamesDraft, setGamesDraft] = useState<Game[]>([]);
  const [compatDraft, setCompatDraft] = useState<string[]>([]);
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
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);
  /** Se incrementa al publicar/guardar para forzar que la vista previa se rearme. */
  const [previewNonce, setPreviewNonce] = useState(0);

  const version = quote ? getActiveVersion(quote) : null;

  const applyEnrichment = (value: Enrichment) => {
    setEnrichment(value);
    setDescriptionDraft(value?.descriptionHtml ?? "");
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
        // Se cuentan las imágenes de cada componente por adelantado para que el
        // checklist diga la verdad sin tener que abrir ficha por ficha.
        const productIds = Array.from(
          new Set(v.items.map((item) => item.productId).filter((id): id is string => Boolean(id))),
        );
        const counts = await Promise.all(
          productIds.map(async (productId) => {
            try {
              const assets = await api<unknown[]>(`/external-module/products/${productId}/assets`);
              return [productId, assets.length] as const;
            } catch {
              return [productId, 0] as const;
            }
          }),
        );
        setAssetCounts(Object.fromEntries(counts));
        setHeroAssetId((q as { heroAssetId?: string | null }).heroAssetId ?? null);
        try {
          setHeroOptions(await api<HeroOption[]>(`/external-module/quote-families/${quoteId}/hero-options`));
        } catch {
          setHeroOptions([]);
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
      setPreviewNonce((n) => n + 1);
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
      setPreviewNonce((n) => n + 1);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setUploadingThumb(false);
    }
  };

  /** Usa una de las fotos ya cargadas como imagen del hero. */
  const setHeroImage = async (assetId: string | null) => {
    if (!quote) return;
    setSettingHero(true);
    setActionError(null);
    try {
      await api(`/external-module/quote-families/${quote.id}/hero-image`, { method: "PUT", body: { assetId } });
      setHeroAssetId(assetId);
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
            .map((game) => ({ name: game.name.trim(), tier: game.tier.trim() }))
            .filter((game) => game.name && game.tier),
          compatibility: compatDraft.map((line) => line.trim()).filter(Boolean),
          programs: (enrichment?.programsJson as { name: string; note: string }[] | undefined) ?? [],
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
    const linked = items.filter((item) => item.productId);
    const withPhoto = linked.filter((item) => (assetCounts[item.productId as string] ?? 0) > 0).length;
    const withDescription = linked.filter((item) =>
      Boolean(productsById[item.productId as string]?.description?.trim()),
    ).length;
    return [
      {
        id: "titulo",
        label: "Título de la publicación",
        ok: Boolean(quote?.internalName?.trim()),
        detail: quote?.internalName?.trim() ? quote.internalName : "Ponele un nombre comercial a la PC",
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
        ok: linked.length > 0 && withPhoto === linked.length,
        detail: linked.length ? `${withPhoto} de ${linked.length} con foto` : "No hay componentes del catálogo",
      },
      {
        id: "descripciones",
        label: "Descripciones de los componentes",
        ok: linked.length > 0 && withDescription === linked.length,
        detail: linked.length
          ? `${withDescription} de ${linked.length} con descripción`
          : "No hay componentes del catálogo",
      },
    ];
  }, [items, assetCounts, productsById, quote?.internalName, quote?.thumbnailUrl, enrichment?.descriptionHtml]);

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
          <h2 style={{ margin: 0, fontSize: 20 }}>{quote.internalName || quote.visibleNumber}</h2>
          <span className="muted">
            {quote.visibleNumber} · v{version.version} · {formatArs(version.totalSaleCents)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Pill tone={statusTone(publication?.status)}>{statusLabel(publication?.status)}</Pill>
          {isPublished && publication?.url ? (
            <a href={publication.url} target="_blank" rel="noreferrer">
              Ver en la tienda
            </a>
          ) : null}
          {isPublished ? (
            <>
              <button type="button" className="btn-dark btn-sm" disabled={busyPublish} onClick={() => void publish()}>
                {busyPublish ? "Actualizando…" : "Actualizar en la tienda"}
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={busyPublish} onClick={() => void unpublish()}>
                {busyPublish ? "Despublicando…" : "Despublicar"}
              </button>
            </>
          ) : (
            <button type="button" className="btn-dark btn-sm" disabled={busyPublish} onClick={() => void publish()}>
              {busyPublish ? "Publicando…" : "Publicar en la tienda"}
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
            <h3 className="panel-title">Datos generales</h3>
            <Field label="Título" hint="Es el nombre con el que se publica la PC en la tienda.">
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

            <Field
              label="Miniatura"
              hint="Es la imagen chica que se ve en el listado de productos de la tienda y en 'Recomendadas de la casa'. La foto grande del hero se elige aparte, en el paso Componentes."
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {quote.thumbnailUrl ? (
                  <img
                    src={quote.thumbnailUrl}
                    alt="Miniatura actual"
                    style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", borderRadius: 8 }}
                  />
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
              </div>
            </Field>
          </section>

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
                    rows={4}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="Se completa al generar con IA, o escribila vos."
                  />
                </Field>
                {/* Juegos y compatibilidad: la IA los estima, así que se
                    muestran para revisarlos y corregirlos antes de publicar. */}
                <Field
                  label="Juegos y rendimiento"
                  hint="Los estima la IA a partir de los componentes: no son mediciones reales. Revisalos y corregí lo que no te cierre; lo que borres no se publica."
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
                            value={game.tier}
                            placeholder="Ej: Alto 1080p (estimado)"
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
                        onClick={() => setGamesDraft((prev) => [...prev, { name: "", tier: "" }])}
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
                            .then(setHeroOptions)
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
          <QuotePreview key={`${version.id}-${previewNonce}`} versionId={version.id} />
        </section>
      ) : null}
    </div>
  );
}
