"use client";

import {FormEvent, useEffect, useState} from "react";
import {
  deleteThumbnailAiReference,
  getThumbnailAiSettings,
  updateThumbnailAiReference,
  updateThumbnailAiSettings,
  uploadThumbnailAiReference,
  type ThumbnailAiSettings,
} from "../lib/api";
import {Alert, Checkbox, Field, Loading, errorMessage} from "./shared";

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

const DEFAULT_PROMPT = `Miniatura de producto para la tienda online de The Gamer Shop (PC gamer armada).
Estilo: fondo oscuro con luces de neón rojas y azules, el gabinete centrado y grande, iluminación de estudio, look premium.
Componentes destacados de esta PC: {{cpu}}, {{gpu}}, {{ram}}, {{disco}}.
Formato limpio, sin logos de otras marcas, sin personas.`;

/**
 * Ajustes → Miniaturas IA: todo lo que antes se hacía a mano en ChatGPT
 * (pegar la plantilla, la foto del gabinete y pedir la miniatura) queda
 * configurado acá y lo corre el pipeline de "Preparar y publicar".
 */
export function ThumbnailAiSettingsSection() {
  const [settings, setSettings] = useState<ThumbnailAiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getThumbnailAiSettings()
      .then(setSettings)
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await updateThumbnailAiSettings({
        enabled: settings.enabled,
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
      });
      setSettings(next);
      setNotice("Configuración de miniaturas guardada.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File | null) {
    if (!file || !settings) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const created = await uploadThumbnailAiReference(file);
      setSettings({...settings, references: [...settings.references, created]});
      setNotice("Imagen de referencia cargada.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUploading(false);
    }
  }

  async function saveNote(id: string, note: string) {
    if (!settings) return;
    try {
      const updated = await updateThumbnailAiReference(id, {note: note.trim() || null});
      setSettings({...settings, references: settings.references.map((ref) => (ref.id === id ? updated : ref))});
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function remove(id: string) {
    if (!settings || !confirm("¿Borrar esta imagen de referencia?")) return;
    setError(null);
    try {
      await deleteThumbnailAiReference(id);
      setSettings({...settings, references: settings.references.filter((ref) => ref.id !== id)});
      setNotice("Referencia borrada.");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  if (loading) return <Loading label="Cargando miniaturas IA…" />;
  if (!settings) return <Alert tone="error">{error ?? "No se pudo cargar la configuración."}</Alert>;

  const ready = settings.references.length > 0 && settings.prompt.trim().length > 0;

  return (
    <form onSubmit={save} className="form-grid" style={{maxWidth: 960}}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="card card-pad" style={{display: "grid", gap: 14}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap"}}>
          <h3 className="panel-title" style={{margin: 0}}>Miniaturas con IA</h3>
          <Checkbox label="Activar" checked={settings.enabled} onChange={(enabled) => setSettings({...settings, enabled})} />
        </div>
        <p className="section-note" style={{margin: 0}}>
          Con esto activo, "Preparar y publicar" genera la miniatura de cada PC con el modelo de imágenes de OpenAI (usa la misma clave de Ajustes → IA):
          le muestra tus miniaturas de referencia, la foto del gabinete de la PC y el prompt de abajo con los componentes. Si algo falta, cae a la plantilla clásica de Módulo externo.
          También se puede regenerar a mano desde Publicación Web con "Generar con IA".
        </p>
        {settings.enabled && !ready ? (
          <Alert tone="info">Para que funcione hacen falta al menos una imagen de referencia y un prompt.</Alert>
        ) : null}
      </div>

      <div className="card card-pad" style={{display: "grid", gap: 14}}>
        <h3 className="panel-title" style={{margin: 0}}>Imágenes de referencia</h3>
        <p className="section-note" style={{margin: 0}}>
          Subí miniaturas que ya tengas hechas y te gusten (hasta 6). La IA copia de acá el estilo: fondo, luces, composición, tipografía. Las notas se le pasan al modelo tal cual.
        </p>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12}}>
          {settings.references.map((ref) => (
            <article key={ref.id} className="card card-pad" style={{display: "grid", gap: 8, padding: 10}}>
              <img src={ref.url} alt="" style={{width: "100%", aspectRatio: "1", objectFit: "contain", background: "#111", borderRadius: 8}} />
              <input
                defaultValue={ref.note ?? ""}
                placeholder="Nota (ej. gabinete blanco, versión con texto)"
                onBlur={(e) => {
                  if ((e.target.value.trim() || null) !== (ref.note ?? null)) void saveNote(ref.id, e.target.value);
                }}
              />
              <button type="button" className="btn-ghost btn-sm" onClick={() => void remove(ref.id)}>
                Borrar
              </button>
            </article>
          ))}
        </div>
        {settings.references.length < 6 ? (
          <Field label="Agregar referencia" hint="PNG, JPG o WEBP. Mejor si son miniaturas reales de la tienda, en el mismo tamaño que querés generar.">
            <input type="file" accept="image/*" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0] ?? null)} />
          </Field>
        ) : null}
        {uploading ? <span className="muted">Subiendo…</span> : null}
      </div>

      <div className="card card-pad" style={{display: "grid", gap: 14}}>
        <h3 className="panel-title" style={{margin: 0}}>Prompt</h3>
        <Field
          label="Instrucciones de estilo"
          hint="Lo que hoy le escribís a ChatGPT. Podés usar placeholders: se reemplazan con los datos de cada PC."
        >
          <textarea rows={9} value={settings.prompt} onChange={(e) => setSettings({...settings, prompt: e.target.value})} placeholder={DEFAULT_PROMPT} />
        </Field>
        {!settings.prompt.trim() ? (
          <button type="button" className="btn-ghost btn-sm" style={{justifySelf: "start"}} onClick={() => setSettings({...settings, prompt: DEFAULT_PROMPT})}>
            Usar prompt de ejemplo
          </button>
        ) : null}
        <div className="section-note" style={{margin: 0}}>
          <strong>Placeholders:</strong>{" "}
          {settings.placeholders.map((key) => (
            <span key={key} style={{display: "inline-block", marginRight: 10}}>
              <code>{`{{${key}}}`}</code> <span className="muted">{PLACEHOLDER_HELP[key] ?? ""}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{display: "grid", gap: 14}}>
        <h3 className="panel-title" style={{margin: 0}}>Texto en la miniatura</h3>
        <Field label="Quién escribe el texto">
          <select value={settings.textMode} onChange={(e) => setSettings({...settings, textMode: e.target.value as ThumbnailAiSettings["textMode"]})}>
            <option value="AI">La IA lo escribe dentro de la imagen (más integrado, puede tener errores de tipeo)</option>
            <option value="OVERLAY">El sistema lo estampa encima (texto siempre exacto)</option>
            <option value="NONE">Sin texto</option>
          </select>
        </Field>
        {settings.textMode !== "NONE" ? (
          <Field label="Texto" hint="Con placeholders. Vacío = CPU · GPU · RAM · disco.">
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
            <Field label="Tipografía" hint="Tiene que estar instalada en el servidor; si no, se usa Arial.">
              <input value={settings.overlayFontFamily ?? ""} onChange={(e) => setSettings({...settings, overlayFontFamily: e.target.value})} placeholder="Arial, Helvetica, sans-serif" />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="card card-pad" style={{display: "grid", gap: 14}}>
        <h3 className="panel-title" style={{margin: 0}}>Modelo y calidad</h3>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12}}>
          <Field label="Modelo" hint="Modelo de imágenes de OpenAI.">
            <input value={settings.model} onChange={(e) => setSettings({...settings, model: e.target.value})} placeholder="gpt-image-1" />
          </Field>
          <Field label="Calidad" hint="Aprox. USD 0,04 (media) a 0,17 (alta) por imagen.">
            <select value={settings.quality} onChange={(e) => setSettings({...settings, quality: e.target.value as ThumbnailAiSettings["quality"]})}>
              <option value="low">Baja (rápida y barata)</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </Field>
          <Field label="Tamaño">
            <select value={settings.size} onChange={(e) => setSettings({...settings, size: e.target.value as ThumbnailAiSettings["size"]})}>
              <option value="1024x1024">Cuadrada 1024×1024</option>
              <option value="1536x1024">Apaisada 1536×1024</option>
              <option value="1024x1536">Vertical 1024×1536</option>
            </select>
          </Field>
        </div>
      </div>

      <div style={{display: "flex", gap: 10, alignItems: "center"}}>
        <button type="submit" className="btn-dark" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <span className="muted" style={{fontSize: 12.5}}>Para probarlo, abrí una PC en Publicación Web y tocá "Generar con IA" en Miniatura.</span>
      </div>
    </form>
  );
}
