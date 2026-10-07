-- El bot y el CRM pasan de gpt-4o-mini (básico) a GPT-5.2.
-- Si ya eligieron otro modelo, no se toca.
ALTER TABLE "AiSettings" ALTER COLUMN "model" SET DEFAULT 'gpt-5.2';

UPDATE "AiSettings"
   SET "model" = 'gpt-5.2'
 WHERE "model" IN ('gpt-4o-mini', 'gpt-4o-mini-2024-07-18');

-- Un override del bot al mini heredaría el nuevo modelo global.
UPDATE "ChatbotSettings"
   SET "model" = NULL
 WHERE "model" IN ('gpt-4o-mini', 'gpt-4o-mini-2024-07-18');
