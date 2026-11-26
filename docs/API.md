# API

OpenAPI esta en `/openapi`; health en `/api/health`. Modulos expuestos: auth, products/import, customers, requests, quotes/versions/status/PDF, collections, notifications, dashboard, extension attempts e IA. Todas las entradas de dominio se validan mediante contratos compartidos.

## API para AcuStock (solo lectura)

Expone las colecciones con sus presupuestos completos para que AcuStock los lea. Código: `apps/api/src/acustock-export.ts`.

**Acceso.** Cada pedido lleva el header `Authorization: Bearer <token>`, donde el token es el valor de la variable `ACUSTOCK_API_TOKEN` del servicio de la API (Railway). Sin esa variable la API responde 503; con un token distinto, 401. Para generar uno: `openssl rand -hex 32`. Para cortar el acceso, se borra o se cambia la variable.

**Rutas** (con el prefijo `/api` de la API):

- `GET /api/integrations/acustock/collections`: todas las colecciones, también las archivadas (`archived: true`), con su local y `quoteCount`.
- `GET /api/integrations/acustock/collections/{id}`: una colección con cada presupuesto (`quotes[].quote`), en el orden de la colección. Cada presupuesto trae número, nombre interno, tipo (PC / COMBO), local, datos de la tienda (título, publicación, URL) y **todas sus versiones** (`versions`, de la más vieja a la más nueva; `isActive` marca la vigente). Cada versión trae estado, quién la creó, totales (costo, venta, ganancia, markup), observación pública, parte de pago, financiación, datos del presupuesto web (vencimiento y avisos), los PDF generados (tipo y fecha) y los ítems con costo unitario, markup, precio unitario, subtotal, costo total y ganancia.

**Formato.** Montos en centavos de peso como texto (`"65125000"` = $ 651.250). Porcentajes en puntos básicos (`2000` = 20 %). Fechas en ISO 8601 (UTC).

**Lo que no se expone.** Datos del cliente (nombre, teléfono, DNI, CUIT, email, dirección) y el mensaje enviado al cliente.
