"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Alert, Checkbox, Field, Loading, Pill, errorMessage } from "./shared";

type ConfigView = {
  serperKeySet: boolean;
  photoroomKeySet: boolean;
  r2SecretAccessKeySet: boolean;
  r2Endpoint: string | null;
  r2Bucket: string | null;
  r2AccessKeyId: string | null;
  r2PublicBaseUrl: string | null;
};

type Draft = {
  serperKey: string;
  clearSerperKey: boolean;
  photoroomKey: string;
  clearPhotoroomKey: boolean;
  r2Endpoint: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2PublicBaseUrl: string;
  r2SecretAccessKey: string;
  clearR2SecretAccessKey: boolean;
};

const emptyDraft: Draft = {
  serperKey: "",
  clearSerperKey: false,
  photoroomKey: "",
  clearPhotoroomKey: false,
  r2Endpoint: "",
  r2Bucket: "",
  r2AccessKeyId: "",
  r2PublicBaseUrl: "",
  r2SecretAccessKey: "",
  clearR2SecretAccessKey: false,
};

/**
 * Claves de las integraciones que usan las fichas de componentes:
 * Serper (buscar imágenes), Photoroom (quitar fondo automático) y
 * Cloudflare R2 (donde se guardan las imágenes que subís o aprobás).
 * Sin esto cargado, buscar/subir imágenes falla.
 */
