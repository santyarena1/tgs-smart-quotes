-- Distribuidores de NODO activados o desactivados para buscar en los presupuestos (sin fila = activo).
CREATE TABLE "NodoProviderSetting" (
    "providerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodoProviderSetting_pkey" PRIMARY KEY ("providerId")
);
