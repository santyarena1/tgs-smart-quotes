# TGS Smart Quotes — Visión completa del sistema (para IA / onboarding)

> Documento maestro para que otra IA (o dev) entienda **todo** el sistema y pueda avanzar sin romper nada. Escrito 2026-08. Verificado contra el repo (rama `master`, último commit de la serie "modulo-externo").
> Idioma del proyecto: **español**. Moneda **ARS**. Dinero SIEMPRE en **centavos (enteros / BigInt)**, nunca float. Zona `America/Argentina/Buenos_Aires`.

---

## 0. Qué es el sistema

**TGS Smart Quotes** = suite de **presupuestos** para *The Gamer Shop* (tienda de PC/gaming). Permite armar presupuestos de PC (con productos, líneas, combos, financiación), generar PDFs, un chatbot de WhatsApp, un catálogo (AcuStock), etc.

Encima de eso se construyó el **Módulo Externo** (foco de este documento): un pipeline que toma un presupuesto y lo publica como **producto-landing en la web WordPress/WooCommerce** de la tienda, con **modelo 3D del gabinete**, **miniatura generada**, **imágenes de producto sin fondo**, y **enriquecimiento por IA** (descripción, potencia estimada, rendimiento en juegos). Es un módulo **oculto** que se activa con una clave.

---

## 1. Monorepo (pnpm + turbo)

```
apps/
  api/        NestJS + Fastify (backend REST). Puerto 3001, prefijo /api
  web/        Next.js (app router). Puerto 3000. SPA-ish, habla con la API por HTTP
  worker/     Proceso de background (loops de polling, sin cola externa)
  extension/  Extensión Chrome (panel WhatsApp) — no parte del módulo externo
packages/
  database/   Prisma (schema + client + migraciones + seed) → export `db`, `enqueueJob`, tipos
  contracts/  Schemas zod + tipos compartidos (validación de inputs de la API)
  config/     env schema + cifrado de secretos: encryptSecret / decryptSecret / maskSecret (AES-256-GCM, SETTINGS_ENC_KEY)
  ai/         Cliente OpenAI + runner con cache/costos (tabla AiRequest) + services/ (uno por tarea de IA)
  providers/  Clientes de servicios externos del módulo: photoroom, serper, tripo, higgsfield, wordpress
  storage/    Cliente Cloudflare R2 (S3-compatible, AWS SigV4) alimentado por la config del módulo
  pdf/        Generación de PDFs (Playwright/Chromium) + storage local/s3 de PDFs
  pricing/    Lógica de precios
  validation/, ui/, testing/, eslint-config/, typescript-config/
wordpress-plugin/tgs-smart-quotes/   Plugin WordPress/WooCommerce (PHP) — NO es paquete pnpm
infrastructure/scripts/   zip-extension.mjs, zip-wp-plugin.mjs (empaquetado con archiver)
docs/modulo-externo/      PLAN.md + BLOCK-0..8.md (specs de cada bloque construido)
```

**Comandos raíz:** `pnpm build` (turbo, compila todo), `pnpm typecheck`, `pnpm test` (vitest), `pnpm db:generate|db:migrate|db:seed`.

**Convención de código:** estilo MUY denso (muchas sentencias por línea, una sola línea por función a veces). Español en strings/UI/errores. Tipos explícitos en APIs públicas. Inmutabilidad. No `console.log`.

---

## 2. Deploy y operación (CRÍTICO — leer antes de tocar nada)

