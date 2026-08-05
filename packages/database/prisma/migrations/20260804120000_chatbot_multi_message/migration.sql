ALTER TABLE "ChatbotSettings"
ADD COLUMN "multiMessage" JSONB NOT NULL DEFAULT '{"enabled":true,"splitMode":"AI_NATURAL","maxBubbles":3,"openingMessage":"","closingMessage":"","quoteFollowup":{"enabled":true,"message":"Decime si querés cambiar algo o sumar/sacar componentes 👍"},"draftMode":"QUEUE","betweenDelayMinSeconds":2,"betweenDelayMaxSeconds":6}';
