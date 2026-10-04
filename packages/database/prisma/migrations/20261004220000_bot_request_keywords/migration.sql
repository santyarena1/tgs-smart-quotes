-- Frases con las que el cliente pide el presupuesto: se crea la solicitud en ese turno.
ALTER TABLE "ChatbotSettings"
  ADD COLUMN "requestKeywords" JSONB NOT NULL DEFAULT '["mandame el presupuesto","pasame el presupuesto","armame el presupuesto","mandame la cotizacion","quiero el presupuesto","sumalo al presupuesto","sumamelo al presupuesto","presupuesto completo","mandame el pdf","pasame el pdf","cotizame"]';
