-- La colección de publicidad de octubre de NAON queda en NAON.
UPDATE "Collection" SET "branchId" = (
  SELECT "id" FROM "Branch" WHERE "name" ILIKE '%naon%' ORDER BY "createdAt" LIMIT 1
) WHERE "name" ILIKE '%PUBLICIDAD OCTUBRE TGS NAON%'
  AND EXISTS (SELECT 1 FROM "Branch" WHERE "name" ILIKE '%naon%');
