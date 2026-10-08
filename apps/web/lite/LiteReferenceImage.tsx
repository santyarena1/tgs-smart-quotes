"use client";

import { useState } from "react";
import { formatElapsed, useElapsed, type GeneratedReference, type ReferenceImage, type ReferenceJob, type ReferenceStyle } from "./useReferenceImageJob";

export type { ReferenceImage, ReferenceStyle } from "./useReferenceImageJob";

/** Mensajes que van rotando mientras se genera: la IA no informa avance real, esto solo acompaña la espera. */
const PHASES = [
  "Leyendo los componentes del presupuesto…",
  "Armando el gabinete…",
  "Colocando procesador, placa de video y memorias…",
  "Ajustando luces y cables…",
  "Dando los últimos retoques…",
];
const PHASE_SECONDS = 9;
const phaseText = (seconds: number) => PHASES[Math.min(PHASES.length - 1, Math.floor(seconds / PHASE_SECONDS))]!;

export const REFERENCE_WARNING = "Imagen ilustrativa generada con IA. Puede no coincidir al 100 % con los componentes (modelos, colores, luces o cables). Revisala antes de incluirla: no es un render oficial ni garantiza cómo se verá el equipo final.";

const STYLE_CARDS: Array<{ style: ReferenceStyle; title: string; text: string }> = [
  { style: "gamer", title: "PC Gamer", text: "Fondo de setup gamer: escritorio oscuro, monitores, periféricos e iluminación RGB." },
  { style: "oficina", title: "PC de oficina", text: "Fondo limpio y minimalista: escritorio claro, luz natural y nada de decoración gamer." },
];

