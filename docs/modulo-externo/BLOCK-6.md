# BLOCK-6 — Fase 5: Plugin WordPress + publicar

> Plugin WooCommerce propio (estilo autocontenido) que recibe el payload por REST (HMAC) y crea/actualiza un producto con landing 3D. Del lado de la plataforma: botón "Enviar a la web" que arma el payload, lo firma y lo manda; guarda `WebPublication`. Plugin descargable como `.zip` (como la extensión Chrome).
>
> Español. Precio del producto Woo (carrito) = **efectivo/transferencia**. Estilo del plugin = **propio** (no depende del tema). Links, no binarios: lo pesado vive en nuestra plataforma; a WP van URLs.

## LECCIONES DEL INCIDENTE (obligatorias)
- Si tocás migraciones: comillas dobles, timestamp posterior a `20260808030000`, sin duplicados. (`WebPublication` YA existe; probablemente no haga falta migración.)
- **Dockerfile**: si agregás un paso de build (zip del plugin), agregalo con cuidado al `apps/api/Dockerfile` (mirror del paso de la extensión). Verificá que el script del zip corra (lo corro yo local).
- NO paquetes de workspace nuevos.
- Archivos UTF-8 válido. `pnpm build` verde del lado JS/TS.

## Alcance
1. Plugin PHP en `wordpress-plugin/tgs-smart-quotes/` (main + includes + templates + assets, model-viewer bundleado).
2. Script de zip + integración al build/Dockerfile; endpoint de descarga.
3. Endpoints de publicar/despublicar del lado plataforma + `WebPublication`.
4. Contracts + UI (botón "Enviar a la web" + descargar plugin).

## 1. Plugin PHP (`wordpress-plugin/tgs-smart-quotes/`)
Archivos:
- `tgs-smart-quotes.php` (header de plugin: Name "TGS Smart Quotes", Version, Description).
- `includes/rest.php`: registra rutas REST namespace `tgs/v1`:
  - `POST /publish`: verifica firma HMAC (header `X-TGS-Signature` = hex hmac-sha256 del body raw con el secreto guardado en la opción `tgs_hmac_secret`; opción seteable en un settings page mínimo del plugin O por constante). Rechaza 401 si no coincide. Body = payload (sección 3 de abajo). Crea/actualiza el producto WooCommerce:
    - Buscar por meta `_tgs_external_id == payload.externalId`. Si existe → update; si no → `wc_get_product`/`new WC_Product_Simple`.
    - `set_name(title)`, `set_status('publish')`, `set_catalog_visibility('visible')`, `set_regular_price( (priceTransferCents/100) )`, `set_sku`, categoría "TGS" (crear si falta), tags. `set_manage_stock(false)`.
    - Guardar meta (todas las URLs y datos): `_tgs_external_id, _tgs_managed=1, _tgs_model3d_url, _tgs_thumbnail_url, _tgs_gallery(json), _tgs_price_list_cents, _tgs_price_cash_cents, _tgs_price_transfer_cents, _tgs_installments(json), _tgs_items(json), _tgs_description_html, _tgs_power(json), _tgs_games(json), _tgs_compatibility(json)`.
    - **Imagen sin sideload**: NO descargar la miniatura a la biblioteca; guardar `_tgs_thumbnail_url` y filtrar la imagen del producto (`woocommerce_single_product_image_thumbnail_html` y el thumbnail del loop / `post_thumbnail_html`) para productos con `_tgs_managed` → emitir `<img src=_tgs_thumbnail_url>`. Así aparece con nuestra miniatura en shop/FiboSearch sin copiar binarios.
    - Responder `{ ok:true, productId, url: get_permalink(id) }`.
  - `POST /unpublish`: body `{ externalId }` (HMAC) → producto a `draft` (no borrar definitivamente). Responder ok.
  - `GET /ping`: responde `{ ok:true, version }` (sin HMAC) para test de conexión.
- `includes/render.php`: landing para productos `_tgs_managed`:
  - `template_include` (o `wc_get_template_part`/`single_template`): si es single product con `_tgs_managed`, cargar `templates/single-landing.php`.
  - `templates/single-landing.php`: estructura con estilo PROPIO (clase raíz `tgs-landing`): hero con `<model-viewer src="_tgs_model3d_url" camera-controls auto-rotate>` centrado (si hay modelo), galería (urls de `_tgs_gallery`), bloques de precio (efectivo/transferencia/cuotas desde meta), **add-to-cart sticky** (arriba antes de imágenes + barra flotante al scrollear) usando el form add-to-cart de WooCommerce (`woocommerce_template_single_add_to_cart` o un form a `?add-to-cart=ID`), specs (items), descripción (`_tgs_description_html`), juegos/compatibilidad. Escapar salidas (`esc_url`, `esc_html`, `wp_kses_post` para el html de descripción).
  - Encolar (solo en páginas de productos managed) `assets/tgs-landing.css`, `assets/tgs-landing.js` y `assets/model-viewer.min.js` (bundleado en el plugin, self-contained).
