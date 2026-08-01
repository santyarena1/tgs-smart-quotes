ALTER TABLE "PdfSettings"
ADD COLUMN "rmaText" TEXT NOT NULL DEFAULT 'Importante: al aceptar este presupuesto, ya sea mediante compromiso verbal o monetario —seña, abono total, abono parcial o cualquier confirmación de compra/servicio—, el cliente declara conocer y aceptar las Políticas de Servicio Técnico y RMA: {rmaUrl}';
