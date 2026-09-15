# BLOCK 10 — "Potenciá tu setup", descuento fuego, guía de la ficha y combos

> Etapa 1 construida 2026-09-15 (plugin 2.22.0). Etapas 2 y 3 (combos desde TGS y en la tienda) se documentan abajo a medida que se construyen.

## Por qué

- El modal "Completá tu setup" (plugin 2.20–2.21) abría después de agregar al carrito con carruseles de hasta 40 productos por categoría, grilla y vista detalle: una mini tienda adentro de un modal. Demasiado para un cliente común y lento para el que sabe qué quiere.
- El público elige periféricos de forma específica: la solución no es menos catálogo sino **pocas opciones a la vista, por categoría, con el catálogo a un click**, y el descuento a la vista mientras elige.
- Con la ficha más larga (más categorías) hacía falta un índice para moverse.

## Etapa 1 — Ficha (plugin)

### Sección "Potenciá tu setup" (`includes/setup.php`, bloque `setup`, placeholder `{{potencia_setup}}`)

- Ranuras fijas de categoría (`tgs_sq_setup_groups()`): `monitor`, `keyboard`, `mouse`, `headset`, `network`, `chair`, `desk`, `mousepad`, `extra1`, `extra2`. Por variante y por ranura: prendida/apagada, nombre de la pestaña, categoría de WooCommerce, productos elegidos (con ★ "más elegido"), cuántos mostrar (1–12, default 4). `monitor` usa la configuración de "Sumale un monitor" (Ajustes o lista propia de la variante).
- Compatibilidad: si `keyboard/mouse/headset` no tienen nada cargado en la sección nueva, toman categoría/productos del modal viejo (`upsell_*`), así la ficha no aparece vacía al actualizar.
- Render: pestañas (`role=tablist`) + tarjetas con el mismo diseño que los monitores (`.tgs-monitor-card`) + resumen de lo elegido + JSON `#tgs-setup-data` para el JS. Pestaña abierta por defecto configurable (`setup_default_group`, default `monitor`).
- Con la sección activa (`$data['setup_active']`: bloque visible, o en diseño propio el placeholder `{{potencia_setup}}` o `{{monitores}}` presente —en ese caso la sección sale en el lugar de los monitores—, y `setup_enabled`): el bloque `monitors` y `{{monitores}}` no imprimen nada (los monitores son una pestaña) y `tgs_sq_upsell_data()` devuelve null (el modal viejo no se muestra). Con la sección apagada todo sigue como en 2.21.
- Bloques nuevos en variantes viejas: `tgs_sq_complete_blocks()` agrega los tipos que faltan con su visibilidad por defecto; `setup` entra justo después de `monitors`.

### Extras al carrito

- Campo oculto `tgs_addon_extras` (IDs separados por coma) en el formulario de compra; el JS también lo agrega a los links `?add-to-cart=` de la barra flotante.
- Hook `woocommerce_add_to_cart` (PC publicada): cada ID se valida con `tgs_sq_is_setup_addon()` (producto simple, publicado, con stock, y presente en alguna lista/categoría de alguna variante o monitor elegible) y entra con 1 unidad y `cart_item_data['tgs_setup_pc'] = <id de la PC>`. En el carrito se ve "Extra de: <PC>".

### Descuento "fuego"

- Regla: **N productos distintos × `setup_pct`** (default 1 %, 0–100, sin tope). Base: los extras de esa PC; si `setup_apply_pc`, también la PC.
- Se calcula **en el carrito** (`woocommerce_cart_calculate_fees`): por cada PC publicada en el carrito se cuentan los extras con `tgs_setup_pc` = esa PC que siguen adentro. Sale como fee negativo "🔥 Descuento setup (N extras)", no imponible, sin cupón. Si el cliente saca un extra, baja solo; si saca la PC, desaparece.
- En la ficha (`assets/tgs-setup.js`) es informativo: barra de fuego (se llena hasta 8 extras), % y ahorro; mini barra sobre la barra de compra con total y cuotas recalculadas; contador por pestaña; resumen con chips para quitar. Los cupones `TGS-SETUP-*`/`TGS-MONITOR-*` del modo viejo siguen existiendo solo para variantes con la sección apagada.

### Aviso post-carrito

