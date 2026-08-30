-- Campos nuevos para publicación web:
-- Product.description: descripción reutilizable de componente entre presupuestos.
-- QuoteFamily.thumbnailUrl: miniatura del presupuesto para la ficha web.
-- QuoteFamily.autoRepublish: si está prendido, un cambio de precio en el
--   catálogo recalcula y re-publica sola la PC en WordPress.
ALTER TABLE "Product" ADD COLUMN "description" TEXT;

ALTER TABLE "QuoteFamily" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "QuoteFamily" ADD COLUMN "autoRepublish" BOOLEAN NOT NULL DEFAULT false;
