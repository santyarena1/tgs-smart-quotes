-- Embudo de ventas y ficha del cliente sobre cada chat, más tareas del equipo.
ALTER TABLE "ChatbotConversation"
  ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'NEW',
  ADD COLUMN "stageChangedAt" TIMESTAMP(3),
  ADD COLUMN "leadValueCents" BIGINT,
  ADD COLUMN "lostReason" TEXT,
  ADD COLUMN "origin" JSONB,
  ADD COLUMN "profile" JSONB;

CREATE INDEX "ChatbotConversation_stage_lastMessageAt_idx" ON "ChatbotConversation"("stage", "lastMessageAt");

-- Chats con presupuesto ya vinculado arrancan en "Presupuesto enviado".
UPDATE "ChatbotConversation" SET "stage" = 'QUOTE_SENT' WHERE "lastQuoteFamilyId" IS NOT NULL;

-- El origen de anuncio que ya estaba guardado en el primer mensaje se pasa a la ficha.
UPDATE "ChatbotConversation" c
   SET "origin" = sub.referral
  FROM (
    SELECT DISTINCT ON ("conversationKey") "conversationKey", "decisionMetadata"->'referral' AS referral
      FROM "ChatbotMessageLog"
     WHERE direction = 'INBOUND' AND "decisionMetadata" ? 'referral'
     ORDER BY "conversationKey", "createdAt" ASC
  ) sub
 WHERE c."chatKey" = sub."conversationKey";

CREATE TABLE "CrmTask" (
  "id" TEXT NOT NULL,
  "conversationKey" TEXT,
  "title" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "assignedToId" TEXT,
  "createdById" TEXT,
  "doneAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrmTask_assignedToId_doneAt_dueAt_idx" ON "CrmTask"("assignedToId", "doneAt", "dueAt");
CREATE INDEX "CrmTask_conversationKey_idx" ON "CrmTask"("conversationKey");
CREATE INDEX "CrmTask_doneAt_dueAt_notifiedAt_idx" ON "CrmTask"("doneAt", "dueAt", "notifiedAt");
