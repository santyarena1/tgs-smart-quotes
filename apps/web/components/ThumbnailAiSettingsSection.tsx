"use client";

import {FormEvent, useEffect, useState} from "react";
import {
  deleteThumbnailAiLogo,
  deleteThumbnailAiReference,
  getThumbnailAiSettings,
  updateThumbnailAiReference,
  updateThumbnailAiSettings,
  uploadThumbnailAiLogo,
  uploadThumbnailAiReference,
  type ThumbnailAiSettings,
  type ThumbnailFooterBadge,
} from "../lib/api";
import {Alert, Checkbox, Field, Loading, MoneyInput, errorMessage} from "./shared";

const PLACEHOLDER_HELP: Record<string, string> = {
  titulo: "Título de la tienda (PC GAMER | ...)",
  cpu: "Procesador (ej. RYZEN 5 7600)",
  gpu: "Placa de video (ej. RTX 4070 12GB)",
  ram: "RAM total (ej. 32GB)",
  disco: "Almacenamiento (ej. 1TB M.2)",
  so: "Sistema operativo (ej. WINDOWS 11)",
  gabinete: "Nombre del gabinete",
  componentes: "Lista completa de componentes, separada por comas",
};

const FOOTER_ICONS: {value: ThumbnailFooterBadge["icon"]; label: string}[] = [
  {value: "shield", label: "Escudo"},
  {value: "star", label: "Estrella"},
  {value: "headset", label: "Auriculares"},
  {value: "truck", label: "Camión"},
  {value: "check", label: "Tilde"},
  {value: "bolt", label: "Rayo"},
];

const DEFAULT_SCENE_PROMPT = `Miniatura de producto para la tienda online de The Gamer Shop (PC gamer armada).
Estilo: fondo oscuro con luces de neón rojas y azules, el gabinete centrado y grande, iluminación de estudio, look premium.
Componentes destacados de esta PC: {{cpu}}, {{gpu}}, {{ram}}, {{disco}}.
Formato limpio, sin logos de otras marcas, sin personas.`;

const formatPesos = (cents: string) => {
  const pesos = Math.round(Number(cents || "0") / 100);
  return String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};
const pesosToCents = (value: string) => `${Number(value.replace(/\D/g, "") || "0") * 100}`;

/**
 * Ajustes → Miniaturas: cómo se arma la miniatura de cada PC publicada.
 * Modo "Plantilla TGS" (recomendado): la compone el sistema con el texto
 * exacto; opcionalmente el gabinete pasa por IA para rellenar el interior.
 * Modo "Escena con IA": toda la imagen la genera el modelo de imágenes.
 */
