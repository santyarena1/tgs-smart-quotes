-- Reinicia el chat +54 9 11 6357-6304 para empezar de cero.
-- El teléfono canónico (sin el 9 móvil) es 541163576304.
-- También se cubre el wa_id de Meta, 5491163576304.
-- Quedan el contacto, las notas, las solicitudes y los presupuestos.

CREATE TEMP TABLE "_reset_chat_target" AS
SELECT "chatKey"
  FROM "ChatbotConversation"
 WHERE regexp_replace("chatKey", '[^0-9]', '', 'g') IN ('541163576304', '5491163576304')
    OR regexp_replace(COALESCE("waId", ''), '[^0-9]', '', 'g') IN ('541163576304', '5491163576304');

UPDATE "WhatsappOutboundQueue"
   SET status = 'CANCELLED',
       "lastError" = 'Se reinició el chat.',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "conversationKey" IN (SELECT "chatKey" FROM "_reset_chat_target")
   AND status IN ('PENDING', 'SENDING');

DELETE FROM "WhatsappOutboundQueue"
 WHERE "conversationKey" IN (SELECT "chatKey" FROM "_reset_chat_target");

DELETE FROM "ChatbotMessageLog"
 WHERE "conversationKey" IN (SELECT "chatKey" FROM "_reset_chat_target");

DELETE FROM "Notification"
 WHERE type IN ('CHATBOT_ESCALATION', 'CHATBOT_SUGGESTION', 'CHATBOT_REQUEST_CREATED')
   AND (
     "chatPhone" IN (SELECT "chatKey" FROM "_reset_chat_target")
     OR "entityId" IN (SELECT "chatKey" FROM "_reset_chat_target")
   );

UPDATE "ChatbotConversation"
   SET summary = NULL,
       "summaryMessageCount" = 0,
       "escalatedAt" = NULL,
       "escalationReason" = NULL,
       "activeRequestId" = NULL,
       "lastQuoteFamilyId" = NULL,
       "lastQuoteVersion" = NULL,
       "lastInboundFingerprint" = NULL,
       "lastInboundText" = NULL,
       "lastInboundAt" = NULL,
       "lastOutboundText" = NULL,
       "lastOutboundAt" = NULL,
       "replyDueAt" = NULL,
       "botPausedAt" = NULL,
       "botPausedById" = NULL,
       "botPausedReason" = NULL,
       "unreadCount" = 0,
       "resolvedAt" = NULL,
       "snoozedUntil" = NULL,
       stage = 'NEW',
       "stageChangedAt" = NULL,
       "leadValueCents" = NULL,
       "lostReason" = NULL,
       origin = NULL,
       profile = NULL,
       temperature = NULL,
       "lastIntent" = NULL,
       "nextStep" = NULL,
       "lastMessageAt" = CURRENT_TIMESTAMP,
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "chatKey" IN (SELECT "chatKey" FROM "_reset_chat_target");

DROP TABLE "_reset_chat_target";
