<?php
/**
 * Combos de la tienda (BLOCK-10, etapa 3): productos publicados desde TGS con
 * kind=COMBO. Se venden como un producto único con precio tachado
 * (descuento inverso: el precio es el final, el tachado sale de
 * precio / (1 − %)) y pueden estar OCULTOS: no salen en listados ni en la
 * búsqueda, llevan noindex y solo se pueden comprar desde el modal que se
 * abre al agregar una PC al carrito sin extras.
 *
 * El tachado se muestra solo en la ficha y en el modal: no se toca el precio
 * regular/oferta de WooCommerce, así el resto del sitio no ve "Oferta".
 */

defined( 'ABSPATH' ) || exit;

function tgs_sq_is_combo( $product_id = 0 ) {
	$product_id = $product_id ?: get_the_ID();
	return $product_id && 'COMBO' === get_post_meta( $product_id, TGS_SQ_META_KIND, true );
}

/** ¿Combo oculto (solo se compra desde el modal)? */
function tgs_sq_combo_hidden( $product_id ) {
	return tgs_sq_is_combo( $product_id ) && '0' === (string) get_post_meta( $product_id, TGS_SQ_META_STORE_VISIBLE, true );
}

/** Datos de precio del combo: precio final, tachado (o 0) y % de descuento. */
function tgs_sq_combo_pricing( $product_id ) {
	$price   = (int) get_post_meta( $product_id, TGS_SQ_META_PRICE_TRANSFER, true );
	$regular = (int) get_post_meta( $product_id, TGS_SQ_META_REGULAR_PRICE, true );
	$bps     = (int) get_post_meta( $product_id, TGS_SQ_META_COMBO_DISCOUNT_BPS, true );
	return array(
		'priceCents'   => $price,
		'regularCents' => $regular > $price ? $regular : 0,
		'pct'          => $bps > 0 ? $bps / 100 : 0,
	);
}

/** HTML del precio tachado + precio final (para el hero y la barra). */
function tgs_sq_combo_strike_html( $product_id ) {
	$pricing = tgs_sq_combo_pricing( $product_id );
	if ( ! $pricing['regularCents'] ) {
		return '';
	}
	return '<span class="tgs-combo-strike"><s>' . wp_kses_post( wc_price( $pricing['regularCents'] / 100 ) ) . '</s>'
		. ( $pricing['pct'] ? '<em class="tgs-combo-off">−' . esc_html( rtrim( rtrim( number_format( $pricing['pct'], 1, ',', '.' ), '0' ), ',' ) ) . '%</em>' : '' ) . '</span>';
}

/**
 * Combos asociados a una PC en TGS (meta _tgs_combos = externalIds en
 * orden), resueltos a productos publicados. Visibles y ocultos por igual:
 * el modal es justamente la puerta de los ocultos.
 */
function tgs_sq_pc_combo_products( $pc_product_id, $count = 4 ) {
	if ( ! function_exists( 'wc_get_product' ) ) {
		return array();
	}
	$external_ids = json_decode( (string) get_post_meta( $pc_product_id, TGS_SQ_META_COMBOS, true ), true );
	if ( ! is_array( $external_ids ) || ! $external_ids ) {
		return array();
	}
	$products = array();
	foreach ( array_slice( $external_ids, 0, max( 1, (int) $count ) ) as $external_id ) {
		$product_id = tgs_sq_find_product_id( (string) $external_id );
		if ( ! $product_id || 'publish' !== get_post_status( $product_id ) || ! tgs_sq_is_combo( $product_id ) ) {
			continue;
		}
		$product = wc_get_product( $product_id );
		if ( $product && $product->is_type( 'simple' ) ) {
			$products[] = $product;
		}
	}
	return $products;
}

/**
 * Todos los combos publicados (para el admin o como respaldo), hasta $count.
 * Orden: los del admin (menu_order) y después por precio.
 */
function tgs_sq_combo_products( $count = 4, $exclude_id = 0 ) {
	if ( ! function_exists( 'wc_get_product' ) ) {
		return array();
	}
	$query = new WP_Query( array(
		'post_type'      => 'product',
		'post_status'    => 'publish',
		'posts_per_page' => max( 1, (int) $count ),
		'post__not_in'   => $exclude_id ? array( $exclude_id ) : array(),
		'orderby'        => array( 'menu_order' => 'ASC', 'meta_value_num' => 'ASC' ),
		'meta_key'       => TGS_SQ_META_PRICE_TRANSFER, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
			array( 'key' => TGS_SQ_META_KIND, 'value' => 'COMBO' ),
		),
	) );
	$products = array();
	foreach ( $query->posts as $post ) {
		$product = wc_get_product( $post->ID );
		if ( $product && $product->is_type( 'simple' ) ) {
			$products[] = $product;
		}
	}
	return $products;
}

