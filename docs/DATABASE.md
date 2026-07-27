# Base de datos

PostgreSQL es la fuente persistente y Prisma define el schema autoritativo. Todo importe monetario se guarda como `BigInt` en centavos y todo markup/coficiente como `Int` en basis points.

La migración inicial habilita `pg_trgm` y crea estos índices GIN trigram:

- `Product.normalizedName`: búsqueda tolerante a errores en nombres normalizados de producto.
- `Customer.normalizedName`: coincidencia aproximada por nombre de cliente.
- `Customer.normalizedPhone`: coincidencia tolerante sobre el teléfono canónico.
- `QuoteFamily.internalName`: búsqueda aproximada de presupuestos por nombre interno.
- `QuoteItem.frozenName`: búsqueda histórica sobre nombres congelados de ítems.
- `QuoteRequest.originalText`: recuperación aproximada del texto original de solicitudes.

Además, los índices B-tree declarados en Prisma cubren sesiones y lockout, estados/fechas, teléfonos/DNI, posiciones, colecciones, IA/cache, notificaciones y auditoría. La migración se aplica con `pnpm db:migrate`; el seed idempotente requiere `ADMIN_USERNAME` y `ADMIN_PASSWORD`.
