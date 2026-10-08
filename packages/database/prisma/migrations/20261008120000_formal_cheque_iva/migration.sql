-- Presupuesto Formal: recargo del cheque a 30 días (8 %) e IVA (21 %), configurables.
ALTER TABLE "CompanySettings" ADD COLUMN "chequeInterestBps" INTEGER NOT NULL DEFAULT 800;
ALTER TABLE "CompanySettings" ADD COLUMN "ivaBps" INTEGER NOT NULL DEFAULT 2100;
