-- Baseline reconstruido desde la base de desarrollo. Extensiones requeridas por los indices GIN de trigramas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AiTaskType" AS ENUM ('REQUEST_ANALYSIS', 'COMPATIBILITY', 'RESPONSE_SUGGESTION', 'SEMANTIC_SIMILARITY');

-- CreateEnum
CREATE TYPE "public"."FieldOverride" AS ENUM ('HEREDAR', 'MOSTRAR', 'OCULTAR');

-- CreateEnum
CREATE TYPE "public"."PcConcept" AS ENUM ('CPU', 'MOTHERBOARD', 'GPU', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."PdfKind" AS ENUM ('SIMPLE', 'DETALLADO');

-- CreateEnum
CREATE TYPE "public"."QuoteState" AS ENUM ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'REEMPLAZADO', 'NO_CONCRETADO');

-- CreateEnum
CREATE TYPE "public"."RequestState" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'LISTA', 'ENVIADA', 'CERRADA');

-- CreateEnum
CREATE TYPE "public"."SendAttemptStatus" AS ENUM ('PENDIENTE', 'CONFIRMADO_AUTO', 'CONFIRMADO_MANUAL', 'NO_ENVIADO', 'AMBIGUO');

-- CreateEnum
CREATE TYPE "public"."StatusEventType" AS ENUM ('SOLICITUD_CREADA', 'SOLICITUD_ASIGNADA', 'ANALISIS_IA', 'PRESUPUESTO_CREADO', 'VERSION_CREADA', 'PRECIOS_ACTUALIZADOS', 'PDF_GENERADO', 'MENSAJE_PREPARADO', 'ENVIO_DETECTADO', 'ENVIO_CONFIRMADO_MANUAL', 'ACEPTACION', 'RECHAZO', 'REEMPLAZO', 'NO_CONCRETADO', 'CAMBIO_ESTADO', 'CLIENTE_CREADO', 'PRODUCTO_MODIFICADO', 'COLECCION_MODIFICADA', 'COSTO_AJUSTADO', 'TOTAL_AJUSTADO');

-- CreateEnum
CREATE TYPE "public"."SuggestionTone" AS ENUM ('AMIGABLE', 'INTERMEDIO', 'TECNICO');

-- CreateTable
CREATE TABLE "public"."AiRequest" (
    "id" TEXT NOT NULL,
    "task" "public"."AiTaskType" NOT NULL,
    "model" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "requestId" TEXT,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER,
    "usageJson" JSONB,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL DEFAULT 'gpt-5.2',
    "apiKeyEncrypted" TEXT,
    "analysisEnabled" BOOLEAN NOT NULL DEFAULT true,
    "similarityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "compatibilityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "responsesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ambiguousSimilarityAi" BOOLEAN NOT NULL DEFAULT false,
    "monthlyBudgetUsdCents" BIGINT,
    "generalMarkupBps" INTEGER NOT NULL DEFAULT 3000,
    "productSimilarityThreshold" INTEGER NOT NULL DEFAULT 70,
    "frequentSupportThreshold" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiSuggestion" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "tone" "public"."SuggestionTone",
    "text" TEXT NOT NULL,
    "usedText" TEXT,
    "model" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous" JSONB,
    "next" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "visibleInExtension" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CollectionQuote" (
    "collectionId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionQuote_pkey" PRIMARY KEY ("collectionId","familyId")
);

