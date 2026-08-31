"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Alert, Field, Loading, Pill, errorMessage } from "./shared";

/**
 * Integraciones externas del módulo de imágenes.
 *
 * Quedó solo Serper (buscar imágenes en Google). Photoroom y Cloudflare R2 se
 * eliminaron: el fondo de las imágenes se quita en el propio servidor y los
 * archivos se guardan en el disco persistente de Railway, así que no hay nada
 * más que configurar.
 *
 * Borrar la clave es un botón que actúa de una, en vez del checkbox
 * "borrar + guardar" de antes, que no se entendía y dejaba dudas de si había
 * hecho algo.
 */

type ConfigView = {
  serperKeySet: boolean;
};

type TestResult = { ok: boolean; detail?: string };

export function IntegrationsCard() {
  const [view, setView] = useState<ConfigView | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setView(await api<ConfigView>("/settings/external-module/config"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveKey = async () => {
    const value = keyDraft.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      const next = await api<ConfigView>("/settings/external-module/config", {
        method: "PUT",
        body: { serperKey: value },
      });
      setView(next);
      setKeyDraft("");
      setNotice(next.serperKeySet ? "Clave guardada." : "La clave no quedó guardada. Probá de nuevo.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async () => {
    setDeleting(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      const next = await api<ConfigView>("/settings/external-module/config", {
        method: "PUT",
        body: { clearSerperKey: true },
      });
      setView(next);
      setKeyDraft("");
      setNotice(next.serperKeySet ? "La clave sigue guardada. Probá de nuevo." : "Clave borrada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api<TestResult>("/settings/external-module/config/test/serper", { method: "POST" }));
    } catch (err) {
      setTestResult({ ok: false, detail: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  const hasKey = Boolean(view?.serperKeySet);

  return (
    <section className="card card-pad" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 className="panel-title" style={{ margin: 0 }}>
          Buscar imágenes en Google (Serper)
        </h3>
        <Pill tone={hasKey ? "ok" : "warn"}>{hasKey ? "Clave cargada" : "Falta la clave"}</Pill>
      </div>

      {loading ? (
        <Loading label="Cargando…" />
      ) : (
        <>
          {error ? <Alert tone="error">{error}</Alert> : null}
          {notice ? <Alert tone="ok">{notice}</Alert> : null}

          <Field
            label={hasKey ? "Reemplazar la clave" : "API key de Serper"}
            hint="Se consigue en serper.dev — tiene un plan gratuito con 2.500 búsquedas."
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="password"
                value={keyDraft}
                placeholder={hasKey ? "Pegá la clave nueva para reemplazar la actual" : "Pegá tu API key de serper.dev"}
                onChange={(e) => setKeyDraft(e.target.value)}
                style={{ flex: "1 1 260px" }}
              />
              <button type="button" className="btn-dark btn-sm" disabled={saving || !keyDraft.trim()} onClick={() => void saveKey()}>
                {saving ? "Guardando…" : hasKey ? "Reemplazar" : "Guardar"}
              </button>
            </div>
          </Field>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn-ghost btn-sm" disabled={testing || !hasKey} onClick={() => void test()}>
              {testing ? "Probando…" : "Probar la clave"}
            </button>
            {hasKey ? (
              <button type="button" className="btn-ghost btn-sm" disabled={deleting} onClick={() => void deleteKey()}>
                {deleting ? "Borrando…" : "Borrar la clave guardada"}
              </button>
            ) : null}
          </div>

          {testResult ? (
            <Alert tone={testResult.ok ? "ok" : "error"}>
              {testResult.ok ? "Serper respondió correctamente." : testResult.detail ?? "Serper no respondió."}
            </Alert>
          ) : null}

          {!hasKey ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              Sin esta clave no vas a poder buscar imágenes de componentes desde Google. El resto del módulo
              (subir imágenes a mano, quitar el fondo y publicar) funciona igual.
            </span>
          ) : null}
        </>
      )}
    </section>
  );
}
