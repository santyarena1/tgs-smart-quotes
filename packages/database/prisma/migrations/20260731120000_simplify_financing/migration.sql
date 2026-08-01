ALTER TABLE "CompanySettings"
ADD COLUMN "listInterestBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancingPlan"
ADD COLUMN "interestBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "description" TEXT,
ALTER COLUMN "bank" DROP NOT NULL;

UPDATE "FinancingPlan"
SET
  "interestBps" = GREATEST(0, "coefficientBps" - 10000),
  "description" = NULLIF(BTRIM("note"), '');

ALTER TABLE "FinancingPlan"
DROP COLUMN "label",
DROP COLUMN "coefficientBps",
DROP COLUMN "interestFree",
DROP COLUMN "appliesOn",
DROP COLUMN "note",
DROP COLUMN "commercialText";
