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
