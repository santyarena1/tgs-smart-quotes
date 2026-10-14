-- Los presupuestos anteriores al snapshot de local (sin branchId) eran de LISANDRO: quedan ahí
-- para que se vean igual en la versión común y en LITE al filtrar por local.
UPDATE "QuoteFamily" SET "branchId" = (
  SELECT "id" FROM "Branch" WHERE "name" ILIKE '%lisandro%' OR "name" ILIKE '%torre%' ORDER BY "createdAt" LIMIT 1
) WHERE "branchId" IS NULL
  AND EXISTS (SELECT 1 FROM "Branch" WHERE "name" ILIKE '%lisandro%' OR "name" ILIKE '%torre%');