-- CreateTable
CREATE TABLE "public"."CompanySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "logoUrl" TEXT,
    "name" TEXT NOT NULL,
    "taxCondition" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "grossIncome" TEXT NOT NULL,
    "activityStart" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phones" TEXT NOT NULL,
    "footerText" TEXT NOT NULL,
    "rmaUrl" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "dni" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancingPlan" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "installments" INTEGER NOT NULL,
    "coefficientBps" INTEGER NOT NULL,
    "interestFree" BOOLEAN NOT NULL DEFAULT false,
    "appliesOn" TEXT NOT NULL,
    "note" TEXT,
    "commercialText" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoginAttempt" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "chatPhone" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PcLine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "aliases" TEXT[],
    "keyLine" BOOLEAN NOT NULL DEFAULT false,
    "concept" "public"."PcConcept" NOT NULL DEFAULT 'OTHER',

    CONSTRAINT "PcLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PdfSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "showListPrice" BOOLEAN NOT NULL DEFAULT true,
    "showCashTransfer" BOOLEAN NOT NULL DEFAULT true,
    "showFinancing" BOOLEAN NOT NULL DEFAULT true,
    "showBbva" BOOLEAN NOT NULL DEFAULT true,
    "showOtherBanks" BOOLEAN NOT NULL DEFAULT true,
    "showFinancingNote" BOOLEAN NOT NULL DEFAULT true,
    "showTaxData" BOOLEAN NOT NULL DEFAULT true,
    "showServicesBlock" BOOLEAN NOT NULL DEFAULT true,
    "showWindows" BOOLEAN NOT NULL DEFAULT true,
    "showDrivers" BOOLEAN NOT NULL DEFAULT true,
    "showDelay" BOOLEAN NOT NULL DEFAULT true,
    "showRma" BOOLEAN NOT NULL DEFAULT true,
    "showExtraObservation" BOOLEAN NOT NULL DEFAULT false,
    "showIndividualPrices" BOOLEAN NOT NULL DEFAULT true,
    "showComponentDetail" BOOLEAN NOT NULL DEFAULT true,
    "builtPcTitle" TEXT NOT NULL,
    "builtPcDescription" TEXT NOT NULL,
    "assemblyText" TEXT NOT NULL,
    "installText" TEXT NOT NULL,
    "windowsText" TEXT NOT NULL,
    "driversText" TEXT NOT NULL,
    "estimatedDelay" TEXT NOT NULL,
    "lineOrder" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "costCents" BIGINT NOT NULL,
    "salePriceCents" BIGINT NOT NULL,
    "markupBps" INTEGER NOT NULL,
    "usesGeneralMarkup" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "defaultLineId" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "costCents" BIGINT NOT NULL,
    "salePriceCents" BIGINT NOT NULL,
    "markupBps" INTEGER NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuoteDelivery" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "customerId" TEXT,
    "chatPhone" TEXT,
    "message" TEXT,
    "pdfKind" "public"."PdfKind",
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuoteFamily" (
    "id" TEXT NOT NULL,
    "visibleNumber" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "requestId" TEXT,
    "customerId" TEXT,
    "isBuiltPc" BOOLEAN NOT NULL DEFAULT false,
    "activeVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuoteItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "productId" TEXT,
    "frozenName" TEXT NOT NULL,
    "lineId" TEXT,
    "quantity" INTEGER NOT NULL,
    "frozenCostCents" BIGINT NOT NULL,
    "frozenMarkupBps" INTEGER NOT NULL,
    "frozenSalePriceCents" BIGINT NOT NULL,
    "subtotalCents" BIGINT NOT NULL,
    "masterPriceAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL,
    "observation" TEXT,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuotePdf" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "public"."PdfKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotePdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuoteRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "customerId" TEXT,
    "detectedPhone" TEXT,
    "maximumBudgetCents" BIGINT,
    "expectedUse" TEXT,
    "requiredComponents" TEXT[],
    "creatorId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "state" "public"."RequestState" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuoteSendAttempt" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "chatPhone" TEXT,
    "message" TEXT NOT NULL,
    "pdfName" TEXT,
    "status" "public"."SendAttemptStatus" NOT NULL DEFAULT 'PENDIENTE',
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "QuoteSendAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuoteStatusEvent" (
    "id" TEXT NOT NULL,
    "type" "public"."StatusEventType" NOT NULL,
    "familyId" TEXT,
    "versionId" TEXT,
    "requestId" TEXT,
    "customerId" TEXT,
    "userId" TEXT,
    "previous" JSONB,
    "next" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuoteVersion" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "public"."QuoteState" NOT NULL DEFAULT 'BORRADOR',
    "creatorId" TEXT NOT NULL,
    "reason" TEXT,
    "totalCostCents" BIGINT NOT NULL,
    "totalSaleCents" BIGINT NOT NULL,
    "profitCents" BIGINT NOT NULL,
    "effectiveMarkupBps" INTEGER NOT NULL,
    "resolvedPdfConfig" JSONB NOT NULL,
    "financingSnapshot" JSONB,
    "sentMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicObservation" TEXT,

    CONSTRAINT "QuoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "renewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SimilarityCache" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimilarityCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRequest_entityType_entityId_idx" ON "public"."AiRequest"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "AiRequest_task_inputHash_idx" ON "public"."AiRequest"("task" ASC, "inputHash" ASC);

-- CreateIndex
CREATE INDEX "AiSuggestion_entityType_entityId_idx" ON "public"."AiSuggestion"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "public"."AuditLog"("entityType" ASC, "entityId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "public"."AuditLog"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_name_key" ON "public"."Collection"("name" ASC);

-- CreateIndex
CREATE INDEX "Customer_dni_idx" ON "public"."Customer"("dni" ASC);

-- CreateIndex
CREATE INDEX "Customer_normalizedName_idx" ON "public"."Customer"("normalizedName" ASC);

-- CreateIndex
CREATE INDEX "Customer_normalizedName_trgm_idx" ON "public"."Customer" USING GIN ("normalizedName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_normalizedPhone_idx" ON "public"."Customer"("normalizedPhone" ASC);

-- CreateIndex
CREATE INDEX "Customer_normalizedPhone_trgm_idx" ON "public"."Customer" USING GIN ("normalizedPhone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "public"."LoginAttempt"("ip" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "LoginAttempt_username_createdAt_idx" ON "public"."LoginAttempt"("username" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_chatPhone_createdAt_idx" ON "public"."Notification"("chatPhone" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "public"."Notification"("userId" ASC, "readAt" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PcLine_name_key" ON "public"."PcLine"("name" ASC);

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "public"."Product"("active" ASC);

-- CreateIndex
CREATE INDEX "Product_normalizedName_idx" ON "public"."Product"("normalizedName" ASC);

-- CreateIndex
CREATE INDEX "Product_normalizedName_trgm_idx" ON "public"."Product" USING GIN ("normalizedName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductPriceHistory_productId_createdAt_idx" ON "public"."ProductPriceHistory"("productId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "QuoteFamily_internalName_idx" ON "public"."QuoteFamily"("internalName" ASC);

-- CreateIndex
CREATE INDEX "QuoteFamily_internalName_trgm_idx" ON "public"."QuoteFamily" USING GIN ("internalName" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteFamily_visibleNumber_key" ON "public"."QuoteFamily"("visibleNumber" ASC);

-- CreateIndex
CREATE INDEX "QuoteItem_frozenName_trgm_idx" ON "public"."QuoteItem" USING GIN ("frozenName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "QuoteItem_productId_idx" ON "public"."QuoteItem"("productId" ASC);

-- CreateIndex
CREATE INDEX "QuoteItem_versionId_position_idx" ON "public"."QuoteItem"("versionId" ASC, "position" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "QuotePdf_versionId_kind_key" ON "public"."QuotePdf"("versionId" ASC, "kind" ASC);

-- CreateIndex
CREATE INDEX "QuoteRequest_originalText_trgm_idx" ON "public"."QuoteRequest" USING GIN ("originalText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "QuoteRequest_state_createdAt_idx" ON "public"."QuoteRequest"("state" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "QuoteSendAttempt_status_createdAt_idx" ON "public"."QuoteSendAttempt"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "QuoteStatusEvent_customerId_createdAt_idx" ON "public"."QuoteStatusEvent"("customerId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "QuoteStatusEvent_familyId_createdAt_idx" ON "public"."QuoteStatusEvent"("familyId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "QuoteStatusEvent_requestId_createdAt_idx" ON "public"."QuoteStatusEvent"("requestId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteVersion_familyId_version_key" ON "public"."QuoteVersion"("familyId" ASC, "version" ASC);

-- CreateIndex
CREATE INDEX "QuoteVersion_state_lastActivityAt_idx" ON "public"."QuoteVersion"("state" ASC, "lastActivityAt" ASC);

-- CreateIndex
CREATE INDEX "QuoteVersion_state_sentAt_idx" ON "public"."QuoteVersion"("state" ASC, "sentAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "public"."Session"("userId" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SimilarityCache_sourceType_sourceId_inputHash_key" ON "public"."SimilarityCache"("sourceType" ASC, "sourceId" ASC, "inputHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username" ASC);

-- AddForeignKey
ALTER TABLE "public"."AiRequest" ADD CONSTRAINT "AiRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectionQuote" ADD CONSTRAINT "CollectionQuote_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "public"."Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectionQuote" ADD CONSTRAINT "CollectionQuote_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "public"."QuoteFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_defaultLineId_fkey" FOREIGN KEY ("defaultLineId") REFERENCES "public"."PcLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteDelivery" ADD CONSTRAINT "QuoteDelivery_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."QuoteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteFamily" ADD CONSTRAINT "QuoteFamily_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteFamily" ADD CONSTRAINT "QuoteFamily_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteItem" ADD CONSTRAINT "QuoteItem_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "public"."PcLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteItem" ADD CONSTRAINT "QuoteItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuotePdf" ADD CONSTRAINT "QuotePdf_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteRequest" ADD CONSTRAINT "QuoteRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteSendAttempt" ADD CONSTRAINT "QuoteSendAttempt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."QuoteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteVersion" ADD CONSTRAINT "QuoteVersion_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuoteVersion" ADD CONSTRAINT "QuoteVersion_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "public"."QuoteFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

