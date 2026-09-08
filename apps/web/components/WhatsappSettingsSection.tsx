"use client";

import {FormEvent, useEffect, useState} from "react";
import {
  getWhatsappSettings,
  updateWhatsappSettings,
  verifyWhatsappNumber,
  type WhatsappSettings,
} from "../lib/api";
import {Alert, Checkbox, Field, Loading, errorMessage} from "./shared";

export function WhatsappSettingsSection() {
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    getWhatsappSettings()
      .then(setSettings)
      .catch(reason => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiado.`);
    } catch {
      setError(`No se pudo copiar ${label.toLowerCase()}.`);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const next = await updateWhatsappSettings({
        enabled: settings.enabled,
        phoneNumberId: settings.phoneNumberId ?? "",
        businessAccountId: settings.businessAccountId ?? "",
        apiVersion: settings.apiVersion,
        ...(accessToken.trim() ? {accessToken} : {}),
        ...(appSecret.trim() ? {appSecret} : {}),
      });
      setSettings(next);
      setAccessToken(""); setAppSecret("");
      setNotice("Configuración de WhatsApp Cloud API guardada.");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  /** Comprueba contra Meta que las credenciales sirven, sin mandarle nada a un cliente. */
  async function verify() {
    setVerifying(true); setError(null); setNotice(null);
    try {
      const next = await verifyWhatsappNumber();
      setSettings(next);
      setNotice(`Credenciales verificadas: ${next.verifiedName ?? "sin nombre"} (${next.displayPhoneNumber ?? "sin número"}).`);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setVerifying(false); }
  }

  if (loading) return <Loading label="Cargando configuración de WhatsApp…"/>;
  if (!settings) return <Alert>{error ?? "No se pudo cargar la configuración de WhatsApp."}</Alert>;

  return <div className="form-grid" style={{maxWidth: 900}}>
    {error ? <Alert>{error}</Alert> : null}
    {notice ? <Alert tone="ok">{notice}</Alert> : null}

    <form className="card card-pad form-grid" onSubmit={save}>
      <div>
        <h3 className="panel-title">WhatsApp Cloud API</h3>
        <p className="section-note">Credenciales oficiales de Meta. Los secretos se guardan cifrados y nunca vuelven a mostrarse completos.</p>
      </div>
      <Checkbox label="Habilitar WhatsApp Cloud API" checked={settings.enabled} onChange={enabled => setSettings({...settings, enabled})}/>
      <div className="grid-2">
        <Field label="Phone Number ID" hint="Meta → WhatsApp → API Setup.">
          <input value={settings.phoneNumberId ?? ""} onChange={event => setSettings({...settings, phoneNumberId: event.target.value})}/>
        </Field>
        <Field label="Business Account ID" hint="WhatsApp Business Account ID de Meta.">
          <input value={settings.businessAccountId ?? ""} onChange={event => setSettings({...settings, businessAccountId: event.target.value})}/>
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Access Token" hint={settings.hasAccessToken ? `Guardado: ${settings.accessTokenMasked}. Dejalo vacío para conservarlo.` : "Pegá un token de acceso permanente."}>
          <input type="password" autoComplete="new-password" value={accessToken} onChange={event => setAccessToken(event.target.value)} placeholder={settings.accessTokenMasked || "Token de Meta"}/>
        </Field>
        <Field label="App Secret" hint={settings.hasAppSecret ? `Guardado: ${settings.appSecretMasked}. Dejalo vacío para conservarlo.` : "Está en Meta → App settings → Basic."}>
          <input type="password" autoComplete="new-password" value={appSecret} onChange={event => setAppSecret(event.target.value)} placeholder={settings.appSecretMasked || "App Secret de Meta"}/>
        </Field>
      </div>
      <Field label="Versión de Graph API">
        <input required pattern="v[0-9]+\.[0-9]+" value={settings.apiVersion} onChange={event => setSettings({...settings, apiVersion: event.target.value})}/>
      </Field>
      <div className="form-actions"><button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar configuración"}</button></div>
    </form>

    <section className="card card-pad form-grid">
      <div>
        <h3 className="panel-title">Configure Webhooks en Meta for Developers</h3>
        <p className="section-note">En el formulario de Meta, pegá la URL en <strong>Callback URL</strong> y el token en <strong>Verify token</strong>. Después suscribí el campo <strong>messages</strong>.</p>
      </div>
      <Field label="Callback URL">
        <div className="toolbar"><input readOnly value={settings.webhookUrl}/><button type="button" className="btn-ghost" onClick={() => void copy(settings.webhookUrl, "URL del webhook")}>Copiar</button></div>
      </Field>
      <Field label="Verify token" hint={settings.webhookVerifyToken ? "Se genera automáticamente al guardar por primera vez." : "Guardá la configuración para generarlo."}>
        <div className="toolbar"><input readOnly value={settings.webhookVerifyToken ?? ""}/><button type="button" className="btn-ghost" disabled={!settings.webhookVerifyToken} onClick={() => void copy(settings.webhookVerifyToken ?? "", "Verify token")}>Copiar</button></div>
      </Field>
    </section>

    <section className="card card-pad form-grid">
      <div>
        <h3 className="panel-title">Verificar la conexión</h3>
        <p className="section-note">
          Consulta a Meta con las credenciales guardadas y devuelve los datos públicos del número.
          No le manda ningún mensaje a nadie.
        </p>
      </div>
      {settings.lastVerifiedAt ? (
        <p className="section-note">
          Última verificación: {new Date(settings.lastVerifiedAt).toLocaleString("es-AR")}
          {settings.verifiedName ? ` · ${settings.verifiedName}` : ""}
          {settings.displayPhoneNumber ? ` · ${settings.displayPhoneNumber}` : ""}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" disabled={verifying} onClick={() => void verify()}>
          {verifying ? "Verificando…" : "Verificar credenciales"}
        </button>
      </div>
    </section>

    <section className="card card-pad form-grid">
      <div>
        <h3 className="panel-title">Plantillas y ventana de 24 horas</h3>
        <p className="section-note">
          WhatsApp solo permite texto libre mientras el cliente escribió hace menos de 24 horas.
          Pasado ese plazo, únicamente se pueden enviar plantillas aprobadas por Meta: son las que
          sostienen los recontactos. Se cargan y sincronizan desde el CRM.
        </p>
      </div>
      <div className="form-actions">
        <a className="btn-ghost" href="/crm">Ir al CRM →</a>
      </div>
    </section>
  </div>;
}