/** Antes de generar se pregunta el fondo: un toque en la opción elegida ya arranca la generación. */
function StylePicker({ suggested, onPick }: { suggested: ReferenceStyle; onPick: (style: ReferenceStyle) => void }) {
  return (
    <div className="lt-refm-pick" role="group" aria-label="Fondo de la imagen">
      <p className="lt-refm-pick-q">¿Qué fondo lleva la imagen?</p>
      <div className="lt-refm-pick-grid">
        {STYLE_CARDS.map((card) => (
          <button key={card.style} type="button" className={`lt-refm-style ${card.style}${card.style === suggested ? " suggested" : ""}`} onClick={() => onPick(card.style)}>
            <span className="lt-refm-style-art" aria-hidden="true"><i /><i /><i /></span>
            <strong>{card.title}{card.style === suggested ? <em>Sugerido</em> : null}</strong>
            <small>{card.text}</small>
            <span className="lt-refm-style-go">Generar con este fondo →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="lt-refx-spin" aria-hidden="true">
      <span className="lt-refx-spin-core" />
    </span>
  );
}

function Check() {
  return (
    <svg className="lt-refx-check" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" />
      <path d="M7 12.5l3.2 3.2L17 8.8" />
    </svg>
  );
}

/** Ventana de la imagen de referencia: generar, revisar y decidir. Cerrarla no frena la generación. */
export function LiteReferenceModal({ job, current, stale, suggested, onGenerate, onCancel, onInclude, onDiscard, onRemove, onClose, itemCount }: {
  job: ReferenceJob;
  /** La que ya está incluida en el presupuesto. */
  current: ReferenceImage | null;
  /** Se cambiaron productos después de generar la imagen. */
  stale: boolean;
  itemCount: number;
  /** Fondo que se sugiere según los productos (el usuario igual elige). */
  suggested: ReferenceStyle;
  onGenerate: (style: ReferenceStyle) => void;
  onCancel: () => void;
  onInclude: () => void;
  onDiscard: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const generating = job.status === "generating";
  const ready = job.status === "ready";
  const elapsed = useElapsed(generating ? job.startedAt : null);
  const shown: (ReferenceImage & Partial<GeneratedReference>) | null = ready ? job.image : current;
  // Antes de generar (o al regenerar) se pregunta el fondo.
  const [picking, setPicking] = useState(false);
  const choosing = !generating && (picking || !shown);
  const step = generating || choosing ? 1 : ready ? 2 : 3;
  const pick = (style: ReferenceStyle) => { setPicking(false); onGenerate(style); };
  const steps: Array<[number, string]> = [[1, "Generar"], [2, "Revisar"], [3, "Incluir"]];

  return (
    <div className="lt-modal lt-refm-backdrop" role="dialog" aria-modal="true" aria-label="Imagen de referencia" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lt-card lt-modal-card lt-refm" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <header className="lt-refm-head">
          <span className="lt-refm-ico" aria-hidden="true">✦</span>
          <div>
            <h2>Imagen de referencia</h2>
            <p className="lt-muted">Cómo quedaría la PC con lo que estás presupuestando. Es opcional: vos decidís si va en el presupuesto y en el PDF.</p>
          </div>
          <button type="button" className="lt-x" onClick={onClose} aria-label="Cerrar" title={generating ? "Cerrar: sigue generando en segundo plano" : "Cerrar"}>×</button>
        </header>

        <ol className="lt-refm-steps" aria-label="Pasos">
          {steps.map(([n, label]) => (
            <li key={n} className={n < step ? "done" : n === step ? "now" : ""}><span>{n < step ? "✓" : n}</span>{label}</li>
          ))}
        </ol>

        <div className={`lt-refm-stage${generating ? " busy" : ""}${shown && !generating && !choosing ? " has" : ""}${choosing ? " choosing" : ""}`}>
          {generating ? (
            <div className="lt-refm-wait" role="status" aria-live="polite">
              <div className="lt-refm-orbs" aria-hidden="true"><i /><i /><i /></div>
              <Spinner />
              <strong key={phaseText(elapsed)} className="lt-refm-phase">{phaseText(elapsed)}</strong>
              <span className="lt-refm-time">{formatElapsed(elapsed)} · suele tardar entre 20 y 60 segundos</span>
              <span className="lt-refm-bar" aria-hidden="true"><i /></span>
              <span className="lt-refm-hint">Podés cerrar esta ventana y seguir armando el presupuesto: un globo te avisa cuando esté lista.</span>
            </div>
          ) : choosing ? (
            itemCount === 0 ? (
              <div className="lt-refm-empty">
                <span className="lt-refm-empty-ico" aria-hidden="true">▣</span>
                <strong>Todavía no hay imagen</strong>
                <span>Primero cargá los productos del presupuesto: la imagen se arma con ellos.</span>
              </div>
            ) : (
              <StylePicker suggested={suggested} onPick={pick} />
            )
          ) : shown ? (
            <img key={shown.key} className="lt-refm-img" src={shown.url} alt="Imagen de referencia de la PC" />
          ) : null}
        </div>

        {job.status === "error" ? <div className="lt-alert err" role="alert">{job.message}</div> : null}
        {stale && (ready || current) ? <div className="lt-refm-stale" role="status">Cambiaste productos desde que se generó la imagen. Si querés que lo refleje, regenerala.</div> : null}
        {shown || generating ? <div className="lt-refm-warn" role="note"><span aria-hidden="true">⚠</span><p>{REFERENCE_WARNING}</p></div> : null}
        {ready && job.image ? (
          <p className="lt-muted lt-hint">
            {job.image.attached?.length
              ? `Se usaron las fotos de: ${job.image.attached.join(", ")}${job.image.background ? " y el fondo de ambiente" : ""}.`
              : job.image.usedPhoto ? `Parte de la foto del gabinete (${job.image.caseName ?? "gabinete"}).` : "Generada desde la descripción: los productos no tienen foto."}
            {job.image.attached && !job.image.attached.includes("gabinete") ? " El gabinete no tiene foto: se reprodujo por su nombre." : ""}
            {Number.isFinite(Number(job.image.costUsdCents)) ? ` Costo aproximado: US$ ${(Number(job.image.costUsdCents) / 100).toFixed(2)}.` : ""}
          </p>
        ) : choosing && itemCount > 0 ? <p className="lt-muted lt-hint">Se arma con los {itemCount} ítem{itemCount === 1 ? "" : "s"} del presupuesto: gabinete exacto, con o sin placa de video, RAM con o sin RGB y la refrigeración que lleve. Aprox. US$ 0,04 a 0,25 por imagen.</p> : null}

        <div className="lt-modal-foot lt-refm-foot">
          {generating ? (
            <>
              <button type="button" className="lt-btn ghost" onClick={onCancel}>Cancelar</button>
              <span className="lt-spacer" />
              <button type="button" className="lt-btn" onClick={onClose}>Seguir trabajando</button>
            </>
          ) : picking ? (
            <>
              <span className="lt-spacer" />
              <button type="button" className="lt-btn ghost" onClick={() => setPicking(false)}>Volver a la imagen</button>
            </>
          ) : ready ? (
            <>
              <button type="button" className="lt-btn ghost" onClick={onDiscard}>Descartar</button>
              <span className="lt-spacer" />
              <button type="button" className="lt-btn ghost" onClick={() => setPicking(true)}>Regenerar</button>
              <button type="button" className="lt-btn lt-refm-go" onClick={onInclude}>Incluir en el presupuesto</button>
            </>
          ) : current ? (
            <>
              <button type="button" className="lt-btn ghost" onClick={onRemove}>Quitar del presupuesto</button>
              <span className="lt-spacer" />
              <button type="button" className="lt-btn ghost" onClick={() => setPicking(true)}>Regenerar</button>
              <button type="button" className="lt-btn" onClick={onClose}>Listo, queda incluida</button>
            </>
          ) : (
            <>
              <span className="lt-spacer" />
              <button type="button" className="lt-btn ghost" onClick={onClose}>Cerrar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Globo flotante que acompaña la generación en segundo plano: avisa que se está generando, cuando está lista (con
 * acciones rápidas para incluirla sin abrir nada) o si falló. No bloquea nada y se puede cerrar.
 */
export function LiteReferenceBubble({ job, stale, onOpen, onInclude, onDiscard, onRetry }: {
  job: ReferenceJob;
  stale: boolean;
  onOpen: () => void;
  onInclude: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}) {
  const generating = job.status === "generating";
  const elapsed = useElapsed(generating ? job.startedAt : null);
  if (job.status === "idle") return null;

  return (
    <aside className={`lt-refb ${job.status}`} role="status" aria-live="polite">
      {generating ? (
        <button type="button" className="lt-refb-main" onClick={onOpen} title="Ver cómo va">
          <Spinner />
          <span className="lt-refb-copy">
            <strong>Generando imagen de referencia</strong>
            <small key={phaseText(elapsed)}>{phaseText(elapsed)}</small>
            <small className="lt-refb-time">{formatElapsed(elapsed)} · seguí trabajando, te aviso</small>
          </span>
          <span className="lt-refb-bar" aria-hidden="true"><i /></span>
        </button>
      ) : job.status === "ready" ? (
        <>
          <button type="button" className="lt-refb-main" onClick={onOpen} title="Ver la imagen">
            <img className="lt-refb-thumb" src={job.image.url} alt="" />
            <span className="lt-refb-copy">
              <strong><Check /> ¡Tu imagen está lista!</strong>
              <small>{stale ? "Cambiaste productos después de generarla." : "Revisala antes de incluirla: es ilustrativa."}</small>
            </span>
          </button>
          <div className="lt-refb-actions">
            <button type="button" className="lt-refb-act go" onClick={onInclude}>Incluir</button>
            <button type="button" className="lt-refb-act" onClick={onOpen}>Ver</button>
            <button type="button" className="lt-refb-act" onClick={onDiscard} aria-label="Descartar la imagen">Descartar</button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="lt-refb-main" onClick={onOpen} title="Ver el detalle">
            <span className="lt-refb-fail" aria-hidden="true">!</span>
            <span className="lt-refb-copy">
              <strong>No se pudo generar la imagen</strong>
              <small>{job.message}</small>
            </span>
          </button>
          <div className="lt-refb-actions">
            <button type="button" className="lt-refb-act go" onClick={onRetry}>Reintentar</button>
            <button type="button" className="lt-refb-act" onClick={onDiscard}>Cerrar</button>
          </div>
        </>
      )}
    </aside>
  );
}
