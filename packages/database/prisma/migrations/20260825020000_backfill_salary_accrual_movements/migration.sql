-- Backfill: los sueldos cargados antes de que "Cargar sueldo" generara un movimiento
-- SALARY_ACCRUAL (fix de hoy) nunca entraron a la cuenta corriente. Sin esto, "Sueldo
-- devengado" queda en $0 para esos empleados aunque el sueldo esté cargado. Solo toca
-- SalaryRecord que todavía no tienen su movimiento vinculado (idempotente: correrla de
-- nuevo no duplica nada, gracias al NOT EXISTS).
INSERT INTO "Movement" (
  "id", "employeeId", "kind", "direction", "amountCents", "status", "occurredAt",
  "description", "salaryRecordId", "createdById", "appliedById", "appliedAt",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), sr."employeeId", 'SALARY_ACCRUAL', 'COMPANY_OWES', sr."amountCents",
  'APPLIED', sr."effectiveFrom", 'Sueldo devengado (backfill)', sr."id",
  sr."createdById", sr."createdById", sr."createdAt", sr."createdAt", sr."createdAt"
FROM "SalaryRecord" sr
WHERE NOT EXISTS (
  SELECT 1 FROM "Movement" m WHERE m."salaryRecordId" = sr."id"
);
