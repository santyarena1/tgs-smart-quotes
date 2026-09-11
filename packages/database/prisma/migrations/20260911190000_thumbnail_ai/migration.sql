-- Miniaturas generadas con IA: configuración (singleton) e imágenes de referencia.
ALTER TYPE "AiTaskType" ADD VALUE IF NOT EXISTS 'THUMBNAIL_IMAGE';

CREATE TABLE IF NOT EXISTS "ThumbnailAiSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "model" TEXT NOT NULL DEFAULT 'gpt-image-1',
  "quality" TEXT NOT NULL DEFAULT 'medium',
  "size" TEXT NOT NULL DEFAULT '1024x1024',
  "prompt" TEXT NOT NULL DEFAULT '',
  "textMode" TEXT NOT NULL DEFAULT 'AI',
  "textTemplate" TEXT NOT NULL DEFAULT '',
  "overlayPosition" TEXT NOT NULL DEFAULT 'bottom',
  "overlayColor" TEXT NOT NULL DEFAULT '#FFFFFF',
  "overlayFontSize" INTEGER NOT NULL DEFAULT 44,
  "overlayFontFamily" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThumbnailAiSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ThumbnailAiReference" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "note" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThumbnailAiReference_pkey" PRIMARY KEY ("id")
);

-- Plantilla TGS compuesta por el sistema + gabinete procesado con IA.
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'LAYOUT';
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "gpuHeadlineThresholdCents" BIGINT NOT NULL DEFAULT 150000000;
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "logoKey" TEXT;
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#E31B23';
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "footerJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "caseAiMode" TEXT NOT NULL DEFAULT 'OFF';
ALTER TABLE "ThumbnailAiSettings" ADD COLUMN IF NOT EXISTS "caseAiPrompt" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "ThumbnailCaseRender" (
  "id" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThumbnailCaseRender_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ThumbnailCaseRender_sourceUrl_key" ON "ThumbnailCaseRender"("sourceUrl");
