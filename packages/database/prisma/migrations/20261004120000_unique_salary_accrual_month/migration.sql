-- Cancela SALARY_ACCRUAL duplicados del mismo empleado/mes (hora Argentina).
-- GET /employees y GET /employees/summary corrían applyDue en paralelo y creaban
-- dos sueldos: el neto salía ×2. El lock de applyDue evita que vuelva a pasar.
--
-- Sin índice único: to_char / AT TIME ZONE no son IMMUTABLE y Postgres rechaza
-- el CREATE INDEX (42P17) → migrate failed → la API no arranca.

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