- **Plataforma: Railway.** Proyecto **`welcoming-adaptation`**, entorno **`production`**. 4 servicios: `api`, `web`, `worker`, `Postgres` (+ volúmenes). El `web` depende de que `api` esté *healthy*.
- **Cada `git push` a `master` dispara un redeploy automático** → el sistema queda caído mientras reconstruye. **Regla: batchear y pushear solo cuando el usuario lo pida.** Commits locales NO despliegan.
- **Los Dockerfiles NO usan turbo**: `apps/api/Dockerfile` y `apps/worker/Dockerfile` compilan una **lista hardcodeada** de paquetes con `pnpm --filter @tgs/X build`. **Si agregás un paquete de workspace nuevo (ej. @tgs/storage, @tgs/providers), HAY QUE agregarlo a esas listas** o el build de Railway falla (aunque `turbo build` local pase). `apps/web/Dockerfile` solo compila web. Deps npm normales (sharp, @google/model-viewer, @aws-sdk/client-s3) NO necesitan tocar Dockerfiles (se instalan con `pnpm install`).
- **La API arranca con** `CMD sh -c "pnpm --filter @tgs/database migrate && pnpm --filter @tgs/database seed && node apps/api/dist/main.js"`. **Si la migración o el seed fallan, la API no arranca → crash loop → carga infinita** (porque `web` depende de la API healthy). El seed es idempotente (upserts).
- **CI (`.github/workflows/ci.yml`) NO corre migraciones contra un Postgres real.** Una migración con SQL inválido pasa CI y rompe el deploy. **Revisar SIEMPRE el SQL de migraciones a mano.**
- **Migraciones (Prisma):**
  - Identificadores SIEMPRE **entre comillas dobles** (`"Tabla"`, `"columna"`). Sin comillas, Postgres las pasa a minúscula y Prisma (que consulta con camelCase citado) falla en runtime.
  - **NUNCA statements duplicados** (un `CREATE INDEX`/`CREATE TABLE` repetido → "already exists" → transacción revertida → migración marcada como fallida → `migrate deploy` se niega a seguir en los reintentos). *Esto ya causó una caída de producción.*
  - Timestamp de carpeta posterior a la última. Enums: `ALTER TYPE "X" ADD VALUE '...'` es válido en PG12+ dentro de transacción si no se usa el valor en la misma migración (Railway usa PG17).
- **Recuperar una migración fallida en prod:** Railway → servicio Postgres → **Database → Data** tiene un query runner (ejecuta con **Cmd+Enter**, NO Enter — Enter acepta el autocompletado). `DELETE FROM _prisma_migrations WHERE migration_name='...'` (si no creó objetos, verificar con `information_schema.tables`) y redeploy para re-aplicarla limpia.
- **Encoding:** todos los archivos en **UTF-8 válido**. El build de Next.js (Rust/webpack) rechaza bytes no-UTF8; `tsc` los tolera pero quedan strings con `�` en runtime. Cuidado con código generado que escribe acentos en Latin-1.
- **Generación de código:** en este proyecto la construcción mecánica de código se delega al **Codex MCP** (`mcp__codex__codex`); la IA principal (Claude) planifica, revisa y orquesta. Cada bloque tiene un spec en `docs/modulo-externo/BLOCK-N.md`.

---

## 3. El Módulo Externo — arquitectura

**Tesis:** nuestra plataforma es el **sistema de verdad**; WordPress es el **escaparate + carrito**. Entre ambos viajan **links y JSON, nunca binarios**. Todo lo pesado (imágenes sin fondo, GLB 3D, miniaturas) vive en **Cloudflare R2**; a WordPress se le mandan **URLs**.

**Assets reutilizables por PRODUCTO del catálogo** (no por presupuesto): la imagen sin fondo se asocia a un `Product`; el modelo 3D a un producto-gabinete. Se generan una vez y se reusan en todos los presupuestos que los usen (ahorra costos de API).

### 3.1 Puerta de acceso (oculto)
- Modelo `ExternalModuleSettings` (singleton, campo `enabled`). Toggle en **Configuración → pestaña "MÓDULO EXTERNO"**.
- Activar/desactivar pide una **clave** validada server-side: `process.env.EXTERNAL_MODULE_KEY` o default **`santy123`** (endpoint `PUT /settings/external-module`).
- Cuando está activo, aparece **"Módulo Externo"** en el sidebar (componente `apps/web/components/ModuloExternoView.tsx`) y se renderiza su vista con sub-tabs.

### 3.2 Configuración / Conexiones
- Modelo `ExternalModuleConfig` (singleton). Guarda **credenciales cifradas** (`*Enc` con `encryptSecret`) y datos no-secretos:
  - Secretos: `photoroomKeyEnc, tripoKeyEnc, higgsfieldKeyEnc, higgsfieldSecretEnc, serperKeyEnc, r2SecretAccessKeyEnc, wpHmacSecretEnc`.
  - No secretos: `r2Endpoint, r2Bucket, r2AccessKeyId, r2PublicBaseUrl, wpBaseUrl (default www.thegamershop.com.ar), autoRepublish (default true), landingLayoutJson`.
- Endpoints: `GET/PUT /settings/external-module/config` (la respuesta NUNCA devuelve secretos: solo booleanos `xxxSet`; para borrar un secreto se manda `clearXxx:true`, patrón copiado de AiSettings). `POST /settings/external-module/config/test/:provider` prueba conexión (photoroom/serper/wordpress reales; tripo/higgsfield/r2 hoy son stub).

