-- Un solo SALARY_ACCRUAL no cancelado por empleado por mes (hora Argentina).
-- GET /employees y GET /employees/summary corrían applyDue en paralelo: los dos
-- veían "no hay sueldo de este mes" y creaban otro, así el neto a pagar salía ×2.

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "employeeId",
        to_char("occurredAt" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYYMM')
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Movement"
  WHERE kind = 'SALARY_ACCRUAL'
    AND status <> 'CANCELLED'
)
UPDATE "Movement" AS m
SET
  status = 'CANCELLED',
  "cancelledAt" = COALESCE(m."cancelledAt", NOW()),
  "updatedAt" = NOW()
FROM ranked
WHERE m.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Movement_salary_accrual_employee_month_uidx"
ON "Movement" (
  "employeeId",
  (to_char("occurredAt" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYYMM'))
)
WHERE kind = 'SALARY_ACCRUAL' AND status <> 'CANCELLED';
