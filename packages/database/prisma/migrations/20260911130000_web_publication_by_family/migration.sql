-- La publicación en la tienda pasa a ser una por presupuesto (QuoteFamily),
-- con la versión publicada como puntero. Antes era una por versión: cada
-- versión nueva "perdía" la publicación en el panel y, al volver a publicar,
-- creaba un producto duplicado en WordPress.

-- ---------------------------------------------------------------------------
-- WebPublication: columna de familia, poblada desde la versión.
-- ---------------------------------------------------------------------------
ALTER TABLE "WebPublication" ADD COLUMN IF NOT EXISTS "quoteFamilyId" TEXT;
ALTER TABLE "WebPublication" ADD COLUMN IF NOT EXISTS "lastErrorAt" TIMESTAMP(3);

UPDATE "WebPublication" p
   SET "quoteFamilyId" = v."familyId"
  FROM "QuoteVersion" v
 WHERE v."id" = p."quoteVersionId"
   AND p."quoteFamilyId" IS NULL;

-- Si un presupuesto tenía varias versiones publicadas, queda la que está
-- publicada y es más reciente. Los productos de WordPress que correspondían
-- a las otras filas los pasa a borrador el plugin en la próxima publicación
-- (recibe todos los ids de versión del presupuesto como `legacyExternalIds`).
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "quoteFamilyId"
           ORDER BY ("status" = 'PUBLISHED') DESC, "publishedAt" DESC NULLS LAST, "updatedAt" DESC
         ) AS rn
    FROM "WebPublication"
)
DELETE FROM "WebPublication" WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- Filas huérfanas (versión sin familia, no debería haber) se descartan.
DELETE FROM "WebPublication" WHERE "quoteFamilyId" IS NULL;

ALTER TABLE "WebPublication" ALTER COLUMN "quoteFamilyId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "WebPublication_quoteFamilyId_key" ON "WebPublication"("quoteFamilyId");
ALTER TABLE "WebPublication"
  ADD CONSTRAINT "WebPublication_quoteFamilyId_fkey"
  FOREIGN KEY ("quoteFamilyId") REFERENCES "QuoteFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La versión publicada no se puede borrar mientras esté en la tienda.
ALTER TABLE "WebPublication" DROP CONSTRAINT IF EXISTS "WebPublication_quoteVersionId_fkey";
ALTER TABLE "WebPublication"
  ADD CONSTRAINT "WebPublication_quoteVersionId_fkey"
  FOREIGN KEY ("quoteVersionId") REFERENCES "QuoteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- QuoteFamily: título y bajada propios de la tienda.
-- ---------------------------------------------------------------------------
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "webTitle" TEXT;
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "webTagline" TEXT;

-- ---------------------------------------------------------------------------
-- QuoteEnrichment: título, bajada, descripción corta, puntos fuertes.
-- ---------------------------------------------------------------------------
ALTER TABLE "QuoteEnrichment" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "QuoteEnrichment" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "QuoteEnrichment" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "QuoteEnrichment" ADD COLUMN IF NOT EXISTS "highlightsJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "QuoteEnrichment" ADD COLUMN IF NOT EXISTS "audience" TEXT;
ALTER TABLE "QuoteEnrichment" ADD COLUMN IF NOT EXISTS "itemsHash" TEXT;

-- ---------------------------------------------------------------------------
-- WebPublishRun: corridas de "Preparar y publicar".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "WebPublishRun" (
  "id"             TEXT NOT NULL,
  "quoteFamilyId"  TEXT NOT NULL,
  "quoteVersionId" TEXT NOT NULL,
  "status"         "ProcessingStatus" NOT NULL DEFAULT 'RUNNING',
  "stepsJson"      JSONB NOT NULL DEFAULT '[]',
  "error"          TEXT,
  "startedById"    TEXT,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"     TIMESTAMP(3),
  CONSTRAINT "WebPublishRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebPublishRun_quoteFamilyId_startedAt_idx" ON "WebPublishRun"("quoteFamilyId", "startedAt");
ALTER TABLE "WebPublishRun"
  ADD CONSTRAINT "WebPublishRun_quoteFamilyId_fkey"
  FOREIGN KEY ("quoteFamilyId") REFERENCES "QuoteFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;
