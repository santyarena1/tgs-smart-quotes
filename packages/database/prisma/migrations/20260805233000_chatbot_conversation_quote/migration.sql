ALTER TABLE "ChatbotConversation"
ADD COLUMN "lastQuoteFamilyId" TEXT;

ALTER TABLE "ChatbotConversation"
ADD CONSTRAINT "ChatbotConversation_lastQuoteFamilyId_fkey"
FOREIGN KEY ("lastQuoteFamilyId") REFERENCES "QuoteFamily"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ChatbotConversation_lastQuoteFamilyId_idx"
ON "ChatbotConversation"("lastQuoteFamilyId");
