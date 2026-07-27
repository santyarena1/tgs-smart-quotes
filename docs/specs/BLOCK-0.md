# BLOCK-0 — Fundaciones (spec autoritativa para Codex)

> Leé antes `docs/BUILD_PLAN.md` (invariantes NO negociables). Este documento especifica el Bloque 0
> campo por campo. Implementá EXACTAMENTE esto. Donde diga "puro" = sin I/O ni dependencias de red.
> Idioma español, ARS, TZ America/Argentina/Buenos_Aires, dinero en centavos `BigInt`, markup en `bps`.

## Objetivo del bloque
Dejar la base sobre la que se construye todo: (A) schema Prisma completo + migración + seed; (B) packages
puros `contracts`, `validation`, `pricing`, `config`; (C) autenticación **real y segura**; (D) módulo
**Settings** totalmente configurable desde la UI, incluida IA con key cifrada y test-connection.
NO construir aún: productos/presupuestos/PDF/IA/extensión (solo lo mínimo que auth y settings requieren).

---

## A. Prisma schema (AUTORITATIVO — reemplazar `packages/database/prisma/schema.prisma`)

Requisitos generales:
- `provider = postgresql`. Habilitar extensión `pg_trgm` vía migración SQL (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`).
- Todos los importes de dinero: `BigInt` (centavos). Markups: `Int` (bps).
- Todas las entidades con `createdAt`. Las mutables con `updatedAt`.
- Índices GIN trigram sobre columnas de búsqueda (se agregan por SQL crudo en la migración; ver sección A.2).

### A.1 Enums
```prisma
enum QuoteState { BORRADOR ENVIADO ACEPTADO RECHAZADO REEMPLAZADO NO_CONCRETADO }
enum RequestState { PENDIENTE EN_PREPARACION LISTA ENVIADA CERRADA }
enum PdfKind { SIMPLE DETALLADO }
enum PcConcept { CPU MOTHERBOARD GPU OTHER }
enum FieldOverride { HEREDAR MOSTRAR OCULTAR }
enum SendAttemptStatus { PENDIENTE CONFIRMADO_AUTO CONFIRMADO_MANUAL NO_ENVIADO AMBIGUO }
enum AiTaskType { REQUEST_ANALYSIS COMPATIBILITY RESPONSE_SUGGESTION SEMANTIC_SIMILARITY }
enum SuggestionTone { AMIGABLE INTERMEDIO TECNICO }
enum StatusEventType {
  SOLICITUD_CREADA SOLICITUD_ASIGNADA ANALISIS_IA PRESUPUESTO_CREADO VERSION_CREADA
  PRECIOS_ACTUALIZADOS PDF_GENERADO MENSAJE_PREPARADO ENVIO_DETECTADO ENVIO_CONFIRMADO_MANUAL
  ACEPTACION RECHAZO REEMPLAZO NO_CONCRETADO CAMBIO_ESTADO CLIENTE_CREADO PRODUCTO_MODIFICADO
  COLECCION_MODIFICADA COSTO_AJUSTADO TOTAL_AJUSTADO
}
```

### A.2 Modelos

**Auth**
- `User { id uuid pk; username String @unique; passwordHash String; displayName String?; active Boolean=true; createdAt; lastAccessAt DateTime? }`
- `Session { id uuid pk; tokenHash String @unique; userId fk→User cascade; expiresAt DateTime; renewedAt DateTime=now; createdAt; ip String?; userAgent String?; @@index([userId,expiresAt]) }`
- `LoginAttempt { id uuid pk; username String; ip String?; success Boolean; createdAt; @@index([username,createdAt]) @@index([ip,createdAt]) }`

**Productos / líneas**
- `Product { id uuid pk; name String; normalizedName String; costCents BigInt; salePriceCents BigInt; markupBps Int; usesGeneralMarkup Boolean=true; defaultLineId String?; active Boolean=true; createdAt; updatedAt; updatedById fk→User; history ProductPriceHistory[]; items QuoteItem[]; defaultLine PcLine?; @@index([normalizedName]) @@index([active]) }`
- `ProductPriceHistory { id uuid pk; productId fk→Product cascade; costCents BigInt; salePriceCents BigInt; markupBps Int; reason String?; changedById String; createdAt; @@index([productId,createdAt]) }`
- `PcLine { id uuid pk; name String @unique; sortOrder Int; active Boolean=true; aliases String[]; keyLine Boolean=false; concept PcConcept=OTHER; products Product[]; items QuoteItem[] }`

**Clientes / solicitudes**
- `Customer { id uuid pk; name String; normalizedName String; phone String?; normalizedPhone String?; dni String?; createdAt; updatedAt; requests QuoteRequest[]; families QuoteFamily[]; @@index([normalizedName]) @@index([normalizedPhone]) @@index([dni]) }`
- `QuoteRequest { id uuid pk; title String; originalText String @default(""); internalNotes String @default(""); customerId String?; customer Customer?; detectedPhone String?; maximumBudgetCents BigInt?; expectedUse String?; requiredComponents String[]; creatorId String; assigneeId String?; state RequestState=PENDIENTE; createdAt; updatedAt; families QuoteFamily[]; analyses AiRequest[]; @@index([state,createdAt]) }`

**Presupuestos (familia/versión/ítem)**
- `QuoteFamily { id uuid pk; visibleNumber String @unique; internalName String; requestId String?; request QuoteRequest?; customerId String?; customer Customer?; isBuiltPc Boolean=false; activeVersion Int=1; createdAt; updatedAt; versions QuoteVersion[]; collections CollectionQuote[]; @@index([internalName]) }`
- `QuoteVersion { id uuid pk; familyId fk→QuoteFamily cascade; version Int; state QuoteState=BORRADOR; creatorId fk→User; reason String?; totalCostCents BigInt; totalSaleCents BigInt; profitCents BigInt; effectiveMarkupBps Int; publicObservation String?; resolvedPdfConfig Json; financingSnapshot Json?; sentMessage String?; sentAt DateTime?; lastActivityAt DateTime?; createdAt; items QuoteItem[]; pdfs QuotePdf[]; attempts QuoteSendAttempt[]; deliveries QuoteDelivery[]; @@unique([familyId,version]) @@index([state,sentAt]) @@index([state,lastActivityAt]) }`
- `QuoteItem { id uuid pk; versionId fk→QuoteVersion cascade; productId String?; product Product?; frozenName String; lineId String?; line PcLine?; quantity Int; frozenCostCents BigInt; frozenMarkupBps Int; frozenSalePriceCents BigInt; subtotalCents BigInt; masterPriceAt DateTime?; position Int; observation String?; @@index([productId]) @@index([versionId,position]) }`

**PDF / envío / entrega**
- `QuotePdf { id uuid pk; versionId fk→QuoteVersion cascade; kind PdfKind; storageKey String; sha256 String; sizeBytes Int; createdAt; @@unique([versionId,kind]) }`
- `QuoteSendAttempt { id uuid pk; versionId fk→QuoteVersion; chatPhone String?; message String; pdfName String?; status SendAttemptStatus=PENDIENTE; confidence Int?; createdAt; resolvedAt DateTime?; @@index([status,createdAt]) }`
- `QuoteDelivery { id uuid pk; versionId fk→QuoteVersion; customerId String?; chatPhone String?; message String?; pdfKind PdfKind?; deliveredAt DateTime=now; userId String?; createdAt }` (registro confirmado del envío efectivo)

**Trazabilidad**
- `QuoteStatusEvent { id uuid pk; type StatusEventType; familyId String?; versionId String?; requestId String?; customerId String?; userId String?; previous Json?; next Json?; metadata Json?; createdAt; @@index([familyId,createdAt]) @@index([requestId,createdAt]) @@index([customerId,createdAt]) }`

**Colecciones**
- `Collection { id uuid pk; name String @unique; description String?; sortOrder Int=0; icon String?; archived Boolean=false; favorite Boolean=false; visibleInExtension Boolean=true; quotes CollectionQuote[] }`
- `CollectionQuote { collectionId fk→Collection cascade; familyId fk→QuoteFamily cascade; sortOrder Int=0; @@id([collectionId,familyId]) }`

**Financiación** (sin coeficientes hardcodeados; todo aquí)
- `FinancingPlan { id uuid pk; label String; bank String; installments Int; coefficientBps Int; interestFree Boolean=false; appliesOn String; note String?; commercialText String?; active Boolean=true; sortOrder Int=0; createdAt; updatedAt }`
  - `coefficientBps`: multiplicador sobre el precio base en bps (10000 = ×1.0). `appliesOn`: "LISTA" | "EFECTIVO" | "BASE".

**Settings (singletons: una sola fila, id fijo "singleton")**
- `CompanySettings { id String @id @default("singleton"); logoUrl String?; name String; taxCondition String; cuit String; grossIncome String; activityStart String; address String; phones String; footerText String; rmaUrl String; primaryColor String; accentColor String; updatedAt }`
- `PdfSettings { id String @id @default("singleton"); showListPrice Boolean=true; showCashTransfer Boolean=true; showFinancing Boolean=true; showBbva Boolean=true; showOtherBanks Boolean=true; showFinancingNote Boolean=true; showTaxData Boolean=true; showServicesBlock Boolean=true; showWindows Boolean=true; showDrivers Boolean=true; showDelay Boolean=true; showRma Boolean=true; showExtraObservation Boolean=false; showIndividualPrices Boolean=true; showComponentDetail Boolean=true; builtPcTitle String; builtPcDescription String; assemblyText String; installText String; windowsText String; driversText String; estimatedDelay String; lineOrder Json; updatedAt }`
- `AiSettings { id String @id @default("singleton"); enabled Boolean=false; model String @default("gpt-5.2"); apiKeyEncrypted String?; analysisEnabled Boolean=true; similarityEnabled Boolean=true; compatibilityEnabled Boolean=true; responsesEnabled Boolean=true; ambiguousSimilarityAi Boolean=false; monthlyBudgetUsdCents BigInt?; generalMarkupBps Int @default(3000); productSimilarityThreshold Int @default(70); frequentSupportThreshold Int @default(3); updatedAt }`
  - Nota: `generalMarkupBps`, umbrales de similitud y soporte van acá para no hardcodear. (Sí, viven en el mismo singleton de settings del sistema; nombre del modelo `AiSettings` es histórico, pero contiene también estos parámetros generales.)

**IA (persistencia + cache)**
- `AiRequest { id uuid pk; task AiTaskType; model String; inputHash String; entityType String?; entityId String?; requestId String?; request QuoteRequest?; success Boolean; error String?; durationMs Int?; usageJson Json?; resultJson Json?; createdAt; @@index([task,inputHash]) @@index([entityType,entityId]) }`
- `AiSuggestion { id uuid pk; entityType String; entityId String; tone SuggestionTone?; text String; usedText String?; model String; inputHash String; createdAt; @@index([entityType,entityId]) }`
- `SimilarityCache { id uuid pk; sourceType String; sourceId String; inputHash String; resultJson Json; createdAt; @@unique([sourceType,sourceId,inputHash]) }`

**Notificaciones / auditoría**
- `Notification { id uuid pk; userId String?; chatPhone String?; type String; title String; body String; entityType String?; entityId String?; readAt DateTime?; createdAt; @@index([userId,readAt,createdAt]) @@index([chatPhone,createdAt]) }`
- `AuditLog { id uuid pk; userId String?; user User?; entityType String; entityId String; action String; previous Json?; next Json?; metadata Json?; createdAt; @@index([entityType,entityId,createdAt]) @@index([userId,createdAt]) }`

Relaciones inversas necesarias en `User` (sessions, products, versions, audits) y `PcLine`/`Customer`/etc.
como implica lo anterior. Agregá los back-relations que Prisma exija.

### A.2 Migración SQL adicional (dentro de la migración inicial)
- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- Índices GIN trigram:
  - `Product.normalizedName`, `Customer.normalizedName`, `Customer.normalizedPhone`,
  - `QuoteFamily.internalName`, `QuoteItem.frozenName`, `QuoteRequest.originalText`.
- Documentá en `docs/DATABASE.md` cada índice y su propósito.

### A.3 Seed (`packages/database` seed script)
- Usuario admin desde `ADMIN_USERNAME`/`ADMIN_PASSWORD` (env), passwordHash argon2id. Idempotente (upsert).
- `CompanySettings`, `PdfSettings`, `AiSettings` singletons con **placeholders realistas de The Gamer Shop**
  (nombre "The Gamer Shop", condición fiscal/CUIT/domicilio de ejemplo claramente marcados como EDITAR).
- `PcLine` inicial ordenada: Procesador, Motherboard, Memoria RAM, Placa de video, Disco SSD, Disco HDD,
  Fuente de poder, Gabinete, Refrigeración, Otros. Marcar keyLine + concept en CPU/MOTHERBOARD/GPU.
- `FinancingPlan` de ejemplo: Efectivo/Transferencia, BBVA 3, BBVA 6, Otros bancos 3/6/12 (coeficientes de
  ejemplo editables, `interestFree` donde corresponda). Sin hardcodear en código: solo seed de datos.
- Colecciones de ejemplo: PROMOS ACTIVAS, PC GAMER, PC OFICINA (favorita las que tenga sentido).

---

## B. Packages puros (sin I/O)

### B.1 `packages/pricing`
Funciones exportadas y testeadas (Vitest), todo en enteros:
- `saleFromCost(costCents: bigint, markupBps: number): bigint`
- `markupFromPrices(costCents: bigint, saleCents: bigint): number`
- `profitCents(costCents, saleCents): bigint`
- `applyToItem` helpers para las 3 reglas bidireccionales del README §6 (cambia costo / cambia markup / cambia venta).
- `totals(items): { costCents, saleCents, profitCents, effectiveMarkupBps }`
- `retarget(items, targetTotalCents)`: implementa §17 con reparto determinístico del residuo y validaciones;
  devuelve nuevos markups/ventas por ítem + preview + error tipado si inválido. **Nunca floats**: hacer la
  proporción con math entera (multiplicar antes de dividir, redondeo bankers o half-up consistente y documentado).
- Tests unitarios exhaustivos: costo→venta, venta→markup, markup general, total objetivo, redondeos, residuos.

### B.2 `packages/validation`
- `normalizeText(s)`: minúsculas, sin tildes, colapsar espacios, quitar signos redundantes (conservar números/modelos).
- `normalizePhone(s)`: versión canónica AR (solo dígitos, normalización de prefijos) + preservar visible aparte.
- `trigramSimilarity(a,b)` determinística + `wordOverlap` + extracción de `numbers/models` del nombre.
- `productSimilarity(a,b): number` (0..100) combinando lo anterior según README §7. Tests unitarios.

### B.3 `packages/contracts` (Zod, única fuente de tipos de dominio)
- Esquemas de entrada/salida para auth, settings, products, customers, requests, quotes, items, collections,
  financing (los que el Bloque 0 necesita: auth + settings completos; el resto puede stubearse mínimamente y
  completarse en bloques siguientes). Derivar tipos con `z.infer`. Exportar todo desde el índice.

### B.4 `packages/config`
- Carga tipada de env (Zod): `DATABASE_URL`, `PORT`, `APP_ORIGIN`, `SESSION_TTL_DAYS`, `ADMIN_USERNAME`,
  `ADMIN_PASSWORD`, `SETTINGS_ENC_KEY` (32 bytes base64/hex), `OPENAI_API_KEY?`, storage vars, etc.
- **Cifrado de secretos**: `encryptSecret(plain)` / `decryptSecret(cipher)` con **AES-256-GCM** usando
  `SETTINGS_ENC_KEY`. Formato de salida: `iv:tag:ciphertext` en base64. `maskSecret(plain)` → `sk-••••1234`.
  Tests unitarios de round-trip y de que el ciphertext no contiene el plano.

---

## C. Autenticación real (NestJS, apps/api)

Reescribir por completo el auth del scaffold. **Eliminar `CoreService.actor()` basado en `findFirst`.**

- `POST /api/auth/login { username, password }`:
  - Rate-limit + **lockout fuerza bruta**: contar `LoginAttempt` fallidos por username/IP en ventana
    configurable (p.ej. 5 en 15 min → bloquear). Registrar cada intento (success/fail) en `LoginAttempt`.
  - Verificar argon2id. Si ok: crear `Session` (token 32 bytes; guardar sha256; `expiresAt = now + SESSION_TTL_DAYS`).
    Setear cookie **HttpOnly, Secure, SameSite=Lax, path=/**, valor = token en claro (solo viaja en cookie).
    Actualizar `lastAccessAt`. Auditar LOGIN.
  - Respuesta: `{ user: { id, username, displayName } }` (nunca el hash).
- `AuthGuard` global: lee cookie, hashea, busca sesión válida (no expirada), inyecta `req.user`.
  **Renovación deslizante**: si falta < X% para expirar, extender `expiresAt` y `renewedAt`. 401 si inválida.
- `POST /api/auth/logout`: borra la sesión de la cookie y limpia la cookie. Auditar LOGOUT.
- `GET /api/auth/me`: devuelve el usuario de la sesión.
- Decorador `@CurrentUser()` para obtener el actor real en cada handler. Todos los endpoints (salvo login y
  `/api/health`) requieren sesión válida.
- `ValidationPipe` global con los esquemas Zod de `contracts` (o pipe Zod propio). Rate limiting global
  (p.ej. @nestjs/throttler) configurable por env.
- Manejo centralizado de errores → JSON `{ error, message }` en español, sin filtrar datos sensibles. Logs estructurados.

## D. Módulo Settings (configurable desde UI)

Endpoints (todos autenticados) que leen/escriben los 3 singletons + financiación:
- `GET/PUT /api/settings/company`
- `GET/PUT /api/settings/pdf`
- `GET/PUT /api/settings/ai`  → al guardar `apiKey` (campo de entrada `apiKey?`), cifrar con `encryptSecret`
  y guardar en `apiKeyEncrypted`. **Nunca** devolver la key; devolver solo `apiKeyMasked` (o `null`) y `hasKey: boolean`.
- `POST /api/settings/ai/test-connection`: usa la key efectiva (settings desc. → o `OPENAI_API_KEY` env),
  hace un ping mínimo al modelo configurado y devuelve `{ ok, model, error? }`. No persiste nada. No bloquea si falla.
- `GET/POST/PUT/DELETE /api/financing` (planes CRUD, ordenables).
- Toda escritura → `AuditLog`. Validación Zod. Errores en español.

## E. Verificación de salida (Codex debe correr y reportar)
1. `pnpm install` (si cambian deps) · `pnpm db:generate` · `pnpm db:migrate` (crea la extensión pg_trgm) · `pnpm db:seed`.
2. `pnpm typecheck` verde en todo el monorepo.
3. `pnpm test` verde: pricing (incl. total objetivo/redondeos), validation (similitud/normalización),
   config (cifrado round-trip), auth (login/lockout/guard/renovación con test de integración usando DB de test).
4. `pnpm build` verde.
5. Reportar: archivos creados/modificados, resultado de cada comando, y cualquier decisión menor tomada
   (documentarla en `docs/DECISIONS.md`). NO marcar terminado con tests rojos, typecheck roto o migración pendiente.

## F. Fuera de alcance del Bloque 0
Productos/import/duplicados, presupuestos/versiones, PDF real, servicios IA, búsqueda avanzada, dashboard,
web UI de negocio, extensión. Dejar sus contratos mínimos si hace falta para compilar, pero SIN implementar lógica.
