-- IVA por ítem y por producto, y memoria de IVA por categoría (aprende de NODO y de lo que se elige al presupuestar).
ALTER TABLE "QuoteItem" ADD COLUMN "ivaBps" INTEGER;
ALTER TABLE "Product" ADD COLUMN "ivaBps" INTEGER;

CREATE TABLE "IvaCategoryStat" (
    "categoryKey" TEXT NOT NULL,
    "ivaBps" INTEGER NOT NULL,
    "samples" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IvaCategoryStat_pkey" PRIMARY KEY ("categoryKey","ivaBps")
);

CREATE INDEX "IvaCategoryStat_categoryKey_idx" ON "IvaCategoryStat"("categoryKey");
