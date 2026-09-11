-- Marca de tiempo del último webhook de Meta con firma válida. Sirve para que el
-- checklist de puesta en marcha pueda confirmar que la suscripción realmente
-- entrega eventos, en vez de mostrar el paso siempre pendiente.
ALTER TABLE "WhatsappCloudSettings" ADD COLUMN IF NOT EXISTS "lastWebhookAt" TIMESTAMP(3);
