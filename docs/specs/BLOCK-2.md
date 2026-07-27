# BLOCK-2 — Presupuestos core

Leer primero `docs/BUILD_PLAN.md`, `docs/BUSINESS_RULES.md` y las secciones 11–17 y 21–22 de
`README.md`.

## Objetivo

Entregar familias de presupuesto con versiones e ítems congelados, estados, ajuste por total,
solicitudes, colecciones y trazabilidad. PDF, IA y envío WhatsApp quedan fuera de este bloque.

## Familia, versión e ítems

- `POST /api/quotes`: crea `QuoteFamily`, versión 1 en `BORRADOR` e ítems snapshot en una transacción.
- `GET /api/quotes` y `GET /api/quotes/:id`: devuelven versión activa, ítems, cliente, solicitud y
  colecciones; BigInt como string.
- `PUT /api/quotes/:id`: solo modifica la versión activa si está en `BORRADOR`.
- `POST /api/quotes/:id/version`: copia la versión activa, crea la siguiente en `BORRADOR`, congela
  todos los datos y registra motivo/evento. No muta versiones históricas.
- Cada ítem guarda nombre, línea, cantidad, costo, markup, venta, subtotal, posición y referencia
  opcional al producto maestro.
- Totales y markup efectivo se calculan únicamente con `@tgs/pricing`.

## Estados

- Estados: `BORRADOR`, `ENVIADO`, `ACEPTADO`, `RECHAZADO`, `REEMPLAZADO`, `NO_CONCRETADO`.
- Enviar establece `sentAt` y `lastActivityAt`.
- Al enviar una nueva versión, reemplazar solo la versión previamente `ENVIADO` de la misma familia.
- Aceptar/rechazar/no concretar registran `QuoteStatusEvent` y auditoría.
- No existe vencimiento.

## Ajuste por total

- `POST /api/quotes/:id/retarget { targetTotalCents }` solo sobre borrador.
- Usar `retarget` de `@tgs/pricing`; nunca duplicar fórmula.
- Aplicar preview resultante a ítems y totales en una transacción, registrando evento
  `TOTAL_AJUSTADO`.

## Solicitudes

- CRUD básico con título, texto original, notas, cliente, presupuesto máximo, uso esperado,
  componentes, responsable y estado.
- Una solicitud puede relacionarse con múltiples familias.
- Crear y cambiar estado genera trazabilidad.

## Colecciones

- CRUD con orden, favorita, archivada y visibilidad en extensión.
- Membresía muchos-a-muchos de familias; no duplicar membresías.

## Integridad

- Actor siempre desde sesión.
- Escrituras compuestas en transacción.
- Versiones enviadas son inmutables.
- `AuditLog` y `QuoteStatusEvent` no se silencian.
- Zod compartido; dinero en strings de centavos por HTTP y BigInt en persistencia.

## Web

- Listado, alta y detalle/editor de borrador.
- Crear versión, ajustar total y cambiar estado con confirmación y errores visibles.
- Pantallas básicas de solicitudes y colecciones.

## Salida

- Tests de contratos y reglas de inmutabilidad/estados/retarget.
- `pnpm typecheck`, `pnpm test`, `pnpm build` verdes.
- Lo no implementado se registra en `docs/HANDOFF.md`.
