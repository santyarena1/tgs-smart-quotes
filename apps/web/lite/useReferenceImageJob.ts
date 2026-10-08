"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { errorMessage } from "../components/shared";

export type ReferenceImage = { url: string; key: string };
export type GeneratedReference = ReferenceImage & { usedPhoto: boolean; caseName: string | null; costUsdCents: string | number; attached?: string[]; background?: boolean };

export type ReferenceItem = { name: string; quantity: number; imageUrl?: string | null; productId?: string | null };

/** Fondo de la imagen: lo elige el usuario antes de generar. */
export type ReferenceStyle = "gamer" | "oficina";

const GAMER_HINT = /\b(gamer|gaming|rgb|argb|rtx|gtx|geforce|radeon|rx ?\d{3,4}|water ?cool|liquid)\b/i;

/** Fondo que se sugiere según lo que lleva el presupuesto (se muestra marcado, pero el usuario siempre elige). */
export function suggestReferenceStyle(items: ReferenceItem[]): ReferenceStyle {
  return items.some((item) => GAMER_HINT.test(item.name)) ? "gamer" : "oficina";
}

/**
 * Estado de la generación de la imagen de referencia. Vive en el creador y no en la ventana: cerrar la ventana no
 * la cancela, sigue en segundo plano y un globo va avisando el estado. `sig` identifica con qué productos se generó,
 * para avisar si después se cambió el presupuesto.
 */
export type ReferenceJob =
  | { status: "idle" }
  | { status: "generating"; startedAt: number; sig: string; style: ReferenceStyle }
  | { status: "ready"; image: GeneratedReference; sig: string; finishedAt: number; style: ReferenceStyle }
  | { status: "error"; message: string; sig: string; style: ReferenceStyle };

const discardFile = (key: string) => {
  void api("/quote-reference-image", { method: "DELETE", body: { key } }).catch(() => undefined);
};

export function useReferenceImageJob() {
  const [job, setJob] = useState<ReferenceJob>({ status: "idle" });
  const jobRef = useRef(job);
  jobRef.current = job;
  const run = useRef(0);

  /** Arranca la generación. Si había una lista sin decidir, esa se descarta. */
  const start = useCallback(async (items: ReferenceItem[], sig: string, style: ReferenceStyle) => {
    const id = ++run.current;
    const prev = jobRef.current;
    if (prev.status === "ready") discardFile(prev.image.key);
    setJob({ status: "generating", startedAt: Date.now(), sig, style });
    try {
      const image = await api<GeneratedReference>("/quote-reference-image/generate", {
        method: "POST",
        body: { style, items: items.map((i) => ({ name: i.name.trim(), quantity: i.quantity, imageUrl: i.imageUrl ?? null, productId: i.productId || null })) },
      });
      // Si mientras tanto se canceló o se arrancó otra, este resultado ya no sirve.
      if (id !== run.current) { discardFile(image.key); return; }
      setJob({ status: "ready", image, sig, finishedAt: Date.now(), style });
    } catch (err) {
      if (id === run.current) setJob({ status: "error", message: errorMessage(err), sig, style });
    }
  }, []);

  /** Cancela lo que se esté generando y borra la imagen lista que no se incluyó. */
  const discard = useCallback(() => {
    run.current++;
    const prev = jobRef.current;
    if (prev.status === "ready") discardFile(prev.image.key);
    setJob({ status: "idle" });
  }, []);

  /** La imagen lista pasa a ser del presupuesto: ya no se borra. */
  const keep = useCallback((): GeneratedReference | null => {
    const prev = jobRef.current;
    setJob({ status: "idle" });
    return prev.status === "ready" ? prev.image : null;
  }, []);

  useEffect(() => () => {
    run.current++;
    const prev = jobRef.current;
    if (prev.status === "ready") discardFile(prev.image.key);
  }, []);

  return { job, start, discard, keep };
}

/** Segundos transcurridos desde `since` (se actualiza cada segundo mientras haya algo en marcha). */
export function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

export const formatElapsed = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
