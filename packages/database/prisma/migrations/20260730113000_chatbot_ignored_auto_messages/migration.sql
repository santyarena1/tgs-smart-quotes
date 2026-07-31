ALTER TABLE "ChatbotSettings"
ADD COLUMN "ignoredAutoMessages" JSONB NOT NULL
DEFAULT '["¡Hola! ¿Cómo podemos ayudarte"]'::jsonb;
