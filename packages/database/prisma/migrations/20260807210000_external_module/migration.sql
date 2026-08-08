-- CreateTable
CREATE TABLE "ExternalModuleSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalModuleSettings_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row
INSERT INTO "ExternalModuleSettings" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING;