export function ThumbnailAiSettingsSection() {
  const [settings, setSettings] = useState<ThumbnailAiSettings | null>(null);
  const [threshold, setThreshold] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getThumbnailAiSettings()
      .then((value) => {
        setSettings(value);
        setThreshold(formatPesos(value.gpuHeadlineThresholdCents));
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  async function run<T>(work: () => Promise<T>, done?: (value: T) => void, message?: string) {
    setError(null);
    setNotice(null);
    try {
      const value = await work();
      done?.(value);
      if (message) setNotice(message);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    await run(
      () =>
        updateThumbnailAiSettings({
          enabled: settings.enabled,
          mode: settings.mode,
          gpuHeadlineThresholdCents: pesosToCents(threshold),
          accentColor: settings.accentColor,
          footer: settings.footer,
          caseAiMode: settings.caseAiMode,
          caseAiPrompt: settings.caseAiPrompt,
          model: settings.model,
          quality: settings.quality,
          size: settings.size,
          prompt: settings.prompt,
          textMode: settings.textMode,
          textTemplate: settings.textTemplate,
          overlayPosition: settings.overlayPosition,
          overlayColor: settings.overlayColor,
          overlayFontSize: settings.overlayFontSize,
          overlayFontFamily: settings.overlayFontFamily?.trim() || null,
        }),
      (next) => {
        setSettings(next);
        setThreshold(formatPesos(next.gpuHeadlineThresholdCents));
      },
      "Configuración de miniaturas guardada.",
    );
    setSaving(false);
  }

  async function uploadLogo(file: File | null) {
    if (!file) return;
    setUploading(true);
    await run(() => uploadThumbnailAiLogo(file), setSettings, "Logo cargado.");
    setUploading(false);
  }

  async function uploadReference(file: File | null) {
    if (!file || !settings) return;
    setUploading(true);
    await run(
      () => uploadThumbnailAiReference(file),
      (created) => setSettings((prev) => (prev ? {...prev, references: [...prev.references, created]} : prev)),
      "Imagen de referencia cargada.",
    );
    setUploading(false);
  }

  if (loading) return <Loading label="Cargando miniaturas…" />;
  if (!settings) return <Alert tone="error">{error ?? "No se pudo cargar la configuración."}</Alert>;

  const layout = settings.mode === "LAYOUT";
  const setFooter = (index: number, patch: Partial<ThumbnailFooterBadge>) =>
    setSettings({...settings, footer: settings.footer.map((badge, i) => (i === index ? {...badge, ...patch} : badge))});

  return (
    <form onSubmit={save} className="form-grid" style={{maxWidth: 960}}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="card card-pad" style={{display: "grid", gap: 14}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap"}}>
          <h3 className="panel-title" style={{margin: 0}}>Miniaturas de la tienda</h3>
          <Checkbox label="Generar automáticamente" checked={settings.enabled} onChange={(enabled) => setSettings({...settings, enabled})} />
        </div>
        <p className="section-note" style={{margin: 0}}>
          Con esto activo, "Preparar y publicar" arma la miniatura de cada PC (la imagen del listado de la tienda). También se puede generar o regenerar a mano
          desde Publicación Web → Miniatura → "Generar miniatura".
        </p>
        <Field label="Cómo se arma">
          <select value={settings.mode} onChange={(e) => setSettings({...settings, mode: e.target.value as ThumbnailAiSettings["mode"]})}>
            <option value="LAYOUT">Plantilla TGS (recomendado): el sistema la compone con el texto exacto, gratis y al instante</option>
            <option value="AI_SCENE">Escena con IA: toda la imagen la genera el modelo de imágenes a partir de referencias</option>
          </select>
        </Field>
      </div>

      {layout ? (
        <>
          <div className="card card-pad" style={{display: "grid", gap: 14}}>
            <h3 className="panel-title" style={{margin: 0}}>Plantilla TGS</h3>
            <p className="section-note" style={{margin: 0}}>
              Logo arriba a la izquierda, "PC GAMER" + título grande, filas de specs con ícono (procesador, mother, RAM, almacenamiento, placa de video, fuente),
              el gabinete grande a la derecha y cuatro badges al pie. Las specs salen de los componentes del presupuesto, tal cual están cargados.
            </p>
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12}}>
              <Field label="Título grande: mostrar la placa de video si la PC supera" hint="Por debajo de este precio (transferencia) el título es el procesador; por encima, la placa de video. En pesos.">
                <MoneyInput value={threshold} onChange={setThreshold} placeholder="1.500.000" />
              </Field>
              <Field label="Color de acento">
                <input type="color" value={settings.accentColor} onChange={(e) => setSettings({...settings, accentColor: e.target.value})} />
              </Field>
              <Field label="Tamaño">
                <select value={settings.size} onChange={(e) => setSettings({...settings, size: e.target.value as ThumbnailAiSettings["size"]})}>
                  <option value="1024x1024">Cuadrada 1024×1024</option>
                  <option value="1536x1024">Apaisada 1536×1024</option>
                  <option value="1024x1536">Vertical 1024×1536</option>
                </select>
              </Field>
            </div>
            <Field label="Logo" hint="PNG con fondo transparente. Sin logo se dibuja 'THE GAMER SHOP' en texto.">
              <div style={{display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"}}>
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" style={{height: 56, maxWidth: 200, objectFit: "contain", background: "#111", borderRadius: 8, padding: 6}} />
                ) : (
                  <span className="muted" style={{fontSize: 12.5}}>Sin logo cargado.</span>
                )}
                <input type="file" accept="image/*" disabled={uploading} onChange={(e) => void uploadLogo(e.target.files?.[0] ?? null)} />
                {settings.logoUrl ? (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => void run(() => deleteThumbnailAiLogo(), setSettings, "Logo borrado.")}>
                    Quitar logo
                  </button>
                ) : null}
              </div>
            </Field>
          </div>

          <div className="card card-pad" style={{display: "grid", gap: 12}}>
            <h3 className="panel-title" style={{margin: 0}}>Badges del pie</h3>
            {settings.footer.map((badge, index) => (
              <div key={index} style={{display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 8}}>
                <select value={badge.icon} onChange={(e) => setFooter(index, {icon: e.target.value as ThumbnailFooterBadge["icon"]})}>
                  {FOOTER_ICONS.map((icon) => (
                    <option key={icon.value} value={icon.value}>{icon.label}</option>
                  ))}
                </select>
                <input value={badge.line1} placeholder="Línea 1 (blanca)" onChange={(e) => setFooter(index, {line1: e.target.value})} />
                <input value={badge.line2} placeholder="Línea 2 (en color)" onChange={(e) => setFooter(index, {line2: e.target.value})} />
              </div>
            ))}
          </div>

          <div className="card card-pad" style={{display: "grid", gap: 14}}>
            <h3 className="panel-title" style={{margin: 0}}>Gabinete procesado con IA</h3>
            <p className="section-note" style={{margin: 0}}>
              Las fotos de gabinete que vienen de internet suelen estar vacías por dentro. Con esto, antes de componer, el modelo de imágenes de OpenAI (clave de
              Ajustes → IA) devuelve el mismo gabinete con el interior armado y luces RGB. Se hace una sola vez por foto de gabinete y queda guardado; cuesta
              aprox. USD 0,04 (media) a 0,17 (alta) por gabinete.
            </p>
            <Field label="Procesar gabinete">
              <select value={settings.caseAiMode} onChange={(e) => setSettings({...settings, caseAiMode: e.target.value as ThumbnailAiSettings["caseAiMode"]})}>
                <option value="OFF">No, usar la foto tal cual</option>
                <option value="ALWAYS">Sí, siempre (con caché por gabinete)</option>
              </select>
            </Field>
            {settings.caseAiMode === "ALWAYS" ? (
              <>
                <Field label="Instrucciones para el gabinete" hint="Lo que se le pide al modelo. Si lo cambiás, los gabinetes ya procesados se vuelven a generar.">
                  <textarea rows={5} value={settings.caseAiPrompt} onChange={(e) => setSettings({...settings, caseAiPrompt: e.target.value})} />
                </Field>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12}}>
                  <Field label="Modelo de imágenes">
                    <input value={settings.model} onChange={(e) => setSettings({...settings, model: e.target.value})} placeholder="gpt-image-1" />
                  </Field>
                  <Field label="Calidad">
                    <select value={settings.quality} onChange={(e) => setSettings({...settings, quality: e.target.value as ThumbnailAiSettings["quality"]})}>
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                    </select>
                  </Field>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="card card-pad" style={{display: "grid", gap: 14}}>
            <h3 className="panel-title" style={{margin: 0}}>Imágenes de referencia</h3>
            <p className="section-note" style={{margin: 0}}>
              Miniaturas que ya tengas hechas y te gusten (hasta 6). El modelo copia de acá el estilo. Las notas se le pasan tal cual.
            </p>
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12}}>
              {settings.references.map((ref) => (
                <article key={ref.id} className="card card-pad" style={{display: "grid", gap: 8, padding: 10}}>
                  <img src={ref.url} alt="" style={{width: "100%", aspectRatio: "1", objectFit: "contain", background: "#111", borderRadius: 8}} />
                  <input
                    defaultValue={ref.note ?? ""}
                    placeholder="Nota (ej. gabinete blanco)"
                    onBlur={(e) => {
                      const note = e.target.value.trim() || null;
                      if (note !== (ref.note ?? null))
                        void run(
                          () => updateThumbnailAiReference(ref.id, {note}),
                          (updated) => setSettings((prev) => (prev ? {...prev, references: prev.references.map((r) => (r.id === ref.id ? updated : r))} : prev)),
                        );
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      if (!confirm("¿Borrar esta imagen de referencia?")) return;
                      void run(
                        () => deleteThumbnailAiReference(ref.id),
                        () => setSettings((prev) => (prev ? {...prev, references: prev.references.filter((r) => r.id !== ref.id)} : prev)),
                        "Referencia borrada.",
                      );
                    }}
                  >
                    Borrar
                  </button>
                </article>
              ))}
            </div>
            {settings.references.length < 6 ? (
              <Field label="Agregar referencia">
                <input type="file" accept="image/*" disabled={uploading} onChange={(e) => void uploadReference(e.target.files?.[0] ?? null)} />
              </Field>
            ) : null}
          </div>

          <div className="card card-pad" style={{display: "grid", gap: 14}}>
            <h3 className="panel-title" style={{margin: 0}}>Prompt de la escena</h3>
            <Field label="Instrucciones de estilo" hint="Placeholders: se reemplazan con los datos de cada PC.">
              <textarea rows={8} value={settings.prompt} onChange={(e) => setSettings({...settings, prompt: e.target.value})} placeholder={DEFAULT_SCENE_PROMPT} />
            </Field>
            {!settings.prompt.trim() ? (
              <button type="button" className="btn-ghost btn-sm" style={{justifySelf: "start"}} onClick={() => setSettings({...settings, prompt: DEFAULT_SCENE_PROMPT})}>
                Usar prompt de ejemplo
              </button>
            ) : null}
            <div className="section-note" style={{margin: 0}}>
              {settings.placeholders.map((key) => (
                <span key={key} style={{display: "inline-block", marginRight: 10}}>
                  <code>{`{{${key}}}`}</code> <span className="muted">{PLACEHOLDER_HELP[key] ?? ""}</span>
                </span>
              ))}
            </div>
            <Field label="Texto en la imagen">
              <select value={settings.textMode} onChange={(e) => setSettings({...settings, textMode: e.target.value as ThumbnailAiSettings["textMode"]})}>
                <option value="AI">La IA lo escribe dentro de la imagen (puede tener errores de tipeo)</option>
                <option value="OVERLAY">El sistema lo estampa encima (texto exacto)</option>
                <option value="NONE">Sin texto</option>
              </select>
            </Field>
            {settings.textMode !== "NONE" ? (
              <Field label="Texto" hint="Vacío = CPU · GPU · RAM · disco.">
                <input value={settings.textTemplate} onChange={(e) => setSettings({...settings, textTemplate: e.target.value})} placeholder="{{cpu}} · {{gpu}} · {{ram}}" />
              </Field>
            ) : null}
            {settings.textMode === "OVERLAY" ? (
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12}}>
                <Field label="Posición">
                  <select value={settings.overlayPosition} onChange={(e) => setSettings({...settings, overlayPosition: e.target.value as "top" | "bottom"})}>
                    <option value="bottom">Abajo</option>
                    <option value="top">Arriba</option>
                  </select>
                </Field>
                <Field label="Color">
                  <input type="color" value={settings.overlayColor} onChange={(e) => setSettings({...settings, overlayColor: e.target.value})} />
                </Field>
                <Field label="Tamaño (px)">
                  <input type="number" min={12} max={200} value={settings.overlayFontSize} onChange={(e) => setSettings({...settings, overlayFontSize: Number(e.target.value) || 44})} />
                </Field>
              </div>
            ) : null}
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12}}>
              <Field label="Modelo">
                <input value={settings.model} onChange={(e) => setSettings({...settings, model: e.target.value})} placeholder="gpt-image-1" />
              </Field>
              <Field label="Calidad" hint="USD 0,04 (media) a 0,17 (alta) por imagen.">
                <select value={settings.quality} onChange={(e) => setSettings({...settings, quality: e.target.value as ThumbnailAiSettings["quality"]})}>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </Field>
              <Field label="Tamaño">
                <select value={settings.size} onChange={(e) => setSettings({...settings, size: e.target.value as ThumbnailAiSettings["size"]})}>
                  <option value="1024x1024">Cuadrada</option>
                  <option value="1536x1024">Apaisada</option>
                  <option value="1024x1536">Vertical</option>
                </select>
              </Field>
            </div>
          </div>
        </>
      )}

      <div style={{display: "flex", gap: 10, alignItems: "center"}}>
        <button type="submit" className="btn-dark" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <span className="muted" style={{fontSize: 12.5}}>Para verla: Publicación Web → una PC → Miniatura → "Generar miniatura".</span>
      </div>
    </form>
  );
}
