# E2E — Playwright

Smoke E2E mínimo: login, dashboard y pantalla de Presupuestos.

## Precondiciones

1. Base de datos accesible (`DATABASE_URL` en `.env`).
2. Seed ejecutado al menos una vez con las mismas credenciales que usará el test:

```powershell
# Cargar .env en la sesión (PowerShell) antes de seed y de levantar la API
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
pnpm db:seed
```

3. **API y web en marcha** (Playwright no levanta servidores). La API debe arrancar con las variables de `.env` cargadas (misma sesión que el seed):

```powershell
# Terminal 1 — API (puerto 3001), con .env cargado
pnpm --filter @tgs/api dev

# Terminal 2 — Web (puerto 3000)
pnpm --filter @tgs/web dev
```

4. Credenciales para el test (una de estas opciones):
   - Variables `E2E_USER` / `E2E_PASSWORD`, o
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` del `.env` (se leen automáticamente si existen).

Opcional: `E2E_BASE_URL` (default `http://localhost:3000`), `E2E_API_URL` (default `http://localhost:3001/api`).

## Ejecutar

```powershell
pnpm e2e
```

Equivalente:

```powershell
pnpm exec playwright test --config e2e/playwright.config.ts
```

## Comportamiento ante servidores caídos

Si la web o la API no responden, el smoke **falla de inmediato** con un mensaje explícito (no se omite silenciosamente). Revisá que ambos servicios estén activos antes de correr los tests.

## Qué valida el smoke

- Health de API (`GET /api/health`).
- Login con credenciales de entorno.
- Dashboard visible tras autenticación.
- Navegación a Presupuestos: título, botón “+ Nuevo presupuesto”, buscador y stat “Total presupuestos”.

No depende de datos frágiles (presupuestos existentes); funciona con lista vacía.
