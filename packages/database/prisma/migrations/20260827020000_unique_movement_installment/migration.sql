-- Una cuota no puede generar más de un movimiento. Antes, al eliminar, el GET
-- volvía a crear la misma cuota (a veces varias veces en paralelo).
-- PostgreSQL permite varios NULL en un UNIQUE, así que los movimientos sueltos no se tocan.

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "installmentId"
      ORDER BY
        CASE WHEN status = 'APPLIED' THEN 0 ELSE 1 END,
        "createdAt" ASC,
        id ASC
    ) AS rn
  FROM "Movement"
  WHERE "installmentId" IS NOT NULL
)
UPDATE "Movement" AS m
SET
  status = 'CANCELLED',
  "cancelledAt" = COALESCE(m."cancelledAt", NOW())
FROM ranked
WHERE m.id = ranked.id
  AND ranked.rn > 1
  AND m.status <> 'CANCELLED';

CREATE UNIQUE INDEX "Movement_installmentId_key" ON "Movement"("installmentId");
