-- Con qué método se recortó cada foto, para poder rehacer las viejas.
ALTER TABLE "ProductAsset" ADD COLUMN IF NOT EXISTS "cutMethod" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "webImageCut" TEXT;