### 3.3 Entidades del módulo (Prisma, en `packages/database/prisma/schema.prisma`)
| Modelo | Clave | Para qué |
|--------|-------|----------|
| `ExternalModuleSettings` | singleton | on/off del módulo |
| `ExternalModuleConfig` | singleton | credenciales cifradas + config |
| `ProductAsset` | por `Product` | imagen sin fondo reutilizable (origin UPLOAD/SERPER/OFFICIAL/PLATFORM, isPrimary, approved, status) |
| `CaseModel3D` | por `Product` (@unique) | modelo 3D del gabinete (source UPLOAD/TRIPO/SKETCHFAB, sourcePhotos[], glbUrl, status PENDING/PROCESSING/READY/FAILED, tripoJobId) |
| `ThumbnailTemplate` | — | plantillas de miniatura (templateImageUrl, fontsJson, rulesJson, active) |
| `QuoteEnrichment` | por `QuoteVersion` (@unique) | descripción IA, powerWatts/recommendedPsuWatts/powerNote, gamesJson, programsJson, compatibilityJson |
| `WebPublication` | por `QuoteVersion` (@unique) | link presupuesto→producto WP (wpProductId, url, status DRAFT/PUBLISHED/UNPUBLISHED/FAILED, payloadSnapshot, publishedAt, lastError) |
| `ProcessingJob` | — | cola de jobs async en DB (type, status PENDING/RUNNING/DONE/FAILED, payload, attempts, maxAttempts, runAfter) |

Enums nuevos: `AssetOrigin, Model3DStatus, Model3DSource, PublicationStatus, ProcessingStatus`. Se agregó `QUOTE_ENRICHMENT` al enum `AiTaskType`.

### 3.4 Storage (Cloudflare R2)
- `packages/storage`: `createR2Storage(creds)` (S3Client region 'auto', forcePathStyle, SigV4) y `loadR2FromModuleConfig()` (lee `ExternalModuleConfig`, desencripta el secret, valida presencia). `put(key, buffer, contentType) → {url, key}`, `delete(key)`, `publicUrl(key)`. Las URLs públicas = `r2PublicBaseUrl + '/' + key`.

### 3.5 Jobs async (worker)
- El worker (`apps/worker/src`) es un **loop de polling, sin Redis/BullMQ**. Tabla `ProcessingJob` en la DB.
- `enqueueJob(type, payload, opts)` (en `@tgs/database`) inserta una fila PENDING.
- `apps/worker/src/jobs.ts`: `processPendingJobs()` reclama filas de forma atómica (`updateMany where status=PENDING` + `count===1`), ejecuta el handler registrado, marca DONE/FAILED con reintentos + backoff exponencial. Registro de handlers en `apps/worker/src/index.ts`.
- Handlers actuales: `product-asset:remove-bg` (Photoroom → R2) y `case-model:tripo` (Tripo → R2).
- Loops en `index.ts`: `runLoop()` (horario, stale-quotes + `resyncStalePublications`), `runJobsLoop()` (poll 3s, jobs del pipeline), `runAcustockSyncLoop()`.

### 3.6 Proveedores externos (`packages/providers`)
- `photoroom.ts` — quitar fondo (`https://sdk.photoroom.com/v1/segment`, header `x-api-key`).
- `serper.ts` — búsqueda de imágenes (`https://google.serper.dev/images`).
- `tripo.ts` — 4 fotos → 3D (`https://api.tripo3d.ai/v2/openapi`: upload → multiview task → poll → GLB).
- `higgsfield.ts` — fondo generado para miniatura (**API incierta**: aislada, best-effort; si falla se cae a la plantilla).
- `wordpress.ts` — `buildPublishPayload(quoteVersionId)` + `publishQuote(quoteVersionId)` (arma payload, firma HMAC, POST al plugin, upsert `WebPublication`). Usado por la API y por el worker (auto-republish).
- `index.ts` — `getPhotoroomKey/getSerperKey/getTripoKey/getHiggsfieldKey` (leen de config, desencriptan).

