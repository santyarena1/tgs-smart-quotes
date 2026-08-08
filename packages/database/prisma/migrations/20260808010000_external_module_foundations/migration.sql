CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'FAILED');
CREATE TYPE "Model3DStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "AssetOrigin" AS ENUM ('UPLOAD', 'SERPER', 'OFFICIAL', 'PLATFORM');

CREATE TABLE "ProductAsset" (
 "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "origin" "AssetOrigin" NOT NULL, "sourceUrl" TEXT, "url" TEXT, "storageKey" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "approved" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'READY', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProductAsset_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CaseModel3D" (
 "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "sourcePhotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "glbUrl" TEXT, "spinUrl" TEXT, "glbKey" TEXT, "status" "Model3DStatus" NOT NULL DEFAULT 'PENDING', "tripoJobId" TEXT, "meshStats" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CaseModel3D_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ThumbnailTemplate" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "templateImageUrl" TEXT, "templateKey" TEXT, "fontsJson" JSONB NOT NULL DEFAULT '[]', "rulesJson" JSONB NOT NULL DEFAULT '{}', "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ThumbnailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WebPublication" (
 "id" TEXT NOT NULL, "quoteVersionId" TEXT NOT NULL, "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT', "wpProductId" TEXT, "url" TEXT, "thumbnailUrl" TEXT, "payloadSnapshot" JSONB, "lastError" TEXT, "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WebPublication_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProcessingJob" (
 "id" TEXT NOT NULL, "type" TEXT NOT NULL, "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING', "payload" JSONB NOT NULL DEFAULT '{}', "result" JSONB, "error" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL DEFAULT 3, "entityType" TEXT, "entityId" TEXT, "runAfter" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductAsset_productId_idx" ON "ProductAsset"("productId");
CREATE UNIQUE INDEX "CaseModel3D_productId_key" ON "CaseModel3D"("productId");
CREATE UNIQUE INDEX "WebPublication_quoteVersionId_key" ON "WebPublication"("quoteVersionId");
CREATE INDEX "ProcessingJob_status_runAfter_idx" ON "ProcessingJob"("status", "runAfter");
CREATE INDEX "ProcessingJob_type_idx" ON "ProcessingJob"("type");
CREATE INDEX "ProductAsset_productId_idx" ON "ProductAsset"("productId");
CREATE UNIQUE INDEX "CaseModel3D_productId_key" ON "CaseModel3D"("productId");
CREATE UNIQUE INDEX "WebPublication_quoteVersionId_key" ON "WebPublication"("quoteVersionId");
CREATE INDEX "ProcessingJob_status_runAfter_idx" ON "ProcessingJob"("status", "runAfter");
CREATE INDEX "ProcessingJob_type_idx" ON "ProcessingJob"("type");

ALTER TABLE "ProductAsset" ADD CONSTRAINT "ProductAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseModel3D" ADD CONSTRAINT "CaseModel3D_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebPublication" ADD CONSTRAINT "WebPublication_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;