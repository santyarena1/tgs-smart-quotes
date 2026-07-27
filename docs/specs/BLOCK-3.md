# BLOCK-3 — PDF, trazabilidad, precios, búsqueda, envíos, respuestas, notificaciones e IA

Este documento registra lo efectivamente implementado en este bloque (no es un plan previo). Sigue el
estilo de `docs/specs/BLOCK-2.md` pero describe el estado final del código en
`apps/api/src`, `packages/contracts`, `packages/testing` y `packages/database`.

## Endpoints entregados

### PDF (`apps/api/src/pdf.ts`)

- `POST /quotes/:id/pdf` `{kind, force?}`: genera el PDF con `@tgs/pdf` (Chromium vía Playwright),
  lo persiste en el storage configurado (`PDF_STORAGE_DRIVER=local|s3`) y crea/actualiza el registro
  `QuotePdf` (`versionId_kind` único). Emite `PDF_GENERADO` solo cuando se genera contenido nuevo.
  - Si ya existe un PDF con el mismo `inputHash` y `!force`, se reutiliza (`reused:true`) sin volver
    a renderizar ni crear un nuevo evento.
  - Si la versión activa **no** es `BORRADOR` (ya fue enviada/aceptada/etc.), el PDF existente se
    considera histórico e inmutable: se reutiliza siempre, incluso con `force:true`
    (`reused:true, immutable:true`), para no alterar lo que el cliente ya recibió.
- `GET /quotes/:id/pdf/:kind`: descarga el binario desde el storage configurado y lo devuelve con
  `Content-Type: application/pdf` (Fastify `res.header` + `res.send(buffer)`).
- `buildRenderInput` arma el `PdfRenderInput`: carga `CompanySettings`, `PdfSettings`,
  `FinancingPlan[]` activos, resuelve overrides (`resolvedPdfConfig` de la versión) y construye los
  ítems: en PC armada (`isPcMainLine`) se genera una línea principal con precio total y componentes
  como líneas sin precio individual (`isComponent:true`).
  - `cashTotalCents` = `totalSaleCents` de la versión (pago de contado).
  - `listTotalCents`: si hay un plan de financiación activo, se usa su snapshot/coeficiente sobre el
    total; si no hay financiación configurada, `list === cash` (documentado inline en el código,
    ver comentario en `buildRenderInput`).

### Trazabilidad (`apps/api/src/quotes.ts`)

- `GET /quotes/:id/timeline`: devuelve `events` (`QuoteStatusEvent` ordenados ascendente por
  `createdAt`), `attempts` (`QuoteSendAttempt`) y `deliveries` (`QuoteDelivery`) de toda la familia,
  para reconstruir el historial completo de un presupuesto (creación, cambios de estado, intentos de
  envío, confirmaciones, reemplazos, reactivaciones, etc.).

### Precios (`apps/api/src/quotes.ts`)

- `POST /quotes/:id/prices` (`quotePricesUpdateSchema`, modos `all` o lista de `itemIds`): solo sobre
  versión `BORRADOR` (usa `assertDraftMutable`). Para cada ítem con `productId`, relee el producto
  maestro, recalcula costo/venta con `@tgs/pricing` y actualiza el ítem congelado.
  - `updateMaster:true` además persiste `masterCostCents`/`masterSaleCents`/`masterPriceAt` en el
    ítem como timestamp de sincronización (la dirección principal del dato sigue siendo
    maestro → ítem; no se escribe de vuelta al `Product`).
  - Emite `PRECIOS_ACTUALIZADOS` siempre que cambie algún ítem, y `COSTO_AJUSTADO` cuando el costo
    total de la versión varía, con el detalle de ítems afectados en `metadata`.

### Reactivación (`apps/api/src/quotes.ts`)

- `POST /quotes/:id/reactivate` (`quoteReactivateSchema`): solo permitido si la versión activa está
  en `NO_CONCRETADO` o `RECHAZADO`. Crea una **nueva versión `BORRADOR`** (copiando ítems y config,
  igual que `createVersion`) y marca la versión anterior con `reactivatedAt` para preservar su
  inmutabilidad histórica. Emite evento `REACTIVADO` en la familia.

### Envíos (`apps/api/src/quotes.ts`)

