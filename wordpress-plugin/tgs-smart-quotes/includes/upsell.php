<?php
/**
 * "Completá tu setup": modal que aparece DESPUÉS de agregar la PC (y el
 * monitor elegido) al carrito, con carruseles de teclados, mouse y
 * auriculares (y monitores, si no eligió uno) y un descuento por sumarlos
 * en ese momento.
 *
 * Todo se configura por variante (Variantes → "Después de agregar al
 * carrito"): categorías y productos elegidos por grupo, porcentaje de
 * descuento y textos. El descuento se aplica con un cupón de WooCommerce
 * que el plugin crea y mantiene solo (TGS-SETUP-<variante>), restringido
 * a los productos y categorías del modal; se aplica automáticamente cuando
 * el producto entra al carrito desde el modal.
 */

defined( 'ABSPATH' ) || exit;

/** Grupos del modal, en el orden en que se muestran. */
function tgs_sq_upsell_groups() {
	return array(
		'keyboard' => array( 'label' => 'Teclados', 'kicker' => 'Para que cada tecla suene a victoria' ),
		'mouse'    => array( 'label' => 'Mouse', 'kicker' => 'Precisión para el headshot' ),
		'headset'  => array( 'label' => 'Auriculares', 'kicker' => 'Escuchá los pasos antes de verlos' ),
	);
}

