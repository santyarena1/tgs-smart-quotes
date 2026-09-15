<?php
/**
 * "Potenciá tu setup": la sección de la ficha donde el cliente suma extras
 * (monitor, teclado, mouse, auriculares, red, silla, escritorio, mouse pad…)
 * que entran al carrito junto con la PC, y el descuento "fuego" que crece
 * con cada extra elegido.
 *
 * Reemplaza al modal de carruseles de upsell.php: en vez de tirarle 40
 * productos por categoría después de comprar, la oferta vive en la ficha,
 * de a una categoría por vez (pestañas) y con pocas opciones cada una.
 * Qué categorías, qué productos y cuántos se muestran se configura por
 * variante (Variantes → "Potenciá tu setup").
 *
 * El descuento NO se decide en el navegador: cada extra entra al carrito
 * marcado con la PC a la que acompaña, y en cada recálculo del carrito se
 * cuentan los extras que siguen ahí (woocommerce_cart_calculate_fees). Si
 * el cliente saca un extra en el carrito, el descuento baja solo. Se aplica
 * como una línea negativa ("🔥 Descuento setup") y no como cupón, así nadie
 * tiene un código para pasar por ahí.
 *
 * Regla del descuento: N extras × porcentaje por producto (sin tope), sobre
 * los extras y, si la variante lo tiene prendido, también sobre la PC.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Categorías ("grupos") disponibles, en orden. Son ranuras fijas: cada una
 * tiene su etiqueta editable, categoría de WooCommerce y productos elegidos.
 * Las dos últimas son libres para lo que haga falta (la etiqueta la pone el
 * admin). El grupo "monitor" usa la configuración de "Sumale un monitor".
 */
function tgs_sq_setup_groups() {
	return array(
		'monitor'  => array( 'label' => 'Monitores', 'kicker' => 'Más hercios, más frames que ves' ),
		'keyboard' => array( 'label' => 'Teclados', 'kicker' => 'Para que cada tecla suene a victoria' ),
		'mouse'    => array( 'label' => 'Mouse', 'kicker' => 'Precisión para el headshot' ),
		'headset'  => array( 'label' => 'Auriculares', 'kicker' => 'Escuchá los pasos antes de verlos' ),
		'network'  => array( 'label' => 'Wifi y red', 'kicker' => 'Que el ping no te juegue en contra' ),
		'chair'    => array( 'label' => 'Sillas gamer', 'kicker' => 'Horas de juego sin dolor de espalda' ),
		'desk'     => array( 'label' => 'Escritorios', 'kicker' => 'Un lugar a la altura de tu PC' ),
		'mousepad' => array( 'label' => 'Mouse pads', 'kicker' => 'Deslizá como corresponde' ),
		'extra1'   => array( 'label' => '', 'kicker' => '' ),
		'extra2'   => array( 'label' => '', 'kicker' => '' ),
	);
}

/** Defaults de la sección (se mezclan en tgs_sq_default_extra()). */
function tgs_sq_setup_default_extra() {
	$extra = array(
		'setup_enabled'       => true,
		'setup_title'         => 'Potenciá tu setup',
		'setup_intro'         => 'Sumá lo que le falta a tu setup y ganá {{pct}}% de descuento por cada producto que agregues. Todo entra al carrito junto con la PC.',
		'setup_pct'           => 1,
		'setup_apply_pc'      => false,
		'setup_default_group' => 'monitor',
		'setup_done_title'    => '¡Ya está en tu carrito! 🎉',
		'setup_done_text'     => 'Podés finalizar la compra ahora o seguir mirando.',
		// Combos (BLOCK-10 etapa 3): se ofrecen en el aviso post-carrito si no eligió extras.
		'combos_enabled'      => true,
		'combos_count'        => 4,
		'combos_headline'     => 'Completá tu setup con un combo',
		'combos_text'         => 'Packs armados por nosotros con descuento. Se suman a tu PC en un toque.',
	);
	foreach ( tgs_sq_setup_groups() as $key => $meta ) {
		// Prendidos por defecto los que ya existían como grupos del modal y el monitor.
		$extra[ "setup_{$key}_enabled" ]  = in_array( $key, array( 'monitor', 'keyboard', 'mouse', 'headset' ), true );
		$extra[ "setup_{$key}_label" ]    = $meta['label'];
		$extra[ "setup_{$key}_category" ] = 0;
		$extra[ "setup_{$key}_products" ] = array();
		$extra[ "setup_{$key}_featured" ] = 0;
		$extra[ "setup_{$key}_count" ]    = 4;
	}
	return $extra;
}

