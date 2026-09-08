-- Capa de mensajería por WhatsApp Cloud API. Reemplaza a la extensión de Chrome:
-- la percepción pasa a ser el webhook de Meta y el transporte, la Graph API.
-- Toda la lógica de decisión del chatbot queda intacta.

-- ---------------------------------------------------------------------------
-- Credenciales: datos informativos que devuelve Meta al verificar el número.
-- ---------------------------------------------------------------------------
ALTER TABLE "WhatsappCloudSettings" ADD COLUMN IF NOT EXISTS "displayPhoneNumber" TEXT;
ALTER TABLE "WhatsappCloudSettings" ADD COLUMN IF NOT EXISTS "verifiedName" TEXT;
ALTER TABLE "WhatsappCloudSettings" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Conversaciones: ventana de 24 h, no leídos y asignación a un vendedor.
-- ---------------------------------------------------------------------------
ALTER TABLE "ChatbotConversation" ADD COLUMN IF NOT EXISTS "windowExpiresAt" TIMESTAMP(3);
ALTER TABLE "ChatbotConversation" ADD COLUMN IF NOT EXISTS "waContactName" TEXT;
-- `chatKey` guarda el teléfono normalizado (sin el 9 argentino); para responderle a
-- Meta hay que usar su `wa_id` textual, así que se conserva aparte.
ALTER TABLE "ChatbotConversation" ADD COLUMN IF NOT EXISTS "waId" TEXT;
ALTER TABLE "ChatbotConversation" ADD COLUMN IF NOT EXISTS "unreadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChatbotConversation" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);
ALTER TABLE "ChatbotConversation" ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT;

-- La ventana se calcula desde el último entrante. Para lo ya existente se
-- reconstruye con el mismo criterio; las conversaciones sin entrantes quedan
-- en NULL, que es exactamente "nunca escribió, no hay ventana abierta".
UPDATE "ChatbotConversation"
   SET "windowExpiresAt" = "lastInboundAt" + INTERVAL '24 hours'
 WHERE "lastInboundAt" IS NOT NULL
   AND "windowExpiresAt" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ChatbotConversation_assignedUserId_fkey'
  ) THEN
    ALTER TABLE "ChatbotConversation"
      ADD CONSTRAINT "ChatbotConversation_assignedUserId_fkey"
      FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "ChatbotConversation_windowExpiresAt_idx"
  ON "ChatbotConversation"("windowExpiresAt");
CREATE INDEX IF NOT EXISTS "ChatbotConversation_assignedUserId_updatedAt_idx"
  ON "ChatbotConversation"("assignedUserId", "updatedAt");

-- ---------------------------------------------------------------------------
-- Mensajes: confirmaciones reales de entrega y referencias de medios.
-- ---------------------------------------------------------------------------
ALTER TABLE "ChatbotMessageLog" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "ChatbotMessageLog" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "ChatbotMessageLog" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "ChatbotMessageLog" ADD COLUMN IF NOT EXISTS "waErrorCode" INTEGER;
ALTER TABLE "ChatbotMessageLog" ADD COLUMN IF NOT EXISTS "mediaId" TEXT;
ALTER TABLE "ChatbotMessageLog" ADD COLUMN IF NOT EXISTS "mediaMimeType" TEXT;
ALTER TABLE "ChatbotMessageLog" ADD COLUMN IF NOT EXISTS "mediaFilename" TEXT;

-- ---------------------------------------------------------------------------
-- Plantillas aprobadas por Meta: único contenido permitido fuera de la ventana.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "WhatsappTemplate" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "language"        TEXT NOT NULL DEFAULT 'es_AR',
  "category"        TEXT NOT NULL DEFAULT 'MARKETING',
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "body"            TEXT NOT NULL,
  "variableCount"   INTEGER NOT NULL DEFAULT 0,
  "usageHint"       TEXT NOT NULL DEFAULT '',
  "useForRecontact" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncedAt"    TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappTemplate_name_language_key"
  ON "WhatsappTemplate"("name", "language");
CREATE INDEX IF NOT EXISTS "WhatsappTemplate_status_useForRecontact_idx"
  ON "WhatsappTemplate"("status", "useForRecontact");

-- ---------------------------------------------------------------------------
-- Cola de salida. Traslada al servidor las demoras humanas, las barreras de
-- autorización y los reintentos que antes corrían dentro del navegador.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "WhatsappOutboundQueue" (
  "id"              TEXT NOT NULL,
  "conversationKey" TEXT NOT NULL,
  "logId"           TEXT,
  "kind"            "WhatsappQueueKind" NOT NULL DEFAULT 'TEXT',
  "payload"         JSONB NOT NULL,
  "bubbleIndex"     INTEGER NOT NULL DEFAULT 0,
  "scheduledAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"          "WhatsappQueueStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "lastError"       TEXT,
  "waMessageId"     TEXT,
  "simulationRunId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappOutboundQueue_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WhatsappOutboundQueue_conversationKey_fkey'
  ) THEN
    ALTER TABLE "WhatsappOutboundQueue"
      ADD CONSTRAINT "WhatsappOutboundQueue_conversationKey_fkey"
      FOREIGN KEY ("conversationKey") REFERENCES "ChatbotConversation"("chatKey")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- El drenador toma trabajo con FOR UPDATE SKIP LOCKED sobre este índice, así que
-- dos instancias de la API nunca mandan el mismo mensaje dos veces.
CREATE INDEX IF NOT EXISTS "WhatsappOutboundQueue_status_scheduledAt_idx"
  ON "WhatsappOutboundQueue"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "WhatsappOutboundQueue_conversationKey_bubbleIndex_idx"
  ON "WhatsappOutboundQueue"("conversationKey", "bubbleIndex");
CREATE INDEX IF NOT EXISTS "WhatsappOutboundQueue_logId_idx"
  ON "WhatsappOutboundQueue"("logId");
