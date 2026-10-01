-- Audios transcriptos e imágenes descriptas para que el bot las entienda.
ALTER TABLE "ChatbotSettings"
  ADD COLUMN "transcribeAudio" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "describeImages" BOOLEAN NOT NULL DEFAULT true;
