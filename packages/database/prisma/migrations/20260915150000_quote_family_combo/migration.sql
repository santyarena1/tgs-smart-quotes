-- Combos: familias de presupuesto que se publican como un producto único con
-- descuento inverso (el precio del presupuesto es el final; el tachado sale de
-- precio / (1 - descuento)) y visibilidad configurable en la tienda.
DO $$ BEGIN
  CREATE TYPE "QuoteFamilyKind" AS ENUM ('PC', 'COMBO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "kind" "QuoteFamilyKind" NOT NULL DEFAULT 'PC';
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "comboDiscountBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuoteFamily" ADD COLUMN IF NOT EXISTS "storeVisible" BOOLEAN NOT NULL DEFAULT true;