- `POST /quotes/:id/send-attempts` (`sendAttemptCreateSchema`): crea `QuoteSendAttempt` asociado a la
  versión activa y emite `ENVIO_DETECTADO`.
- `POST /quotes/:id/send-attempts/:attemptId/resolve` (`sendAttemptResolveSchema`):
  - Si `status` es `CONFIRMADO_AUTO`/`CONFIRMADO_MANUAL` y `createDelivery` (default `true`), crea
    `QuoteDelivery`, transiciona la versión a `ENVIADO` vía `transitionVersionState` (que marca
    cualquier versión previamente `ENVIADO` de la familia como     `REEMPLAZADO` y emite `REEMPLAZO`) y registra `ENVIO_CONFIRMADO_MANUAL` (evento genérico de
    transición a `ENVIADO`, ver `eventTypeForState`).
  - Si `status` es `AMBIGUO`, no crea entrega, emite `REVISION_REQUERIDA` y genera una
    `Notification` (`ENVIO_AMBIGUO`) para revisión manual.
  - Si `status` es `DESCARTADO`, emite `ENVIO_DESCARTADO` sin tocar el estado de la versión.

### Respuestas (`apps/api/src/quotes.ts`)

- `POST /quotes/:id/replies` (`quoteReplyCreateSchema`): registra `QuoteReply` (texto, intención,
  canal). Si el body incluye `applyState`, aplica la transición explícita con
  `transitionVersionState` (nunca automática a partir de la sola intención detectada) y emite el
  evento correspondiente (p. ej. `ACEPTACION` al pasar a `ACEPTADO`).

### Búsqueda (`apps/api/src/search.ts`)

- `GET /quotes/search` (`quoteSearchSchema`): controller separado `@Controller('quotes/search')`
  registrado **antes** de `QuotesController` en `module.ts` para que Nest no lo confunda con
  `GET /quotes/:id`. Soporta filtros por `customerId`, `state`, `isBuiltPc`, `collectionId`,
  `visibleNumber`, rango de `createdAt`, texto libre `q` (nombre, cliente, ítems), `productName` y
  `phone` (normalizado con `normalizeText`/`normalizePhone`), orden por `createdAt`,
  `visibleNumber`, `totalSaleCents`, `state` o `lastActivityAt`, y paginación `page`/`pageSize`.

### Configuración operativa (`apps/api/src/settings.ts`)

- `GET /settings/operations`: devuelve el singleton `OperationsSettings`.
- `PUT /settings/operations` (`operationsSettingsInputSchema`): actualiza el singleton y audita el
  cambio (`AuditLog`, entidad `OperationsSettings`).

### Notificaciones (`apps/api/src/notifications.ts`)

- `GET /notifications` (`notificationListQuerySchema`): lista notificaciones del usuario actual (o
  globales), con filtros opcionales `unread` y `chatPhone`.
- `POST /notifications/:id/mark` (`notificationMarkSchema`): marca una notificación como leída y/o
  actuada (`readAt`/`actedAt`).

### IA (`apps/api/src/ai.ts`, opcional/mejor esfuerzo)

- `POST /requests/:id/ai/analyze`: analiza el texto original de una `QuoteRequest` con `@tgs/ai`.
- `POST /quotes/:id/ai/compatibility`, `POST /quotes/:id/ai/suggest-response`,
  `POST /quotes/:id/ai/intent`: wiring básico sobre `@tgs/ai`, con caché en `AiRequest` para las
  tareas persistibles en Prisma (`PERSISTABLE_TASKS`); `INTENT_CLASSIFICATION` no se persiste porque
  no existe en el enum `AiTaskType` de la base de datos, solo se cachea en memoria/proceso.
  - Requiere `AiSettings` con proveedor configurado; si no hay API key o el feature flag está
    apagado, responde con el fallback documentado en `@tgs/ai` sin romper la request.

## Dependencias y configuración

