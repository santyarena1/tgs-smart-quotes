-- Reglas del bot editables desde Configuración (null = las de fábrica).
ALTER TABLE "ChatbotSettings" ADD COLUMN "salesRules" JSONB;
ALTER TABLE "ChatbotSettings" ADD COLUMN "stagePlaybook" JSONB;
ALTER TABLE "ChatbotSettings" ADD COLUMN "writingFilters" JSONB;
