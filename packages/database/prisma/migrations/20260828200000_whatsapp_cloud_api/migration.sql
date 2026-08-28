CREATE TYPE "ChatbotMessageChannel" AS ENUM ('EXTENSION', 'CLOUD_API');

CREATE TABLE "WhatsappCloudSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumberId" TEXT,
    "businessAccountId" TEXT,
    "accessTokenEncrypted" TEXT,
    "appSecretEncrypted" TEXT,
    "webhookVerifyToken" TEXT,
    "apiVersion" TEXT NOT NULL DEFAULT 'v21.0',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappCloudSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChatbotMessageLog"
ADD COLUMN "channel" "ChatbotMessageChannel" NOT NULL DEFAULT 'EXTENSION',
ADD COLUMN "waMessageId" TEXT;

CREATE INDEX "ChatbotMessageLog_waMessageId_idx" ON "ChatbotMessageLog"("waMessageId");
