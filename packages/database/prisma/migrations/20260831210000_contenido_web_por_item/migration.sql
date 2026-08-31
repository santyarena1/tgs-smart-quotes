-- Los componentes escritos a mano (los que no están en el catálogo) no tenían
-- dónde guardar foto ni descripción, porque esos datos viven en el producto.
-- Ahora cada ítem del presupuesto puede tener su propio contenido web: aplica
-- solo a ese presupuesto y no se reutiliza en otras PCs.
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "webDescription" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "webImageUrl" TEXT;

-- Para poder elegir como foto del hero una de esas imágenes, que al no ser
-- ProductAsset no tienen id al que apuntar.
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT;
