<?php
/**
 * Novedades del plugin, versión por versión. Se muestran en Ajustes (arriba
 * de todo, con la versión instalada) para poder confirmar de un vistazo que
 * lo que se subió trae lo que tenía que traer. La primera entrada es la
 * versión actual: hay que agregar una entrada en CADA cambio que se sube.
 */

defined( 'ABSPATH' ) || exit;

function tgs_sq_changelog() {
	return array(
		'2.23.7' => array(
			'ARREGLO: al pagar aparecía "«Mouse …» está agotado" cuando la PC se agregaba más de una vez: el extra se sumaba otra vez y superaba el stock. Ahora un extra que ya está en el carrito para esa PC no se duplica, y antes de sumarlo se valida el stock real (contando lo que ya hay en el carrito). Los productos ofrecidos en "Potenciá tu setup" y monitores tienen que tener al menos 1 unidad real.',
		),
		'2.23.6' => array(
			'Combos: vuelven a usar el MISMO diseño propio de su variante (2.23.5 les ponía la ficha de bloques del plugin y se veía distinto). Solo cambian los textos y secciones que hablaban de una PC: "PC armada" → "Combo", "Armada y testeada" → "Combo con descuento", "La PC" → "El combo" ("Qué es este combo"), "Componentes" → "Qué incluye", "Compartir esta PC" → "Compartir este combo", el cierre; sin juegos, compatibilidad, monitores/Potenciá tu setup ni 3D; "Recomendadas" pasa a "Otros combos"; el precio de lista tachado es el del descuento del combo. En variantes de bloques, la ficha de combo de 2.23.5.',
		),
		'2.23.5' => array(
			'Ficha propia para los combos: hero (miniatura, título, tachado, precio y compra, kicker "THE GAMER SHOP · COMBO"), "Qué incluye" con las fotos de los productos, descripción, formas de pago, envíos y "Otros combos". Ya no usa el diseño de la PC: sin "Sobre la PC", "Girala en 3D", juegos, monitores ni "Potenciá tu setup". Toma la paleta de la variante asignada. En la guía, "El combo".',
		),
		'2.23.4' => array(
			'Guía: arranca a la altura del hero (donde empieza la ficha), bien separada del header. La sección actual se ve en rojo, un poco más grande y con el marcador latiendo (animación suave al cambiar).',
			'Guía: "Formas de pago" ahora abre el panel de pagos de la barra de compra (en el diseño propio esa sección vive adentro de un panel fijo y no se podía scrollear hasta ella); esas secciones tampoco se marcan como "actual".',
		),
		'2.23.3' => array(
			'Potenciá tu setup: un solo producto por categoría. Elegir otro de la misma pestaña reemplaza al anterior (cada pestaña dice "Elegí uno.").',
			'La guía ya no pisa la barra superior del sitio: arranca debajo del header fijo (medido en vivo) y, si la lista es larga, scrollea por dentro.',
		),
		'2.23.2' => array(
			'Guía de la ficha rediseñada al estilo del resto del diseño: sin recuadro gris, una línea roja vertical, "EN ESTA FICHA" en mono con cuadrado rojo, secciones en Rajdhani mayúsculas y marcador rojo en la sección activa; botón Comprar con corte diagonal. En celular, la hoja inferior con borde rojo.',
			'La guía ya no lista secciones sin título real ("…", íconos), ni "Girala en 3D" (vive en el hero), ni secciones de ejemplo dentro de comentarios del diseño propio. "La PC" pasa a "Sobre la PC". Sin hero del plugin, "Comprar" vuelve arriba de todo. Para excluir una sección a mano: data-tgs-guide="".',
		),
		'2.23.1' => array(
			'Combos por PC: el aviso post-carrito muestra solo los combos que se le asociaron a esa PC en TGS Smart Quotes (editor web de la PC → "Combos para esta PC"), en ese orden. Sin combos asociados, no se ofrece ninguno. Antes salían todos los combos publicados.',
		),
		'2.23.0' => array(
			'NUEVO — Combos de la tienda: los presupuestos marcados "Es combo para la tienda" en TGS Smart Quotes se publican como un producto único con precio tachado (descuento inverso: el precio es el final y el tachado sale de precio / (1 − %)). El tachado y la etiqueta −X% se ven en la ficha (hero y barra de compra) y en el modal; no se toca el precio regular/oferta de WooCommerce. La sección "Componentes" pasa a llamarse "Qué incluye".',
			'Combos ocultos ("Visible en la tienda" apagado en TGS): quedan fuera de listados, búsqueda y sitemap, con noindex, sin botón de compra en su URL, y solo se pueden agregar al carrito desde el aviso post-carrito de una PC (tgs_combo_from). Los visibles se compran normal.',
			'Aviso post-carrito: si el cliente NO eligió extras en "Potenciá tu setup", ofrece los combos (título, productos que incluye, tachado, precio, −X%, "Sumar al carrito"). Configurable por variante: prendido, cuántos, título y texto. Los combos no suman al descuento del fuego.',
			'Recomendadas de la casa: ya no incluye combos.',
		),
		'2.22.0' => array(
			'NUEVO — "Potenciá tu setup": sección de la ficha con una pestaña por categoría (Monitores, Teclados, Mouse, Auriculares, Wifi y red, Sillas, Escritorios, Mouse pads y dos libres) y pocos productos por pestaña. Lo elegido entra al carrito junto con la PC. Se configura por variante (categoría de Woo + elegidos + cuántos mostrar por pestaña; pestaña abierta por defecto). Con esta sección activa, el modal de carruseles de "Completá tu setup" no se muestra y "Sumale un monitor" pasa a ser la pestaña Monitores.',
			'Descuento "fuego": N extras × % por producto (1 % por defecto, sin tope), con barra que se va llenando y el ahorro en vivo en la sección, en la barra de compra y en la guía. Se elige si aplica también a la PC o solo a los extras. El descuento real lo calcula el carrito con lo que quedó adentro (si el cliente saca un extra, baja solo) y sale como línea "🔥 Descuento setup", no como cupón.',
			'Al agregar al carrito: aviso corto ("¡Ya está en tu carrito!" + ahorro) con Finalizar compra / Ver carrito / Seguir viendo, en vez del modal de carruseles.',
			'Guía de la ficha: índice fijo a la izquierda (pantallas anchas) con todas las secciones (La PC, Descripción, Componentes, Rendimiento estimado, Galería, Compatibilidad, Formas de pago, Envíos, Potenciá tu setup, Recomendadas…), la sección actual resaltada, el ahorro del fuego y un botón Comprar. En celular, botón "Guía" que abre la misma lista como hoja inferior. Funciona también en el diseño propio: toma las secciones con clase tgs-section-card o con data-tgs-guide="Etiqueta".',
			'Diseño propio: placeholder {{potencia_setup}} con la sección nueva.',
		),
		'2.21.4' => array(
			'Sumale un monitor: el resumen de abajo se rediseñó como tarjeta con tilde, "Monitor elegido: X", el cálculo "PC $A + Monitor $B = $Total" y la aclaración de que entran juntos al carrito; con más aire respecto de las tarjetas (antes era una línea mal redactada y pegada).',
		),
		'2.21.3' => array(
			'Modal en celular: el título y los textos scrollean junto con el contenido (antes quedaban fijos y tapaban los productos); solo los botones del pie quedan fijos.',
			'Etiqueta "−10% solo ahora" rediseñada: chip horizontal con rayo, degradado y brillo, en vez del círculo torcido.',
		),
		'2.21.2' => array(
			'Modal en PC: todo entra en pantalla sin deslizar. El modal usa el alto de la ventana y, si las filas no entran, el contenido se achica en bloque (con 3 filas en 1080p queda a tamaño natural; con 4 filas o pantallas más bajas, al ~65-75 %).',
		),
		'2.21.1' => array(
			'Recomendadas: miniatura CUADRADA que ocupa todo el recuadro (sin bordes ni grilla de fondo), de a 3 por fila y centradas aunque el diseño propio pegado sea viejo; se usa la versión grande de la imagen (antes 300 px estirados).',
		),
		'2.21.0' => array(
			'Modal: carrusel con flechas en las puntas de cada fila (en PC avanza solo de a uno cada 3,5 s y las flechas saltan una página; en celular no avanza solo y las flechas pasan de a un producto), contador "1 / N" y vuelta al principio al llegar al final. Se fue la cinta automática que en celular unificaba las filas.',
			'Barra de compra con monitor elegido: el precio grande pasa a ser el total (PC + monitor) y las cuotas se recalculan; arriba aparece una mini barra con "PC $X + Monitor $Y = Total $Z · N cuotas de $Q" (en celular solo "Con monitor: nombre"). Al quitar el monitor vuelve todo.',
			'Modal: contenido más grande (tarjetas de 380 px, foto 132 px, textos y botones más grandes) y el degradado del carrusel solo a la derecha (el "más elegido" ya no queda tapado).',
		),
		'2.20.1' => array(
			'ARREGLO: con un monitor elegido, el modal igual ofrecía monitores y el monitor no entraba al carrito. Causa: en el diseño propio {{boton_carrito}} salía vacío (Woo no tenía el producto en contexto), así que no existía el campo del monitor. Ahora el botón de compra se imprime siempre y el modal lee el monitor marcado en la sección.',
		),
		'2.20.0' => array(
			'Modal más grande: tarjetas de 320 px con foto de 104 px, carrusel más lento (se frena al pasar el mouse).',
			'"Ver todos (N)" por grupo: grilla con toda la categoría o todos los elegidos, con "Volver".',
			'Vista previa al tocar un producto: foto grande, nombre, descripción corta, precio tachado + con descuento, botón grande "Sumar al carrito con −X%" y link a la ficha.',
			'Hasta 40 productos por grupo (los elegidos primero) y al menos 12 monitores.',
			'Celular: el modal es una hoja inferior con scroll, listas deslizables a dedo (sin carrusel automático) y los botones "Ver carrito" / "Finalizar compra" fijos abajo.',
			'En todas las pantallas el pie con los CTAs queda siempre a la vista; scrollea solo el contenido.',
		),
		'2.19.2' => array(
			'Ajustes: esta lista de novedades con la versión instalada, para verificar cada subida.',
		),
		'2.19.1' => array(
			'ARREGLO: el modal "Completá tu setup", el visor de fotos y "Sumale un monitor" no funcionaban porque otro script del sitio frena DOMContentLoaded; el JS del plugin ya no depende de ese evento.',
			'Modal: precios sin entidades HTML ni decimales, filas más compactas; si el modal fallara con la PC ya en el carrito, va al carrito en vez de reenviar el formulario.',
		),
		'2.19.0' => array(
			'"Más elegido": botón ★ en cada lista del selector (monitores, teclados, mouse, auriculares). Va primero, con etiqueta dorada y borde brillante, en la ficha y en el modal.',
			'Modal compacto: tarjetas horizontales bajas para que entren las 3-4 filas y los botones sin scroll.',
		),
		'2.18.1' => array(
			'Modal: descuento propio para monitores (cupón TGS-MONITOR-<variante>) distinto del de periféricos; etiqueta de descuento por grupo; {{descuento_monitor}} en los textos.',
		),
		'2.18.0' => array(
			'Modal "Completá tu setup" después de agregar al carrito: la PC (y el monitor elegido) entran por AJAX y se abre el modal con carruseles infinitos de teclados / mouse / auriculares (y monitores si no eligió uno), descuento por sumar en el momento, CTAs "Ver carrito" / "Finalizar compra".',
			'Configuración por variante: activar, porcentaje, textos, categoría + elegidos por grupo. Cupón TGS-SETUP-<variante> creado y mantenido por el plugin.',
		),
		'2.17.0' => array(
			'Placeholder {{cuotas_detalle}} para el hero: "Hasta N cuotas sin interés del precio de lista con Tarjeta X", una línea por plan sin interés y "Más opciones de pago" (abre el panel).',
			'Recomendadas de a 3 por fila, centradas si hay menos. Tarjetas de monitores del mismo alto y resumen con más aire.',
		),
		'2.16.1' => array( 'Recomendadas usa la imagen destacada local antes que la URL del sistema.' ),
		'2.16.0' => array(
			'Protección de las PCs publicadas: si un sync externo (AcuStock) las pasa a borrador, a la papelera o sin stock, se restauran al instante. Tilde en Ajustes y contador por producto.',
		),
		'2.15.2' => array( 'Al republicar se conserva el producto publicado (no el de ID más bajo): evita que un duplicado viejo mande a borrador al que se ve en la tienda.' ),
		'2.15.1' => array( 'Buscador amplio de monitores: por palabras, categoría, solo con stock, orden por precio, tildar varios, ordenar la lista.' ),
		'2.15.0' => array( 'Cada variante puede elegir sus propios monitores (o usar los de Ajustes).' ),
		'2.14.3' => array( 'ARREGLO: el título del hero no tomaba Rajdhani (un reset de títulos del plugin lo pisaba).' ),
		'2.14.2' => array( 'Tipografías Inter y Rajdhani servidas desde el plugin (no dependen de Google Fonts).' ),
		'2.14.1' => array( 'Selector de monitores propio con foto, precio, stock y orden.' ),
		'2.14.0' => array( 'Monitores elegidos a mano y categoría por defecto de las PCs nuevas (Ajustes).' ),
		'2.13.0' => array(
			'Juegos con rango de FPS estimado. Sección "Sumale un monitor" (bloque y {{monitores}}). Publicar/Despublicar desde Productos. Diseño predeterminado. Métodos de envío ocultables y tarifas por clase de envío.',
		),
		'2.12.0' => array( 'Visor de fotos, JSON-LD Product, sección Envíos y retiro con zonas y costos de WooCommerce.' ),
	);
}