/**
 * Configuración efectiva de un grupo. Para teclado/mouse/auriculares, si la
 * variante todavía no tiene nada cargado en la sección nueva, se toma lo que
 * tenía configurado para el modal viejo (mismos productos y categorías), así
 * al actualizar el plugin la ficha no aparece vacía.
 */
function tgs_sq_setup_group_config( array $extra, $key ) {
	$meta   = tgs_sq_setup_groups()[ $key ] ?? array( 'label' => '', 'kicker' => '' );
	$config = array(
		'key'      => $key,
		'enabled'  => ! empty( $extra[ "setup_{$key}_enabled" ] ),
		'label'    => trim( (string) ( $extra[ "setup_{$key}_label" ] ?? '' ) ) ?: $meta['label'],
		'kicker'   => $meta['kicker'],
		'category' => (int) ( $extra[ "setup_{$key}_category" ] ?? 0 ),
		'products' => array_values( array_filter( array_map( 'absint', (array) ( $extra[ "setup_{$key}_products" ] ?? array() ) ) ) ),
		'featured' => (int) ( $extra[ "setup_{$key}_featured" ] ?? 0 ),
		'count'    => max( 1, min( 12, (int) ( $extra[ "setup_{$key}_count" ] ?? 4 ) ) ),
	);
	if ( in_array( $key, array( 'keyboard', 'mouse', 'headset' ), true ) && ! $config['category'] && ! $config['products'] ) {
		$config['category'] = (int) ( $extra[ "upsell_{$key}_category" ] ?? 0 );
		$config['products'] = array_values( array_filter( array_map( 'absint', (array) ( $extra[ "upsell_{$key}_products" ] ?? array() ) ) ) );
		$config['featured'] = $config['featured'] ?: (int) ( $extra[ "upsell_{$key}_featured" ] ?? 0 );
	}
	return $config;
}

/** ¿La variante tiene la sección prendida? */
function tgs_sq_setup_enabled( array $extra ) {
	return ! empty( $extra['setup_enabled'] );
}

/** Porcentaje por producto (entero, 0-100). */
function tgs_sq_setup_pct( array $extra ) {
	return max( 0, min( 100, (int) ( $extra['setup_pct'] ?? 1 ) ) );
}

/**
 * Productos de un grupo: los elegidos primero (en su orden), después la
 * categoría, hasta `count`. Monitores: la lista/categoría de "Sumale un
 * monitor" (Ajustes o propia de la variante).
 */
function tgs_sq_setup_group_products( array $extra, $key ) {
	$config = tgs_sq_setup_group_config( $extra, $key );
	if ( 'monitor' === $key ) {
		$monitors = tgs_sq_monitor_products( $config['count'], $extra );
		$featured = tgs_sq_monitor_featured_id( $extra );
		usort( $monitors, function ( $a, $b ) use ( $featured ) { return ( (int) $b->get_id() === $featured ? 1 : 0 ) - ( (int) $a->get_id() === $featured ? 1 : 0 ); } );
		return $monitors;
	}
	$products = array();
	$seen     = array();
	foreach ( $config['products'] as $product_id ) {
		$product = tgs_sq_monitor_usable( $product_id );
		if ( $product ) {
			$products[]          = $product;
			$seen[ $product_id ] = true;
		}
	}
	if ( $config['category'] && count( $products ) < $config['count'] ) {
		$query = new WP_Query( array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => $config['count'] + count( $seen ),
			'orderby'        => 'menu_order title',
			'order'          => 'ASC',
			'tax_query'      => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
				array( 'taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $config['category'] ),
			),
		) );
		foreach ( $query->posts as $post ) {
			if ( isset( $seen[ $post->ID ] ) ) {
				continue;
			}
			$product = tgs_sq_monitor_usable( $post->ID );
			if ( $product ) {
				$products[]        = $product;
				$seen[ $post->ID ] = true;
			}
		}
	}
	$products = array_slice( $products, 0, $config['count'] );
	$featured = $config['featured'];
	usort( $products, function ( $a, $b ) use ( $featured ) { return ( (int) $b->get_id() === $featured ? 1 : 0 ) - ( (int) $a->get_id() === $featured ? 1 : 0 ); } );
	return $products;
}

