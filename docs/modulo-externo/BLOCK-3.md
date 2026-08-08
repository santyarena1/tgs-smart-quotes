# BLOCK-3 — Fase 2 (parte 1): Modelo 3D del gabinete — subir GLB + Tripo + preview

> Asociar un modelo 3D (GLB) a un producto-gabinete, por dos vías: subir un GLB propio, o generarlo desde fotos con Tripo Multiview. Preview con `<model-viewer>`. Reutiliza `CaseModel3D` (ya existe) + `@tgs/storage` + `@tgs/providers` + jobs.
>
> Español, ARS, centavos. NO romper nada. Secretos nunca en respuestas/logs. Sketchfab y optimización glTF quedan para BLOCK-4 (NO incluir acá).

## LECCIONES DEL INCIDENTE (obligatorias)
- **Migración**: identificadores SIEMPRE entre comillas dobles; timestamp posterior a `20260808010000`; **revisar que NO haya statements duplicados** (un CREATE repetido tira "already exists" y rompe el deploy). Mirrorear `packages/database/prisma/migrations/20260808010000_external_module_foundations/migration.sql`.
- **NO agregar paquetes de workspace nuevos** (reusar `@tgs/providers` y `@tgs/storage`), para no tener que tocar los Dockerfiles.
- Verificar `pnpm build` verde al final.

## Alcance
1. Schema: enum `Model3DSource` + campo `source` en `CaseModel3D` (migración ADD COLUMN).
2. `@tgs/providers`: cliente Tripo (subir imágenes → crear task multiview → poll → obtener GLB).
3. Job handler `case-model:tripo` en el worker.
4. Endpoints en `ExternalModuleController`.
5. UI: tab "Modelo 3D" con selector de producto, preview `<model-viewer>`, subir GLB, y generar con Tripo.

## 1. Schema (schema.prisma + migración)
- Enum `Model3DSource { UPLOAD TRIPO SKETCHFAB }`.
- En `CaseModel3D`: agregar `source Model3DSource @default(UPLOAD)`.
- Migración `<timestamp>_case_model_source/migration.sql`:
  ```sql
  CREATE TYPE "Model3DSource" AS ENUM ('UPLOAD', 'TRIPO', 'SKETCHFAB');
  ALTER TABLE "CaseModel3D" ADD COLUMN "source" "Model3DSource" NOT NULL DEFAULT 'UPLOAD';
  ```
- `pnpm db:generate`.

## 2. Tripo (`packages/providers/src/tripo.ts` + export en index)
Constantes configurables arriba (comentadas):
- `TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi'`.
Funciones (key vía `getTripoKey()` que lee `tripoKeyEnc` de `ExternalModuleConfig`, patrón igual a getPhotoroomKey):
- `uploadImage(bytes: Buffer, apiKey): Promise<string>` → `POST {BASE}/upload` (multipart `file`), header `Authorization: Bearer {key}`; devuelve `image_token` (`data.image_token`).
- `createMultiviewTask(imageTokens: string[], apiKey): Promise<string>` → `POST {BASE}/task` JSON `{ type:'multiview_to_model', files: imageTokens.map(t=>({type:'jpg', file_token:t})) }`; devuelve `data.task_id`.
- `getTask(taskId, apiKey): Promise<{status:string; modelUrl?:string; progress?:number}>` → `GET {BASE}/task/{taskId}`; mapear `data.status` y `data.output?.pbr_model || data.output?.model` a `modelUrl`.
- `generateModelFromImages(imageUrls: string[], apiKey, opts?:{pollMs?:number;timeoutMs?:number}): Promise<Buffer>` → descarga cada url, `uploadImage`, `createMultiviewTask`, hace polling (default cada 5s, timeout 5 min) hasta `status==='success'`, descarga el `modelUrl` y devuelve el GLB (Buffer). Errores claros en español; nunca loguear la key.

