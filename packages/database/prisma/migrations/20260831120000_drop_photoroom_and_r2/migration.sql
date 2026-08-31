-- Photoroom y Cloudflare R2 dejan de usarse:
--   * El fondo de las imágenes se quita en el propio servidor (sharp), sin API.
--   * Los archivos se guardan en el disco persistente de Railway y los sirve la
--     propia API en /api/uploads/media/..., en vez de un bucket de R2.
-- Se borran las credenciales guardadas junto con las columnas, así no queda
-- ningún secreto sin uso en la base.
ALTER TABLE "ExternalModuleConfig" DROP COLUMN IF EXISTS "photoroomKeyEnc";
ALTER TABLE "ExternalModuleConfig" DROP COLUMN IF EXISTS "r2SecretAccessKeyEnc";
ALTER TABLE "ExternalModuleConfig" DROP COLUMN IF EXISTS "r2Endpoint";
ALTER TABLE "ExternalModuleConfig" DROP COLUMN IF EXISTS "r2Bucket";
ALTER TABLE "ExternalModuleConfig" DROP COLUMN IF EXISTS "r2AccessKeyId";
ALTER TABLE "ExternalModuleConfig" DROP COLUMN IF EXISTS "r2PublicBaseUrl";

-- Motivo del último fallo al quitar el fondo, para poder explicarlo en pantalla.
ALTER TABLE "ProductAsset" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
