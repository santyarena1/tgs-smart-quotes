ALTER TABLE "ChatbotSettings"
ADD COLUMN "quoteSendPrompt" TEXT NOT NULL DEFAULT 'Redactá un mensaje breve y cálido presentando el presupuesto adjunto, respondiendo puntualmente a lo que el cliente pidió según los últimos mensajes. No inventes datos.';
