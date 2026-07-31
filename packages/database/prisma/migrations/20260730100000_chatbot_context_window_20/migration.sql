ALTER TABLE "ChatbotSettings"
ALTER COLUMN "maxRecentSnippets" SET DEFAULT 20;

-- Migra solamente el default histórico; los valores personalizados se conservan.
UPDATE "ChatbotSettings"
SET "maxRecentSnippets" = 20
WHERE "maxRecentSnippets" = 12;
