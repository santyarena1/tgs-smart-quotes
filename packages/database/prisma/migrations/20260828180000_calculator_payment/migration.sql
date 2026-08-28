CREATE TYPE "CalculatorGroupKind" AS ENUM ('CASH', 'LIST', 'PLAN');

CREATE TABLE "CalculatorGroup" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "iconUrl" TEXT,
  "kind" "CalculatorGroupKind" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalculatorGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalculatorGroup_key_key" ON "CalculatorGroup"("key");

CREATE TABLE "CalculatorPlan" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "installments" INTEGER NOT NULL,
  "interestBps" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalculatorPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalculatorPlan_groupId_sortOrder_idx" ON "CalculatorPlan"("groupId", "sortOrder");

ALTER TABLE "CalculatorPlan" ADD CONSTRAINT "CalculatorPlan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CalculatorGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
