-- Presupuesto Web: vencimiento a los 2 días, revisión de precios y stock contra la tienda, y preferencias del checklist.
ALTER TABLE "QuoteVersion" ADD COLUMN "webMeta" JSONB;
ALTER TABLE "QuoteVersion" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "QuoteVersion" ADD COLUMN "checkedAt" TIMESTAMP(3);
ALTER TABLE "QuoteVersion" ADD COLUMN "alertsJson" JSONB;
CREATE INDEX "QuoteVersion_expiresAt_idx" ON "QuoteVersion"("expiresAt");
ALTER TABLE "User" ADD COLUMN "webQuotePrefsJson" JSONB;
-- El margen general por defecto pasa de 30 % a 20 %. Un valor distinto, elegido a mano, se deja como está.
UPDATE "AiSettings" SET "generalMarkupBps" = 2000 WHERE "generalMarkupBps" = 3000;
