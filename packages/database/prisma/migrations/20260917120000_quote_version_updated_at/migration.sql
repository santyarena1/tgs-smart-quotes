-- Última modificación del contenido de una versión: sirve para detectar
-- "cambios sin publicar" respecto de la copia que tiene la tienda.
ALTER TABLE "QuoteVersion" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
