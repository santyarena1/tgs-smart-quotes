-- Presupuesto Web: vencimiento a los 2 días, revisión de precios y stock contra la tienda, y preferencias del checklist.
ALTER TABLE "QuoteVersion" ADD COLUMN "webMeta" JSONB;
ALTER TABLE "QuoteVersion" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "QuoteVersion" ADD COLUMN "checkedAt" TIMESTAMP(3);
ALTER TABLE "QuoteVersion" ADD COLUMN "alertsJson" JSONB;
CREATE INDEX "QuoteVersion_expiresAt_idx" ON "QuoteVersion"("expiresAt");
ALTER TABLE "User" ADD COLUMN "webQuotePrefsJson" JSONB;
-- Los presupuestos valen 2 días.
UPDATE "PdfSettings" SET "validityDays" = 2;
