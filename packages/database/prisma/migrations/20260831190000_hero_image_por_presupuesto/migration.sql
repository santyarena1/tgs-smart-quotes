-- Separa dos cosas que antes hacía una sola imagen:
--   * thumbnailUrl: la miniatura del listado de productos (se sube a mano).
--   * heroAssetId:  la foto grande de la ficha, elegida entre las imágenes de
--     los componentes desde la lista de componentes.
-- Si no hay hero marcado, la ficha sigue cayendo a la miniatura, así que las
-- PCs ya publicadas no cambian de aspecto hasta que se elija una.
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "heroAssetId" TEXT;

-- Al borrar la imagen, el presupuesto simplemente se queda sin hero elegido.
ALTER TABLE "QuoteFamily"
  ADD CONSTRAINT "QuoteFamily_heroAssetId_fkey"
  FOREIGN KEY ("heroAssetId") REFERENCES "ProductAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "QuoteFamily_heroAssetId_idx" ON "QuoteFamily"("heroAssetId");
