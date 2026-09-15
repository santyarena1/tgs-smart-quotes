-- Combos asociados a cada PC (BLOCK-10): qué combos se ofrecen en el modal
-- post-carrito de una PC publicada, en orden.
CREATE TABLE IF NOT EXISTS "QuoteFamilyCombo" (
  "pcFamilyId" TEXT NOT NULL,
  "comboFamilyId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "QuoteFamilyCombo_pkey" PRIMARY KEY ("pcFamilyId", "comboFamilyId"),
  CONSTRAINT "QuoteFamilyCombo_pcFamilyId_fkey" FOREIGN KEY ("pcFamilyId") REFERENCES "QuoteFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuoteFamilyCombo_comboFamilyId_fkey" FOREIGN KEY ("comboFamilyId") REFERENCES "QuoteFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "QuoteFamilyCombo_comboFamilyId_idx" ON "QuoteFamilyCombo"("comboFamilyId");
