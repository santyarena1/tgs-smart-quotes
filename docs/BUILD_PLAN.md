# TGS Smart Quotes — Plan Maestro de Construcción

> Documento de orquestación. **Claude diseña y especifica; Codex construye.** Este archivo es la
> fuente de verdad de las decisiones transversales y el roadmap. No contiene código; contiene
> contratos e invariantes que TODO el sistema debe respetar.

## 0. Contexto

Reconstrucción total de la sustancia del sistema. Se conserva la plomería existente (monorepo
pnpm + Turborepo, baseline Prisma, Docker, CI) y se reescribe todo lo demás desde cero según
`README.md` (spec completa del propietario) y `docs/ACCEPTANCE_CHECKLIST.md` (contrato de aceptación).

El scaffold previo de Codex era hueco (~1.200 líneas, auth falsa, PDF falso, IA stub, sin motor de
precios). Nada de ese comportamiento se reutiliza; solo la configuración de tooling.

## 1. Invariantes NO NEGOCIABLES (todo el código las respeta)

### 1.1 Dinero y números
- **Nunca floats para dinero.** Importes en **centavos enteros** (`BigInt` en Prisma, `bigint`/`number` seguro en TS).
- Markup en **basis points** (`bps`, enteros). 30% = `3000` bps. Nunca `0.30`.
- Fórmulas canónicas (única fuente en `packages/pricing`):
  - `saleFromCost(costCents, markupBps) = round(costCents * (10000 + markupBps) / 10000)`
  - `markupFromPrices(costCents, saleCents) = round((saleCents - costCents) * 10000 / costCents)` (cost>0)
  - `profit = sale - cost`
- **Total objetivo** (sección 17 del README): `factor = targetProfit / currentProfit`,
  `newMarkupItem = originalMarkupItem * factor`, luego `newSale = cost * (1 + newMarkup)`.
  Considerar cantidades. Reparto del residuo de redondeo **determinístico** (al ítem de mayor subtotal,
  orden estable por `position`). Validar: target ≥ costo total, markups ≥ 0, currentProfit ≠ 0.

### 1.2 Localización
- Idioma **español (es-AR)**. Moneda **ARS**. Zona **America/Argentina/Buenos_Aires**.
- Formatos numéricos/fecha argentinos en UI y PDF.
- **Prohibido**: "válido hasta", vencimiento, stock, proveedores, monedas extranjeras, CRM, email de cliente,
  variantes, SKU complejos, envío automático de WhatsApp, roles complejos, cualquier regla comercial no documentada.

### 1.3 Configurabilidad total (principio rector del propietario)
- **Todo lo que pueda ser configurable, va a Configuración editable desde la web.** Nada que requiera
  tocar código para funcionar: datos de empresa, colores, textos, logo, líneas de PC, planes de financiación
  y coeficientes, defaults de visibilidad del PDF, umbrales de similitud, markup general, parámetros de IA.
- **API key de OpenAI y config de IA se gestionan desde la UI de Configuración**, con botón **"Probar conexión"**.
  - La key se guarda **cifrada en reposo** (AES-256-GCM con clave maestra `SETTINGS_ENC_KEY` de entorno),
    **nunca en texto plano** en la base, y se muestra **enmascarada** en la UI (`sk-••••••1234`).
  - Fallback: si no hay key en settings, usar `OPENAI_API_KEY` de entorno.
  - Sin key configurada → IA deshabilitada pero **el sistema funciona 100% determinístico** (no bloquea nada).

### 1.4 Seguridad / Auth (real, no la del scaffold)
- Passwords con **argon2id**. Sin email, sin registro público. Todos los usuarios mismos permisos.
- Sesión: token aleatorio 32 bytes; se guarda solo su **sha256**. Cookie **HttpOnly + Secure + SameSite=Lax**.
- Expiración con **renovación deslizante**. Logout invalida la sesión. Guard valida sesión en **cada** request.
- **Protección fuerza bruta** (lockout por usuario/IP tras N intentos, configurable). Auditoría de login.
- Actor real = usuario dueño de la sesión de la cookie. **Prohibido** el patrón `findFirst({active:true})`.

### 1.5 Datos e integridad
- Sin duplicar tipos entre web/api/extensión: **contratos Zod compartidos** en `packages/contracts`.
- **Transacciones** para: guardar presupuesto, crear versión, actualizar maestro desde presupuesto,
  confirmar envío, cambios de estado relacionados.
- Snapshots de versión **inmutables**: una versión enviada nunca se modifica; cambios → nueva versión.
- **Auditoría** de acciones críticas; nunca ocultar errores de auditoría.

