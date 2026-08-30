<?php
/**
 * Crea/actualiza el producto de WooCommerce a partir del payload que manda
 * TGS-SMART-QUOTES. No decide diseño acá — solo persiste los datos del
 * presupuesto como producto + metadatos. El diseño (variante) se elige
 * aparte, desde el admin de WordPress, y nunca se pisa en esta función.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Busca el producto ya publicado para un externalId dado (id de
 * QuoteVersion en TGS-SMART-QUOTES). Devuelve 0 si todavía no existe.
 */
function tgs_sq_find_product_id( $external_id ) {
	$ids = get_posts( array(
		'post_type'   => 'product',
		'post_status' => 'any',
		'fields'      => 'ids',
		'numberposts' => 1,
		'meta_key'    => TGS_SQ_META_EXTERNAL_ID,
		'meta_value'  => $external_id,
	) );
	return $ids ? (int) $ids[0] : 0;
}

/**
 * Categoría de producto donde caen todos los presupuestos publicados.
 * Se crea sola la primera vez si no existe.
 */
function tgs_sq_ensure_category() {
	$term = term_exists( 'TGS', 'product_cat' );
	if ( ! $term ) {
		$term = wp_insert_term( 'TGS', 'product_cat' );
	}
	if ( is_wp_error( $term ) ) {
		return 0;
	}
	return (int) ( is_array( $term ) ? $term['term_id'] : $term );
}

/**
 * Crea o actualiza el producto WooCommerce a partir del payload validado.
 * Devuelve el ID de post del producto.
 */
function tgs_sq_sync_product( array $payload ) {
	if ( ! class_exists( 'WC_Product_Simple' ) ) {
		return new WP_Error( 'tgs_woocommerce_inactive', 'WooCommerce no está activo', array( 'status' => 503 ) );
	}

	$external_id = sanitize_text_field( $payload['externalId'] ?? '' );
	if ( '' === $external_id ) {
		return new WP_Error( 'tgs_missing_external_id', 'externalId es obligatorio', array( 'status' => 400 ) );
	}

	$product_id = tgs_sq_find_product_id( $external_id );
	$product    = $product_id ? wc_get_product( $product_id ) : new WC_Product_Simple();
	if ( ! $product ) {
		return new WP_Error( 'tgs_product_load_failed', 'No se pudo cargar el producto', array( 'status' => 500 ) );
	}

	$title             = sanitize_text_field( $payload['title'] ?? 'Presupuesto TGS' );
	$price_transfer_ars = ( (int) ( $payload['priceTransferCents'] ?? 0 ) ) / 100;

	$product->set_name( $title );
	$product->set_status( 'publish' );
	$product->set_catalog_visibility( 'visible' );
	$product->set_regular_price( wc_format_decimal( $price_transfer_ars, 2 ) );
	$product->set_manage_stock( false );
	$product->set_sku( 'TGS-' . substr( preg_replace( '/[^A-Za-z0-9]/', '', $external_id ), 0, 24 ) );

	if ( ! empty( $payload['slug'] ) ) {
		$product->set_slug( sanitize_title( $payload['slug'] ) );
	}

	$product_id = $product->save();

	$category_id = tgs_sq_ensure_category();
	if ( $category_id ) {
		wp_set_object_terms( $product_id, array( $category_id ), 'product_cat' );
	}

	$meta = array(
		TGS_SQ_META_EXTERNAL_ID     => $external_id,
		TGS_SQ_META_MANAGED         => '1',
		TGS_SQ_META_MODEL3D         => esc_url_raw( $payload['model3dUrl'] ?? '' ),
		TGS_SQ_META_THUMBNAIL       => esc_url_raw( $payload['thumbnailUrl'] ?? '' ),
		TGS_SQ_META_GALLERY         => wp_json_encode( $payload['gallery'] ?? array() ),
		TGS_SQ_META_PRICE_LIST      => (string) (int) ( $payload['priceListCents'] ?? 0 ),
		TGS_SQ_META_PRICE_CASH      => (string) (int) ( $payload['priceCashCents'] ?? 0 ),
		TGS_SQ_META_PRICE_TRANSFER  => (string) (int) ( $payload['priceTransferCents'] ?? 0 ),
		TGS_SQ_META_INSTALLMENTS    => wp_json_encode( $payload['installments'] ?? array() ),
		TGS_SQ_META_ITEMS           => wp_json_encode( tgs_sq_sanitize_items( $payload['items'] ?? array() ) ),
		TGS_SQ_META_DESCRIPTION     => wp_kses_post( $payload['descriptionHtml'] ?? '' ),
		TGS_SQ_META_POWER           => wp_json_encode( $payload['power'] ?? array() ),
		TGS_SQ_META_GAMES           => wp_json_encode( $payload['games'] ?? array() ),
		TGS_SQ_META_COMPATIBILITY   => wp_json_encode( $payload['compatibility'] ?? array() ),
	);
	foreach ( $meta as $key => $value ) {
		update_post_meta( $product_id, $key, $value );
	}

	// La variante de diseño NUNCA se pisa acá: si el producto es nuevo se le
	// asigna la variante default una sola vez; si ya existía (re-publish),
	// se respeta lo que el admin haya elegido en WordPress.
	if ( '' === (string) get_post_meta( $product_id, TGS_SQ_META_VARIANT, true ) ) {
		update_post_meta( $product_id, TGS_SQ_META_VARIANT, TGS_SQ_DEFAULT_VARIANT );
	}

	return $product_id;
}

/**
 * Limpia la lista de componentes que llega en el payload. Cada item trae
 * al menos name/imageUrl/specs; specs.line es la "parte" (CPU, Mother,
 * etc.) y specs no incluye precio individual a propósito — el precio que
 * se muestra siempre es el total de la PC, nunca por componente.
 *
 * NOTA: hoy el payload de TGS-SMART-QUOTES no manda una descripción breve
 * por componente. El campo se deja contemplado (item.description) para
 * cuando se actualice el backend; mientras tanto llega vacío y la
 * plantilla simplemente no muestra esa línea.
 */
function tgs_sq_sanitize_items( $items ) {
	if ( ! is_array( $items ) ) {
		return array();
	}
	$clean = array();
	foreach ( $items as $item ) {
		if ( ! is_array( $item ) ) {
			continue;
		}
		$specs = is_array( $item['specs'] ?? null ) ? $item['specs'] : array();
		$clean[] = array(
			'name'        => sanitize_text_field( $item['name'] ?? '' ),
			'imageUrl'    => esc_url_raw( $item['imageUrl'] ?? '' ),
			'description' => sanitize_text_field( $item['description'] ?? ( $specs['description'] ?? '' ) ),
			'part'        => sanitize_text_field( $specs['line'] ?? ( $item['part'] ?? '' ) ),
		);
	}
	return $clean;
}

/**
 * Pone el producto en borrador (no lo borra) cuando TGS-SMART-QUOTES pide
 * despublicar un presupuesto.
 */
function tgs_sq_unpublish_product( $external_id ) {
	$product_id = tgs_sq_find_product_id( $external_id );
	if ( $product_id ) {
		wp_update_post( array( 'ID' => $product_id, 'post_status' => 'draft' ) );
	}
	return $product_id;
}
