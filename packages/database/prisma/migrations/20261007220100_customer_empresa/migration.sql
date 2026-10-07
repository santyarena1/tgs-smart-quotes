-- Clientes empresa: razón social (name), CUIT, condición frente al IVA (taxCondition ya existía), email y contacto.
CREATE TYPE "CustomerKind" AS ENUM ('PERSONA', 'EMPRESA');

ALTER TABLE "Customer"
  ADD COLUMN "kind" "CustomerKind" NOT NULL DEFAULT 'PERSONA',
  ADD COLUMN "cuit" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "contactName" TEXT;

CREATE INDEX "Customer_cuit_idx" ON "Customer"("cuit");
