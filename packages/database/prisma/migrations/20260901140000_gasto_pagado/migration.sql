-- Cargar el importe del mes y confirmar que ya se pagó son dos acciones
-- distintas: un gasto puede estar cargado (sé cuánto es) y todavía no estar
-- pago. Antes tener importe se interpretaba directamente como "pagado".
ALTER TABLE "RecurringExpensePayment" ADD COLUMN IF NOT EXISTS "paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecurringExpensePayment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Lo ya cargado hasta ahora se daba por pagado, así que se migra con ese
-- criterio para no cambiarle el estado a lo que ya existía.
UPDATE "RecurringExpensePayment" SET "paid" = true, "paidAt" = "updatedAt" WHERE "paid" = false;