### 1.6 IA (cuando se use)
- Solo desde backend (nunca frontend/extensión). SDK oficial OpenAI, **Structured Outputs** con JSON Schema.
- Acción explícita del usuario; resultado **cacheado por hash de entrada**; no re-llamar si el input no cambió.
- No modifica precios/estados/presupuestos sin confirmación. No usar IA donde una regla determinística alcanza.
- Registrar: tarea, modelo, duración, éxito/error, uso/tokens, entidad, hash. No guardar razonamientos internos.

## 2. Arquitectura

Monorepo pnpm + Turborepo, TypeScript estricto.

```
apps/
  web/        Next.js (App Router) — UI interna
  api/        NestJS (Fastify) — API consumida por web y extensión, OpenAPI
  worker/     proceso independiente — no-concretado + tareas
  extension/  Chrome MV3 (React) — panel dentro de WhatsApp Web
packages/
  database/       Prisma schema + client + migraciones + seed
  contracts/      Zod schemas + tipos derivados (única fuente de tipos de dominio)
  validation/     normalización texto/teléfono, trigram, similitud determinística
  pricing/        toda la matemática de dinero (cents/bps) + total objetivo
  pdf/            plantillas HTML/CSS + render Chromium/Playwright
  ai/             clientes OpenAI + servicios Structured Output + cache
  config/         carga/tipado de settings + cifrado de secretos
  ui/             componentes React compartidos (web + extensión)
  testing/        fixtures y helpers de test
  eslint-config/ typescript-config/   (ya existen)
infrastructure/
  docker/  scripts/   (backup/restore, extension:zip)
docs/  graphify-out/
```

Reglas de dependencia: `apps/*` dependen de `packages/*`; `packages/*` no dependen de `apps/*`.
`contracts` no depende de nada del dominio salvo Zod. `pricing`/`validation` puros (sin I/O).

## 3. Roadmap de bloques (orden de construcción)

La ejecución se ordena en bloques por manejabilidad y costo de tokens; **el entregable final es completo**
(sin fases/MVP en el producto). Cada bloque se especifica en `docs/specs/BLOCK-N.md`, lo construye Codex,
y Claude lo revisa contra el checklist antes de avanzar.

| Bloque | Contenido | Áreas checklist |
|---:|---|---|
| 0 | Fundaciones: schema completo, packages puros, auth segura, Settings configurables | 1,2(base),3,34,35 |
| 1 | Dominio producto: CRUD+markup bidireccional, duplicados, import, líneas, clientes | 4,5,6,7,8 |
| 2 | Presupuestos core: familias/versiones/ítems, estados, total objetivo, precios, colecciones, solicitudes, trazabilidad | 9,11,12,13,14,15,16,21(base),22,31 |
| 3 | Motor PDF: Chromium A4 TGS simple/detallado, PC armada, overrides triestado, financiación | 17,18,19,20 |
| 4 | Servicios IA: análisis, compatibilidad, respuestas, similitud semántica | 10,25,26 |
| 5 | Búsqueda+dashboard+similitud presupuestos+componentes habituales+notificaciones | 21,23,24,33,36(notif) |
| 6 | Web app: todas las pantallas UX TGS | (UI de todo) |
| 7 | Extensión Chrome MV3 WhatsApp | 27,28,29,30,32(ext) |
| 8 | Worker no-concretado idempotente | 32 |
| 9 | Tests, deploy, docs, graphify deep | 1,2,36 |

## 4. Protocolo de delegación a Codex

1. Claude escribe `docs/specs/BLOCK-N.md` autocontenido (Codex no ve la conversación de Claude).
2. Se invoca Codex (`sandbox: workspace-write`) apuntando a leer esa spec + `BUILD_PLAN.md`.
3. Codex construye, ejecuta `pnpm typecheck`/`pnpm test`/`pnpm build` y reporta.
4. Claude revisa el diff contra la spec y el checklist; corrige rumbo por `codex-reply`.
5. Se marca el bloque y se reporta al propietario.

## 5. Modelo de datos (entidades objetivo)

User, Session, LoginAttempt, Product, ProductPriceHistory, PcLine, Customer, QuoteRequest, QuoteFamily,
QuoteVersion, QuoteItem, QuotePdf, QuoteSendAttempt, QuoteDelivery, QuoteStatusEvent, Collection,
CollectionQuote, FinancingPlan, CompanySettings, PdfSettings, AiSettings, AiRequest, AiSuggestion,
Notification, AuditLog, SimilarityCache. Índices: número, nombre, producto, teléfono, cliente, fecha,
estado, colección, texto de solicitud, y **trigram/FTS** (extensión `pg_trgm`).
El detalle campo-por-campo vive en `docs/specs/BLOCK-0.md` (schema autoritativo).
