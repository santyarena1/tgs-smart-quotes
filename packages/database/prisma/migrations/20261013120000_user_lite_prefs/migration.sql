-- Preferencias de la interfaz LITE por usuario (ej. ocultar la columna de financiación).
ALTER TABLE "User" ADD COLUMN "litePrefsJson" JSONB;