/**
 * Grupos con productos para mostrar, en orden, con el grupo por defecto
 * primero si está configurado así. Vacío si la sección está apagada.
 */
function tgs_sq_setup_data( array $d ) {
	$extra = (array) ( $d['extra'] ?? array() );
	if ( empty( $d['product'] ) || ! tgs_sq_setup_enabled( $extra ) ) {
		return null;
	}
	$groups = array();
	foreach ( array_keys( tgs_sq_setup_groups() ) as $key ) {
		$config = tgs_sq_setup_group_config( $extra, $key );
		if ( ! $config['enabled'] || '' === $config['label'] ) {
			continue;
		}
		$products = tgs_sq_setup_group_products( $extra, $key );
		if ( ! $products ) {
			continue;
		}
		$featured = 'monitor' === $key ? tgs_sq_monitor_featured_id( $extra ) : $config['featured'];
		$groups[] = array(
			'key'    => $key,
			'label'  => $config['label'],
			'kicker' => $config['kicker'],
			'items'  => array_map( function ( $product ) use ( $featured ) { return tgs_sq_upsell_item( $product, $featured ); }, $products ),
		);
	}
	// Sin grupos con productos igual puede haber combos para el aviso post-carrito.
	$combos = tgs_sq_combos_modal_data( $d );
	if ( ! $groups && ! $combos ) {
		return null;
	}
	$default = sanitize_key( (string) ( $extra['setup_default_group'] ?? 'monitor' ) );
	$keys    = array_column( $groups, 'key' );
	$best    = tgs_sq_best_installment_plan( $d['installments'] );
	$pc      = (float) $d['product']->get_price();
	return array(
		'ajaxUrl'     => WC_AJAX::get_endpoint( 'add_to_cart' ),
		'cartUrl'     => wc_get_cart_url(),
		'checkoutUrl' => wc_get_checkout_url(),
		'productId'   => (int) $d['product_id'],
		'pcTitle'     => (string) $d['title'],
		'pcPrice'     => $pc,
		'pcList'      => $d['price_list'] > 0 ? $d['price_list'] / 100 : $pc,
		'bestN'       => $best ? (int) $best['installments'] : 0,
		'bestBps'     => $best ? (int) ( $best['interestBps'] ?? 0 ) : 0,
		'currency'    => get_woocommerce_currency(),
		'pct'         => tgs_sq_setup_pct( $extra ),
		'applyPc'     => ! empty( $extra['setup_apply_pc'] ),
		'defaultKey'  => in_array( $default, $keys, true ) ? $default : ( $keys[0] ?? '' ),
		'doneTitle'   => (string) ( $extra['setup_done_title'] ?? '' ),
		'doneText'    => (string) ( $extra['setup_done_text'] ?? '' ),
		'groups'      => $groups,
		'combos'      => $combos,
	);
}

