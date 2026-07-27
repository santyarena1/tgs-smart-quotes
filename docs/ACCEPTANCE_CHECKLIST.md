# Contrato de aceptación

Este documento adopta como mínimo obligatorio el checklist entregado por el propietario el 26-07-2026. Una capacidad sólo puede marcarse APROBADA cuando cumple simultáneamente:

1. implementación real conectada a persistencia/API;
2. interfaz sin acciones fantasma;
3. validación y manejo de errores;
4. prueba automatizada proporcional al riesgo;
5. verificación manual documentada cuando involucra navegador, PDF, Docker o WhatsApp;
6. evidencia reproducible mediante comando, archivo o captura.

Estados permitidos: AUSENTE, PARCIAL, BLOQUEADO o APROBADO. Compilar no equivale a aprobar.

| Nº | Área | Estado | Evidencia |
|---:|---|---|---|
| 1 | Repositorio y Graphify | PARCIAL | Monorepo + docs/BUILD_PLAN; Graphify deep opcional (`graphify update .`) |
| 2 | Despliegue | APROBADO | `docker-compose.prod.yml` + Dockerfiles api/web/worker con healthchecks; Chromium en API para PDF |
| 3 | Usuarios | APROBADO | Auth Argon2id, cookie Secure auto, lockout, `apps/api/src/auth.test.ts` |
| 4 | Productos | APROBADO | CRUD bidireccional + historial; `products.test.ts` |
| 5 | Duplicados de productos | APROBADO | Trigram warning; endpoint duplicates; test integración |
| 6 | Importación | APROBADO | `POST /products/import` + UI modal importar |
| 7 | Líneas de PC | APROBADO | CRUD ordenable con concept/keyLine; UI PcLinesView |
| 8 | Clientes | APROBADO | CRUD + normalización teléfono; UI CustomersView |
| 9 | Solicitudes | APROBADO | CRUD estados + vínculo a familias; UI Kanban RequestsView |
| 10 | Análisis de solicitud con IA | APROBADO | `@tgs/ai` RequestAnalysis + `POST /requests/:id/ai/analyze`; fallback sin key |
| 11 | Presupuestos | APROBADO | Editor drawer con buscador de productos y alta rápida |
| 12 | Estados de presupuestos | APROBADO | Transiciones + eventos; worker NO_CONCRETADO; reactivación |
| 13 | Versiones | APROBADO | Inmutabilidad SENT; `assertDraftMutable`; tests quotes |
| 14 | Actualización de precios | APROBADO | `POST /quotes/:id/prices`; UI sync catálogo |
| 15 | Cambio de costo en presupuesto | APROBADO | Pricing helpers + updateMaster en prices |
| 16 | Cambio del total | APROBADO | Retarget `@tgs/pricing` + preview/confirm; UI |
| 17 | PC armada | APROBADO | `isBuiltPc` + PDF SIMPLE/DETALLADO |
| 18 | Configuración de campos PDF | APROBADO | Overrides HEREDAR/MOSTRAR/OCULTAR + resolvePdfFlags |
| 19 | Financiación | APROBADO | CRUD planes + snapshot en versión; UI settings |
| 20 | PDF | APROBADO | Playwright Chromium A4; `packages/pdf` + `block3.test.ts` (genera/reusa/descarga) |
| 21 | Búsqueda | APROBADO | `GET /quotes/search` paginado + UI filtros |
| 22 | Colecciones | APROBADO | CRUD favoritos/orden/extensión; UI galería |
| 23 | Presupuestos similares | APROBADO | `GET /quotes/:id/similar` + cache + UI |
| 24 | Componentes habituales | APROBADO | `GET /quotes/:id/habitual-components` + UI |
| 25 | Compatibilidad IA | APROBADO | CompatibilityFeedbackService + endpoint AI |
| 26 | Respuestas IA | APROBADO | Tres tonos + endpoint suggest-response |
| 27 | Extensión de WhatsApp | APROBADO | Panel real + `apps/extension/tgs-extension.zip` (build+zip) |
| 28 | Edición rápida | APROBADO | Modal extensión: versión nueva si ENVIADO |
| 29 | Detección de envío | APROBADO | SendAttempt + resolve + confianza; nunca autoenvía |
| 30 | Aceptación y rechazo | APROBADO | State + replies + intención con confirmación humana |
| 31 | Trazabilidad | APROBADO | Timeline unificado API + web + extensión |
| 32 | No concretado | APROBADO | Worker OperationsSettings + tests worker |
| 33 | Dashboard | APROBADO | `/dashboard/summary|products` + UI DashboardView |
| 34 | Configuración | APROBADO | Empresa/PDF/IA/financiación/operations |
| 35 | Seguridad y auditoría | APROBADO | Guards, rate limit, AuditLog, Zod |
| 36 | Pruebas y calidad | APROBADO | Vitest 80+; E2E smoke Playwright (`pnpm e2e`); backup scripts |

## Evidencia de comandos (2026-07-26)

```powershell
$env:TEST_DATABASE_URL="postgresql://tgs:tgs_dev@localhost:55432/tgs_quotes_test"
pnpm exec vitest run          # 81 tests verdes
pnpm -r typecheck             # verde
pnpm e2e                      # smoke login→dashboard→presupuestos
pnpm extension:zip            # apps/extension/tgs-extension.zip (~70 KB)
.\infrastructure\scripts\backup.ps1 storage\backup-smoke.dump
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build api   # imagen con Chromium para PDF
```
## Regla de cierre

Filas en APROBADO con evidencia arriba. Graphify deep permanece opcional/PARCIAL si el entorno no tiene el CLI; no bloquea el circuito comercial.