- `assets/tgs-landing.css` (estilo propio con tokens; add-to-cart sticky claro y poco invasivo), `assets/tgs-landing.js` (sticky bar on scroll), `assets/model-viewer.min.js` (bundlear el web component).

> Seguridad: verificar HMAC con `hash_equals`; sanitizar/escapar todo; nonce no aplica (server-to-server con HMAC). No exponer el secreto.

## 2. Empaquetado + descarga
- Script `infrastructure/scripts/zip-wp-plugin.mjs` (mirror de `zip-extension.mjs`, usa `archiver`) → genera `wordpress-plugin/tgs-smart-quotes.zip` conteniendo la carpeta `tgs-smart-quotes/`.
- Script raíz en `package.json`: `"wp-plugin:zip": "node infrastructure/scripts/zip-wp-plugin.mjs"`.
- `apps/api/Dockerfile`: agregar el paso de zip del plugin al `RUN` (después del install, junto al de la extensión) → `&& node infrastructure/scripts/zip-wp-plugin.mjs`. (Cuidado: mirror exacto; el script debe correr sin fallar.)
- Endpoint descarga: mirror de `extension-settings.ts` (candidatos de path `wordpress-plugin/tgs-smart-quotes.zip`, `../../wordpress-plugin/...`, `storage/...`), servir como attachment `tgs-smart-quotes.zip`. Ubicalo en `ExternalModuleController` (`GET external-module/wp-plugin/download`).

## 3. Publicar (plataforma → WordPress)
Payload (arma desde la DB, reusando lo ya hecho):
```
{ externalId: quoteVersionId, title, slug,
  priceListCents, priceCashCents, priceTransferCents, installments:[...],
  items:[{name, imageUrl, specs}], gallery:[url...],
  model3dUrl, thumbnailUrl, descriptionHtml, power:{watts,psu,note}, games:[...], compatibility:[...] }
```
- `title`: nombre del presupuesto/familia. `price*`: del payload de la Fase 4 (efectivo/transferencia/lista). `installments`: financiación.
- `items`: de `QuoteItem`; `imageUrl`: la `ProductAsset` principal de cada producto (si hay). `gallery`: esas imágenes.
- `model3dUrl`: buscar `CaseModel3D.glbUrl` entre los productos de los items (preferir el de la línea Gabinete si se identifica; si no, el primero con modelo). `thumbnailUrl`: de `WebPublication` si ya hay, o generar una con la plantilla activa (best-effort; si falla, null).
- `descriptionHtml/power/games/compatibility`: de `QuoteEnrichment` (si existe).

Endpoints (`ExternalModuleController`):
- `POST external-module/quotes/:versionId/publish` → arma payload, firma HMAC (secreto = `decryptSecret(wpHmacSecretEnc)` de la config), `POST {wpBaseUrl}/wp-json/tgs/v1/publish`. Upsert `WebPublication` (wpProductId, url, status='PUBLISHED', payloadSnapshot, publishedAt). Manejo de error claro.
- `POST external-module/quotes/:versionId/unpublish` → llama `/unpublish`, `WebPublication.status='UNPUBLISHED'`.
- `GET  external-module/quotes/:versionId/publication` → estado actual.

## 4. Contracts + UI
- Contracts: tipos del payload + inputs si hacen falta.
- UI: en la tab "Presupuesto" agregar, cuando hay enrichment, botón **"Enviar a la web"** (POST publish) que muestra la URL resultante y el estado, + **"Despublicar"**. En "Conexiones" (o config) agregar botón **"Descargar plugin de WordPress"** (GET wp-plugin/download).

## NO incluir acá (va a Fase 7): republicado automático al editar el presupuesto (lo hace un task del worker después).

## Verificación (obligatoria)
1. `pnpm build` verde (TS/JS). Correr `node infrastructure/scripts/zip-wp-plugin.mjs` para confirmar que el zip se genera.
2. Revisar el PHP a mano (no hay build de PHP): HMAC con hash_equals, escaping, create/update idempotente por `_tgs_external_id`, precio = transfer.
3. Migración solo si hiciera falta (revisar comillas/duplicados).
NO commit / NO push. Resumen: archivos del plugin, endpoints, cambios de Dockerfile/package.json, y pendientes.