/** Productos de un grupo: primero los elegidos, después la categoría, hasta $count. */
function tgs_sq_upsell_group_products( array $extra, $group, $count = 12 ) {
	$ids         = array_values( array_filter( array_map( 'absint', (array) ( $extra[ "upsell_{$group}_products" ] ?? array() ) ) ) );
	$category_id = (int) ( $extra[ "upsell_{$group}_category" ] ?? 0 );
	$products    = array();
	$seen        = array();
	foreach ( $ids as $product_id ) {
		$product = tgs_sq_monitor_usable( $product_id );
		if ( $product ) {
			$products[]          = $product;
			$seen[ $product_id ] = true;
		}
	}
	if ( $category_id && count( $products ) < $count ) {
		$query = new WP_Query( array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => $count + count( $seen ),
			'orderby'        => 'menu_order title',
			'order'          => 'ASC',
			'tax_query'      => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
				array( 'taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $category_id ),
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
	return array_slice( $products, 0, $count );
}

/** Cupón de periféricos (kind 'setup') o de monitores (kind 'monitor'). */
function tgs_sq_upsell_coupon_code( $variant_slug, $kind = 'setup' ) {
	return ( 'monitor' === $kind ? 'TGS-MONITOR-' : 'TGS-SETUP-' ) . strtoupper( preg_replace( '/[^a-z0-9]/i', '', (string) $variant_slug ) ?: 'DEFAULT' );
}

/** Crea/actualiza un cupón porcentual restringido a productos/categorías; lo desactiva si pct = 0. */
function tgs_sq_upsell_write_coupon( $code, $pct, array $product_ids, array $categories, $description ) {
	$id = wc_get_coupon_id_by_code( $code );
	$product_ids = array_values( array_unique( array_filter( array_map( 'absint', $product_ids ) ) ) );
	$categories  = array_values( array_unique( array_filter( array_map( 'absint', $categories ) ) ) );
	if ( ! $pct || ( ! $product_ids && ! $categories ) ) {
		if ( $id ) {
			wp_trash_post( $id );
		}
		return '';
	}
	$coupon = new WC_Coupon( $id ?: 0 );
	if ( $id && 'trash' === get_post_status( $id ) ) {
		wp_untrash_post( $id );
	}
	$coupon->set_code( $code );
	$coupon->set_discount_type( 'percent' );
	$coupon->set_amount( $pct );
	$coupon->set_product_ids( $product_ids );
	$coupon->set_product_categories( $categories );
	$coupon->set_individual_use( false );
	$coupon->set_exclude_sale_items( false );
	$coupon->set_usage_limit( 0 );
	$coupon->set_description( $description );
	$coupon->save();
	return $code;
}

/**
 * Crea o actualiza el cupón del modal para una variante: porcentaje sobre
 * los productos/categorías del modal (más los monitores), sin límite de
 * usos, no publicado en ningún lado. Si el descuento es 0 se deja
 * inactivo (papelera).
 */
function tgs_sq_upsell_ensure_coupon( array $variant, $kind = 'setup' ) {
	if ( ! class_exists( 'WC_Coupon' ) ) {
		return '';
	}
	$extra = wp_parse_args( $variant['extra'] ?? array(), tgs_sq_default_extra() );
	$slug  = $variant['slug'] ?? 'default';
	$name  = $variant['name'] ?? $slug;
	$note  = 'Cupón automático de TGS Smart Quotes (variante ' . $name . '). No lo edites: se regenera al guardar la variante.';
	if ( 'monitor' === $kind ) {
		$pct = max( 0, min( 90, (int) ( $extra['upsell_monitor_discount_pct'] ?? 0 ) ) );
		if ( 'custom' === ( $extra['monitors_source'] ?? 'settings' ) ) {
			$ids  = (array) ( $extra['monitors_products'] ?? array() );
			$cats = array();
		} else {
			$ids  = tgs_sq_monitor_product_ids();
			$cats = array( tgs_sq_monitor_category_id() );
		}
		return tgs_sq_upsell_write_coupon( tgs_sq_upsell_coupon_code( $slug, 'monitor' ), $pct, $ids, $cats, 'Descuento de monitores del modal "Completá tu setup". ' . $note );
	}
	$pct = max( 0, min( 90, (int) ( $extra['upsell_discount_pct'] ?? 0 ) ) );
	$ids  = array();
	$cats = array();
	foreach ( array_keys( tgs_sq_upsell_groups() ) as $group ) {
		$ids = array_merge( $ids, (array) ( $extra[ "upsell_{$group}_products" ] ?? array() ) );
		if ( ! empty( $extra[ "upsell_{$group}_category" ] ) ) {
			$cats[] = (int) $extra[ "upsell_{$group}_category" ];
		}
	}
	return tgs_sq_upsell_write_coupon( tgs_sq_upsell_coupon_code( $slug, 'setup' ), $pct, $ids, $cats, 'Descuento de periféricos del modal "Completá tu setup". ' . $note );
}

/** Los dos cupones de una variante (periféricos y monitores). */
function tgs_sq_upsell_ensure_coupons( array $variant ) {
	return array_filter( array( tgs_sq_upsell_ensure_coupon( $variant, 'setup' ), tgs_sq_upsell_ensure_coupon( $variant, 'monitor' ) ) );
}

/**
 * Datos del modal para el JS (JSON en la ficha). Null si está apagado o no
 * hay productos en ningún grupo.
 */
function tgs_sq_upsell_data( array $d, $variant_slug ) {
	if ( empty( $d['product'] ) || empty( $d['extra']['upsell_enabled'] ) ) {
		return null;
	}
	$extra  = $d['extra'];
	$pct    = max( 0, min( 90, (int) ( $extra['upsell_discount_pct'] ?? 0 ) ) );
	$groups = array();
	foreach ( tgs_sq_upsell_groups() as $key => $meta ) {
		$products = tgs_sq_upsell_group_products( $extra, $key );
		if ( $products ) {
			$groups[] = array( 'key' => $key, 'label' => $meta['label'], 'kicker' => $meta['kicker'], 'items' => array_map( 'tgs_sq_upsell_item', $products ) );
		}
	}
	// Monitores: solo se ofrecen si no eligió uno (lo decide el JS).
	$monitors = tgs_sq_monitor_products( (int) ( $extra['monitors_count'] ?? 6 ), $extra );
	if ( ! $groups && ! $monitors ) {
		return null;
	}
	$variant     = tgs_sq_get_variant( $variant_slug ) ?: array( 'slug' => $variant_slug, 'extra' => $extra );
	$coupon      = $pct ? tgs_sq_upsell_coupon_code( $variant_slug, 'setup' ) : '';
	if ( $coupon && ! wc_get_coupon_id_by_code( $coupon ) ) {
		$coupon = tgs_sq_upsell_ensure_coupon( $variant, 'setup' );
	}
	$monitor_pct    = max( 0, min( 90, (int) ( $extra['upsell_monitor_discount_pct'] ?? 0 ) ) );
	$monitor_coupon = $monitor_pct ? tgs_sq_upsell_coupon_code( $variant_slug, 'monitor' ) : '';
	if ( $monitor_coupon && ! wc_get_coupon_id_by_code( $monitor_coupon ) ) {
		$monitor_coupon = tgs_sq_upsell_ensure_coupon( $variant, 'monitor' );
	}
	return array(
		'ajaxUrl'       => WC_AJAX::get_endpoint( 'add_to_cart' ),
		'cartUrl'       => wc_get_cart_url(),
		'checkoutUrl'   => wc_get_checkout_url(),
		'productId'     => (int) $d['product_id'],
		'variant'       => (string) $variant_slug,
		'discountPct'   => $coupon ? $pct : 0,
		'monitorDiscountPct' => $monitor_coupon ? $monitor_pct : 0,
		'headline'      => (string) ( $extra['upsell_headline'] ?? '' ),
		'text'          => (string) ( $extra['upsell_text'] ?? '' ),
		'noMonitorText' => (string) ( $extra['upsell_no_monitor_text'] ?? '' ),
		'groups'        => $groups,
		'monitors'      => $monitors ? array( 'key' => 'monitor', 'label' => 'Monitores', 'kicker' => 'Ya sé, ya tenés uno…', 'items' => array_map( 'tgs_sq_upsell_item', $monitors ) ) : null,
	);
}

function tgs_sq_upsell_item( $product ) {
	$price = (float) $product->get_price();
	return array(
		'id'        => $product->get_id(),
		'name'      => $product->get_name(),
		'price'     => $price,
		'priceHtml' => wp_strip_all_tags( wc_price( $price ) ),
		'image'     => (string) get_the_post_thumbnail_url( $product->get_id(), 'woocommerce_thumbnail' ),
		'url'       => get_permalink( $product->get_id() ),
	);
}

/** Imprime el JSON del modal (en los dos modos de diseño). */
function tgs_sq_upsell_data_html( array $d, $variant_slug ) {
	$data = tgs_sq_upsell_data( $d, $variant_slug );
	if ( ! $data ) {
		return;
	}
	echo '<script type="application/json" id="tgs-upsell-data">' . wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG ) . '</script>';
}

/**
 * Cuando un producto entra al carrito desde el modal (tgs_upsell=<variante>),
 * se aplica el cupón de esa variante. El cupón ya está restringido a los
 * productos/categorías del modal, así que no descuenta nada más.
 */
add_action( 'woocommerce_add_to_cart', function () {
	$variant_slug = sanitize_title( wp_unslash( $_REQUEST['tgs_upsell'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$kind         = 'monitor' === ( $_REQUEST['tgs_upsell_kind'] ?? '' ) ? 'monitor' : 'setup'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( '' === $variant_slug || ! WC()->cart ) {
		return;
	}
	$variant = tgs_sq_get_variant( $variant_slug );
	$pct_key = 'monitor' === $kind ? 'upsell_monitor_discount_pct' : 'upsell_discount_pct';
	if ( ! $variant || empty( $variant['extra']['upsell_enabled'] ) || empty( $variant['extra'][ $pct_key ] ) ) {
		return;
	}
	$code = tgs_sq_upsell_coupon_code( $variant_slug, $kind );
	if ( ! wc_get_coupon_id_by_code( $code ) ) {
		$code = tgs_sq_upsell_ensure_coupon( $variant, $kind );
	}
	if ( $code && ! WC()->cart->has_discount( $code ) ) {
		WC()->cart->apply_coupon( $code );
	}
}, 20 );
