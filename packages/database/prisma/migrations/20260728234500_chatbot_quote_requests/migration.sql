ALTER TABLE "ChatbotConversation" ADD COLUMN "activeRequestId" TEXT;

CREATE INDEX "ChatbotConversation_activeRequestId_idx"
ON "ChatbotConversation"("activeRequestId");

ALTER TABLE "ChatbotConversation"
ADD CONSTRAINT "ChatbotConversation_activeRequestId_fkey"
FOREIGN KEY ("activeRequestId") REFERENCES "QuoteRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
