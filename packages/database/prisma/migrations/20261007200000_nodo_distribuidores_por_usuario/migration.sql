-- Cada usuario elige en qué distribuidores de NODO busca: guarda los que apagó (sin ninguno = todos).
ALTER TABLE "User" ADD COLUMN "nodoOffProviders" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- La elección global de la versión anterior se reemplaza por la de cada usuario.
DROP TABLE IF EXISTS "NodoProviderSetting";
