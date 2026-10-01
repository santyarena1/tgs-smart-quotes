-- Temperatura, intención y próximo paso de cada venta.
ALTER TABLE "ChatbotConversation"
  ADD COLUMN "temperature" INTEGER,
  ADD COLUMN "lastIntent" TEXT,
  ADD COLUMN "nextStep" TEXT;
CREATE INDEX "ChatbotConversation_temperature_idx" ON "ChatbotConversation"("temperature");
