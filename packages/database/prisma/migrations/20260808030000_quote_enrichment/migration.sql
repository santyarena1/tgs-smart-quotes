ALTER TYPE "AiTaskType" ADD VALUE 'QUOTE_ENRICHMENT';

CREATE TABLE "QuoteEnrichment" (
 "id" TEXT NOT NULL, "quoteVersionId" TEXT NOT NULL, "descriptionHtml" TEXT, "powerWatts" INTEGER, "recommendedPsuWatts" INTEGER, "powerNote" TEXT, "gamesJson" JSONB NOT NULL DEFAULT '[]', "programsJson" JSONB NOT NULL DEFAULT '[]', "compatibilityJson" JSONB NOT NULL DEFAULT '[]', "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "QuoteEnrichment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuoteEnrichment_quoteVersionId_key" ON "QuoteEnrichment"("quoteVersionId");
ALTER TABLE "QuoteEnrichment" ADD CONSTRAINT "QuoteEnrichment_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
