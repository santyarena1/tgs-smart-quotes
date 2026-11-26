-- Clave de la API de solo lectura para AcuStock. Solo se guarda el hash; la clave se ve una vez al generarla.
CREATE TABLE "AcustockApiSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "tokenHash" TEXT,
    "tokenHint" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcustockApiSettings_pkey" PRIMARY KEY ("id")
);