/** Datos de un combo para el JS del modal. */
function tgs_sq_combo_item( WC_Product $product ) {
	$pid     = $product->get_id();
	$pricing = tgs_sq_combo_pricing( $pid );
	$items   = json_decode( (string) get_post_meta( $pid, TGS_SQ_META_ITEMS, true ), true );
	$names   = array();
	foreach ( is_array( $items ) ? $items : array() as $item ) {
		if ( ! empty( $item['name'] ) ) {
			$names[] = (string) $item['name'];
		}
	}
	$money = function ( $cents ) { return html_entity_decode( wp_strip_all_tags( wc_price( $cents / 100, array( 'decimals' => 0 ) ) ), ENT_QUOTES, 'UTF-8' ); };
	return array(
		'id'          => $pid,
		'name'        => $product->get_name(),
		'price'       => $pricing['priceCents'] / 100,
		'priceHtml'   => $money( $pricing['priceCents'] ),
		'regularHtml' => $pricing['regularCents'] ? $money( $pricing['regularCents'] ) : '',
		'pct'         => $pricing['pct'],
		'image'       => (string) ( get_the_post_thumbnail_url( $pid, 'woocommerce_single' ) ?: get_post_meta( $pid, TGS_SQ_META_THUMBNAIL, true ) ),
		'tagline'     => (string) get_post_meta( $pid, TGS_SQ_META_TAGLINE, true ),
		'items'       => $names,
		'url'         => get_permalink( $pid ),
		'hidden'      => tgs_sq_combo_hidden( $pid ),
	);
}

/* ---------------------------------------------------------------------
 * Ocultos: fuera de listados, búsqueda y Google.
 * ------------------------------------------------------------------- */

// Visibilidad de catálogo la fija el sync (hidden/visible). Además, noindex.
add_filter( 'wp_robots', function ( array $robots ) {
	if ( is_singular( 'product' ) && tgs_sq_combo_hidden( get_the_ID() ) ) {
		$robots['noindex']  = true;
		$robots['nofollow'] = true;
	}
	return $robots;
} );

// Fuera del sitemap de WordPress (los SEO plugins respetan la visibilidad "hidden" de Woo).
add_filter( 'wp_sitemaps_posts_query_args', function ( array $args, $post_type ) {
	if ( 'product' !== $post_type ) {
		return $args;
	}
	$args['meta_query'] = array_merge( (array) ( $args['meta_query'] ?? array() ), array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
		array(
			'relation' => 'OR',
			array( 'key' => TGS_SQ_META_STORE_VISIBLE, 'compare' => 'NOT EXISTS' ),
			array( 'key' => TGS_SQ_META_STORE_VISIBLE, 'value' => '0', 'compare' => '!=' ),
		),
	) );
	return $args;
}, 10, 2 );

/**
 * Un combo oculto solo entra al carrito desde el modal (tgs_combo_from =
 * la PC que acaba de agregarse). Si alguien llega a la URL directa y manda
 * el formulario, se rechaza con un aviso. Los visibles se compran normal.
 */
add_filter( 'woocommerce_add_to_cart_validation', function ( $passed, $product_id ) {
	if ( ! $passed || ! tgs_sq_combo_hidden( $product_id ) ) {
		return $passed;
	}
	$from = absint( $_REQUEST['tgs_combo_from'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( $from && tgs_sq_is_managed_product( $from ) && WC()->cart ) {
		foreach ( WC()->cart->get_cart() as $item ) {
			if ( (int) $item['product_id'] === $from ) {
				return true;
			}
		}
	}
	wc_add_notice( 'Este combo se compra junto con una PC: agregá primero la PC al carrito.', 'error' );
	return false;
}, 10, 2 );

/** En el carrito, el combo muestra con qué PC entró. */
add_action( 'woocommerce_add_to_cart', function ( $cart_item_key, $product_id ) {
	$from = absint( $_REQUEST['tgs_combo_from'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( $from && tgs_sq_is_combo( $product_id ) && WC()->cart && isset( WC()->cart->cart_contents[ $cart_item_key ] ) ) {
		WC()->cart->cart_contents[ $cart_item_key ]['tgs_combo_from'] = $from;
	}
}, 5, 2 );
add_filter( 'woocommerce_get_item_data', function ( $item_data, $cart_item ) {
	if ( ! empty( $cart_item['tgs_combo_from'] ) ) {
		$item_data[] = array( 'key' => 'Combo para', 'value' => get_the_title( (int) $cart_item['tgs_combo_from'] ) );
	}
	return $item_data;
}, 10, 2 );

/** Datos de los combos para el modal post-carrito (JSON en la ficha de una PC). */
function tgs_sq_combos_modal_data( array $d ) {
	if ( empty( $d['product'] ) || tgs_sq_is_combo( $d['product_id'] ) ) {
		return null;
	}
	$extra = (array) ( $d['extra'] ?? array() );
	if ( empty( $extra['combos_enabled'] ) ) {
		return null;
	}
	// Solo los combos que se le asociaron a esta PC en TGS; sin asociados, no se ofrece nada.
	$combos = tgs_sq_pc_combo_products( (int) $d['product_id'], (int) ( $extra['combos_count'] ?? 4 ) );
	if ( ! $combos ) {
		return null;
	}
	return array(
		'headline' => (string) ( $extra['combos_headline'] ?? '' ),
		'text'     => (string) ( $extra['combos_text'] ?? '' ),
		'items'    => array_map( 'tgs_sq_combo_item', $combos ),
	);
}
