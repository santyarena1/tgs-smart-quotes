-- Fichas por anuncio (Facebook/Instagram): el bot usa presupuesto e info de ese aviso.
ALTER TABLE "ChatbotSettings"
  ADD COLUMN "ads" JSONB NOT NULL DEFAULT '[]';
