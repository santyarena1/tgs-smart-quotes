-- Entrenamiento del bot: números entrenadores, indicaciones aprobadas y propuestas.
ALTER TABLE "ChatbotSettings"
  ADD COLUMN "trainerNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "guidance" JSONB NOT NULL DEFAULT '[]';

-- El número del local (+54 9 11 4870-4101) entrena al bot, como pidió el dueño.
UPDATE "ChatbotSettings" SET "trainerNumbers" = ARRAY['tel:541148704101'] WHERE id = 'singleton';

CREATE TABLE "BotLearning" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "conversationKey" TEXT,
  "logId" TEXT,
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  "decidedAt" TIMESTAMP(3),
  "decidedById" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotLearning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BotLearning_status_createdAt_idx" ON "BotLearning"("status", "createdAt");
CREATE INDEX "BotLearning_source_status_idx" ON "BotLearning"("source", "status");
