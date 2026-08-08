# BLOCK-0 — Fundación de configuración del Módulo Externo (Conexiones)

> Orden de construcción para Codex. Objetivo: un singleton `ExternalModuleConfig` que guarda credenciales cifradas de proveedores + WordPress, endpoints para leer (enmascarado), guardar (cifrado) y testear conexión, y una sub-tab **Conexiones** dentro de la vista del Módulo Externo para cargar/guardar/testear las keys.
>
> **Idioma español, ARS, dinero en centavos.** No romper nada existente. Mirrorear patrones ya presentes en el repo (citados abajo). No inventar reglas de negocio.

## Alcance (SOLO esto en este bloque)

1. Modelo Prisma `ExternalModuleConfig` (singleton) + migración SQL + seed + `prisma generate`.
2. Schema en `@tgs/contracts` para input/response de la config.
3. Endpoints en `SettingsController` (`apps/api/src/settings.ts`): GET / PUT / POST test.
4. Frontend: sub-tabs internas en `ModuloExternoView` con la tab **Conexiones** funcional; placeholders para "Plantillas", "Layout de landing", "Almacenamiento".

NO incluir en este bloque: pipeline de imágenes/3D/miniatura, plugin WP, jobs. Solo la base de configuración.

## Patrones a mirrorear (leer antes de construir)

- **Cifrado de secretos + máscara**: cómo `AiSettings` guarda la OpenAI key. Ver `apps/api/src/settings.ts` (endpoints `ai`), `@tgs/config` `encryptSecret` / `decryptSecret` / `maskSecret`. Guardar ciphertext; nunca devolver el secreto en claro; enmascarar en GET.
- **Toggle existente**: `GET/PUT /settings/external-module` ya existe en `SettingsController` (es el on/off del módulo). NO tocarlo; este bloque agrega `/settings/external-module/config`.
- **Contracts**: mirar `operationsSettingsInputSchema` / `aiSettingsInputSchema` en `packages/contracts/src/index.ts` (zod `.strict()`, tipos exportados con `z.infer`).
- **Migración singleton**: mirar `packages/database/prisma/migrations/20260807210000_external_module/migration.sql` (CREATE TABLE + INSERT singleton ON CONFLICT DO NOTHING).
- **Frontend**: `ModuloExternoView.tsx` (vista actual placeholder). Componentes compartidos en `components/shared.tsx`: `Tabs`, `Field`, `Alert`, `Pill`, `PageHeader`, `Loading`. Cliente HTTP: `lib/api.ts` (`api<T>(path, {method, body})`).

## 1. Modelo `ExternalModuleConfig`

Singleton `id = 'singleton'`. Campos:

Secretos (guardar **ciphertext** vía `encryptSecret`, nullable):
- `photoroomKeyEnc`, `tripoKeyEnc`, `higgsfieldKeyEnc`, `higgsfieldSecretEnc`, `serperKeyEnc`, `r2SecretAccessKeyEnc`, `wpHmacSecretEnc`

No secretos (texto plano, nullable):
- `r2Endpoint`, `r2Bucket`, `r2AccessKeyId`, `r2PublicBaseUrl`
- `wpBaseUrl` (default `'https://www.thegamershop.com.ar'`)

Flags:
- `autoRepublish` Boolean default `true`
- `updatedAt` DateTime `@default(now()) @updatedAt`

Migración en `packages/database/prisma/migrations/<timestamp>_external_module_config/migration.sql` + `INSERT ... ('singleton') ON CONFLICT DO NOTHING`. Agregar upsert en `prisma/seed.ts` (mirar cómo se seedean `operationsSettings`/`aiSettings`). Correr `pnpm db:generate`.

## 2. Contracts (`packages/contracts/src/index.ts`)

`externalModuleConfigInputSchema` (`.strict()`), todos los campos **opcionales**:
- Secretos como `string` opcional: `""`/omitido = **no cambiar**; valor especial `null` o flag `clearX: true` = **borrar**. Elegir el mismo mecanismo que usa AiSettings para limpiar la key (`clearKey`) y replicarlo por secreto (p. ej. `clearPhotoroomKey?: boolean`).
- No secretos: strings opcionales, `wpBaseUrl` validado como URL.
- `autoRepublish?: boolean`.

Exportar tipo `ExternalModuleConfigInput = z.infer<...>`.

Tipo de **response** (no schema de input): `ExternalModuleConfigView` con:
- campos no-secretos en claro,
- por cada secreto un booleano `xxxSet: boolean` (si hay valor guardado) — **nunca** el secreto ni el ciphertext,
- `autoRepublish`, `updatedAt`.

## 3. API (`apps/api/src/settings.ts`, dentro de `SettingsController`)

- `GET  external-module/config` → devuelve `ExternalModuleConfigView` (upsert-safe: si no existe fila, devolver defaults con todos los `*Set=false`).
- `PUT  external-module/config` → `@Body(ZodPipe(externalModuleConfigInputSchema))`. Para cada secreto: si viene `clearX` → set null; si viene string no vacío → `encryptSecret`; si vacío/omitido → dejar como está. Upsert del singleton. Auditar con el helper `audit(...)` existente (`entityType: 'ExternalModuleConfig'`). Devolver `ExternalModuleConfigView`.
- `POST external-module/config/test/:provider` (`provider` ∈ `photoroom|tripo|higgsfield|serper|r2|wordpress`) → hace una verificación liviana de credenciales y devuelve `{ ok: boolean, detail?: string }`.
  - Implementar real y mínimo: **serper** (POST search de prueba), **photoroom** (llamada de cuenta/ping), **wordpress** (GET a `wpBaseUrl/wp-json`). 
  - **tripo**, **higgsfield**, **r2**: dejar stub que devuelva `{ ok:false, detail:'Test no implementado aún' }` (no romper). Usar la key **guardada** (desencriptada), no la del body.

## 4. Frontend (`apps/web/components/ModuloExternoView.tsx`)

Reemplazar el placeholder por una vista con `Tabs` internas:
- `conexiones` (funcional en este bloque), `plantillas`, `layout`, `almacenamiento` (estos tres = placeholder "En construcción").

Tab **Conexiones**: cargar `GET /settings/external-module/config`. Form agrupado por proveedor (Photoroom, Tripo, Higgsfield, Serper, Cloudflare R2, WordPress). Para cada secreto: input `password`; si `xxxSet` es true mostrar placeholder tipo "•••• guardada" y un checkbox/botón "Borrar". Campos no-secretos como inputs normales. Botón **Guardar** (PUT). Botón **Probar** por proveedor (POST test) mostrando resultado con `Alert`/`Pill`. Manejo de loading/error con los componentes compartidos.

## Verificación (obligatoria antes de terminar)

1. `pnpm db:generate` ok.
2. `pnpm build` **verde** (turbo, todos los paquetes) — typecheck de web y api incluidos.
3. No romper endpoints ni tipos existentes. Secretos nunca en claro en respuestas.