/** HTML de la sección (pestañas + tarjetas + barra de fuego). */
function tgs_sq_setup_html( array $d ) {
	$data = tgs_sq_setup_data( $d );
	if ( ! $data ) {
		return '';
	}
	$json = '<script type="application/json" id="tgs-setup-data">' . wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG ) . '</script>';
	if ( ! $data['groups'] ) {
		// Solo combos: el JS igual intercepta el agregar al carrito para ofrecerlos.
		return $json;
	}
	$extra = (array) $d['extra'];
	$pct   = $data['pct'];
	$title = trim( (string) ( $extra['setup_title'] ?? '' ) ) ?: 'Potenciá tu setup';
	$intro = str_replace( '{{pct}}', (string) $pct, (string) ( $extra['setup_intro'] ?? '' ) );
	ob_start();
	echo '<section class="tgs-section-card tgs-setup" data-tgs-setup data-tgs-guide="' . esc_attr( $title ) . '">';
	echo '<div class="tgs-setup__head">';
	echo '<div><h2>' . esc_html( $title ) . '</h2>';
	if ( $intro ) {
		echo '<p class="tgs-setup__intro">' . esc_html( $intro ) . '</p>';
	}
	echo '</div>';
	// Barra de fuego: se llena con cada extra; el JS actualiza % y ahorro.
	echo '<div class="tgs-fire" data-tgs-fire aria-live="polite">';
	echo '<div class="tgs-fire__row"><span class="tgs-fire__icon">🔥</span><span class="tgs-fire__label">Tu descuento</span><strong class="tgs-fire__pct" data-fire-pct>0%</strong></div>';
	echo '<div class="tgs-fire__track"><div class="tgs-fire__fill" data-fire-fill style="width:0%"></div></div>';
	echo '<span class="tgs-fire__hint" data-fire-hint>Sumá un extra y arrancá con ' . esc_html( $pct ) . '% de descuento.</span>';
	echo '</div>';
	echo '</div>';
	// Pestañas: una por grupo. Botones reales para que funcionen con teclado.
	echo '<div class="tgs-setup__tabs" role="tablist">';
	foreach ( $data['groups'] as $group ) {
		$on = $group['key'] === $data['defaultKey'];
		echo '<button type="button" role="tab" class="tgs-setup__tab' . ( $on ? ' is-active' : '' ) . '" aria-selected="' . ( $on ? 'true' : 'false' ) . '" data-setup-tab="' . esc_attr( $group['key'] ) . '">'
			. '<span class="tgs-setup__tab-label">' . esc_html( $group['label'] ) . '</span><span class="tgs-setup__tab-count" data-setup-tab-count hidden>0</span></button>';
	}
	echo '</div>';
	foreach ( $data['groups'] as $group ) {
		$on = $group['key'] === $data['defaultKey'];
		echo '<div class="tgs-setup__panel" role="tabpanel" data-setup-panel="' . esc_attr( $group['key'] ) . '"' . ( $on ? '' : ' hidden' ) . '>';
		if ( $group['kicker'] ) {
			echo '<p class="tgs-setup__kicker">' . esc_html( $group['kicker'] ) . ' <span class="tgs-setup__one">Elegí uno.</span></p>';
		}
		echo '<div class="tgs-monitors-grid tgs-setup__grid">';
		foreach ( $group['items'] as $item ) {
			echo '<div class="tgs-monitor-card' . ( $item['featured'] ? ' tgs-monitor-card--featured' : '' ) . '">';
			if ( $item['featured'] ) {
				echo '<span class="tgs-monitor-star">★ Más elegido</span>';
			}
			echo '<button type="button" class="tgs-monitor-pick tgs-setup__pick" aria-pressed="false" data-setup-id="' . esc_attr( $item['id'] ) . '" data-setup-group="' . esc_attr( $group['key'] ) . '" data-setup-name="' . esc_attr( $item['name'] ) . '" data-setup-price="' . esc_attr( $item['price'] ) . '">';
			echo '<span class="tgs-monitor-media">' . ( $item['image'] ? '<img src="' . esc_url( $item['image'] ) . '" alt="" loading="lazy">' : '' ) . '</span>';
			echo '<span class="tgs-monitor-body">';
			echo '<span class="tgs-monitor-name">' . esc_html( $item['name'] ) . '</span>';
			echo '<span class="tgs-monitor-price">' . esc_html( $item['priceHtml'] ) . '</span>';
			echo '<span class="tgs-monitor-cta"><span class="tgs-monitor-cta--add">+ Agregar' . ( $pct ? ' · −' . (int) $pct . '%' : '' ) . '</span><span class="tgs-monitor-cta--added">✓ Elegido</span></span>';
			echo '</span>';
			echo '</button>';
			echo '<a class="tgs-monitor-link" href="' . esc_url( $item['url'] ) . '" target="_blank" rel="noopener">Ver ficha</a>';
			echo '</div>';
		}
		echo '</div>';
		echo '</div>';
	}
	// Resumen: qué eligió y cómo queda el total. Lo llena el JS.
	echo '<div class="tgs-setup__summary" data-setup-summary hidden>';
	echo '<div class="tgs-setup__summary-list" data-setup-summary-list></div>';
	echo '<div class="tgs-setup__summary-total"><span>PC <b data-setup-sum-pc></b> <i>+</i> extras <b data-setup-sum-extras></b> <i>−</i> <em data-setup-sum-off></em> <i>=</i> <strong data-setup-sum-total></strong></span>';
	echo '<span class="tgs-monitors-summary__hint">Al tocar "Agregar al carrito" entra todo junto con el descuento.</span></div>';
	echo '</div>';
	echo '</section>';
	echo $json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	return ob_get_clean();
}

