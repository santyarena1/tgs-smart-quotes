-- Solicitudes que eleva el bot: avisos al equipo y envío automático del presupuesto listo.
ALTER TABLE "ChatbotSettings" ADD COLUMN "teamAlerts" JSONB;
ALTER TABLE "QuoteRequest" ADD COLUMN "botDeliveredAt" TIMESTAMP(3);

-- Lo que ya existía no se manda solo: solo las solicitudes nuevas.
UPDATE "QuoteRequest" SET "botDeliveredAt" = now();

-- Si las reglas ya se editaron, se suman las nuevas (si no, rigen las de fábrica que ya las traen).
UPDATE "ChatbotSettings"
   SET "salesRules" = "salesRules" || jsonb_build_array('Agarrá al cliente en caliente: si en DATOS DEL SISTEMA no hay un producto o una PC publicada que encaje con lo que pide, no hagas más de una o dos preguntas (para qué la usa y cuánto quiere gastar). Con eso alcanza: decile que le armás opciones a medida y pedí el presupuesto al equipo (shouldCreateRequest=true). No lo derives a una persona por esto, no lo dejes sin respuesta y no sigas preguntando en loop.', 'Cuando le prometas un presupuesto a medida, el plazo depende de la COLA del equipo que figura en DATOS DEL SISTEMA: con 0 o 1 pendientes, "ya te lo mando"; con 2 a 4, "ahora te lo armo y te lo paso"; con 5 o más, "en un ratito te lo paso". Nunca des minutos ni horas exactas. Si ya tiene una solicitud en curso, no le pidas los datos de nuevo: decile que ya lo están armando.')
 WHERE "salesRules" IS NOT NULL;

-- Chats cuyo último mensaje fue nuestro (bot o vendedor) no cuentan como no leídos.
UPDATE "ChatbotConversation"
   SET "unreadCount" = 0
 WHERE "unreadCount" > 0
   AND "lastOutboundAt" IS NOT NULL
   AND ("lastInboundAt" IS NULL OR "lastOutboundAt" >= "lastInboundAt");
