-- Bandeja del CRM: resolver, posponer, etiquetas, notas internas, respuestas rápidas y tema por usuario.
ALTER TABLE "ChatbotConversation"
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "ChatbotConversation_resolvedAt_idx" ON "ChatbotConversation"("resolvedAt");
CREATE INDEX "ChatbotConversation_snoozedUntil_idx" ON "ChatbotConversation"("snoozedUntil");

CREATE TABLE "CrmNote" (
  "id" TEXT NOT NULL,
  "conversationKey" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrmNote_conversationKey_createdAt_idx" ON "CrmNote"("conversationKey", "createdAt");
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_conversationKey_fkey"
  FOREIGN KEY ("conversationKey") REFERENCES "ChatbotConversation"("chatKey") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CrmQuickReply" (
  "id" TEXT NOT NULL,
  "shortcut" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmQuickReply_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrmQuickReply_shortcut_key" ON "CrmQuickReply"("shortcut");

ALTER TABLE "User" ADD COLUMN "themePreference" TEXT;
