# BLOCK-2 — Fase 1: Imágenes de producto sin fondo

> Subir/elegir una imagen para un producto, quitarle el fondo con Photoroom (con confirmación) o usarla tal cual, y dejarla asociada al producto (reutilizable). Búsqueda de imágenes con Serper.
>
> Español, ARS, centavos. NO romper nada. Mirrorear patrones. Secretos nunca en respuestas ni logs. Todo lo dudoso, configurable.

## Alcance

1. Package `@tgs/providers` con clientes **Photoroom** y **Serper** (keys desde `ExternalModuleConfig`).
2. Job handler `product-asset:remove-bg` en el worker (usa Photoroom + `@tgs/storage`).
3. Controller `ExternalModuleController` (`@Controller('external-module')`) con endpoints de assets + proxy Serper.
4. Contracts para los inputs.
5. UI: tab **Imágenes** en `ModuloExternoView` (selector de producto + gestor de assets con preview y confirmación).

## 1. Package `@tgs/providers`

Crear `packages/providers` (mirrorear `packages/storage`: package.json con `exports` condición `development`, tsconfig, src/index.ts). Sin dependencias nuevas: usar `fetch`/`FormData`/`Blob` globales de Node 22.

- `src/photoroom.ts`:
  - Constante configurable arriba del archivo: `PHOTOROOM_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment'` (comentario: cambiar acá si Photoroom cambia el endpoint).
  - `removeBackground(imageBytes: Buffer, apiKey: string): Promise<Buffer>` → POST multipart (`image_file`) con header `x-api-key`; devuelve el PNG resultante (Buffer). Manejo de error claro en español si status != 200.
- `src/serper.ts`:
  - `SERPER_IMAGES_URL = 'https://google.serper.dev/images'`.
  - `searchImages(query: string, apiKey: string, num=20): Promise<{url:string;title?:string;source?:string;width?:number;height?:number}[]>` → POST JSON `{q, num}` con header `X-API-KEY`; mapear `images[]` (campo `imageUrl`→url).
- Helpers para obtener keys desde config (desencriptar con `@tgs/config`): `getPhotoroomKey()`, `getSerperKey()` que leen `db.externalModuleConfig` y lanzan error claro si falta.
- Nunca loguear las keys.

## 2. Job handler `product-asset:remove-bg`

En `apps/worker/src`: crear `handlers/product-asset.ts` (o similar) y registrarlo en el `handlers` map de `apps/worker/src/jobs.ts` (importándolo desde `index.ts` o donde se arme el registro; asegurate de que el registro quede efectivamente poblado en runtime).

- payload `{ assetId: string }`.
- Carga `ProductAsset`; si no tiene `sourceUrl`, error. Descarga los bytes de `sourceUrl` (fetch). Llama `removeBackground`. Sube a R2 vía `loadR2FromModuleConfig().put('product-assets/{productId}/{assetId}.png', buffer, 'image/png')`. Actualiza el asset: `url`, `storageKey`, `status='READY'`.
- En error, dejar el asset con `status='FAILED'` (el job ya reintenta solo por la infra).

## 3. API — `ExternalModuleController` (`apps/api/src/external-module.ts`)

Registrarlo en `apps/api/src/module.ts` (array `controllers`). Auth normal (sin `@Public`). Usar `@tgs/storage`, `@tgs/providers`, `enqueueJob`, `jsonSafe`, el helper `audit` (podés replicar el patrón local de settings). Multipart: mirrorear `company/logo` de `settings.ts` (`req.file()`).

Endpoints:
- `GET  products/:productId/assets` → lista `ProductAsset` del producto (orden isPrimary desc, createdAt desc).
- `POST products/:productId/assets/upload` (multipart, campo file) + query/body `{ mode: 'remove-bg' | 'as-is' }`:
  - Sube el original a R2 (`product-assets/{productId}/source-{uuid}.<ext>`). Crea `ProductAsset(origin=UPLOAD, sourceUrl=<url original>, status=...)`.
  - `as-is` → `url=sourceUrl`, `status='READY'`, `approved=true`.
  - `remove-bg` → `status='PENDING'` y `enqueueJob('product-asset:remove-bg', {assetId})`.
- `POST products/:productId/assets/from-url` `{ url, origin?: 'SERPER'|'OFFICIAL'|'UPLOAD', mode }` → crea asset con `sourceUrl=url` (origin default SERPER) y aplica el mismo flujo `mode`.
- `GET  serper/images?q=` → proxy a `searchImages`; devolver `{images:[...]}`.
- `POST assets/:id/remove-bg` → set `status='PENDING'` + `enqueueJob(...)` (botón "quitar fondo" / reintentar).
- `POST assets/:id/confirm-as-is` → `url=sourceUrl`, `approved=true`, `status='READY'`.
- `PATCH assets/:id` `{ isPrimary?, approved? }` → si `isPrimary=true`, desmarcar las demás del mismo producto en una transacción.
- `DELETE assets/:id` → borrar fila; best-effort borrar objeto R2 si hay `storageKey` (no fallar si el borrado remoto falla).

Todos los endpoints devuelven `jsonSafe(...)` cuando corresponda. Validar inputs con zod (contracts).

## 4. Contracts

Schemas `.strict()` para: `assetFromUrlSchema` (`url` url, `origin?`, `mode`), `assetUpdateSchema` (`isPrimary?`, `approved?`), `assetModeSchema` (`mode: 'remove-bg'|'as-is'`). Tipos con `z.infer`.

## 5. UI — tab "Imágenes" en `ModuloExternoView`

Agregar `'imagenes'` a las tabs (reemplaza el placeholder de "Plantillas"? NO: agregala como tab nueva, dejá los otros placeholders). Contenido:
- **Selector de producto**: cargar `GET /products` (ya existe) y filtrar por texto (client-side). Mostrar lista/buscador.
- Al elegir producto: `GET /external-module/products/:id/assets` → grilla de assets con thumbnail (`url` o `sourceUrl`), badge "Principal", estado (PENDING/READY/FAILED con Pill).
- Acciones por asset: **Marcar principal**, **Aprobar**, **Quitar fondo** (si aún no), **Usar tal cual**, **Borrar**.
- **Subir imagen**: input file → pregunta `mode` (botones "Quitar fondo" / "Usar tal cual, ya viene sin fondo") → POST upload.
- **Buscar en Serper**: input query → `GET serper/images?q=` → grilla de resultados → al elegir uno, POST from-url con `mode`.
- Preview + confirmación antes de aplicar. Loading/error con componentes compartidos. Refrescar tras cada acción. Botones con clases existentes (`btn-dark`, `btn-ghost`, `btn-sm`), Alert tone `'error'|'ok'|'info'`.

## Verificación (obligatoria)

1. `pnpm db:generate` (no hay cambios de schema, pero corré igual).
2. `pnpm build` VERDE. El build de Next.js puede fallar con `spawn EPERM` en tu sandbox — lo corro yo afuera; asegurá typecheck de providers/worker/api/web/contracts.
3. Sin secretos en logs/respuestas. Nada roto.

NO commit / NO push. Resumen final: archivos, endpoints creados, dónde registraste el handler y el controller, y estado de verificación.
