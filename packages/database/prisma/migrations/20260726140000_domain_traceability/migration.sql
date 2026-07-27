-- CreateEnum
CREATE TYPE "ReplyIntent" AS ENUM ('ACEPTA', 'RECHAZA', 'PIDE_CAMBIO', 'CONSULTA', 'AMBIGUA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatusEventType" ADD VALUE 'SOLICITUD_LISTA';
ALTER TYPE "StatusEventType" ADD VALUE 'ENVIO_DESCARTADO';
ALTER TYPE "StatusEventType" ADD VALUE 'REACTIVADO';
ALTER TYPE "StatusEventType" ADD VALUE 'REVISION_REQUERIDA';
ALTER TYPE "StatusEventType" ADD VALUE 'INTENCION_DETECTADA';
ALTER TYPE "StatusEventType" ADD VALUE 'SUGERENCIA_IA';
ALTER TYPE "StatusEventType" ADD VALUE 'COMPATIBILIDAD_IA';

-- DropForeignKey
ALTER TABLE "QuoteDelivery" DROP CONSTRAINT "QuoteDelivery_versionId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteSendAttempt" DROP CONSTRAINT "QuoteSendAttempt_versionId_fkey";

-- AlterTable
ALTER TABLE "AiRequest" ADD COLUMN     "cacheHit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "costUsdCents" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AiSettings" ADD COLUMN     "compatibilityOnSave" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultTone" "SuggestionTone" NOT NULL DEFAULT 'INTERMEDIO',
ADD COLUMN     "intentEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minIntentConfidence" INTEGER NOT NULL DEFAULT 70;

-- AlterTable
ALTER TABLE "AiSuggestion" ADD COLUMN     "usedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "normalizedName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CollectionQuote" ADD COLUMN     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actedAt" TIMESTAMP(3),
ADD COLUMN     "draft" TEXT,
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "QuoteDelivery" ADD COLUMN     "attemptId" TEXT,
ADD COLUMN     "chatName" TEXT,
ADD COLUMN     "confirmedBy" "SendAttemptStatus" NOT NULL DEFAULT 'CONFIRMADO_MANUAL',
ADD COLUMN     "pdfId" TEXT;

-- AlterTable
ALTER TABLE "QuoteFamily" ADD COLUMN     "lastActivityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "isPcMainLine" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "masterCostCents" BIGINT,
ADD COLUMN     "masterSaleCents" BIGINT;

-- AlterTable
ALTER TABLE "QuotePdf" ADD COLUMN     "configJson" JSONB,
ADD COLUMN     "driver" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN     "inputHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuotePdf" ALTER COLUMN "inputHash" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "readyAt" TIMESTAMP(3),
ALTER COLUMN "originalText" SET DEFAULT '';

-- AlterTable
ALTER TABLE "QuoteSendAttempt" ADD COLUMN     "chatName" TEXT,
ADD COLUMN     "detectionLog" JSONB,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "pdfKind" "PdfKind",
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "QuoteVersion" ADD COLUMN     "autoClosedAt" TIMESTAMP(3),
ADD COLUMN     "pdfOverrides" JSONB,
ADD COLUMN     "reactivatedAt" TIMESTAMP(3),
ADD COLUMN     "reviewPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "staleNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "QuoteReply" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "chatPhone" TEXT,
    "text" TEXT NOT NULL,
    "intent" "ReplyIntent" NOT NULL DEFAULT 'AMBIGUA',
    "confidence" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'EXTENSION',
    "appliedState" "QuoteState",
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "staleDays" INTEGER NOT NULL DEFAULT 10,
    "staleNoticeDays" INTEGER NOT NULL DEFAULT 2,
    "autoStaleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "similarityCpuBps" INTEGER NOT NULL DEFAULT 3500,
    "similarityMotherBps" INTEGER NOT NULL DEFAULT 2000,
    "similarityGpuBps" INTEGER NOT NULL DEFAULT 3500,
    "similarityOtherBps" INTEGER NOT NULL DEFAULT 1000,
    "similarityAmbiguousMin" INTEGER NOT NULL DEFAULT 55,
    "similarityAmbiguousMax" INTEGER NOT NULL DEFAULT 75,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteReply_versionId_createdAt_idx" ON "QuoteReply"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteReply_intent_createdAt_idx" ON "QuoteReply"("intent", "createdAt");

-- CreateIndex
CREATE INDEX "AiRequest_createdAt_idx" ON "AiRequest"("createdAt");

-- CreateIndex
CREATE INDEX "Collection_archived_sortOrder_idx" ON "Collection"("archived", "sortOrder");

-- CreateIndex
CREATE INDEX "Collection_normalizedName_idx" ON "Collection"("normalizedName");

-- CreateIndex
CREATE INDEX "CollectionQuote_familyId_idx" ON "CollectionQuote"("familyId");

-- CreateIndex
CREATE INDEX "CollectionQuote_collectionId_sortOrder_idx" ON "CollectionQuote"("collectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteDelivery_attemptId_key" ON "QuoteDelivery"("attemptId");

-- CreateIndex
CREATE INDEX "QuoteDelivery_versionId_deliveredAt_idx" ON "QuoteDelivery"("versionId", "deliveredAt");

-- CreateIndex
CREATE INDEX "QuoteDelivery_chatPhone_deliveredAt_idx" ON "QuoteDelivery"("chatPhone", "deliveredAt");

-- CreateIndex
CREATE INDEX "QuoteDelivery_customerId_deliveredAt_idx" ON "QuoteDelivery"("customerId", "deliveredAt");

-- CreateIndex
CREATE INDEX "QuoteFamily_customerId_createdAt_idx" ON "QuoteFamily"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteFamily_lastActivityAt_idx" ON "QuoteFamily"("lastActivityAt");

-- CreateIndex
CREATE INDEX "QuotePdf_sha256_idx" ON "QuotePdf"("sha256");

-- CreateIndex
CREATE INDEX "QuoteRequest_detectedPhone_idx" ON "QuoteRequest"("detectedPhone");

-- CreateIndex
CREATE INDEX "QuoteSendAttempt_versionId_createdAt_idx" ON "QuoteSendAttempt"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteSendAttempt_chatPhone_createdAt_idx" ON "QuoteSendAttempt"("chatPhone", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteStatusEvent_versionId_createdAt_idx" ON "QuoteStatusEvent"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteStatusEvent_type_createdAt_idx" ON "QuoteStatusEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteVersion_reviewPending_idx" ON "QuoteVersion"("reviewPending");

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSendAttempt" ADD CONSTRAINT "QuoteSendAttempt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSendAttempt" ADD CONSTRAINT "QuoteSendAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDelivery" ADD CONSTRAINT "QuoteDelivery_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDelivery" ADD CONSTRAINT "QuoteDelivery_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuoteSendAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDelivery" ADD CONSTRAINT "QuoteDelivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDelivery" ADD CONSTRAINT "QuoteDelivery_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "QuotePdf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDelivery" ADD CONSTRAINT "QuoteDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteReply" ADD CONSTRAINT "QuoteReply_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteStatusEvent" ADD CONSTRAINT "QuoteStatusEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "QuoteFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteStatusEvent" ADD CONSTRAINT "QuoteStatusEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteStatusEvent" ADD CONSTRAINT "QuoteStatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: la coleccion necesita nombre normalizado para la busqueda por trigramas.
UPDATE "Collection" SET "normalizedName" = lower("name") WHERE "normalizedName" = '';

-- Singleton de parametros operativos.
INSERT INTO "OperationsSettings" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING;

-- Los indices GIN de trigramas no se declaran en el datamodel de Prisma; se crean aqui
-- porque sostienen la busqueda server-side por nombre, telefono, numero y contenido.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Collection_normalizedName_trgm_idx" ON "Collection" USING GIN ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "QuoteFamily_visibleNumber_trgm_idx" ON "QuoteFamily" USING GIN ("visibleNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_name_trgm_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);

