ALTER TABLE "CalculatorGroup" ADD COLUMN "iconUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "CalculatorGroup" SET "iconUrls" = ARRAY["iconUrl"] WHERE "iconUrl" IS NOT NULL AND "iconUrl" <> '';
