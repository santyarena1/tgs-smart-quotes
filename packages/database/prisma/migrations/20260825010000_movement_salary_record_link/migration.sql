ALTER TABLE "Movement"
  ADD COLUMN "salaryRecordId" TEXT;

ALTER TABLE "Movement"
  ADD CONSTRAINT "Movement_salaryRecordId_fkey"
  FOREIGN KEY ("salaryRecordId") REFERENCES "SalaryRecord"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