/** Tarjeta "Versión instalada + novedades" para Ajustes. */
function tgs_sq_changelog_card() {
	$log = tgs_sq_changelog();
	?>
	<div class="tgs-card">
		<div class="tgs-card__head">
			<div class="tgs-card__head-row">
				<h2>Versión instalada: <?php echo esc_html( TGS_SQ_VERSION ); ?></h2>
				<span class="tgs-chip tgs-chip--<?php echo isset( $log[ TGS_SQ_VERSION ] ) ? 'ok' : 'warn'; ?>"><?php echo isset( $log[ TGS_SQ_VERSION ] ) ? 'Novedades al día' : 'Sin novedades registradas'; ?></span>
			</div>
			<p>Qué trae cada versión. Si lo que ves acá no coincide con lo que te dijeron que subieras, es que el ZIP no se actualizó.</p>
		</div>
		<div class="tgs-card__body">
			<details open>
				<summary style="cursor:pointer;font-weight:600">Novedades (<?php echo count( $log ); ?> versiones)</summary>
				<div style="display:grid;gap:10px;margin-top:10px">
					<?php foreach ( $log as $version => $items ) : ?>
						<div>
							<strong><?php echo esc_html( $version ); ?></strong><?php echo $version === TGS_SQ_VERSION ? ' <span class="tgs-chip tgs-chip--ok">instalada</span>' : ''; ?>
							<ul style="margin:4px 0 0 18px">
								<?php foreach ( $items as $item ) : ?>
									<li><?php echo esc_html( $item ); ?></li>
								<?php endforeach; ?>
							</ul>
						</div>
					<?php endforeach; ?>
				</div>
			</details>
		</div>
	</div>
	<?php
}
