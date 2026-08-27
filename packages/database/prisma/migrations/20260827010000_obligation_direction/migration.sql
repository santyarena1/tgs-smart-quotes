-- Quién debe en una obligación: el empleado a TGS (default, comportamiento actual)
-- o TGS al empleado. Las filas existentes quedan como EMPLOYEE_OWES.
ALTER TABLE "Obligation"
  ADD COLUMN "direction" "MovementDirection" NOT NULL DEFAULT 'EMPLOYEE_OWES';
