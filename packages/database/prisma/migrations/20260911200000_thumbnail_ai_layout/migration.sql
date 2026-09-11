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
