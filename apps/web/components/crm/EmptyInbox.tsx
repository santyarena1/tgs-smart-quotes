"use client";

import { useEffect, useState } from "react";
import { getWhatsappSettings, listWhatsappTemplates, type WhatsappSettings } from "../../lib/api";
import { IconChat, IconCheck, IconExternal } from "./icons";

/**
 * Estado inicial de la bandeja.
 *
 * Mientras WhatsApp no esté conectado no puede haber conversaciones, así que en
 * vez de un "no hay nada" la pantalla dice qué falta para ponerlo en marcha, con
 * los pasos ya cumplidos marcados a partir del estado real de la configuración.
 */
export function EmptyInbox() {
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [hasTemplates, setHasTemplates] = useState(false);

  useEffect(() => {
    void getWhatsappSettings().then(setSettings).catch(() => setSettings(null));
    void listWhatsappTemplates()
      .then((rows) => setHasTemplates(rows.some((row) => row.status === "APPROVED")))
      .catch(() => setHasTemplates(false));
  }, []);

  const credentialsDone = Boolean(settings?.enabled && settings.hasAccessToken && settings.hasAppSecret);
  const verified = Boolean(settings?.lastVerifiedAt);
  // El paso se da por hecho recién cuando Meta mandó al menos un evento firmado:
  // que la URL haya pasado la verificación no garantiza que la app esté suscripta al WABA.
  const webhookDone = Boolean(settings?.lastWebhookAt);

  const steps = [
    {
      done: credentialsDone,
      title: "Cargar las credenciales de Meta",
      detail: verified && settings?.displayPhoneNumber
        ? `Número verificado: ${settings.displayPhoneNumber}`
        : "Phone Number ID, Business Account ID, access token y app secret.",
    },
    {
      done: webhookDone,
      title: "Suscribir el webhook en Meta",
      detail: webhookDone && settings?.lastWebhookAt
        ? `Último evento recibido: ${new Date(settings.lastWebhookAt).toLocaleString("es-AR")}`
        : "Suscribí el campo messages (trae mensajes y confirmaciones de entrega) y la app al WABA. Se marca solo cuando llega el primer evento.",
    },
    {
      done: hasTemplates,
      title: "Registrar al menos una plantilla",
      detail: "Necesaria para retomar conversaciones pasadas las 24 h.",
    },
  ];

  return (
    <div className="crm-empty-inbox">
      <div className="crm-empty-mark"><IconChat size={28} /></div>
      <h1>Todavía no hay conversaciones</h1>
      <p className="crm-empty-lead">
        Cuando conectes WhatsApp, cada mensaje que llegue va a aparecer acá y vas a poder responder,
        mandar presupuestos y productos sin salir de esta pantalla.
      </p>

      <div className="crm-empty-card">
        <div className="crm-section-label">Para ponerlo en marcha</div>
        {steps.map((step, index) => (
          <div key={step.title} className="crm-step">
            <span className={step.done ? "crm-step-mark done" : index === steps.findIndex((s) => !s.done) ? "crm-step-mark next" : "crm-step-mark"}>
              {step.done ? <IconCheck size={12} /> : index + 1}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p className="crm-hint">{step.detail}</p>
            </div>
          </div>
        ))}
        <div className="crm-empty-actions">
          <a className="crm-send" href="/configuracion">Abrir configuración</a>
          <a className="btn-ghost btn-sm" href="/crm/plantillas">Ir a Plantillas</a>
        </div>
      </div>

      <p className="crm-hint crm-empty-note">
        <IconExternal size={13} /> El webhook se configura en Meta for Developers con la URL que muestra Configuración.
      </p>
    </div>
  );
}
