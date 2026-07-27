import fs from "node:fs";
import path from "node:path";

function loadEnvFile(): void {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export function getCredentials(): { username: string; password: string } {
  loadEnvFile();
  const username = process.env.E2E_USER ?? process.env.ADMIN_USERNAME;
  const password = process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "Credenciales E2E faltantes. Definí E2E_USER/E2E_PASSWORD o ADMIN_USERNAME/ADMIN_PASSWORD (p. ej. en .env).",
    );
  }
  return { username, password };
}

export const webBaseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const apiBaseUrl = process.env.E2E_API_URL ?? "http://localhost:3001/api";
