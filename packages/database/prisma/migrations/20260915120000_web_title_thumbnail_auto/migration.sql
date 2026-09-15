-- El título y la miniatura propuestos por el sistema se vuelven a generar
-- cuando cambian los componentes; los cargados a mano se respetan. Para
-- distinguirlos se marca quién los puso.
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "webTitleAuto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "thumbnailAuto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "thumbnailInputsHash" TEXT;

-- Datos existentes: el título es automático si coincide con el que guardó el
-- enriquecimiento de alguna versión (es lo que propone el pipeline).
UPDATE "QuoteFamily" f
SET "webTitleAuto" = true
WHERE f."webTitle" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "QuoteVersion" v
    JOIN "QuoteEnrichment" e ON e."quoteVersionId" = v."id"
    WHERE v."familyId" = f."id" AND e."title" = f."webTitle"
  );

-- La miniatura es automática salvo que la actual se haya subido a mano
-- (esa subida queda auditada como UPDATE_THUMBNAIL). Sin hash de insumos, el
-- próximo "Preparar y publicar" la rehace una vez y de ahí en más se compara.
UPDATE "QuoteFamily" f
SET "thumbnailAuto" = true
WHERE f."thumbnailUrl" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AuditLog" a
    WHERE a."entityType" = 'QuoteFamily' AND a."entityId" = f."id" AND a."action" = 'UPDATE_THUMBNAIL'
      AND a."next"->>'thumbnailUrl' = f."thumbnailUrl"
  );
