# API

OpenAPI esta en `/openapi`; health en `/api/health`. Modulos expuestos: auth, products/import, customers, requests, quotes/versions/status/PDF, collections, notifications, dashboard, extension attempts e IA. Todas las entradas de dominio se validan mediante contratos compartidos.

## API para AcuStock (solo lectura)

Expone las colecciones con sus presupuestos completos para que AcuStock los lea. Código: `apps/api/src/acustock-export.ts`.

**Acceso.** Cada pedido lleva el header `Authorization: Bearer <clave>`. La clave se genera en **Configuración → AcuStock** (solo administradores) y se muestra una sola vez; en la base queda solo su hash SHA-256 (tabla `AcustockApiSettings`). Generar una clave nueva invalida la anterior y **Revocar acceso** la borra. Sin clave generada la API responde 503; con una clave distinta, 401. La pantalla muestra cuándo la usó AcuStock por última vez. Rutas de administración: `GET /api/settings/acustock-api`, `POST /api/settings/acustock-api/token` (devuelve la clave) y `DELETE /api/settings/acustock-api/token`.

**Rutas** (con el prefijo `/api` de la API):

- `GET /api/integrations/acustock/collections`: todas las colecciones, también las archivadas (`archived: true`), con su local y `quoteCount`.
- `GET /api/integrations/acustock/collections/{id}`: una colección con cada presupuesto (`quotes[].quote`), en el orden de la colección. Cada presupuesto trae número, nombre interno, tipo (PC / COMBO), local, datos de la tienda (título, publicación, URL) y **todas sus versiones** (`versions`, de la más vieja a la más nueva; `isActive` marca la vigente). Cada versión trae estado, quién la creó, totales (costo, venta, ganancia, markup), observación pública, parte de pago, financiación, datos del presupuesto web (vencimiento y avisos), los PDF generados (tipo y fecha) y los ítems con costo unitario, markup, precio unitario, subtotal, costo total y ganancia.

**Formato.** Montos en centavos de peso como texto (`"65125000"` = $ 651.250). Porcentajes en puntos básicos (`2000` = 20 %). Fechas en ISO 8601 (UTC).

**Lo que no se expone.** Datos del cliente (nombre, teléfono, DNI, CUIT, email, dirección) y el mensaje enviado al cliente.
