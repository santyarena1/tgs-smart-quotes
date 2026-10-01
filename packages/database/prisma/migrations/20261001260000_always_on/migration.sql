-- Chats que el bot atiende a cualquier hora, aunque el local esté cerrado.
ALTER TABLE "ChatbotConversation" ADD COLUMN "alwaysOn" BOOLEAN NOT NULL DEFAULT false;

-- Pedido del dueño: este número de prueba se atiende siempre.
UPDATE "ChatbotConversation" SET "alwaysOn" = true WHERE "chatKey" = 'tel:541140859342';
