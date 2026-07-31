-- CreateEnum
ALTER TYPE "AiTaskType" ADD VALUE 'CHATBOT_RESPONSE';

-- CreateEnum
CREATE TYPE "ChatbotMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO');

-- CreateEnum
CREATE TYPE "ChatbotMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ChatbotMessageStatus" AS ENUM ('OBSERVED', 'GENERATED', 'SUGGESTED', 'SEND_PENDING', 'SENT', 'SEND_FAILED', 'DISMISSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ChatbotMessageActor" AS ENUM ('CUSTOMER', 'BOT', 'HUMAN', 'SYSTEM');

-- CreateTable
CREATE TABLE "ChatbotSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultMode" "ChatbotMode" NOT NULL DEFAULT 'SUGGEST',
    "persona" TEXT NOT NULL,
    "openingMessages" JSONB NOT NULL,
    "closingMessages" JSONB NOT NULL,
    "knowledgeEntries" JSONB NOT NULL,
    "escalationKeywords" JSONB NOT NULL,
    "escalationInstructions" TEXT NOT NULL,
    "modelCanEscalate" BOOLEAN NOT NULL DEFAULT true,
    "businessHours" JSONB NOT NULL,
    "outsideHoursBehavior" JSONB NOT NULL,
    "responseStyle" JSONB NOT NULL,
    "customRules" JSONB NOT NULL,
    "scanIntervalSeconds" INTEGER NOT NULL DEFAULT 8,
    "maxRecentSnippets" INTEGER NOT NULL DEFAULT 12,
    "summaryRefreshEvery" INTEGER NOT NULL DEFAULT 8,
    "sendConfirmationTimeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotConversation" (
    "chatKey" TEXT NOT NULL,
    "displayName" TEXT,
    "modeOverride" "ChatbotMode",
    "summary" TEXT,
    "summaryMessageCount" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "lastInboundFingerprint" TEXT,
    "lastInboundText" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundText" TEXT,
    "lastOutboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatbotConversation_pkey" PRIMARY KEY ("chatKey")
);

-- CreateTable
CREATE TABLE "ChatbotMessageLog" (
    "id" TEXT NOT NULL,
    "conversationKey" TEXT NOT NULL,
    "direction" "ChatbotMessageDirection" NOT NULL,
    "actor" "ChatbotMessageActor" NOT NULL,
    "mode" "ChatbotMode",
    "status" "ChatbotMessageStatus" NOT NULL,
    "text" TEXT NOT NULL,
    "inboundFingerprint" TEXT,
    "pairedMessageId" TEXT,
    "notificationId" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "inputHash" TEXT,
    "shouldEscalate" BOOLEAN NOT NULL DEFAULT false,
    "escalationReason" TEXT,
    "decisionMetadata" JSONB,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatbotMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatbotConversation_escalatedAt_idx" ON "ChatbotConversation"("escalatedAt");
CREATE INDEX "ChatbotConversation_updatedAt_idx" ON "ChatbotConversation"("updatedAt");
CREATE INDEX "ChatbotMessageLog_conversationKey_createdAt_idx" ON "ChatbotMessageLog"("conversationKey", "createdAt");
CREATE INDEX "ChatbotMessageLog_status_createdAt_idx" ON "ChatbotMessageLog"("status", "createdAt");
CREATE INDEX "ChatbotMessageLog_notificationId_idx" ON "ChatbotMessageLog"("notificationId");
CREATE INDEX "ChatbotMessageLog_inboundFingerprint_idx" ON "ChatbotMessageLog"("inboundFingerprint");
CREATE UNIQUE INDEX "ChatbotMessageLog_conversationKey_inboundFingerprint_direction_key"
ON "ChatbotMessageLog"("conversationKey", "inboundFingerprint", "direction");

ALTER TABLE "ChatbotMessageLog" ADD CONSTRAINT "ChatbotMessageLog_conversationKey_fkey"
FOREIGN KEY ("conversationKey") REFERENCES "ChatbotConversation"("chatKey") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ChatbotSettings" (
  "id", "persona", "openingMessages", "closingMessages", "knowledgeEntries",
  "escalationKeywords", "escalationInstructions", "businessHours",
  "outsideHoursBehavior", "responseStyle", "customRules", "updatedAt"
) VALUES (
  'singleton',
  'Hablá como un vendedor argentino, cálido, informal pero profesional. Nunca digas que sos un bot ni inventes información.',
  '["¡Hola! ¿Cómo estás? ¿En qué te puedo ayudar?"]'::jsonb,
  '["¡Gracias por escribirnos! Cualquier otra consulta, estamos a disposición."]'::jsonb,
  '[]'::jsonb,
  '["supervisor", "encargado", "reclamo", "denuncia"]'::jsonb,
  'Escalá si falta información confiable, hay un reclamo sensible, el cliente pide una excepción comercial o solicita hablar con una persona. No anuncies la escalación al cliente.',
  '{"enabled":false,"timezone":"America/Argentina/Buenos_Aires","schedule":{"monday":[{"from":"09:00","to":"18:00"}],"tuesday":[{"from":"09:00","to":"18:00"}],"wednesday":[{"from":"09:00","to":"18:00"}],"thursday":[{"from":"09:00","to":"18:00"}],"friday":[{"from":"09:00","to":"18:00"}],"saturday":[],"sunday":[]}}'::jsonb,
  '{"mode":"STALL","message":"¡Gracias por escribirnos! Ya revisamos tu consulta y te respondemos apenas estemos disponibles."}'::jsonb,
  '{"length":"MEDIUM","maxCharacters":700,"emoji":"SPARING","paragraphs":"SHORT","avoidRepetition":true}'::jsonb,
  '[]'::jsonb,
  CURRENT_TIMESTAMP
);