- El JS intercepta el submit del formulario y los links de compra, agrega por AJAX (`wc-ajax=add_to_cart` con `tgs_addon_extras`) y muestra `.tgs-done` ("¡Ya está en tu carrito!", PC + N extras, ahorro, Finalizar compra / Ver carrito / Seguir viendo). Título y texto configurables (`setup_done_title`, `setup_done_text`). Si el AJAX falla, el formulario sigue su curso normal.
- Etapa 3: cuando el cliente no eligió extras, en lugar del aviso se ofrecen los combos.

### Guía de la ficha (`tgs_sq_guide_inject()` / `tgs_sq_guide_html()`)

- Se arma post-render sobre el HTML: cada `<section>` con clase `tgs-section-card` (etiqueta = su primer `<h2>`), la `tgs-hero` ("La PC", id `tgs-hero`) o cualquier `<section data-tgs-guide="Etiqueta">` recibe `id="tgs-s-N"` y una entrada. Mapa de etiquetas en `tgs_sq_guide_labels()` ("Juegos" → "Rendimiento estimado"). Vale en modo bloques y en diseño propio.
- Escritorio (≥1400 px): rail fijo a la izquierda con scroll-spy, entrada "🔥 Potenciá tu setup" resaltada, cajita con el ahorro actual y botón Comprar (vuelve al hero). `.tgs-landing` recibe `padding-left` para dejarle lugar.
- Menos de 1400 px: botón flotante "☰ Guía" (arriba de la barra de compra) que abre la lista como hoja inferior; se cierra al elegir, al tocar afuera o con Escape.

### Admin (Variantes)

- Tarjeta "Potenciá tu setup": prendido, % por producto, aplica a la PC, título, texto (`{{pct}}`), pestaña por defecto, textos del aviso, y un `<details>` por ranura (prendida, nombre, cuántos, categoría, selector de productos con ★).
- La tarjeta del modal viejo queda como "(modo viejo)": solo actúa si la sección está apagada.

## Etapa 2 — Combos en TGS (construida 2026-09-15)

- `QuoteFamily.kind` (`PC` | `COMBO`), `comboDiscountBps`, `storeVisible` (migración `20260915150000_quote_family_combo`). Un combo es un presupuesto común (no "PC armada") con la casilla **"Es combo para la tienda"** en el editor de presupuestos (`kind` va en create/update de `/quotes`). Se lista en Publicación web junto con las PCs (`GET /external-module/publications` y el listado filtran `isBuiltPc || kind === 'COMBO'`); la sincronización automática de precios también los toma.
- **Descuento inverso**: el precio del presupuesto es el final; el tachado es `precio / (1 − bps/10000)` redondeado al centavo (`comboStrikeCents` en `@tgs/providers` y en `apps/web/lib/money.ts`, entero puro; test en `wordpress.test.ts`). Con $100.000 y 10 %: tachado $111.111,11. Se edita en el editor web ("Combo para la tienda": % con decimales + vista previa del tachado) vía `PUT publish-settings {comboDiscountBps}`.
- **Visibilidad**: `storeVisible` (`PUT publish-settings {storeVisible}`). Apagado = el plugin lo publica oculto (etapa 3).
- **Payload a WordPress** (`buildPublishPayload`): `kind`, `comboDiscountBps`, `regularPriceCents` (tachado o null), `storeVisible` (PCs: 'PC', 0, null, true).
- **Pipeline "Preparar y publicar"** con combos: imágenes/recortes/descripciones igual; hero = producto más caro con foto (`findComboHeroItem`); textos = `ComboEnrichmentService` (`packages/ai/src/services/combo-enrichment.ts`: título, bajada, descripción corta, HTML, puntos fuertes, público; sin juegos/programas/compatibilidad; misma tarea `QUOTE_ENRICHMENT` con `format: 'combo-v1'` en el hash); `runQuoteEnrichment` despacha por `kind`; título por reglas = `buildComboTitle` ("Combo A + B + C", ≤120); miniatura = collage con sharp (`apps/api/src/combo-thumbnail.ts`: hasta 4 fotos, banda con título y etiqueta −X %; sin IA); 3D no aplica. El editor web oculta Juegos y Compatibilidad para combos.

## Etapa 3 — Combos en la tienda (pendiente)
