# BLOCK-8 — Fase 7: Operación (republicado automático + refactor de publish)

> Que las publicaciones se re-sincronicen solas cuando cambia el presupuesto (precios/enrichment/assets). Para eso, extraer la lógica de publish a un helper compartido y que un task del worker re-publique lo que quedó desactualizado.
>
> Español. NO romper nada. Reusa `@tgs/providers` (integración externa). Secretos nunca en logs/respuestas.

## LECCIONES DEL INCIDENTE (obligatorias)
- Sin migración nueva (probablemente). Si hiciera falta: comillas dobles, timestamp posterior a `20260809010000`, sin duplicados.
- NO paquetes de workspace nuevos. Archivos UTF-8. `pnpm build` verde. El zip del plugin debe seguir generándose.

## Alcance
1. Extraer la lógica de armado+envío de publish a `@tgs/providers/wordpress.ts` (`buildPublishPayload` + `publishQuote`), reutilizable por API y worker.
2. Refactor del endpoint `POST quotes/:v/publish` (BLOCK-6) para usar `publishQuote`.
3. Task del worker `resyncStalePublications` que re-publica lo desactualizado (auto-republish).
4. (Opcional simple) endpoint + UI para listar publicaciones y su estado.

## 1. `@tgs/providers/wordpress.ts`
`@tgs/providers` ya importa `@tgs/database` y `@tgs/config`. Agregar:
- `buildPublishPayload(quoteVersionId: string): Promise<PublishPayload>` — arma el payload EXACTAMENTE como en el endpoint actual de BLOCK-6 (precios efectivo/transferencia/lista, items con imagen principal, gallery, model3dUrl del CaseModel3D de los productos del presupuesto, thumbnailUrl si hay, enrichment: descripción/potencia/juegos/compatibilidad, y `layout` guardado o `DEFAULT_LANDING_LAYOUT`). Mové la lógica que hoy está inline en `apps/api/src/external-module.ts` a esta función (importando lo necesario). Si algo vive en la API (helpers de precio), replicá mínimamente o exponelo.
- `publishQuote(quoteVersionId: string): Promise<{ webPublication, wpResponse }>` — `buildPublishPayload`, firma HMAC con `decryptSecret(wpHmacSecretEnc)` de `ExternalModuleConfig`, `POST {wpBaseUrl}/wp-json/tgs/v1/publish`, upsert `WebPublication` (wpProductId, url, status='PUBLISHED', payloadSnapshot=payload, publishedAt). En error: `status='FAILED'`, `lastError`. Devuelve el resultado.
- Exportar ambos desde `@tgs/providers`. Nunca loguear el secreto.

> IMPORTANTE: no cambiar el comportamiento observable del endpoint; solo mover la lógica. Verificar que el endpoint siga devolviendo lo mismo.

## 2. Refactor endpoint
`POST external-module/quotes/:versionId/publish` en `external-module.ts` → llama `publishQuote(versionId)` y devuelve `jsonSafe`. `unpublish` puede quedar como está o moverse también (opcional).

## 3. Worker: `resyncStalePublications`
En `apps/worker/src` (nuevo archivo `publications.ts`):
- `resyncStalePublications(now?)`: si la config `autoRepublish` es true, para cada `WebPublication` con `status='PUBLISHED'`: `buildPublishPayload(quoteVersionId)`, comparar (JSON estable) contra `payloadSnapshot`; si difiere → `publishQuote(quoteVersionId)` (re-envía y actualiza snapshot). Contar cuántas re-sincronizó. Try/catch por publicación (una que falle no frena las demás).
- Integrar al loop del worker: agregala al `runLoop` horario existente en `apps/worker/src/index.ts` (con su try/catch y log JSON), NO al loop de jobs de 3s (esto es más pesado; horario está bien para sync de precios).

## 4. (Opcional simple) Listado de publicaciones
- `GET external-module/publications` → lista `WebPublication` (con datos del presupuesto: id, título, url, status, publishedAt). 
- UI: en la tab "Presupuesto" o una mini sección, mostrar las publicaciones existentes con link y estado, y botón republicar/despublicar. Mantenerlo simple; si suma mucho, dejarlo mínimo.

## Verificación (obligatoria)
1. `pnpm db:generate` (si tocaste schema; probablemente no).
2. `pnpm build` verde (Next puede fallar por `spawn EPERM`; lo corro yo). Typecheck providers/api/worker/web/contracts. **Importante**: verificar que el refactor no rompió el typecheck de la API.
3. Correr `node infrastructure/scripts/zip-wp-plugin.mjs` (no debería cambiar el plugin, pero confirmar).
NO commit / NO push. Resumen: archivos, qué se movió a @tgs/providers, el task del worker, y pendientes.
