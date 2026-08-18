-- Backfill: los presupuestos creados antes de que existiera "branchId" en QuoteFamily
-- quedan con el local del usuario que los creó (según su local asignado en Configuración
-- ahora mismo). Solo toca familias sin branchId todavía; no pisa el snapshot ya guardado
-- para las familias creadas después del cambio.
WITH first_version AS (
  SELECT DISTINCT ON ("familyId") "familyId", "creatorId"
  FROM "QuoteVersion"
  ORDER BY "familyId", version ASC
)
UPDATE "QuoteFamily" f
SET "branchId" = u."branchId"
FROM first_version fv
JOIN "User" u ON u.id = fv."creatorId"
WHERE fv."familyId" = f.id
  AND f."branchId" IS NULL
  AND u."branchId" IS NOT NULL;
