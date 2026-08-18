CREATE TYPE "TaxCondition" AS ENUM ('CONSUMIDOR_FINAL', 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO');

ALTER TABLE "Customer"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "taxCondition" "TaxCondition";

ALTER TABLE "QuoteFamily"
  ADD COLUMN "branchId" TEXT;

ALTER TABLE "QuotePdf"
  ADD COLUMN "branchId" TEXT;

CREATE INDEX "QuoteFamily_branchId_idx" ON "QuoteFamily"("branchId");

ALTER TABLE "QuoteFamily"
  ADD CONSTRAINT "QuoteFamily_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuotePdf"
  ADD CONSTRAINT "QuotePdf_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