function tgs_sq_block_setup( array $d ) {
	if ( empty( $d['setup_active'] ) ) {
		return;
	}
	echo tgs_sq_setup_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

/**
 * Campo oculto con los extras elegidos (IDs separados por coma). El JS de
 * la ficha lo llena; el hook de abajo los suma al carrito.
 */
add_action( 'woocommerce_after_add_to_cart_button', function () {
	if ( tgs_sq_is_managed_product() ) {
		echo '<input type="hidden" name="tgs_addon_extras" value="" data-tgs-addon-extras>';
	}
} );

/**
 * ¿Este ID es un extra ofrecible? Vale si alguna variante lo tiene en su
 * lista o en su categoría de algún grupo, o si es un monitor elegible. El
 * ID viene del navegador, así que se valida acá y no se confía en nada.
 */
function tgs_sq_is_setup_addon( $product_id ) {
	$product_id = absint( $product_id );
	if ( ! $product_id || ! tgs_sq_monitor_usable( $product_id ) ) {
		return false;
	}
	if ( tgs_sq_is_addon_monitor( $product_id ) ) {
		return true;
	}
	foreach ( tgs_sq_get_variants() as $variant ) {
		$extra = wp_parse_args( $variant['extra'] ?? array(), tgs_sq_default_extra() );
		foreach ( array_keys( tgs_sq_setup_groups() ) as $key ) {
			$config = tgs_sq_setup_group_config( $extra, $key );
			if ( in_array( $product_id, $config['products'], true ) ) {
				return true;
			}
			if ( $config['category'] && has_term( $config['category'], 'product_cat', $product_id ) ) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Cuando entra una PC al carrito con extras elegidos, se suman también (1
 * unidad cada uno), marcados con la PC a la que acompañan para que el
 * descuento se calcule por PC. Vale para el formulario y para los links
 * ?add-to-cart= de la barra flotante.
 */
add_action( 'woocommerce_add_to_cart', function ( $cart_item_key, $product_id ) {
	static $adding = false;
	if ( $adding || empty( $_REQUEST['tgs_addon_extras'] ) || ! tgs_sq_is_managed_product( $product_id ) || ! WC()->cart ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}
	$ids = array_unique( array_filter( array_map( 'absint', explode( ',', (string) wp_unslash( $_REQUEST['tgs_addon_extras'] ) ) ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$adding = true;
	foreach ( array_slice( $ids, 0, 30 ) as $extra_id ) {
		if ( tgs_sq_is_setup_addon( $extra_id ) ) {
			WC()->cart->add_to_cart( $extra_id, 1, 0, array(), array( 'tgs_setup_pc' => (int) $product_id ) );
		}
	}
	$adding = false;
}, 10, 2 );

/** En el carrito se ve a qué PC acompaña cada extra. */
add_filter( 'woocommerce_get_item_data', function ( $item_data, $cart_item ) {
	if ( ! empty( $cart_item['tgs_setup_pc'] ) ) {
		$item_data[] = array( 'key' => 'Extra de', 'value' => get_the_title( (int) $cart_item['tgs_setup_pc'] ) );
	}
	return $item_data;
}, 10, 2 );

/** Total de una línea del carrito; si Woo todavía no lo calculó, precio × cantidad. */
function tgs_sq_setup_line_total( array $line ) {
	if ( isset( $line['line_total'] ) && (float) $line['line_total'] > 0 ) {
		return (float) $line['line_total'];
	}
	$product = $line['data'] ?? null;
	return $product && is_object( $product ) ? (float) $product->get_price() * (int) ( $line['quantity'] ?? 1 ) : 0.0;
}

/**
 * El descuento "fuego", recalculado en cada cambio del carrito: por cada PC
 * publicada se cuentan los extras que la acompañan y siguen en el carrito;
 * el porcentaje es N × pct de la variante de esa PC, sobre los extras (y la
 * PC si la variante lo tiene prendido). Sale como una línea negativa.
 */
add_action( 'woocommerce_cart_calculate_fees', function ( $cart ) {
	if ( is_admin() && ! defined( 'DOING_AJAX' ) ) {
		return;
	}
	$pcs    = array();
	$extras = array();
	foreach ( $cart->get_cart() as $item ) {
		$pid = (int) $item['product_id'];
		if ( ! empty( $item['tgs_setup_pc'] ) ) {
			$extras[ (int) $item['tgs_setup_pc'] ][] = $item;
		} elseif ( tgs_sq_is_managed_product( $pid ) ) {
			$pcs[ $pid ][] = $item;
		}
	}
	$total_off = 0.0;
	$count     = 0;
	foreach ( $pcs as $pid => $lines ) {
		if ( empty( $extras[ $pid ] ) ) {
			continue;
		}
		$variant = tgs_sq_get_variant( tgs_sq_product_variant_slug( $pid ) );
		$extra   = wp_parse_args( $variant['extra'] ?? array(), tgs_sq_default_extra() );
		if ( ! tgs_sq_setup_enabled( $extra ) ) {
			continue;
		}
		$pct = tgs_sq_setup_pct( $extra );
		if ( ! $pct ) {
			continue;
		}
		// Se cuentan productos distintos, no unidades: "1% por producto".
		$distinct = array();
		$base     = 0.0;
		foreach ( $extras[ $pid ] as $line ) {
			$distinct[ (int) $line['product_id'] ] = true;
			$base += tgs_sq_setup_line_total( $line );
		}
		$n = count( $distinct );
		if ( ! empty( $extra['setup_apply_pc'] ) ) {
			foreach ( $lines as $line ) {
				$base += tgs_sq_setup_line_total( $line );
			}
		}
		$total_off += $base * $n * $pct / 100;
		$count     += $n;
	}
	if ( $total_off > 0 ) {
		$cart->add_fee( '🔥 Descuento setup (' . $count . ( 1 === $count ? ' extra' : ' extras' ) . ')', -round( $total_off, 2 ), false );
	}
} );

/**
 * Guía de la ficha: un índice fijo (rail a la izquierda en escritorio, hoja
 * inferior en celular) con todas las secciones que la página realmente
 * tiene. Se arma a partir del HTML ya renderizado: cada <section> con clase
 * tgs-section-card (o con data-tgs-guide="Etiqueta") recibe un id y una
 * entrada. Así vale para el modo bloques y para el diseño propio sin tener
 * que declarar nada.
 */
function tgs_sq_guide_labels() {
	return array(
		'la pc'           => 'Sobre la PC',
		'juegos'          => 'Rendimiento estimado',
		'componentes'     => 'Componentes',
		'descripción'     => 'Descripción',
		'galería'         => 'Galería',
		'compatibilidad'  => 'Compatibilidad',
		'formas de pago'  => 'Formas de pago',
		'envíos y retiro' => 'Envíos y retiro',
	);
}

function tgs_sq_guide_inject( $html ) {
	$entries = array();
	$index   = 0;
	$labels  = tgs_sq_guide_labels();
	$source  = $html;
	// Rangos de comentarios HTML: un <section> de ejemplo dentro de un
	// comentario del diseño propio no es una sección de la ficha.
	$comments = array();
	if ( preg_match_all( '/<!--.*?-->/s', $source, $cm, PREG_OFFSET_CAPTURE ) ) {
		foreach ( $cm[0] as $c ) {
			$comments[] = array( (int) $c[1], (int) $c[1] + strlen( $c[0] ) );
		}
	}
	// Secciones que no van en la guía aunque tengan título (el visor 3D vive en el hero).
	$skip = array( 'girala en 3d', '3d', 'visor 3d', 'modelo 3d' );
	$html    = preg_replace_callback(
		'/<section\b([^>]*)>/i',
		function ( $m ) use ( &$entries, &$index, $labels, $source, $comments, $skip ) {
			$attrs = $m[1][0];
			$open  = $m[0][0];
			$at    = (int) $m[0][1];
			foreach ( $comments as $range ) {
				if ( $at >= $range[0] && $at < $range[1] ) {
					return $open;
				}
			}
			$label = '';
			$hero  = false;
			if ( preg_match( '/data-tgs-guide="([^"]*)"/i', $attrs, $g ) ) {
				// data-tgs-guide="" = esta sección no va en la guía.
				$label = html_entity_decode( $g[1], ENT_QUOTES, 'UTF-8' );
				if ( '' === trim( $label ) ) {
					return $open;
				}
			} elseif ( preg_match( '/class="[^"]*\btgs-hero\b[^"]*"/i', $attrs ) ) {
				$label = 'La PC';
				$hero  = true;
			} elseif ( preg_match( '/class="[^"]*\btgs-section-card\b[^"]*"/i', $attrs ) ) {
				// El título es el primer <h2> después de la apertura.
				$tail = substr( $source, (int) $m[0][1], 1200 );
				if ( preg_match( '/<h2[^>]*>(.*?)<\/h2>/is', $tail, $h ) ) {
					$label = trim( html_entity_decode( wp_strip_all_tags( $h[1] ), ENT_QUOTES, 'UTF-8' ) );
				}
			}
			// Sin título real (vacío, puntos suspensivos, un ícono) no hay entrada.
			if ( mb_strlen( preg_replace( '/[^\p{L}\p{N}]/u', '', $label ) ) < 2 ) {
				return $open;
			}
			$key = mb_strtolower( trim( $label ) );
			if ( in_array( $key, $skip, true ) ) {
				return $open;
			}
			$label = $labels[ $key ] ?? $label;
			if ( preg_match( '/\sid="([^"]+)"/i', $attrs, $id_match ) ) {
				$id = $id_match[1];
			} else {
				$index++;
				$id    = $hero ? 'tgs-hero' : 'tgs-s-' . $index;
				$attrs = ' id="' . $id . '"' . $attrs;
			}
			$entries[] = array( 'id' => $id, 'label' => $label, 'setup' => false !== strpos( $attrs, 'data-tgs-setup' ), 'hero' => $hero );
			return '<section' . $attrs . '>';
		},
		$html,
		-1,
		$replaced,
		PREG_OFFSET_CAPTURE
	);
	return array( $html, $entries );
}

function tgs_sq_guide_html( array $entries, array $d ) {
	if ( count( $entries ) < 2 ) {
		return '';
	}
	$has_setup = (bool) array_filter( $entries, function ( $e ) { return $e['setup']; } );
	$hero      = current( array_filter( $entries, function ( $e ) { return ! empty( $e['hero'] ); } ) );
	// Sin hero del plugin (diseño propio), "Comprar" vuelve arriba de todo.
	$buy_id    = $hero ? $hero['id'] : 'top';
	ob_start();
	echo '<nav class="tgs-guide" data-tgs-guide-nav aria-label="Secciones de la ficha">';
	echo '<div class="tgs-guide__box">';
	echo '<span class="tgs-guide__title"><i></i>En esta ficha</span>';
	echo '<ol class="tgs-guide__list">';
	foreach ( $entries as $entry ) {
		echo '<li><a href="#' . esc_attr( $entry['id'] ) . '" class="tgs-guide__link' . ( $entry['setup'] ? ' tgs-guide__link--setup' : '' ) . '" data-guide-target="' . esc_attr( $entry['id'] ) . '">'
			. ( $entry['setup'] ? '<span class="tgs-guide__flame">🔥</span>' : '' ) . esc_html( $entry['label'] ) . '</a></li>';
	}
	echo '</ol>';
	if ( $has_setup ) {
		echo '<div class="tgs-guide__fire" data-guide-fire hidden><span data-guide-fire-text></span></div>';
	}
	echo '<a class="tgs-guide__buy" href="#' . esc_attr( $buy_id ) . '" data-guide-target="' . esc_attr( $buy_id ) . '">Comprar</a>';
	echo '</div>';
	echo '</nav>';
	// Celular: botón flotante que abre la misma lista como hoja inferior.
	echo '<button type="button" class="tgs-guide-fab" data-guide-open aria-label="Ir a una sección"><span>☰</span> Guía</button>';
	return ob_get_clean();
}
