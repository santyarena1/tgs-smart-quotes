-- El canal en vivo del CRM consulta cada segundo qué mensajes cambiaron.
CREATE INDEX "ChatbotMessageLog_updatedAt_idx" ON "ChatbotMessageLog"("updatedAt");
CREATE INDEX IF NOT EXISTS "ChatbotConversation_updatedAt_idx" ON "ChatbotConversation"("updatedAt");
