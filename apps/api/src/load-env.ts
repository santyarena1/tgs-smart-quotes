import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

/**
 * Carga el `.env` del monorepo si la variable aún no está en process.env.
 * Evita que la API arranque sin DATABASE_URL cuando se lanza desde `apps/api`.
 */
export function loadRootEnv() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(process.cwd(), '../../.env'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
    return file;
  }
  return null;
}

// Side-effect: correr al importarse antes que el resto del bootstrap.
loadRootEnv();
