# BLOCK-1 — Fundación de dominio: entidades + storage R2 + jobs async

> Completa la Fase 0. Objetivo: entidades reutilizables del módulo, capa de storage en Cloudflare R2 (SigV4 real) alimentada por `ExternalModuleConfig`, y un scaffold de jobs async sobre el worker existente (polling de una tabla, sin cola externa).
>
> Español, ARS, centavos. NO romper nada. Mirrorear patrones existentes. Sin secretos en respuestas.

## Alcance (SOLO esto)

1. Entidades Prisma + enums + migración (con **identificadores entre comillas dobles**, ver más abajo) + `prisma generate`. Sin filas seed salvo lo indicado.
2. Package nuevo `@tgs/storage` con cliente R2 (S3-compatible, **AWS SigV4** vía `@aws-sdk/client-s3`) que toma credenciales de `ExternalModuleConfig`.
3. Scaffold de jobs async: tabla `ProcessingJob` + loop en `apps/worker` que reclama/procesa/reintenta, con registro de handlers (vacío/stub por ahora) + helper `enqueueJob` reutilizable.

NO incluir: lógica de Photoroom/Tripo/Higgsfield/Serper/OpenAI, endpoints de negocio, UI. Solo fundaciones.

## IMPORTANTE — Migraciones

Todas las migraciones del repo usan **identificadores entre comillas dobles** para preservar el case (ej: `CREATE TABLE "ProductAsset" (... "productId" TEXT ...)`). Postgres pasa a minúscula lo no citado y rompe Prisma. Copiá el estilo EXACTO de `packages/database/prisma/migrations/20260808000000_external_module_config/migration.sql`. Timestamp posterior a `20260808000000`.

## 1. Entidades (schema.prisma)

Enums:
- `ProcessingStatus { PENDING RUNNING DONE FAILED }`
- `PublicationStatus { DRAFT PUBLISHED UNPUBLISHED FAILED }`
- `Model3DStatus { PENDING PROCESSING READY FAILED }`
- `AssetOrigin { UPLOAD SERPER OFFICIAL PLATFORM }`

Modelos (agregar relaciones inversas mínimas en `Product` y `QuoteVersion` donde corresponda):

**`ProductAsset`** (imagen sin fondo reutilizable por producto)
- id (uuid), productId (FK `Product`, onDelete Cascade), origin `AssetOrigin`, sourceUrl String? (original), url String? (procesada en R2), storageKey String?, isPrimary Boolean @default(false), approved Boolean @default(false), status String @default("READY"), createdAt, updatedAt. Index por productId.

**`CaseModel3D`** (modelo/spin por gabinete)
- id (uuid), productId (FK `Product`, **@unique**, onDelete Cascade), sourcePhotos String[] (@default([])), glbUrl String?, spinUrl String?, glbKey String?, status `Model3DStatus` @default(PENDING), tripoJobId String?, meshStats Json?, createdAt, updatedAt.

**`ThumbnailTemplate`** (plantillas + reglas + tipografías, cargables como config)
- id (uuid), name String, templateImageUrl String?, templateKey String?, fontsJson Json @default("[]"), rulesJson Json @default("{}"), active Boolean @default(true), createdAt, updatedAt.

**`WebPublication`** (presupuesto → producto WP)
- id (uuid), quoteVersionId (FK `QuoteVersion`, **@unique**, onDelete Cascade), status `PublicationStatus` @default(DRAFT), wpProductId String?, url String?, thumbnailUrl String?, payloadSnapshot Json?, lastError String?, publishedAt DateTime?, createdAt, updatedAt.

**`ProcessingJob`** (job async genérico)
- id (uuid), type String, status `ProcessingStatus` @default(PENDING), payload Json @default("{}"), result Json?, error String?, attempts Int @default(0), maxAttempts Int @default(3), entityType String?, entityId String?, runAfter DateTime?, startedAt DateTime?, finishedAt DateTime?, createdAt, updatedAt. Index por (status, runAfter) y (type).

## 2. Package `@tgs/storage`

Crear `packages/storage` (mirrorear estructura de otro package: `package.json`, `tsconfig.json`, `src/index.ts`, export en `exports` con condición `development` → `src/index.ts`, como `@tgs/config`/`@tgs/database`).

- Dependencia: `@aws-sdk/client-s3` (agregar a package.json; yo corro `pnpm install`).
- API:
  - `type R2Credentials = { endpoint:string; bucket:string; accessKeyId:string; secretAccessKey:string; publicBaseUrl:string }`
  - `createR2Storage(creds: R2Credentials)` → `{ put(key, body:Buffer, contentType?):Promise<{url:string;key:string}>; publicUrl(key):string }`. Usar `S3Client` con `region:'auto'`, `forcePathStyle:true`, endpoint y credenciales dadas. `put` hace `PutObjectCommand`; `publicUrl` = `publicBaseUrl.replace(/\/$/,'')+'/'+key`.
  - `loadR2FromModuleConfig(): Promise<R2Storage>` — lee `db.externalModuleConfig` singleton, desencripta `r2SecretAccessKeyEnc` con `decryptSecret` (`@tgs/config`), valida que endpoint/bucket/accessKeyId/secret/publicBaseUrl estén presentes; si falta algo, lanzar error claro en español. **Nunca** loguear el secreto.
- No exponer secretos en tipos de retorno.

## 3. Jobs async (apps/worker + helper compartido)

- Helper `enqueueJob(type:string, payload:unknown, opts?:{entityType?:string;entityId?:string;maxAttempts?:number;runAfter?:Date})` → crea fila `ProcessingJob` PENDING. Ubicarlo donde sea reutilizable por la API (p.ej. en `@tgs/database` o un módulo de la API). Elegí el lugar que mejor mirroree el repo y documentalo.
- En `apps/worker/src`: nuevo archivo `jobs.ts` con:
  - Registro de handlers: `type JobHandler = (job:ProcessingJob)=>Promise<unknown>`; `const handlers: Record<string, JobHandler> = {}` (vacío por ahora; los llenan fases futuras).
  - `processPendingJobs(now?)`: reclama en transacción las PENDING con `runAfter<=now` (o null), marca RUNNING + startedAt + attempts+1; ejecuta handler; DONE con result, o FAILED con error; si attempts<maxAttempts, reprograma a PENDING con `runAfter` backoff exponencial. Si no hay handler para el type → FAILED con error claro. Procesar en tandas (limit N) para no saturar.
  - Integrar `processPendingJobs()` al `runLoop` existente en `index.ts` (agregarlo al `Promise.all` / al ciclo), con su propio try/catch y log JSON como los otros.
- No usar `Date.now()` prohibido en workflows: esto es código normal de Node, `new Date()` está OK acá.

## Verificación (obligatoria)

1. `pnpm db:generate` ok.
2. `pnpm build` VERDE (todos los paquetes; incluye `@tgs/storage`, api, web, worker). Si falta instalar deps por `@aws-sdk/client-s3`, dejá el package.json correcto; el operador corre `pnpm install`.
3. Sin secretos en logs ni respuestas. Nada roto de lo existente.

NO commit / NO push. Al terminar: resumen de archivos, nombre de migración, y resultado de build (o el paso exacto que quede pendiente de `pnpm install`).
