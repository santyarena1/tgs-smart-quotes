# BLOCK-1 — Productos, clientes y líneas de PC

Leer primero `docs/BUILD_PLAN.md`, `docs/BUSINESS_RULES.md` y las secciones 6–10 de `README.md`.

## Objetivo

Entregar gestión real de productos, historial de precios, duplicados determinísticos, importación,
clientes y líneas configurables. API y web consumen los contratos Zod de `@tgs/contracts`.

## Productos

- `GET /api/products`: listado con búsqueda, activos/inactivos, línea y paginación razonable.
- `POST /api/products`: crear con `costCents`, `markupBps` o `salePriceCents`; calcular siempre con
  `@tgs/pricing` y guardar `ProductPriceHistory`.
- `PUT /api/products/:id`: las reglas son:
  - cambia costo: conservar markup efectivo y recalcular venta;
  - cambia markup: conservar costo y recalcular venta;
  - cambia venta: conservar costo y recalcular markup;
  - nunca aceptar venta menor al costo ni importes decimales.
- `DELETE /api/products/:id`: desactivar; no destruir historial.
- `GET /api/products/duplicates?name=`: `productSimilarity` contra productos activos, umbral desde
  `AiSettings.productSimilarityThreshold`; no usar IA.
- `POST /api/products/import`: filas `{ name, costCents }`, preview/validación previa en web, modo
  `skip` o `update`, resumen final. El markup general sale de `AiSettings.generalMarkupBps`.
- Cambiar markup general actualiza solamente productos con `usesGeneralMarkup=true`; presupuestos
  históricos no se modifican.

## Clientes

- CRUD mínimo con nombre obligatorio, teléfono visible y `normalizedPhone`, DNI opcional.
- Normalizar con `@tgs/validation`. Advertir posibles duplicados por teléfono/DNI/nombre; no fusionar
  automáticamente.

## Líneas de PC

- CRUD ordenable de `PcLine`: nombre, orden, activa, aliases, `keyLine`, concepto
  `CPU | MOTHERBOARD | GPU | OTHER`.
- No agregar atributos técnicos ni catálogo paralelo.

## Integridad

- Actor siempre desde `@CurrentUser`; toda escritura crítica crea `AuditLog`.
- Producto + historial se escriben en la misma transacción.
- BigInt se serializa como string; nunca convertir dinero a `number`.
- Errores en español y 404 explícito para entidades inexistentes.

## Web

- Pantallas operativas de productos, clientes y líneas.
- Estados de carga/error, formularios accesibles, formato ARS en presentación.
- No mostrar controles sin endpoint funcional.

## Salida

- Contratos completos y compartidos.
- Tests de contratos, reglas de precio/duplicados y controladores con mocks o DB de test.
- `pnpm typecheck`, `pnpm test`, `pnpm build` verdes.
