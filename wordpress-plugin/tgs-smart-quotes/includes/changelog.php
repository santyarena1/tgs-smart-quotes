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