export function IntegrationsCard() {
  const [view, setView] = useState<ConfigView | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail?: string }>>({});
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api<ConfigView>("/settings/external-module/config");
      setView(next);
      setDraft({
        ...emptyDraft,
        r2Endpoint: next.r2Endpoint ?? "",
        r2Bucket: next.r2Bucket ?? "",
        r2AccessKeyId: next.r2AccessKeyId ?? "",
        r2PublicBaseUrl: next.r2PublicBaseUrl ?? "",
      });
      setExpanded(!next.serperKeySet || !next.r2SecretAccessKeySet);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api<ConfigView>("/settings/external-module/config", {
        method: "PUT",
        body: {
          serperKey: draft.serperKey || undefined,
          clearSerperKey: draft.clearSerperKey,
          photoroomKey: draft.photoroomKey || undefined,
          clearPhotoroomKey: draft.clearPhotoroomKey,
          r2Endpoint: draft.r2Endpoint || undefined,
          r2Bucket: draft.r2Bucket || undefined,
          r2AccessKeyId: draft.r2AccessKeyId || undefined,
          r2PublicBaseUrl: draft.r2PublicBaseUrl || undefined,
          r2SecretAccessKey: draft.r2SecretAccessKey || undefined,
          clearR2SecretAccessKey: draft.clearR2SecretAccessKey,
        },
      });
      setView(next);
      setDraft((d) => ({
        ...d,
        serperKey: "",
        clearSerperKey: false,
        photoroomKey: "",
        clearPhotoroomKey: false,
        r2SecretAccessKey: "",
        clearR2SecretAccessKey: false,
      }));
      setNotice("Integraciones guardadas.");
      setTestResults({});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const test = async (provider: "serper" | "photoroom") => {
    setTesting(provider);
    try {
      const result = await api<{ ok: boolean; detail?: string }>(
        `/settings/external-module/config/test/${provider}`,
        { method: "POST" },
      );
      setTestResults((prev) => ({ ...prev, [provider]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [provider]: { ok: false, detail: errorMessage(err) } }));
    } finally {
      setTesting(null);
    }
  };

  const allReady = Boolean(view?.serperKeySet && view?.r2SecretAccessKeySet);

  return (
    <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 className="panel-title">Integraciones para imágenes</h3>
          {loading ? null : (
            <Pill tone={allReady ? "ok" : "warn"}>{allReady ? "Configurado" : "Falta configurar"}</Pill>
          )}
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {!expanded ? (
        <span className="muted">
          {allReady
            ? "Buscar imágenes, subir propias y quitar fondo ya están configurados."
            : "Buscar imágenes (Serper), subir propias y quitar fondo (Photoroom + R2) necesitan estas claves para funcionar."}
        </span>
      ) : loading ? (
        <Loading label="Cargando…" />
      ) : (
        <>
          {error ? <Alert tone="error">{error}</Alert> : null}
          {notice ? <Alert tone="ok">{notice}</Alert> : null}

          <div style={{ display: "grid", gap: 6 }}>
            <span className="field-label">Serper — buscar imágenes en Google</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="password"
                style={{ flex: 1, minWidth: 220 }}
                value={draft.serperKey}
                placeholder={view?.serperKeySet ? "•••• guardada" : "Pegá tu API key de serper.dev"}
                onChange={(e) => setDraft((d) => ({ ...d, serperKey: e.target.value }))}
              />
              <button type="button" className="btn-ghost btn-sm" disabled={testing === "serper"} onClick={() => void test("serper")}>
                {testing === "serper" ? "Probando…" : "Probar"}
              </button>
            </div>
            {view?.serperKeySet ? (
              <Checkbox
                label="Borrar clave guardada"
                checked={draft.clearSerperKey}
                onChange={(v) => setDraft((d) => ({ ...d, clearSerperKey: v }))}
              />
            ) : null}
            {testResults.serper ? (
              <Alert tone={testResults.serper.ok ? "ok" : "error"}>
                {testResults.serper.ok ? "Serper respondió bien." : testResults.serper.detail ?? "No se pudo conectar."}
              </Alert>
            ) : null}
            <span className="muted">Se consigue en serper.dev — tiene un plan gratuito con 2.500 búsquedas.</span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <span className="field-label">Photoroom — quitar el fondo de las imágenes</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="password"
                style={{ flex: 1, minWidth: 220 }}
                value={draft.photoroomKey}
                placeholder={view?.photoroomKeySet ? "•••• guardada" : "Pegá tu API key de photoroom.com"}
                onChange={(e) => setDraft((d) => ({ ...d, photoroomKey: e.target.value }))}
              />
              <button type="button" className="btn-ghost btn-sm" disabled={testing === "photoroom"} onClick={() => void test("photoroom")}>
                {testing === "photoroom" ? "Probando…" : "Probar"}
              </button>
            </div>
            {view?.photoroomKeySet ? (
              <Checkbox
                label="Borrar clave guardada"
                checked={draft.clearPhotoroomKey}
                onChange={(v) => setDraft((d) => ({ ...d, clearPhotoroomKey: v }))}
              />
            ) : null}
            {testResults.photoroom ? (
              <Alert tone={testResults.photoroom.ok ? "ok" : "error"}>
                {testResults.photoroom.ok ? "Photoroom respondió bien." : testResults.photoroom.detail ?? "No se pudo conectar."}
              </Alert>
            ) : null}
            <span className="muted">
              Opcional: sin esto, igual podés buscar y usar imágenes "tal cual"; solo falla el botón "Quitar fondo".
            </span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <span className="field-label">
              Cloudflare R2 — donde se guardan las imágenes que subís o aprobás{" "}
              {view?.r2SecretAccessKeySet ? <Pill tone="ok">Configurado</Pill> : <Pill tone="warn">Falta</Pill>}
            </span>
            <div className="form-grid">
              <Field label="Endpoint">
                <input
                  value={draft.r2Endpoint}
                  placeholder="https://<cuenta>.r2.cloudflarestorage.com"
                  onChange={(e) => setDraft((d) => ({ ...d, r2Endpoint: e.target.value }))}
                />
              </Field>
              <Field label="Bucket">
                <input value={draft.r2Bucket} onChange={(e) => setDraft((d) => ({ ...d, r2Bucket: e.target.value }))} />
              </Field>
              <Field label="Access Key ID">
                <input
                  value={draft.r2AccessKeyId}
                  onChange={(e) => setDraft((d) => ({ ...d, r2AccessKeyId: e.target.value }))}
                />
              </Field>
              <Field label="Secret Access Key" hint={view?.r2SecretAccessKeySet ? "Hay una guardada. Solo cargá una nueva si la vas a cambiar." : undefined}>
                <input
                  type="password"
                  placeholder={view?.r2SecretAccessKeySet ? "•••• guardada" : ""}
                  value={draft.r2SecretAccessKey}
                  onChange={(e) => setDraft((d) => ({ ...d, r2SecretAccessKey: e.target.value }))}
                />
              </Field>
              <Field label="URL pública del bucket">
                <input
                  value={draft.r2PublicBaseUrl}
                  placeholder="https://pub-xxxxx.r2.dev"
                  onChange={(e) => setDraft((d) => ({ ...d, r2PublicBaseUrl: e.target.value }))}
                />
              </Field>
            </div>
            {view?.r2SecretAccessKeySet ? (
              <Checkbox
                label="Borrar clave secreta guardada"
                checked={draft.clearR2SecretAccessKey}
                onChange={(v) => setDraft((d) => ({ ...d, clearR2SecretAccessKey: v }))}
              />
            ) : null}
          </div>

          <div>
            <button type="button" className="btn-dark btn-sm" disabled={saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar integraciones"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