- `apps/api/package.json`: se agregaron `@tgs/pdf` y `@tgs/ai` como `workspace:*`.
- `packages/contracts/src/index.ts`: se agregaron/exportaron `pdfGenerateSchema`,
  `quotePricesUpdateSchema`, `quoteReactivateSchema`, `sendAttemptCreateSchema`,
  `sendAttemptResolveSchema`, `quoteReplyCreateSchema`, `quoteSearchSchema`,
  `notificationListQuerySchema`, `notificationMarkSchema`, `operationsSettingsInputSchema`,
  `aiAnalyzeRequestSchema`, `aiSuggestResponseSchema`, `aiCompatibilitySchema`, `aiIntentSchema` y
  sus tipos inferidos (`AiAnalyzeRequestInput`, `AiSuggestResponseInput`, `AiCompatibilityInput`,
  `AiIntentInput`, etc.).
- `packages/testing/src/index.ts`: `seedBaseline` ahora asegura el singleton `OperationsSettings`
  (`upsert` sin pisar valores existentes). `OperationsSettings` fue **excluido** de la lista
  `TABLES` que `resetDatabase` trunca, porque es configuración persistente tipo singleton (igual
  que `CompanySettings`/`PdfSettings`/`AiSettings`), no un dato transaccional de prueba.
- `packages/database/prisma/seed.ts`: agrega el `upsert` de `OperationsSettings` para que el
  singleton exista siempre en entornos reales tras el seed de producción.
- `module.ts`: registra `PdfController`, `QuoteSearchController`, `NotificationsController`,
  `QuoteAiController`, `RequestAiController` (además de los controllers ya existentes de BLOCK-2).

## Integridad y convenciones respetadas

- Dinero en `BigInt` en persistencia, serializado a string vía `jsonSafe` en las respuestas HTTP.
- Versiones `ENVIADO`/no-`BORRADOR` son inmutables (`assertDraftMutable` en `/prices`; el endpoint
  de PDF nunca re-renderiza un PDF histórico salvo que la versión activa siga en `BORRADOR`).
- Toda escritura compuesta (generar PDF + evento, resolver intento + entrega + transición, etc.) se
  hace dentro de una transacción (`db.$transaction`).
- Actor siempre resuelto desde la sesión (`@CurrentUser()`), nunca desde el body.
- `AuditLog` y `QuoteStatusEvent` se registran para toda mutación relevante; no se silencian errores.
- Validación de entrada con los esquemas Zod compartidos de `@tgs/contracts` vía `ZodPipe`.
- `transitionVersionState` (extraído de `changeState`) centraliza el reemplazo de la versión
  previamente `ENVIADO`, evitando duplicar esa lógica entre `changeState`, `resolveSendAttempt` y
  `createReply`.

## Tests

- `apps/api/src/block3.test.ts` (12 tests de integración, requieren `TEST_DATABASE_URL`; se
  saltean automáticamente si no está configurada, sin fallar silenciosamente el resto de la suite):
  1. Generación y reutilización de PDF (mismo `inputHash`) + descarga binaria real (`%PDF-` header,
     Chromium real vía Playwright).
  2. No regeneración de un PDF histórico de una versión ya `ENVIADO` aunque se pida `force:true`.
  3. Timeline con eventos, intentos y entregas.
  4. Sincronización de precios desde el catálogo maestro (`updateMaster`) y evento `COSTO_AJUSTADO`.
  5. Rechazo de `/prices` sobre una versión no-`BORRADOR`.
  6. Reactivación de un presupuesto `NO_CONCRETADO` (nueva versión `BORRADOR`, evento `REACTIVADO`).
  7. Rechazo de reactivación fuera de `NO_CONCRETADO`/`RECHAZADO`.
  8. Resolución de intento confirmado: crea entrega, pasa a `ENVIADO`, reemplaza la versión previa.
  9. Intento `AMBIGUO`: no crea entrega, genera notificación de revisión, se puede marcar como leída.
  10. Respuesta de cliente con `applyState` aplicando transición explícita.
  11. Búsqueda por texto, estado, cliente y nombre de producto.
  12. Lectura/actualización de `OperationsSettings` con auditoría.
- `pnpm --filter @tgs/api typecheck` sin errores.
- `pnpm vitest run apps/api` → 4 archivos, 39 tests, todos verdes.

## Pendiente / fuera de alcance

- No se agregaron pantallas web para estos endpoints (fuera del pedido, que era solo API).
- El endpoint de IA no incluye reintentos avanzados ni streaming; se apoya en el fallback que ya
  provee `@tgs/ai` cuando falta configuración.
