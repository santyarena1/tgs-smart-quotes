"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/time-ago";
import { Alert, Loading, Modal, errorMessage } from "./shared";

type AcustockApiState = { enabled: boolean; tokenHint: string | null; issuedAt: string | null; lastUsedAt: string | null };

/**
 * Configuración → AcuStock: la clave con la que AcuStock lee las colecciones y sus presupuestos.
 * La clave se muestra una sola vez al generarla; en la base solo queda su huella.
 */
export function AcustockApiSettingsSection() {
  const [state, setState] = useState<AcustockApiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"generate" | "revoke" | null>(null);

  const baseUrl = typeof window === "undefined" ? "" : `${window.location.origin}/api/integrations/acustock`;

  const load = useCallback(async () => {
    try {
      setState(await api<AcustockApiState>("/settings/acustock-api"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setState({ enabled: false, tokenHint: null, issuedAt: null, lastUsedAt: null });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<AcustockApiState & { token: string }>("/settings/acustock-api/token", { method: "POST" });
      const { token, ...rest } = res;
      setState(rest);
      setNewToken(token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      setState(await api<AcustockApiState>("/settings/acustock-api/token", { method: "DELETE" }));
      setNewToken(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("No se pudo copiar: seleccioná el texto y copialo a mano.");
    }
  }

  if (state === null) return <Loading />;

  return (
    <div className="form-grid" style={{ maxWidth: 900 }}>
      <div className="card card-pad">
        <h3 className="panel-title">API para AcuStock</h3>
        <p className="section-note">
          Con esta clave, AcuStock puede leer todas las colecciones con sus presupuestos: todas las versiones, los ítems, los
          costos, el % y la ganancia. No ve los datos de los clientes y no puede modificar nada.
        </p>

        {error ? <Alert>{error}</Alert> : null}

        <p>
          Estado:{" "}
          {state.enabled ? (
            <strong>Activa</strong>
          ) : (
            <strong>Apagada</strong>
          )}
          {state.enabled ? (
            <span className="muted">
              {" "}· clave terminada en <code>…{state.tokenHint}</code> · generada {timeAgo(state.issuedAt)} ·{" "}
              {state.lastUsedAt ? `AcuStock la usó por última vez ${timeAgo(state.lastUsedAt)}` : "AcuStock todavía no la usó"}
            </span>
          ) : (
            <span className="muted"> · generá una clave para que AcuStock pueda leer las colecciones.</span>
          )}
        </p>

        {newToken ? (
          <Alert tone="ok">
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <strong>Copiá la clave ahora: es la única vez que se muestra.</strong>
              <code style={{ wordBreak: "break-all", userSelect: "all" }}>{newToken}</code>
              <div className="form-actions">
                <button type="button" onClick={() => void copy(newToken, "token")}>
                  {copied === "token" ? "Copiada" : "Copiar clave"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setNewToken(null)}>
                  Ya la guardé
                </button>
              </div>
            </div>
          </Alert>
        ) : null}

        <div className="form-actions" style={{ flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={() => (state.enabled ? setConfirm("generate") : void generate())}>
            {busy ? "…" : state.enabled ? "Generar clave nueva" : "Generar clave"}
          </button>
          {state.enabled ? (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirm("revoke")}>
              Revocar acceso
            </button>
          ) : null}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="panel-title">Qué pasarle a AcuStock</h3>
        <p className="section-note">La dirección, la clave y que la manden en cada pedido así:</p>
        <p>
          <code>Authorization: Bearer &lt;clave&gt;</code>
        </p>
        <p className="muted">Lista de colecciones:</p>
        <p>
          <code style={{ wordBreak: "break-all", userSelect: "all" }}>GET {baseUrl}/collections</code>{" "}
          <button type="button" className="btn-ghost" onClick={() => void copy(`${baseUrl}/collections`, "list")}>
            {copied === "list" ? "Copiada" : "Copiar"}
          </button>
        </p>
        <p className="muted">Una colección completa, con todos sus presupuestos:</p>
        <p>
          <code style={{ wordBreak: "break-all", userSelect: "all" }}>GET {baseUrl}/collections/&#123;id&#125;</code>
        </p>
        <p className="muted">
          Montos en centavos como texto (&quot;65125000&quot; = $ 651.250). Porcentajes en puntos básicos (2000 = 20 %). Fechas en
          UTC.
        </p>
      </div>

      <Modal
        open={confirm !== null}
        title={confirm === "generate" ? "Generar clave nueva" : "Revocar acceso de AcuStock"}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>
              Cancelar
            </button>
            <button type="button" disabled={busy} onClick={() => void (confirm === "generate" ? generate() : revoke())}>
              {confirm === "generate" ? "Generar clave nueva" : "Revocar acceso"}
            </button>
          </>
        }
      >
        <p>
          {confirm === "generate"
            ? "La clave actual deja de funcionar al instante. Vas a tener que pasarle la nueva a AcuStock."
            : "AcuStock deja de poder leer las colecciones al instante, hasta que generes una clave nueva."}
        </p>
      </Modal>
    </div>
  );
}
