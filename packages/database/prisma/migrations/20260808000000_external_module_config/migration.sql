-- CreateTable
CREATE TABLE "ExternalModuleConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "photoroomKeyEnc" TEXT,
    "tripoKeyEnc" TEXT,
    "higgsfieldKeyEnc" TEXT,
    "higgsfieldSecretEnc" TEXT,
    "serperKeyEnc" TEXT,
    "r2SecretAccessKeyEnc" TEXT,
    "wpHmacSecretEnc" TEXT,
    "r2Endpoint" TEXT,
    "r2Bucket" TEXT,
    "r2AccessKeyId" TEXT,
    "r2PublicBaseUrl" TEXT,
    "wpBaseUrl" TEXT NOT NULL DEFAULT 'https://www.thegamershop.com.ar',
    "autoRepublish" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalModuleConfig_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row
INSERT INTO "ExternalModuleConfig" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING;
