-- Las dos distribuidoras de demostración de NODO (Demo Norte y Demo Sur) quedan apagadas por defecto para todos los usuarios.
ALTER TABLE "User" ALTER COLUMN "nodoOffProviders" SET DEFAULT ARRAY['prv_3A2i1P1LB6ERTmAz','prv_jQVpXcxOxfNdphB5']::TEXT[];

UPDATE "User"
SET "nodoOffProviders" = ARRAY(
  SELECT DISTINCT unnest(COALESCE("nodoOffProviders", ARRAY[]::TEXT[]) || ARRAY['prv_3A2i1P1LB6ERTmAz','prv_jQVpXcxOxfNdphB5']::TEXT[])
);
