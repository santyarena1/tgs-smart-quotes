-- Gastos fijos que se repiten todos los meses (alquiler, internet, contador…).
-- El gasto es solo el concepto: no tiene monto propio ni se ajusta por nada.
-- Lo que efectivamente se pagó cada mes se carga aparte, un registro por gasto
-- y período.
CREATE TABLE IF NOT EXISTS "RecurringExpense" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "note"        TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecurringExpensePayment" (
  "id"          TEXT NOT NULL,
  "expenseId"   TEXT NOT NULL,
  "period"      TEXT NOT NULL,
  "amountCents" BIGINT NOT NULL DEFAULT 0,
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringExpensePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecurringExpense_active_position_idx"
  ON "RecurringExpense"("active", "position");
CREATE INDEX IF NOT EXISTS "RecurringExpensePayment_period_idx"
  ON "RecurringExpensePayment"("period");
-- Un solo registro de pago por gasto y mes.
CREATE UNIQUE INDEX IF NOT EXISTS "RecurringExpensePayment_expenseId_period_key"
  ON "RecurringExpensePayment"("expenseId", "period");

ALTER TABLE "RecurringExpense"
  ADD CONSTRAINT "RecurringExpense_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Al borrar un gasto se van también sus pagos: el historial de ese concepto
-- deja de existir junto con él (por eso la baja normal es archivar, no borrar).
ALTER TABLE "RecurringExpensePayment"
  ADD CONSTRAINT "RecurringExpensePayment_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "RecurringExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