### 3.7 API del módulo (`apps/api/src/external-module.ts`, `@Controller('external-module')`, auth por sesión)
Rutas (prefijo real `/api/external-module/...`):
- **Imágenes**: `GET products/:id/assets`, `POST products/:id/assets/upload` (multipart, `?mode=remove-bg|as-is`), `POST products/:id/assets/from-url`, `GET serper/images?q=`, `POST assets/:id/remove-bg`, `POST assets/:id/confirm-as-is`, `PATCH assets/:id` (isPrimary/approved), `DELETE assets/:id`.
- **3D**: `GET products/:id/case-model`, `POST products/:id/case-model/upload` (GLB), `POST products/:id/case-model/tripo` (1–4 fotos → job), `DELETE case-model/:id`.
- **Miniatura**: `GET/POST thumbnail-templates`, `POST thumbnail-templates/:id/image`, `PUT/DELETE thumbnail-templates/:id`, `POST products/:id/thumbnail` (compositing con **sharp** en `apps/api/src/thumbnail-render.ts`: fondo plantilla/Higgsfield + recorte real + textos SVG → JPEG).
- **Enriquecimiento**: `GET quotes/:v/payload` (items+precios desde DB, reusa lógica de precios del PDF), `GET quotes/:v/enrichment`, `POST quotes/:v/enrich` (IA + potencia determinística `apps/api/src/quote-power.ts`), `PUT quotes/:v/enrichment`.
- **Publicar**: `GET quotes/:v/publication`, `POST quotes/:v/publish` (usa `publishQuote`), `POST quotes/:v/unpublish`.
- **Layout**: `GET/PUT landing-layout`.
- **Plugin**: `GET wp-plugin/download` (sirve el zip generado en build).

### 3.8 UI del módulo (`apps/web/components/ModuloExternoView.tsx`)
Sub-tabs: **Conexiones**, **Imágenes**, **Modelo 3D**, **Presupuesto** (payload + enriquecimiento + publicar), **Miniatura** (id interno `plantillas`), **Layout de landing**, **Almacenamiento** (placeholder). Cliente HTTP: `apps/web/lib/api.ts` (`api<T>(path,{method,body,query})`, `apiUpload`). Componentes compartidos en `apps/web/components/shared.tsx` (`Tabs, Field, Alert, Pill, PageHeader, Loading, Modal, Checkbox`). Clases de botón existentes: `btn-dark, btn-ghost, btn-sm, btn-danger`. `Alert` tone: `'error'|'ok'|'info'`.

---

## 4. Plugin WordPress (`wordpress-plugin/tgs-smart-quotes/`)

Plugin WooCommerce **self-contained** (estilo propio, no depende del tema). Se descarga como `.zip` desde Conexiones (se genera en build con `infrastructure/scripts/zip-wp-plugin.mjs`, paso agregado al `apps/api/Dockerfile`).

- `includes/rest.php`: rutas REST namespace `tgs/v1`:
  - `POST /publish` y `POST /unpublish` — protegidas por **HMAC** (header `X-TGS-Signature` = hmac-sha256 hex del body con el secreto `tgs_hmac_secret` opción / constante `TGS_HMAC_SECRET`; verificación con `hash_equals`).
  - `GET /ping` — público, para test de conexión.
  - `publish`: busca producto por meta `_tgs_external_id` (idempotente), crea/actualiza `WC_Product_Simple`, **precio (carrito) = efectivo/transferencia** (`priceTransferCents/100`), categoría "TGS", guarda todo como meta (`_tgs_model3d_url, _tgs_thumbnail_url, _tgs_gallery, _tgs_price_*_cents, _tgs_installments, _tgs_items, _tgs_description_html, _tgs_power, _tgs_games, _tgs_compatibility, _tgs_layout`). **Imagen sin sideload**: se filtra la imagen del producto para emitir `_tgs_thumbnail_url` (aparece en shop/FiboSearch con nuestra miniatura sin copiar binarios).
- `includes/render.php` + `templates/single-landing.php`: landing para productos `_tgs_managed`. Renderiza los **bloques según `_tgs_layout`** (orden + visibilidad) con **tokens como CSS variables** (`--tgs-accent` etc.). Bloques: hero3d (`<model-viewer>`), gallery, priceBox (efectivo/transferencia/cuotas), addToCartSticky, specs, description, power, games, compatibility. Escaping con `esc_url/esc_html/wp_kses_post`.
- `assets/`: `tgs-landing.css` (estilo propio + tokens), `tgs-landing.js` (barra sticky al scrollear), `model-viewer.min.js` (**hoy: import remoto/CDN, no bundleado** — pendiente).

**La tienda real** es WooCommerce + **FiboSearch** (`dgwt/wcas`) sobre un **child-theme de Impreza** ("Impreza Gamer TGS Redesign"). Por eso los presupuestos-landing deben ser productos WooCommerce reales (para aparecer en la búsqueda). El zip del theme está en `C:\Users\Santy\Downloads\Impreza-Gamer-TGS-Redesign.zip` (referencia, no está en el repo).

