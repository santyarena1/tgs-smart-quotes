CREATE TYPE "MovementKind" AS ENUM ('SALARY_ACCRUAL', 'SALARY_PAYMENT', 'ADVANCE', 'MERCHANDISE', 'CARD_CONSUMPTION', 'DEBT', 'REPAYMENT', 'REIMBURSEMENT', 'INSTALLMENT', 'ADJUSTMENT');
CREATE TYPE "MovementDirection" AS ENUM ('EMPLOYEE_OWES', 'COMPANY_OWES');
CREATE TYPE "MovementStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'MERCADO_PAGO', 'TARJETA', 'OTRO');
CREATE TYPE "ObligationKind" AS ENUM ('MERCHANDISE', 'CARD_CONSUMPTION', 'ADVANCE', 'OTHER');
CREATE TYPE "ObligationStatus" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED');
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED');
CREATE TYPE "AllocationTarget" AS ENUM ('OBLIGATION', 'INSTALLMENT', 'PERIOD', 'GENERAL');
CREATE TYPE "RequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'CONFIRMED');

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL, "fullName" TEXT NOT NULL, "docId" TEXT, "branchId" TEXT, "userId" TEXT, "position" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SalaryRecord" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "amountCents" BIGINT NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL, "previousAmountCents" BIGINT, "changeBps" INTEGER, "reason" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SalaryRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Movement" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "kind" "MovementKind" NOT NULL, "direction" "MovementDirection" NOT NULL, "amountCents" BIGINT NOT NULL, "status" "MovementStatus" NOT NULL DEFAULT 'PENDING', "occurredAt" TIMESTAMP(3) NOT NULL, "description" TEXT, "obligationId" TEXT, "installmentId" TEXT, "paymentId" TEXT, "requestId" TEXT, "createdById" TEXT NOT NULL, "appliedById" TEXT, "appliedAt" TIMESTAMP(3), "cancelledById" TEXT, "cancelledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Obligation" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "kind" "ObligationKind" NOT NULL, "originalAmountCents" BIGINT NOT NULL, "description" TEXT, "productId" TEXT, "status" "ObligationStatus" NOT NULL DEFAULT 'OPEN', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InstallmentPlan" (
  "id" TEXT NOT NULL, "obligationId" TEXT NOT NULL, "count" INTEGER NOT NULL, "firstPeriod" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Installment" (
  "id" TEXT NOT NULL, "obligationId" TEXT NOT NULL, "number" INTEGER NOT NULL, "amountCents" BIGINT NOT NULL, "period" TEXT NOT NULL, "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING', "paidCents" BIGINT NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "amountCents" BIGINT NOT NULL, "method" "PaymentMethod" NOT NULL, "paidAt" TIMESTAMP(3) NOT NULL, "reference" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PaymentAllocation" (
  "id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "targetType" "AllocationTarget" NOT NULL, "targetId" TEXT, "amountCents" BIGINT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmployeeRequest" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "kind" "MovementKind" NOT NULL, "amountCents" BIGINT NOT NULL, "description" TEXT, "status" "RequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL', "createdByUserId" TEXT NOT NULL, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "resultingMovementId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EmployeeRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmployeePeriod" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "period" TEXT NOT NULL, "baseSalaryCents" BIGINT NOT NULL, "linesJson" JSONB NOT NULL DEFAULT '[]', "netCents" BIGINT NOT NULL, "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT', "confirmedById" TEXT, "confirmedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EmployeePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX "Employee_branchId_idx" ON "Employee"("branchId");
CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");
CREATE INDEX "SalaryRecord_employeeId_effectiveFrom_idx" ON "SalaryRecord"("employeeId", "effectiveFrom");
CREATE INDEX "Movement_employeeId_status_idx" ON "Movement"("employeeId", "status");
CREATE INDEX "Movement_employeeId_occurredAt_idx" ON "Movement"("employeeId", "occurredAt");
CREATE INDEX "Obligation_employeeId_idx" ON "Obligation"("employeeId");
CREATE UNIQUE INDEX "InstallmentPlan_obligationId_key" ON "InstallmentPlan"("obligationId");
CREATE INDEX "Installment_obligationId_idx" ON "Installment"("obligationId");
CREATE UNIQUE INDEX "Installment_obligationId_number_key" ON "Installment"("obligationId", "number");
CREATE INDEX "Payment_employeeId_idx" ON "Payment"("employeeId");
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");
CREATE INDEX "EmployeeRequest_employeeId_status_idx" ON "EmployeeRequest"("employeeId", "status");
CREATE UNIQUE INDEX "EmployeePeriod_employeeId_period_key" ON "EmployeePeriod"("employeeId", "period");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EmployeeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_resultingMovementId_fkey" FOREIGN KEY ("resultingMovementId") REFERENCES "Movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeePeriod" ADD CONSTRAINT "EmployeePeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeePeriod" ADD CONSTRAINT "EmployeePeriod_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
