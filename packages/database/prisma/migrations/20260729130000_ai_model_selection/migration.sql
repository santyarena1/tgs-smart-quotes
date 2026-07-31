ALTER TABLE "AiSettings" ALTER COLUMN "model" SET DEFAULT 'gpt-4o-mini';

-- Corrige únicamente el valor inicial obsoleto; selecciones explícitas diferentes se preservan.
UPDATE "AiSettings" SET "model" = 'gpt-4o-mini' WHERE "model" = 'gpt-5.2';

ALTER TABLE "ChatbotSettings" ADD COLUMN "model" TEXT;
