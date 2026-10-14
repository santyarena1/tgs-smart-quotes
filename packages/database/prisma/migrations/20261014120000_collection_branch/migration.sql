-- Las colecciones pasan a ser por local. Las existentes quedan en LISANDRO (Av. Lisandro de la Torre).
ALTER TABLE "Collection" ADD COLUMN "branchId" TEXT;
DROP INDEX IF EXISTS "Collection_name_key";
UPDATE "Collection" SET "branchId" = (
  SELECT "id" FROM "Branch" WHERE "name" ILIKE '%lisandro%' OR "name" ILIKE '%torre%' ORDER BY "createdAt" LIMIT 1
);
CREATE UNIQUE INDEX "Collection_branchId_name_key" ON "Collection"("branchId", "name");
CREATE INDEX "Collection_branchId_idx" ON "Collection"("branchId");
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
