"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { errorMessage } from "./shared";

/**
 * Tipos y piezas compartidas de la publicación web de un presupuesto.
 *
 * La publicación es una por presupuesto y fija la versión que está en la
 * tienda. Estos helpers los usan el listado (PublicacionWebView) y el editor
 * (QuoteWebEditor) para hablar el mismo idioma: estado, versión publicada vs.
 * activa, y el progreso de "Preparar y publicar".
 */

export type PublicationStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "FAILED";

export type Publication = {
  status: PublicationStatus;
  url: string | null;
  lastError: string | null;
  lastErrorAt?: string | null;
  publishedAt?: string | null;
  quoteVersionId?: string | null;
  /** Versión cuyo contenido está en la tienda (null si nunca se publicó). */
  publishedVersionNumber?: number | null;
  activeVersionId?: string | null;
  activeVersionNumber?: number | null;
  /** La tienda muestra una versión anterior a la activa del presupuesto. */
  isStale?: boolean;
  webTitle?: string | null;
  webTagline?: string | null;
};

export type PublishRunStepStatus = "PENDING" | "RUNNING" | "DONE" | "SKIPPED" | "FAILED";
export type PublishRunStep = { id: string; label: string; status: PublishRunStepStatus; detail: string | null };
export type PublishRun = {
  id: string;
  quoteFamilyId: string;
  quoteVersionId: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  stepsJson: PublishRunStep[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export const EMPTY_PUBLICATION: Publication = { status: "DRAFT", url: null, lastError: null };

export function publicationStatusLabel(publication: Publication | undefined | null): string {
  const status = publication?.status;
  if (status === "PUBLISHED") return publication?.isStale ? "Publicada (versión anterior)" : "Publicada";
  if (status === "FAILED") return "Error al publicar";
  if (status === "UNPUBLISHED") return "Despublicada";
  return "Sin publicar";
}

export function publicationStatusTone(publication: Publication | undefined | null): "ok" | "bad" | "warn" | "neutral" {
  const status = publication?.status;
  if (status === "PUBLISHED") return publication?.isStale ? "warn" : "ok";
  if (status === "FAILED") return "bad";
  return "neutral";
}

export function loadPublication(familyId: string): Promise<Publication> {
  return api<Publication>(`/external-module/quote-families/${familyId}/publication`).catch(() => EMPTY_PUBLICATION);
}

/**
 * Sigue una corrida de "Preparar y publicar": arranca una nueva o retoma la
 * última, y la consulta cada 2,5 s mientras está en marcha.
 */
export function usePublishRun(familyId: string | null, onFinished?: (run: PublishRun) => void) {
  const [run, setRun] = useState<PublishRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const loadLatest = useCallback(async () => {
    if (!familyId) return;
    try {
      const latest = await api<PublishRun | null>(`/external-module/quote-families/${familyId}/prepare/latest`);
      // Una corrida vieja ya no aporta nada al abrir la pantalla: se retoma
      // solo si sigue en marcha o terminó hace poco.
      const recent = latest && (latest.status === "RUNNING" || Date.now() - new Date(latest.finishedAt ?? latest.startedAt).getTime() < 6 * 3_600_000);
      setRun(recent ? latest : null);
    } catch {
      setRun(null);
    }
  }, [familyId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (!run || run.status !== "RUNNING") return;
    const timer = window.setInterval(async () => {
      try {
        const next = await api<PublishRun>(`/external-module/publish-runs/${run.id}`);
        setRun(next);
        if (next.status !== "RUNNING") onFinishedRef.current?.(next);
      } catch (err) {
        setError(errorMessage(err));
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [run]);

  const start = useCallback(
    async (options: { versionId?: string | null; publish?: boolean } = {}) => {
      if (!familyId) return;
      setStarting(true);
      setError(null);
      try {
        const next = await api<PublishRun>(`/external-module/quote-families/${familyId}/prepare`, {
          method: "POST",
          body: { versionId: options.versionId ?? null, publish: options.publish !== false },
        });
        setRun(next);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setStarting(false);
      }
    },
    [familyId],
  );

  const dismiss = useCallback(() => setRun(null), []);

  return { run, start, starting, error, dismiss, running: run?.status === "RUNNING" };
}

function stepIcon(status: PublishRunStepStatus): { glyph: string; bg: string; color: string } {
  if (status === "DONE") return { glyph: "✓", bg: "rgba(34,197,94,.16)", color: "#15803d" };
  if (status === "SKIPPED") return { glyph: "–", bg: "rgba(148,163,184,.2)", color: "#475569" };
  if (status === "FAILED") return { glyph: "!", bg: "rgba(239,68,68,.16)", color: "#b91c1c" };
  if (status === "RUNNING") return { glyph: "…", bg: "rgba(59,130,246,.16)", color: "#1d4ed8" };
  return { glyph: "", bg: "rgba(148,163,184,.12)", color: "#94a3b8" };
}

/** Panel con el progreso paso a paso de una corrida. */
export function PublishRunPanel({ run, onDismiss }: { run: PublishRun; onDismiss?: () => void }) {
  const steps = Array.isArray(run.stepsJson) ? run.stepsJson : [];
  const running = run.status === "RUNNING";
  const failedSteps = steps.filter((step) => step.status === "FAILED").length;
  const title = running
    ? "Preparando la publicación…"
    : run.status === "FAILED"
      ? "La publicación falló"
      : failedSteps
        ? `Publicada, con ${failedSteps} ${failedSteps === 1 ? "paso que falló" : "pasos que fallaron"}`
        : "Publicación lista";
  return (
    <section className="card card-pad" style={{ marginTop: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 className="panel-title" style={{ margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {new Date(run.startedAt).toLocaleString("es-AR")}
          </span>
          {!running && onDismiss ? (
            <button type="button" className="btn-ghost btn-sm" onClick={onDismiss}>Ocultar</button>
          ) : null}
        </div>
      </div>
      {run.error && run.status === "FAILED" ? <div className="alert alert-error">{run.error}</div> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {steps.map((step) => {
          const icon = stepIcon(step.status);
          return (
            <div key={step.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "start" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  background: icon.bg,
                  color: icon.color,
                  marginTop: 1,
                }}
              >
                {icon.glyph}
              </span>
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 13.5, color: step.status === "PENDING" ? "var(--muted, #94a3b8)" : undefined }}>
                  {step.label}
                </strong>
                {step.detail ? (
                  <span className="muted" style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{step.detail}</span>
                ) : step.status === "RUNNING" ? (
                  <span className="muted" style={{ fontSize: 12.5 }}>En curso…</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
