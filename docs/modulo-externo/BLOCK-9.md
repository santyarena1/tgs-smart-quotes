# BLOCK 9 — Publicación por presupuesto + "Preparar y publicar"

> Construido 2026-09-11. Reemplaza el modelo "una publicación por versión" y agrega el pipeline de un solo botón.

## Por qué

- La publicación colgaba de `QuoteVersion`. Cada versión nueva (editar un ENVIADO, "Nueva versión", "Restaurar", "Reactivar") cambiaba la versión activa y el panel dejaba de ver la publicación; al volver a publicar se creaba un **segundo producto** en WordPress (otro `externalId`). Borrar el presupuesto dejaba el producto huérfano y publicado.
- Un error transitorio de WordPress dejaba la publicación en `FAILED` para siempre (el resync y la sincronización de precios solo miran `PUBLISHED`).
- Publicar bien exigía muchos pasos manuales: fotos de cada componente, hero, IA, título, miniatura.

## Modelo

- `WebPublication.quoteFamilyId` (@unique) + `quoteVersionId` = versión cuyo contenido está en la tienda. `externalId` en WordPress = id de la familia.
- `QuoteFamily.webTitle` / `webTagline`: título comercial y bajada de la tienda. El nombre interno no se toca.
- `QuoteEnrichment`: `title` (formato fijo de specs, ver abajo), `tagline`, `shortDescription`, `highlightsJson`, `audience`, `itemsHash`. Juegos con `resolution`/`settings`/`note` además de `tier`.
- `WebPublishRun`: corrida del pipeline con `stepsJson` (id, label, status PENDING/RUNNING/DONE/SKIPPED/FAILED, detail).
- Migración `20260911130000_web_publication_by_family`: puebla `quoteFamilyId`, deduplica (queda la PUBLISHED más reciente por familia), FK a versión pasa a RESTRICT.

## Reglas

1. **La tienda muestra la versión que se publicó.** Crear V3 no cambia nada; el panel muestra "Publicada (versión anterior)" y ofrece "Actualizar a v3". Si el presupuesto está en BORRADOR y cambia un precio del catálogo, la sincronización automática recalcula y republica **solo si esa versión es la fijada**.
2. **Un fallo al republicar algo ya publicado no lo baja de "Publicados"**: se guarda `lastError`/`lastErrorAt` y el resync horario reintenta. Solo una primera publicación fallida queda en `FAILED`.
3. **Borrar el presupuesto despublica primero** (si falla, no se borra). **La versión fijada no se puede borrar.**
4. **Plugin (2.11.0)**: busca el producto por `externalId` y por `legacyExternalIds` (ids de versión), re-etiqueta el que encuentra y pasa a borrador los duplicados; busca también en la papelera y la restaura; captura `WC_Data_Exception` (SKU duplicado → publica sin SKU); el **slug solo se fija al crear**; escribe descripción y descripción corta del producto Woo (feeds, buscadores, emails); guarda galería, bajada, puntos fuertes, público y versión en meta; `media_sideload_image` con timeout de 20 s. 2.11.2: `data-resolution`/`data-settings` en cada juego, asterisco de condiciones de cuotas (`financing_terms` en la variante) y aviso de IA por sección (`ai_disclaimer`), fuentes Inter + Rajdhani por Google Fonts. 2.12.0: lightbox de fotos (`#tgs-gallery-data` + `tgs-landing.js`), JSON-LD schema.org Product, bloque/placeholder `envios` que lee zonas y métodos de WooCommerce (`tgs_sq_shipping_options`). Juegos a analizar configurables en `AiSettings.gamesToAnalyze` (default `DEFAULT_GAMES_TO_ANALYZE` en @tgs/ai). 2.13.0: campo `fps` por juego (rango estimado, formato `v4` del caché de IA y `ENRICHMENT_FORMAT` en el hash del pipeline); bloque/placeholder `monitores` (categoría en `tgs_sq_monitor_category`, campo oculto `tgs_addon_monitor` + hook `woocommerce_add_to_cart` que suma el monitor); opciones `tgs_sq_default_variant` (variante de las PCs nuevas) y `tgs_sq_hidden_shipping` (métodos ocultos); `tgs_sq_shipping_options( $product )` suma el costo por clase de envío y omite tarifas planas que solo tienen costo para otras clases; Publicar/Despublicar desde TGS Smart Quotes → Productos.

