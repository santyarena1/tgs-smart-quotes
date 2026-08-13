# Graph Report - tgs-smart-quotes  (2026-08-13)

## Corpus Check
- 269 files · ~148,009 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2348 nodes · 3739 edges · 179 communities (137 shown, 42 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f07c6d13`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- scripts
- tasks
- CoreController
- extension/package.json
- dependencies
- service.ts
- What You Must Do When Invoked
- database/package.json
- web/package.json
- compilerOptions
- worker/package.json
- api/package.json
- extension/manifest.json
- public/manifest.json
- compilerOptions
- ai/package.json
- compilerOptions
- api/tsconfig.json
- graphify reference: extra exports and benchmark
- config/package.json
- contracts/package.json
- ui/package.json
- worker/tsconfig.json
- ai/src/index.ts
- database/tsconfig.json
- graphify reference: query, path, explain
- eslint-config/package.json
- pdf/package.json
- pricing/package.json
- testing/package.json
- validation/package.json
- content.tsx
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- typescript-config/package.json
- layout.tsx
- page.tsx
- TGS Smart Quotes
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- graphify
- base.json
- TGS Smart Quotes
- next-env.d.ts
- .claude/CLAUDE.md
- extraction-spec.md
- AI.md
- API.md
- ARCHITECTURE.md
- BACKUP_RESTORE.md
- BUSINESS_RULES.md
- DATABASE.md
- DECISIONS.md
- DEPLOYMENT.md
- EXTENSION.md
- GRAPHIFY.md
- PDF.md
- QA_CHECKLIST.md
- config/src/index.ts
- seed.ts
- pdf/src/index.ts
- testing/src/index.ts
- ui/src/index.ts
- background.ts
- index.test.ts
- contracts/src/index.ts
- CurrentUser
- shared.tsx
- QuotesView.tsx
- src/lib/api.ts
- web/lib/types.ts
- SettingsView.tsx
- branding-storage.ts
- module.ts
- similarity.ts
- src/lib/types.ts
- BLOCK-0 — Fundaciones (spec autoritativa para Codex)
- Endpoints entregados
- infrastructure.ts
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- errorMessage
- 1. Invariantes NO NEGOCIABLES (todo el código las respeta)
- EXTENSION-PRO — Rediseño profesional de la extensión WhatsApp (spec autoritativa para Codex)
- dom-selectors.ts
- BLOCK-2 — Presupuestos core
- domain-contracts.test.ts
- BLOCK-1 — Productos, clientes y líneas de PC
- devDependencies
- .login
- E2E — Playwright
- Handoff — TGS Smart Quotes
- Panel
- SpanishExceptionFilter
- build.mjs
- Contrato de aceptación
- env.ts
- vite-windows-sandbox.cjs
- @nestjs/common
- @nestjs/core
- @nestjs/platform-fastify
- openai
- reflect-metadata
- rxjs
- @tgs/ai
- @tgs/database
- @tgs/pdf
- render.php
- ProductsView.tsx
- worker/src/jobs.ts
- database/src/index.ts
- vitest.setup.ts
- QuotesView.tsx
- model-viewer.min.js
- PcLinesView.tsx
- changelog.ts
- Controller
- Delete
- Get
- Param
- Post
- Put
- Req
- 5. Fases
- BLOCK-0 — Fundación de configuración del Módulo Externo (Conexiones)
- ModuloExternoView.tsx
- devDependencies
- web/package.json
- api/package.json
- dependencies
- dependencies
- RequestsView.tsx
- BLOCK-7 — Fase 6: Editor de layout de la landing (bloques configurables)
- BLOCK-3 — Fase 2 (parte 1): Modelo 3D del gabinete — subir GLB + Tripo + preview
- .mark
- onlyBuiltDependencies
- devDependencies
- model-viewer.d.ts
- serper.ts
- model-viewer-module.d.ts
- Controller
- Get
- dependencies
- BLOCK-4 — Fase 4: Enriquecimiento del presupuesto
- onlyBuiltDependencies
- package.json
- @nestjs/common
- @nestjs/core
- @nestjs/swagger
- openai
- reflect-metadata
- rxjs
- sharp
- @tgs/ai
- @tgs/pdf
- @tgs/pricing
- branding-storage.ts
- testing/src/index.ts

## God Nodes (most connected - your core abstractions)
1. `jsonSafe()` - 47 edges
2. `RequestUser` - 44 edges
3. `CurrentUser` - 44 edges
4. `EmployeesController` - 31 edges
5. `ExternalModuleController` - 30 edges
6. `SettingsController` - 30 edges
7. `statusEvent()` - 24 edges
8. `audit()` - 22 edges
9. `audit()` - 20 edges
10. `QuotesController` - 20 edges

## Surprising Connections (you probably didn't know these)
- `audit()` --calls--> `jsonSafe()`  [EXTRACTED]
  apps/api/src/products.ts → apps/api/src/infrastructure.ts
- `activeBundle()` --calls--> `jsonSafe()`  [EXTRACTED]
  apps/api/src/quotes.ts → apps/api/src/infrastructure.ts
- `Panel()` --calls--> `detectChat()`  [EXTRACTED]
  apps/extension/src/content.tsx → apps/extension/src/dom-selectors.ts
- `Panel()` --calls--> `errorMessage()`  [EXTRACTED]
  apps/extension/src/content.tsx → apps/extension/src/lib/api.ts
- `CollectionsView()` --calls--> `errorMessage()`  [EXTRACTED]
  apps/web/components/CollectionsView.tsx → apps/web/components/shared.tsx

## Import Cycles
- None detected.

## Communities (179 total, 42 thin omitted)

### Community 0 - "scripts"
Cohesion: 0.51
Nodes (8): extractNumbersModels(), normalizePhone(), normalizeText(), productSimilarity(), sameMultiset(), trigrams(), trigramSimilarity(), wordOverlap()

### Community 1 - "tasks"
Cohesion: 0.07
Nodes (27): dependencies, react, react-dom, vite, @vitejs/plugin-react, devDependencies, @types/chrome, @types/react (+19 more)

### Community 2 - "CoreController"
Cohesion: 0.05
Nodes (37): dependencies, argon2, @fastify/multipart, @fastify/static, @nestjs/common, @nestjs/core, @nestjs/platform-fastify, @nestjs/swagger (+29 more)

### Community 3 - "extension/package.json"
Cohesion: 0.25
Nodes (15): applyCost(), applyMarkup(), applySale(), markupFromPrices(), PricingError, PricingItem, retarget(), RetargetItem (+7 more)

### Community 4 - "dependencies"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 5 - "service.ts"
Cohesion: 0.05
Nodes (37): archiver, devDependencies, archiver, @playwright/test, prettier, turbo, vitest, engines (+29 more)

### Community 6 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (29): dependencies, argon2, @prisma/client, devDependencies, prisma, tsx, @types/node, typescript (+21 more)

### Community 7 - "database/package.json"
Cohesion: 0.11
Nodes (21): aiCache, audit(), createAsset(), downloadBytes(), enrichmentData(), enrichmentService(), ext(), ExternalModuleController (+13 more)

### Community 8 - "web/package.json"
Cohesion: 0.09
Nodes (22): compilerOptions, allowJs, incremental, isolatedModules, jsx, lib, module, moduleResolution (+14 more)

### Community 9 - "compilerOptions"
Cohesion: 0.11
Nodes (16): metadata, config, ^build, .next/**, dependsOn, outputs, cache, persistent (+8 more)

### Community 10 - "worker/package.json"
Cohesion: 0.08
Nodes (24): dependencies, @tgs/database, @tgs/providers, @tgs/storage, devDependencies, @tgs/testing, tsx, @types/node (+16 more)

### Community 11 - "api/package.json"
Cohesion: 0.20
Nodes (11): devDependencies, @types/node, @types/react, typescript, typescript, devDependencies, @types/node, typescript (+3 more)

### Community 12 - "extension/manifest.json"
Cohesion: 0.19
Nodes (9): currentSalary(), EmployeePortalController, EmployeePortalEnabledGuard, periodDates(), Controller, Get, isEmployeePortalEnabled(), requireEmployeeForUser() (+1 more)

### Community 13 - "public/manifest.json"
Cohesion: 0.11
Nodes (18): background, service_worker, type, content_scripts, externally_connectable, matches, host_permissions, downloads (+10 more)

### Community 14 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, jsx, module, moduleResolution, noEmit, types, extends, include (+3 more)

### Community 15 - "ai/package.json"
Cohesion: 0.08
Nodes (24): dependencies, openai, @tgs/validation, zod, devDependencies, @types/node, typescript, exports (+16 more)

### Community 16 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck, strict (+1 more)

### Community 17 - "api/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, emitDecoratorMetadata, experimentalDecorators, outDir, extends, include, src, ../../tsconfig.json

### Community 18 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 19 - "config/package.json"
Cohesion: 0.10
Nodes (20): dependencies, zod, devDependencies, @types/node, typescript, exports, files, dist (+12 more)

### Community 20 - "contracts/package.json"
Cohesion: 0.11
Nodes (18): dependencies, zod, devDependencies, typescript, exports, files, dist, typescript (+10 more)

### Community 21 - "ui/package.json"
Cohesion: 0.12
Nodes (15): exports, files, react, dist, main, name, peerDependencies, react (+7 more)

### Community 22 - "worker/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, extends, include, src, ../../tsconfig.json

### Community 23 - "ai/src/index.ts"
Cohesion: 0.06
Nodes (73): AiClientConfig, client(), createAiClient(), COMPONENT_PATTERNS, extractBudgetCents(), fallbackCompatibilityFeedback(), fallbackIntentClassification(), fallbackRequestAnalysis() (+65 more)

### Community 24 - "database/tsconfig.json"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+7 more)

### Community 25 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 26 - "eslint-config/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 27 - "pdf/package.json"
Cohesion: 0.08
Nodes (23): dependencies, playwright, devDependencies, @types/node, typescript, vitest, exports, files (+15 more)

### Community 28 - "pricing/package.json"
Cohesion: 0.12
Nodes (15): devDependencies, typescript, exports, files, dist, typescript, main, name (+7 more)

### Community 29 - "testing/package.json"
Cohesion: 0.09
Nodes (22): dependencies, argon2, @prisma/client, devDependencies, @types/node, typescript, exports, files (+14 more)

### Community 30 - "validation/package.json"
Cohesion: 0.12
Nodes (15): devDependencies, typescript, exports, files, dist, typescript, main, name (+7 more)

### Community 31 - "content.tsx"
Cohesion: 0.11
Nodes (20): defaultMessage(), NotificationsBell(), QuoteDetail(), QuoteSummaryCard(), root, STATE_LABEL, STATE_TONE, downloadFile() (+12 more)

### Community 32 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 33 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 34 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 35 - "typescript-config/package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 36 - "layout.tsx"
Cohesion: 0.26
Nodes (20): jsonSafe(), activeVersion(), assertDraftMutable(), audit(), buildItemRows(), jsonField(), loadFamily(), masterPrices() (+12 more)

### Community 37 - "page.tsx"
Cohesion: 0.20
Nodes (9): 1. Plugin PHP (`wordpress-plugin/tgs-smart-quotes/`), 2. Empaquetado + descarga, 3. Publicar (plataforma → WordPress), 4. Contracts + UI, Alcance, BLOCK-6 — Fase 5: Plugin WordPress + publicar, LECCIONES DEL INCIDENTE (obligatorias), NO incluir acá (va a Fase 7): republicado automático al editar el presupuesto (lo hace un task del worker después). (+1 more)

### Community 50 - "BACKUP_RESTORE.md"
Cohesion: 0.50
Nodes (3): Backup, Backup y restauración, Restauración

### Community 55 - "EXTENSION.md"
Cohesion: 0.40
Nodes (4): Descarga desde el sistema, Empaquetado, Extension Chrome (WhatsApp Web), Verificación de conexión

### Community 59 - "config/src/index.ts"
Cohesion: 0.31
Nodes (8): AppEnv, decryptSecret(), encryptSecret(), envSchema, keyBytes(), maskSecret(), optionalEmpty, resolveKey()

### Community 61 - "pdf/src/index.ts"
Cohesion: 0.12
Nodes (27): applyCoefficient(), buildFinancing(), buildItemsRows(), createLocalPdfStorage(), createPdfStorageFromEnv(), createS3PdfStorage(), escapeHtml(), formatArsFromCents() (+19 more)

### Community 62 - "testing/src/index.ts"
Cohesion: 0.12
Nodes (25): Get, CurrentUser, RequestUser, Get, addPriceHistory(), audit(), createProduct(), CustomerController (+17 more)

### Community 64 - "background.ts"
Cohesion: 0.33
Nodes (6): ApiMessage, buildUrl(), DownloadMessage, Message, PingMessage, probeConnection()

### Community 66 - "index.test.ts"
Cohesion: 0.22
Nodes (16): activityAt(), closeAsNoConcretado(), jsonSafe(), loadSettings(), markStale(), notifyStaleApproaching(), processStaleQuotes(), runLoop() (+8 more)

### Community 71 - "contracts/src/index.ts"
Cohesion: 0.01
Nodes (227): AiAnalyzeRequestInput, aiAnalyzeRequestSchema, AiCompatibilityInput, aiCompatibilitySchema, AiIntentInput, aiIntentSchema, AiSettingsInput, aiSettingsInputSchema (+219 more)

### Community 72 - "CurrentUser"
Cohesion: 0.28
Nodes (4): audit(), Body, CurrentUser, Put

### Community 73 - "shared.tsx"
Cohesion: 0.14
Nodes (21): CustomersView(), Draft, empty(), DashboardView(), msToHuman(), RankBlock, Summary, NotificationRow (+13 more)

### Community 74 - "QuotesView.tsx"
Cohesion: 0.19
Nodes (14): Draft, emptyDraft(), ProductsView(), centsFieldFromArs(), centsToInput(), displayArs(), formatArs(), formatBps() (+6 more)

### Community 75 - "src/lib/api.ts"
Cohesion: 0.16
Nodes (19): api(), ApiError, ApiOptions, BackgroundApiResponse, BackgroundDownloadResponse, buildPath(), changeQuoteState(), createQuickRequest() (+11 more)

### Community 76 - "web/lib/types.ts"
Cohesion: 0.06
Nodes (38): AiModelOption, centsToInput(), efficiencyHint(), emptyFin(), ExtensionInfo, ExtensionInstructions, FinDraft, PDF_FLAGS (+30 more)

### Community 77 - "SettingsView.tsx"
Cohesion: 0.17
Nodes (12): LoginView(), Field(), api(), apiBaseUrl(), ApiError, ApiOptions, apiUpload(), buildUrl() (+4 more)

### Community 78 - "branding-storage.ts"
Cohesion: 0.20
Nodes (11): resolveLogoForPdf(), buildRenderInput(), PdfController, pdfStorage, storageKeyFor(), Body, Controller, Get (+3 more)

### Community 79 - "module.ts"
Cohesion: 0.09
Nodes (21): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, extends, include (+13 more)

### Community 80 - "similarity.ts"
Cohesion: 0.18
Nodes (14): ActiveItem, bucketByConcept(), ConceptItems, ConceptKey, conceptOf(), CONCEPTS, conceptScore(), emptyConceptItems() (+6 more)

### Community 81 - "src/lib/types.ts"
Cohesion: 0.11
Nodes (17): AiSuggestion, Collection, Customer, NotificationRow, PdfKind, Quote, QuoteItem, QuotePdf (+9 more)

### Community 82 - "BLOCK-0 — Fundaciones (spec autoritativa para Codex)"
Cohesion: 0.12
Nodes (16): A.1 Enums, A.2 Migración SQL adicional (dentro de la migración inicial), A.2 Modelos, A.3 Seed (`packages/database` seed script), A. Prisma schema (AUTORITATIVO — reemplazar `packages/database/prisma/schema.prisma`), B.1 `packages/pricing`, B.2 `packages/validation`, B.3 `packages/contracts` (Zod, única fuente de tipos de dominio) (+8 more)

### Community 83 - "Endpoints entregados"
Cohesion: 0.12
Nodes (16): BLOCK-3 — PDF, trazabilidad, precios, búsqueda, envíos, respuestas, notificaciones e IA, Búsqueda (`apps/api/src/search.ts`), Configuración operativa (`apps/api/src/settings.ts`), Dependencias y configuración, Endpoints entregados, Envíos (`apps/api/src/quotes.ts`), IA (`apps/api/src/ai.ts`, opcional/mejor esfuerzo), Integridad y convenciones respetadas (+8 more)

### Community 84 - "infrastructure.ts"
Cohesion: 0.08
Nodes (23): AuthController, fakeUser, Body, Controller, Post, Req, Res, ExtensionSettingsController (+15 more)

### Community 85 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+7 more)

### Community 86 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+7 more)

### Community 87 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+7 more)

### Community 88 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+7 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+6 more)

### Community 90 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+6 more)

### Community 91 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+6 more)

### Community 92 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, declarationMap, outDir, sourceMap, types, exclude, extends (+6 more)

### Community 93 - "errorMessage"
Cohesion: 0.08
Nodes (25): Detail, DetailTab, Direction, Employee, EmployeeDetail(), EmployeesView(), errorText(), kindLabel() (+17 more)

### Community 94 - "1. Invariantes NO NEGOCIABLES (todo el código las respeta)"
Cohesion: 0.14
Nodes (13): 0. Contexto, 1.1 Dinero y números, 1.2 Localización, 1.3 Configurabilidad total (principio rector del propietario), 1.4 Seguridad / Auth (real, no la del scaffold), 1.5 Datos e integridad, 1.6 IA (cuando se use), 1. Invariantes NO NEGOCIABLES (todo el código las respeta) (+5 more)

### Community 95 - "EXTENSION-PRO — Rediseño profesional de la extensión WhatsApp (spec autoritativa para Codex)"
Cohesion: 0.17
Nodes (11): 0. Estado actual (confirmado por auditoría), 1. Reestructuración del panel: de scroll único a Tabs, 2. Gestión de cliente (nuevo, README §28.3-4), 3. Edición rápida completa — `QuickEditModal` (README §29, EL PUNTO CENTRAL DEL PEDIDO), 4. Adjunto de PDF real (README §30), 5. Detección de envío real (README §31), 6. Aceptación/rechazo asistido (README §32), 7. Jerarquía visual de acciones delicadas (+3 more)

### Community 96 - "dom-selectors.ts"
Cohesion: 0.24
Nodes (9): ChatDetection, detectChat(), detectWithSet(), extractPhoneFromDataId(), findComposer(), insertMessageIntoComposer(), InsertResult, SELECTOR_SETS (+1 more)

### Community 97 - "BLOCK-2 — Presupuestos core"
Cohesion: 0.18
Nodes (10): Ajuste por total, BLOCK-2 — Presupuestos core, Colecciones, Estados, Familia, versión e ítems, Integridad, Objetivo, Salida (+2 more)

### Community 98 - "domain-contracts.test.ts"
Cohesion: 0.20
Nodes (9): collectionCreateSchema, customerCreateSchema, pcLineCreateSchema, productCreateSchema, productImportSchema, quoteCreateSchema, quoteRetargetSchema, quoteStateSchema (+1 more)

### Community 99 - "BLOCK-1 — Productos, clientes y líneas de PC"
Cohesion: 0.22
Nodes (8): BLOCK-1 — Productos, clientes y líneas de PC, Clientes, Integridad, Líneas de PC, Objetivo, Productos, Salida, Web

### Community 100 - "devDependencies"
Cohesion: 0.50
Nodes (7): tgs_sq_auth(), tgs_sq_find(), tgs_sq_permission(), tgs_sq_publish(), tgs_sq_secret(), tgs_sq_unpublish(), WP_REST_Request

### Community 101 - ".login"
Cohesion: 0.50
Nodes (3): root, source, target

### Community 102 - "E2E — Playwright"
Cohesion: 0.33
Nodes (5): Comportamiento ante servidores caídos, E2E — Playwright, Ejecutar, Precondiciones, Qué valida el smoke

### Community 103 - "Handoff — TGS Smart Quotes"
Cohesion: 0.33
Nodes (5): Credenciales locales, Estado, Handoff — TGS Smart Quotes, Invariantes, Verificación (2026-07-26)

### Community 104 - "Panel"
Cohesion: 0.40
Nodes (5): Panel(), listNotifications(), probeExtensionConnection(), sendToBackground(), injectPanelStyles()

### Community 105 - "SpanishExceptionFilter"
Cohesion: 0.31
Nodes (9): buildCacheRepo(), PERSISTABLE_TASKS, QuoteAiController, RequestAiController, resolveAiDeps(), Body, Controller, Param (+1 more)

### Community 106 - "build.mjs"
Cohesion: 0.50
Nodes (3): nextBin, require, result

### Community 107 - "Contrato de aceptación"
Cohesion: 0.50
Nodes (3): Contrato de aceptación, Evidencia de comandos (2026-07-26), Regla de cierre

### Community 110 - "@nestjs/common"
Cohesion: 0.20
Nodes (9): 1. `ThumbnailTemplate` (ya existe: id, name, templateImageUrl, templateKey, fontsJson, rulesJson, active), 2. Compositing con `sharp` (nuevo archivo en apps/api, ej. `thumbnail-render.ts`), 3. Generar miniatura de un producto, 4. Higgsfield (aislado, opcional), 5. UI: tab "Miniatura", Alcance, BLOCK-5 — Fase 3: Miniatura (plantillas + compositing + Higgsfield opcional), LECCIONES DEL INCIDENTE (obligatorias) (+1 more)

### Community 112 - "@nestjs/platform-fastify"
Cohesion: 0.18
Nodes (14): getPhotoroomKey(), getSerperKey(), getTripoKey(), loadKey(), buildPublishPayload(), DEFAULT_LAYOUT, installmentTotal(), jsonSafe() (+6 more)

### Community 113 - "openai"
Cohesion: 0.07
Nodes (27): 1.10 Qué reutilizar vs. qué corregir, 1.1 Login (`apps/api/src/auth.ts`, `AuthController`), 1.2 Sesiones / auth (`apps/api/src/infrastructure.ts`, `AuthGuard`), 1.3 Roles / cómo se determina "administrador", 1.4 Locales (`Branch`), 1.5 Permisos en frontend, 1.6 Permisos en backend (lo que importa), 1.7 ¿Hay endpoints que dependen solo de ocultar UI? (+19 more)

### Community 114 - "reflect-metadata"
Cohesion: 0.25
Nodes (7): 1. Entidades (schema.prisma), 2. Package `@tgs/storage`, 3. Jobs async (apps/worker + helper compartido), Alcance (SOLO esto), BLOCK-1 — Fundación de dominio: entidades + storage R2 + jobs async, IMPORTANTE — Migraciones, Verificación (obligatoria)

### Community 115 - "rxjs"
Cohesion: 0.22
Nodes (8): 1. Package `@tgs/providers`, 2. Job handler `product-asset:remove-bg`, 3. API — `ExternalModuleController` (`apps/api/src/external-module.ts`), 4. Contracts, 5. UI — tab "Imágenes" en `ModuloExternoView`, Alcance, BLOCK-2 — Fase 1: Imágenes de producto sin fondo, Verificación (obligatoria)

### Community 116 - "@tgs/ai"
Cohesion: 0.50
Nodes (4): createR2Storage(), loadR2FromModuleConfig(), R2Credentials, R2Storage

### Community 117 - "@tgs/database"
Cohesion: 0.40
Nodes (3): CPU, GPU, PowerItem

### Community 118 - "@tgs/pdf"
Cohesion: 0.57
Nodes (6): createMultiviewTask(), generateModelFromImages(), getTask(), TripoEnvelope, tripoJson(), uploadImage()

### Community 119 - "render.php"
Cohesion: 0.14
Nodes (4): tgs_sq_default_layout(), tgs_sq_image_html(), tgs_sq_layout(), tgs_sq_managed()

### Community 120 - "ProductsView.tsx"
Cohesion: 0.11
Nodes (18): devDependencies, @types/node, typescript, exports, files, @types/node, typescript, main (+10 more)

### Community 121 - "worker/src/jobs.ts"
Cohesion: 0.43
Nodes (6): claimNextJob(), handlers, JobHandler, jsonResult(), processJob(), processPendingJobs()

### Community 126 - "QuotesView.tsx"
Cohesion: 0.26
Nodes (13): blankItem(), buildPcSlots(), emptyLineSlot(), filledItems(), isSlotEmpty(), ItemDraft, itemFromProduct(), itemsToPayload() (+5 more)

### Community 137 - "5. Fases"
Cohesion: 0.11
Nodes (18): 0. Principios (no negociables), 1. Arquitectura, 2. Entidades nuevas (nuestra DB), 3. Superficie de configuración interna del módulo (tabs dentro de la vista), 4. Contrato de datos (platform → WordPress), 5. Fases, 6. Decisiones tomadas, 7. Riesgos conocidos (+10 more)

### Community 138 - "BLOCK-0 — Fundación de configuración del Módulo Externo (Conexiones)"
Cohesion: 0.22
Nodes (8): 1. Modelo `ExternalModuleConfig`, 2. Contracts (`packages/contracts/src/index.ts`), 3. API (`apps/api/src/settings.ts`, dentro de `SettingsController`), 4. Frontend (`apps/web/components/ModuloExternoView.tsx`), Alcance (SOLO esto en este bloque), BLOCK-0 — Fundación de configuración del Módulo Externo (Conexiones), Patrones a mirrorear (leer antes de construir), Verificación (obligatoria antes de terminar)

### Community 139 - "ModuloExternoView.tsx"
Cohesion: 0.07
Nodes (22): ars(), Asset, CaseModel, defaultThumbnailRules, Draft, empty, Enrichment, LandingBlockType (+14 more)

### Community 143 - "devDependencies"
Cohesion: 0.22
Nodes (8): 1. `@tgs/providers/wordpress.ts`, 2. Refactor endpoint, 3. Worker: `resyncStalePublications`, 4. (Opcional simple) Listado de publicaciones, Alcance, BLOCK-8 — Fase 7: Operación (republicado automático + refactor de publish), LECCIONES DEL INCIDENTE (obligatorias), Verificación (obligatoria)

### Community 144 - "web/package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, start, typecheck (+1 more)

### Community 145 - "api/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, @tgs/testing, tsx, typescript, name, private, scripts, build (+6 more)

### Community 146 - "dependencies"
Cohesion: 0.10
Nodes (20): 0. Qué es el sistema, 1. Monorepo (pnpm + turbo), 2. Deploy y operación (CRÍTICO — leer antes de tocar nada), 3.1 Puerta de acceso (oculto), 3.2 Configuración / Conexiones, 3.3 Entidades del módulo (Prisma, en `packages/database/prisma/schema.prisma`), 3.4 Storage (Cloudflare R2), 3.5 Jobs async (worker) (+12 more)

### Community 147 - "dependencies"
Cohesion: 0.17
Nodes (12): @tgs/contracts, dependencies, @google/model-viewer, next, react, react-dom, @tgs/contracts, @google/model-viewer (+4 more)

### Community 148 - "RequestsView.tsx"
Cohesion: 0.22
Nodes (9): COLUMNS, Draft, empty(), NEXT_STATE, RequestsView(), Tone, Customer, QuoteRequest (+1 more)

### Community 149 - "BLOCK-7 — Fase 6: Editor de layout de la landing (bloques configurables)"
Cohesion: 0.22
Nodes (8): 1. Schema del layout, 2. Backend, 3. Plugin (WordPress), 4. UI: tab "Layout de landing", Alcance, BLOCK-7 — Fase 6: Editor de layout de la landing (bloques configurables), LECCIONES DEL INCIDENTE (obligatorias), Verificación (obligatoria)

### Community 150 - "BLOCK-3 — Fase 2 (parte 1): Modelo 3D del gabinete — subir GLB + Tripo + preview"
Cohesion: 0.20
Nodes (9): 1. Schema (schema.prisma + migración), 2. Tripo (`packages/providers/src/tripo.ts` + export en index), 3. Job handler `case-model:tripo` (apps/worker/src/handlers), 4. API (`ExternalModuleController`), 5. UI: tab "Modelo 3D" en `ModuloExternoView`, Alcance, BLOCK-3 — Fase 2 (parte 1): Modelo 3D del gabinete — subir GLB + Tripo + preview, LECCIONES DEL INCIDENTE (obligatorias) (+1 more)

### Community 151 - ".mark"
Cohesion: 0.23
Nodes (7): currentSalary(), EmployeesController, periodDates(), audit(), requireEmployee(), Param, Roles

### Community 152 - "onlyBuiltDependencies"
Cohesion: 0.33
Nodes (5): NotificationsController, Body, Controller, Param, Post

### Community 154 - "devDependencies"
Cohesion: 0.24
Nodes (10): addMonths(), balanceFrom(), directionFor(), employeeBalance(), MOVEMENT_DIRECTIONS, obligationPendingCents(), reconcileAllocation(), reconcileObligation() (+2 more)

### Community 155 - "model-viewer.d.ts"
Cohesion: 0.50
Nodes (3): IntrinsicElements, JSX, react

### Community 163 - "dependencies"
Cohesion: 0.22
Nodes (9): @tgs/config, @tgs/database, @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, @tgs/config, @tgs/database, @tgs/config (+1 more)

### Community 164 - "BLOCK-4 — Fase 4: Enriquecimiento del presupuesto"
Cohesion: 0.17
Nodes (11): 1. Modelo `QuoteEnrichment`, 2. Serialización del presupuesto, 3. IA (service nuevo en `@tgs/ai`), 4. Potencia (determinística), 5. Endpoints (`ExternalModuleController`), 6. Contracts, 7. UI: tab "Presupuesto", Alcance (+3 more)

### Community 165 - "onlyBuiltDependencies"
Cohesion: 0.23
Nodes (8): App(), NAV_GROUPS, defaults(), effective(), NavPreferences, PersonalizableSidebarNav(), Props, SidebarNavGroup

### Community 166 - "package.json"
Cohesion: 0.22
Nodes (5): CollectionsController, RequestsController, Controller, Delete, Get

### Community 168 - "@nestjs/core"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 169 - "@nestjs/swagger"
Cohesion: 0.33
Nodes (6): CollectionsView(), Draft, empty(), Pill(), Collection, Quote

### Community 170 - "openai"
Cohesion: 0.33
Nodes (6): CONCEPT_LABEL, Draft, empty(), PcLinesView(), Checkbox(), PcLine

### Community 171 - "reflect-metadata"
Cohesion: 0.13
Nodes (17): avgBigInt(), avgMs(), DashboardController, ProductRank, rankProducts(), Controller, Get, activeBundle() (+9 more)

### Community 173 - "sharp"
Cohesion: 0.15
Nodes (9): MePreferencesController, Controller, Get, AppModule, HealthController, Controller, Get, Module (+1 more)

### Community 174 - "@tgs/ai"
Cohesion: 0.40
Nodes (5): dependencies, @tgs/config, @tgs/database, @tgs/config, @tgs/database

### Community 175 - "@tgs/pdf"
Cohesion: 0.13
Nodes (6): FinancingController, isChatCompletionModel(), SettingsController, Controller, Get, Query

### Community 176 - "@tgs/pricing"
Cohesion: 0.21
Nodes (11): balanceText(), date(), EmployeePortalView(), label(), labels, Movement, Obligation, Payment (+3 more)

### Community 177 - "branding-storage.ts"
Cohesion: 0.18
Nodes (15): assertSafeBrandingFilename(), BRANDING_DIR, brandingFilePath(), EXT_TO_MIME, filenameFromLogoUrl(), logoPublicUrl(), MIME_TO_EXT, mimeForBrandingFilename() (+7 more)

### Community 182 - "testing/src/index.ts"
Cohesion: 0.27
Nodes (10): actorFrom(), Baseline, BaselineOptions, createTestDb(), fixtureUser, hasTestDatabase(), resetDatabase(), seedBaseline() (+2 more)

## Knowledge Gaps
- **1084 isolated node(s):** `NavPreferences`, `Props`, `NAV_GROUPS`, `name`, `version` (+1079 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **42 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `argon2` connect `service.ts` to `devDependencies`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `jsonSafe()` connect `layout.tsx` to `package.json`, `SpanishExceptionFilter`, `reflect-metadata`, `branding-storage.ts`, `similarity.ts`, `infrastructure.ts`, `onlyBuiltDependencies`, `testing/src/index.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `NavPreferences`, `Props`, `NAV_GROUPS` to the rest of the system?**
  _1084 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tasks` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `CoreController` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._