CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VENDEDOR');

ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'VENDEDOR',
  ADD COLUMN "branchId" TEXT;

-- Antes de existir roles, todos los usuarios provenían del bootstrap administrativo.
UPDATE "User" SET "role" = 'ADMIN';

CREATE TABLE "Branch" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "phones" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

ALTER TABLE "User"
  ADD CONSTRAINT "User_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
