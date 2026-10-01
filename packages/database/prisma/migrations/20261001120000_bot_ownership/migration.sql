-- Dueño del chat (bot o vendedor), espera para juntar mensajes y orden por último mensaje.
ALTER TABLE "ChatbotConversation"
  ADD COLUMN "botPausedAt" TIMESTAMP(3),
  ADD COLUMN "botPausedById" TEXT,
  ADD COLUMN "botPausedReason" TEXT,
  ADD COLUMN "replyDueAt" TIMESTAMP(3),
  ADD COLUMN "lastMessageAt" TIMESTAMP(3);

UPDATE "ChatbotConversation"
   SET "lastMessageAt" = GREATEST(
         COALESCE("lastInboundAt", "createdAt"),
         COALESCE("lastOutboundAt", "createdAt"));

CREATE INDEX "ChatbotConversation_replyDueAt_idx" ON "ChatbotConversation"("replyDueAt");
CREATE INDEX "ChatbotConversation_lastMessageAt_idx" ON "ChatbotConversation"("lastMessageAt");

ALTER TABLE "ChatbotSettings"
  ADD COLUMN "replyDebounceSeconds" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "autoResumeHours" INTEGER NOT NULL DEFAULT 0;
