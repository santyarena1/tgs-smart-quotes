-- Ejemplos de cómo habla el bot, para que no suene formal (null = los de fábrica).
ALTER TABLE "ChatbotSettings" ADD COLUMN "styleExamples" JSONB;
-- Las palabras prohibidas vuelven a las de fábrica, que ahora suman las muletillas formales.
UPDATE "ChatbotSettings" SET "bannedWords" = NULL WHERE id = 'singleton';
