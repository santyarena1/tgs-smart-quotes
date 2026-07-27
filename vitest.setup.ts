import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Carga `.env` sin dependencias externas para que los tests de integración
 * encuentren `TEST_DATABASE_URL` y `SETTINGS_ENC_KEY`.
 * Las variables ya presentes en el entorno tienen prioridad.
 */
const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Durante los tests, `DATABASE_URL` apunta siempre a la base de pruebas.
 * Así ningún test de integración puede escribir sobre datos de desarrollo.
 */
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
