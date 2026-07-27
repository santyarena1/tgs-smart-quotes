-- AlterTable
ALTER TABLE "Product" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Product_lastUsedAt_idx" ON "Product"("lastUsedAt");

-- Backfill from existing quote items
UPDATE "Product" AS p
SET "lastUsedAt" = sub.max_at
FROM (
  SELECT
    qi."productId" AS product_id,
    MAX(COALESCE(qv."lastActivityAt", qv."createdAt", qf."lastActivityAt", qf."updatedAt")) AS max_at
  FROM "QuoteItem" AS qi
  INNER JOIN "QuoteVersion" AS qv ON qv."id" = qi."versionId"
  INNER JOIN "QuoteFamily" AS qf ON qf."id" = qv."familyId"
  WHERE qi."productId" IS NOT NULL
  GROUP BY qi."productId"
) AS sub
WHERE p."id" = sub.product_id;
