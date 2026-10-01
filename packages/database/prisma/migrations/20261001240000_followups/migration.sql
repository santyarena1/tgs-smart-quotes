-- Seguimiento automático de presupuestos sin respuesta (apagado hasta que se configure).
ALTER TABLE "ChatbotSettings"
  ADD COLUMN "followups" JSONB NOT NULL DEFAULT '{"enabled":false,"onlyBotChats":false,"steps":[]}';

UPDATE "ChatbotSettings" SET "followups" = '{
  "enabled": false,
  "onlyBotChats": false,
  "steps": [
    {"afterHours": 2, "text": "Hola! Pudiste ver el presupuesto? Cualquier duda o si querés ajustar algo, decime!", "templateId": null, "variables": []},
    {"afterHours": 23, "text": "Te escribo para ver si te quedó alguna duda con la PC. Si querés te paso otra opción!", "templateId": null, "variables": []},
    {"afterHours": 48, "text": null, "templateId": null, "variables": []}
  ]
}'::jsonb WHERE id = 'singleton';