> Nota: los nombres exactos de campos de Tripo pueden variar; dejá el mapeo aislado y comentado para ajustarlo fácil. Si un campo no viene, error claro.

## 3. Job handler `case-model:tripo` (apps/worker/src/handlers)
- payload `{ caseModelId: string }`.
- Carga `CaseModel3D`; usa `sourcePhotos` (urls). Llama `generateModelFromImages`. Sube el GLB a R2 (`case-models/{productId}/{caseModelId}.glb`, contentType `model/gltf-binary`) vía `loadR2FromModuleConfig()`. Actualiza `glbUrl`, `glbKey`, `status='READY'`. En error → `status='FAILED'` y rethrow.
- Registrarlo en el mapa `handlers` (import en `apps/worker/src/index.ts`, igual que `product-asset:remove-bg`).

## 4. API (`ExternalModuleController`)
- `GET  products/:productId/case-model` → devuelve el `CaseModel3D` del producto (o null).
- `POST products/:productId/case-model/upload` (multipart, campo file `.glb`) → sube a R2 (`case-models/{productId}/upload-{uuid}.glb`, `model/gltf-binary`), upsert `CaseModel3D` (unique por productId): `source='UPLOAD'`, `glbUrl`, `glbKey`, `status='READY'`, `sourcePhotos=[]`. Validar extensión `.glb`/`.gltf` y mimetype tolerante.
- `POST products/:productId/case-model/tripo` (multipart, hasta 4 archivos de imagen, campo `photos` con `req.files()`) → sube cada foto a R2 (`case-photos/{productId}/{uuid}.ext`), upsert `CaseModel3D` con `source='TRIPO'`, `sourcePhotos=[urls]`, `status='PENDING'`, `glbUrl=null`; luego `enqueueJob('case-model:tripo', {caseModelId})`. Requiere entre 1 y 4 fotos.
- `DELETE case-model/:id` → borra fila; best-effort borrar objetos R2 (`glbKey` y las `sourcePhotos` que sean de nuestro bucket).
Auth normal, `jsonSafe`, audit con `entityType:'CaseModel3D'`. Mirrorear el multipart de assets/upload ya hecho en el mismo controller.

## 5. UI: tab "Modelo 3D" en `ModuloExternoView`
- Agregar tab `'modelo3d'` (sin romper las existentes: conexiones/imagenes/plantillas/layout/almacenamiento).
- Selector de producto (reusar `GET /products` + filtro, igual que la tab Imágenes).
- Al elegir: `GET /external-module/products/:id/case-model`.
  - Si hay `glbUrl` y status READY → **preview** con `<model-viewer src={glbUrl} camera-controls auto-rotate>` (cargar el web component con `await import('@google/model-viewer')` en un `useEffect` client-side; declarar el custom element para TS). Mostrar estado con `Pill` (PENDING/READY/FAILED) y la fuente.
  - Acciones: **Subir GLB** (input file `.glb` → POST upload), **Generar con Tripo** (inputs para 1–4 fotos → POST tripo multipart), **Borrar**.
- Loading/error/refresh con componentes compartidos; botones `btn-dark`/`btn-ghost`/`btn-sm`; Alert tone `'error'|'ok'|'info'`.
- Agregar `@google/model-viewer` a `apps/web/package.json` (dep npm normal; NO es workspace, no toca Dockerfiles). Correr install lo hago yo.
- **Cuidado con el encoding: archivos en UTF-8 válido** (acentos correctos, sin bytes Latin-1).

## Verificación (obligatoria)
1. `pnpm db:generate` ok.
2. Revisar la migración: comillas, sin duplicados, timestamp correcto.
3. `pnpm build` verde (puede fallar solo el build Next por `spawn EPERM` en el sandbox; lo corro yo). Asegurar typecheck de providers/worker/api/web/contracts.
NO commit / NO push. Resumen: archivos, endpoints, nombre de migración, dep npm agregada, pendientes de verificar afuera.