5. **Miniaturas con IA** (`apps/api/src/thumbnail-ai.ts`, `packages/ai/src/services/thumbnail-image.ts`): `ThumbnailAiSettings` (singleton) + `ThumbnailAiReference` (hasta 6 imágenes en `thumbnail-ai/references/`). `generateAiThumbnail` arma el prompt (encabezado fijo que explica qué es cada imagen + prompt del negocio con placeholders `{{titulo}} {{cpu}} {{gpu}} {{ram}} {{disco}} {{so}} {{gabinete}} {{componentes}}` + instrucción de texto según `textMode` AI/OVERLAY/NONE) y llama a `images.edit` de OpenAI (`gpt-image-1`, `input_fidelity: high`) con la foto del gabinete primero y las referencias después. OVERLAY estampa el texto exacto con sharp. Cada llamada queda en `AiRequest` (`THUMBNAIL_IMAGE`, costo estimado). El pipeline (`ensureThumbnail`) lo usa si está activo y cae a la plantilla clásica si falta configuración (`ThumbnailAiUnavailable`). Endpoints: `GET/PUT /settings/thumbnail-ai`, `POST/PATCH/DELETE /settings/thumbnail-ai/references`, `POST /external-module/quote-families/:id/thumbnail/generate`. UI: Ajustes → Miniaturas IA y botón "Generar con IA" en Publicación Web.
5. **Medios**: `/uploads/media/*` sin rate limit y con `Cache-Control: public, max-age=604800, immutable`.

## Pipeline "Preparar y publicar" (`apps/api/src/publish-pipeline.ts`)

`POST /external-module/quote-families/:familyId/prepare` `{versionId?, publish?}` → crea `WebPublishRun` y corre en segundo plano en la API (necesita el disco de medios y sharp). `GET /external-module/publish-runs/:id` y `GET .../prepare/latest` para el progreso. Una corrida RUNNING de más de 15 min se marca colgada.

| Paso | Qué hace | Se saltea si |
|------|----------|--------------|
| images | Por cada componente sin imagen: Serper con el nombre limpio de ruido, ranking por relevancia (los tokens con números del nombre —modelo, capacidad— tienen que aparecer en título/URL del resultado; se descartan redes sociales), después PNG, ≥250 px, proporción ≤2.5; hasta 4 candidatas: descarga con UA de navegador → `removeBackgroundDetailed`; si ninguna recorta, se guarda la mejor con fondo. Producto de catálogo → `ProductAsset` (origen SERPER, principal si es la primera); ítem manual → `QuoteItem.webImageUrl` | todos tienen imagen |
| descriptions | Descripción corta con IA (`generateProductDescription`) para cada componente sin descripción: producto de catálogo → `Product.description` (reutilizable), ítem manual → `QuoteItem.webDescription` | todos tienen descripción |
| hero | `heroAssetId`/`heroImageUrl` = foto del gabinete (línea o nombre con gabinete/case/chasis/tower) | ya había hero |
| enrichment | `runQuoteEnrichment` (IA v2) | `itemsHash` igual y ya hay descripción y título |
| title | `webTitle` = `PC GAMER | CPU - RAM xxGB - DISCO - GPU | WINDOWS N` armado por reglas desde los nombres de los ítems (`apps/api/src/quote-title.ts`); la IA (`specs`) solo rellena lo que las reglas no leyeron. Sin CPU legible no se propone título. `WINDOWS 11` va siempre (todas las PC salen con Windows); si un ítem indica otra versión de Windows se respeta. `webTagline` = `enrichment.tagline` | ya tenían valor |
| thumbnail | plantilla activa + foto del gabinete → `quote-thumbnails/<familia>/…jpg` | ya había miniatura, o no hay plantilla activa / foto |
| model3d | informativo | — |
| publish | `publishQuote(familyId, {versionId})` | `publish: false` |

Un paso que falla no frena a los demás; solo un fallo de `publish` marca la corrida como FAILED. La IA desactivada produce un texto básico y lo dice en el detalle.

## Endpoints

- `GET /external-module/quote-families/:id/publication` → publicación + `publishedVersionNumber`, `activeVersionNumber`, `isStale`, `webTitle`, `webTagline`.
- `POST .../publish` `{versionId?}` (default: la fijada, o la activa si nunca se publicó), `POST .../unpublish`, `GET .../publish-preview?versionId=`.
- `PUT .../publish-settings` `{autoRepublish?, webTitle?, webTagline?}`.
- `POST .../generate-title` `{versionId?, apply?}`: rehace título (reglas + specs de la IA) y bajada a pedido; con `apply` los guarda pisando lo que había. Botón "Regenerar título y bajada con IA" en el editor.
- `POST /external-module/quotes/:versionId/enrich` (manual), `PUT .../enrichment` acepta los campos nuevos.

## Pendiente / no incluido a propósito

- Potencia/PSU: sigue manual (principio del plan: cálculo determinístico, no IA).
- 3D: no se genera solo; si el gabinete no tiene modelo se informa.
- Mover medios a R2 con URL pública (hoy se sirven desde la API).
