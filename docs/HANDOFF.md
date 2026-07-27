# Handoff — TGS Smart Quotes

Documento vivo para retomar sin depender del historial de conversación.

## Estado

| Área | Estado | Evidencia |
|---|---|---|
| Block 0 — schema/auth/settings | DONE | Cookie Secure auto; GIN trgm; settings cifrados |
| Block 1 — catálogo | DONE | Productos/clientes/líneas + tests |
| Block 2 — presupuestos core | DONE | Versiones, estados, retarget, requests, colecciones |
| Block 3 — PDF | DONE | `@tgs/pdf` Chromium; storage; endpoints; BLOCK-3.md |
| Block 4 — IA | DONE | `@tgs/ai` + endpoints; fallback sin key |
| Block 5 — búsqueda/dashboard/similitud | DONE | search, dashboard, similar, habitual-components |
| Block 6 — web | DONE | Dashboard, PDF, timeline, notificaciones, similitud en editor |
| Block 7 — extensión WhatsApp | DONE | Panel asistido + ZIP instalable |
| Block 8 — worker | DONE | OperationsSettings, aviso, idempotencia, `--once` |
| Block 9 — calidad/deploy | DONE | E2E smoke, Dockerfiles prod, backup/restore scripts, checklist |

## Verificación (2026-07-26)

- Vitest: suite completa verde (con `TEST_DATABASE_URL`).
- `pnpm -r typecheck` verde.
- E2E: `pnpm e2e` (requiere api+web + seed). Ver `docs/E2E.md`.
- Extensión: `pnpm extension:zip` → `apps/extension/tgs-extension.zip`.
- Deploy: `docker compose -f docker-compose.prod.yml up --build`.
- Backup: `.\infrastructure\scripts\backup.ps1`.

## Invariantes

- Centavos `BigInt` → string HTTP.
- Versiones enviadas inmutables.
- Sin vencimiento; solo `NO_CONCRETADO` por inactividad.
- WhatsApp nunca autoenvía.
- IA siempre opcional.

## Credenciales locales

Ver `.env`: `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Web `http://localhost:3000`, API `http://localhost:3001/api`.
