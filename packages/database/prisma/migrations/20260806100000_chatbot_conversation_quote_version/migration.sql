-- Agrega lastQuoteVersion por separado. La migración 20260805233000 fue modificada
-- después de aplicarse (rompía el checksum de `prisma migrate deploy`); se restauró a su
-- contenido original y esta migración nueva agrega la columna que faltaba.
ALTER TABLE "ChatbotConversation"
ADD COLUMN IF NOT EXISTS "lastQuoteVersion" INTEGER;
