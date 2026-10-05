-- Los avisos de solicitudes nuevas van a los mismos números que entrenan al bot.
UPDATE "ChatbotSettings"
   SET "teamAlerts" = jsonb_set(
         COALESCE("teamAlerts", '{"enabled": true, "templateId": null, "autoSendQuote": true}'::jsonb),
         '{numbers}',
         to_jsonb("trainerNumbers"))
 WHERE id = 'singleton';