---

## 5. Flujo end-to-end

1. **Producto**: se sube/elige una imagen del producto → Photoroom le quita el fondo (con confirmación) → queda como `ProductAsset` reutilizable.
2. **Gabinete 3D**: se sube un GLB propio, o se generan desde 4 fotos con Tripo (job) → `CaseModel3D` por gabinete.
3. **Enriquecimiento**: sobre un `QuoteVersion` → serializa items+precios, la IA genera descripción + juegos/programas (tiers "(estimado)"), y un helper determinístico estima potencia/PSU → `QuoteEnrichment` editable.
4. **Miniatura**: recorte real del producto + plantilla (y fondo Higgsfield opcional) → compositing con sharp → JPEG en R2.
5. **Publicar**: `publishQuote` arma el payload (items, precios, GLB, miniatura, enrichment, layout), lo firma con HMAC y lo manda al plugin → crea/actualiza el producto WooCommerce con su landing. Guarda `WebPublication`.
6. **Auto-republish**: el worker (loop horario) rearma el payload de cada `WebPublication` PUBLISHED y, si cambió vs `payloadSnapshot` y `autoRepublish` está on, re-publica (precios se actualizan solos).

---

## 6. Reglas de negocio del sistema base (NO violar)
- Nunca usar float para dinero (centavos/BigInt). ARS. Zona Buenos Aires.
- No agregar vencimiento, stock, CRM, envío automático ni reglas no documentadas al core de presupuestos.
- Reusar la lógica de precios existente (efectivo/transferencia/lista, financiación) del PDF/quotes — no reinventarla.

## 7. Cómo trabajar / verificar
- Local: `pnpm install`, `pnpm db:generate`, `pnpm build` (debe dar todos los paquetes verdes). La DB local suele estar apagada; el build no la necesita. Para migraciones locales hace falta Postgres (`docker-compose.yml`) + `DATABASE_URL`.
- Antes de pushear: `pnpm build` verde + revisar migraciones (comillas, sin duplicados) + `pnpm install --frozen-lockfile` (lo que corre Railway) debe pasar + si hay paquete workspace nuevo, agregarlo a los Dockerfiles + confirmar que `node infrastructure/scripts/zip-wp-plugin.mjs` genera el zip.
- Después de pushear: **vigilar el deploy en Railway** (build → migrate → seed → boot) y recuperar si falla.

## 8. Pendientes / diferidos
- **model-viewer**: bundlear el archivo real en el plugin (hoy usa import remoto/CDN — funcional).
- **Sketchfab + optimización glTF**: diferidos a propósito (subir GLB propio ya cubre modelos externos; Sketchfab tiene fricción de licencias/formatos zip-gltf). Serían un bloque nuevo (agregarían `sketchfabTokenEnc` a la config + cliente + job).
- **Higgsfield**: el cliente está aislado con la mejor conjetura de la API; hay que confirmar endpoints reales cuando haya acceso.
- **Tests del módulo**: el módulo se validó con `pnpm build` + review; faltan tests unitarios/e2e dedicados. El PHP del plugin solo se valida instalándolo en un WordPress real.

## 9. Para configurar y probar (lo que carga el usuario)
1. Activar el módulo (Configuración → MÓDULO EXTERNO → `santy123`).
2. Cargar keys en Conexiones: Photoroom, Serper, Tripo, R2 (endpoint/bucket/access key/secret/URL pública), WordPress (URL + secreto HMAC inventado).
3. Descargar el plugin desde Conexiones, instalarlo en WordPress, poner el **mismo** secreto HMAC.

---

### Referencias en el repo
- Specs de construcción: `docs/modulo-externo/PLAN.md` y `BLOCK-0.md` … `BLOCK-8.md` (cada uno describe un bloque: 0 config, 1 fundaciones, 2 imágenes, 3 modelo3D, 4 enriquecimiento, 5 miniatura, 6 plugin+publish, 7 layout, 8 auto-republish — nota: la numeración de BLOCK no coincide 1:1 con la de "Fase" del PLAN).
- Reglas de negocio base: `docs/BUSINESS_RULES.md`, arquitectura: `docs/ARCHITECTURE.md`, deploy: `docs/DEPLOYMENT.md`, checklist: `docs/ACCEPTANCE_CHECKLIST.md`.
- Instrucciones de proyecto: `CLAUDE.md` (raíz) y `.claude/CLAUDE.md`.
