<?php
/**
 * Crea/actualiza el producto de WooCommerce a partir del payload que manda
 * TGS-SMART-QUOTES. No decide diseño acá — solo persiste los datos del
 * presupuesto como producto + metadatos. El diseño (variante) se elige
 * aparte, desde el admin de WordPress, y nunca se pisa en esta función.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Todos los productos etiquetados con alguno de estos externalIds, incluidos
 * los que están en la papelera (si no, un producto tirado a la papelera y
 * vuelto a publicar se creaba de nuevo y chocaba por SKU duplicado).
 */
function tgs_sq_find_product_ids( array $external_ids ) {
	$external_ids = array_values( array_filter( array_map( 'sanitize_text_field', $external_ids ) ) );
	if ( empty( $external_ids ) ) {
		return array();
	}
	$ids = get_posts( array(
		'post_type'   => 'product',
		'post_status' => array( 'publish', 'pending', 'draft', 'future', 'private', 'trash' ),
		'fields'      => 'ids',
		'numberposts' => 20,
		'orderby'     => 'ID',
		'order'       => 'ASC',
		'meta_query'  => array(
			array(
				'key'     => TGS_SQ_META_EXTERNAL_ID,
				'value'   => $external_ids,
				'compare' => 'IN',
			),
		),
	) );
	return array_map( 'intval', $ids );
}

/**
 * Producto ya publicado para un externalId (id del presupuesto en
 * TGS-SMART-QUOTES). Devuelve 0 si todavía no existe.
 */
function tgs_sq_find_product_id( $external_id ) {
	$ids = tgs_sq_find_product_ids( array( $external_id ) );
	return $ids ? (int) $ids[0] : 0;
}

/**
 * Resuelve el producto a actualizar a partir del externalId actual y de los
 * ids con los que pudo haber quedado etiquetado antes (los ids de versión que
 * se usaban en versiones anteriores del sistema).
 *
 * - Si hay un producto con el id actual, es ese.
 * - Si no, el primero que tenga un id viejo se re-etiqueta con el actual.
 * - Cualquier otro producto que coincida es un duplicado: se pasa a borrador
 *   con una nota, nunca se borra.
 */
/** Entre varios productos con el mismo id: publicado > no borrado > más nuevo. */
function tgs_sq_pick_product_to_keep( array $ids ) {
	$best       = 0;
	$best_score = -1;
	foreach ( $ids as $id ) {
		$status = get_post_status( (int) $id );
		$score  = ( 'publish' === $status ? 200 : ( 'trash' === $status ? 0 : 100 ) ) + (int) $id / 1e9;
		if ( $score > $best_score ) {
			$best       = (int) $id;
			$best_score = $score;
		}
	}
	return $best;
}

function tgs_sq_resolve_product_id( $external_id, array $legacy_ids ) {
	$current = tgs_sq_find_product_ids( array( $external_id ) );
	$legacy  = array_diff( tgs_sq_find_product_ids( $legacy_ids ), $current );
	// Si hay más de un producto con el mismo id, se conserva el que está
	// PUBLICADO (y entre varios, el más nuevo). Antes se conservaba el de ID
	// más bajo: si ese era un duplicado viejo (incluso en la papelera), cada
	// republicación lo resucitaba y mandaba a borrador al que el cliente veía.
	$keep = tgs_sq_pick_product_to_keep( $current ) ?: tgs_sq_pick_product_to_keep( array_values( $legacy ) );
	if ( ! $keep ) {
		return 0;
	}
	if ( 'trash' === get_post_status( $keep ) ) {
		wp_untrash_post( $keep );
	}
	update_post_meta( $keep, TGS_SQ_META_EXTERNAL_ID, tgs_sq_meta_text( $external_id ) );
	tgs_sq_guard_allow( true );
	foreach ( array_merge( $current, array_values( $legacy ) ) as $duplicate ) {
		if ( (int) $duplicate === $keep ) {
			continue;
		}
		if ( 'draft' !== get_post_status( $duplicate ) && 'trash' !== get_post_status( $duplicate ) ) {
			wp_update_post( array( 'ID' => (int) $duplicate, 'post_status' => 'draft' ) );
		}
		update_post_meta( (int) $duplicate, '_tgs_superseded_by', (string) $keep );
	}
	return $keep;
}

/**
 * Categoría de producto "por defecto" para presupuestos nuevos. Se crea
 * sola la primera vez si no existe. La categoría de cada producto se puede
 * cambiar después desde TGS Smart Quotes → Productos, y una vez cambiada
 * nunca se pisa en un republish (ver tgs_sq_sync_product).
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
 * Categoría actualmente asignada a un producto publicado (o 0 si no tiene
 * ninguna todavía).
 */
function tgs_sq_product_category_id( $product_id ) {
	$terms = wp_get_object_terms( $product_id, 'product_cat', array( 'fields' => 'ids' ) );
	if ( is_wp_error( $terms ) || empty( $terms ) ) {
		return 0;
	}
	return (int) $terms[0];
}

/**
 * Baja una imagen externa a la librería de medios de WordPress y la deja
 * como imagen destacada del producto (así se ve en la grilla de la tienda
 * y en los resultados de búsqueda, que si no quedan en blanco). No vuelve
 * a bajar la misma imagen dos veces: si la URL no cambió desde la última
 * vez, no hace nada.
 */
function tgs_sq_maybe_set_featured_image( $product_id, $image_url ) {
	$image_url = esc_url_raw( (string) $image_url );
	if ( '' === $image_url ) {
		return;
	}

	$stored_source = get_post_meta( $product_id, '_tgs_thumbnail_source', true );
	if ( $stored_source === $image_url && has_post_thumbnail( $product_id ) ) {
		return;
	}

	if ( ! function_exists( 'media_sideload_image' ) ) {
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
	}

	// La descarga no puede colgar el publish entero: si el origen tarda más
	// de esto, se sigue sin imagen destacada y se reintenta en el próximo.
	$timeout       = function () { return 20; };
	add_filter( 'http_request_timeout', $timeout );
	$attachment_id = media_sideload_image( $image_url, $product_id, null, 'id' );
	remove_filter( 'http_request_timeout', $timeout );
	if ( is_wp_error( $attachment_id ) ) {
		return;
	}

	set_post_thumbnail( $product_id, $attachment_id );
	update_post_meta( $product_id, '_tgs_thumbnail_source', $image_url );
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

	$legacy_ids          = is_array( $payload['legacyExternalIds'] ?? null ) ? $payload['legacyExternalIds'] : array();
	$existing_product_id = tgs_sq_resolve_product_id( $external_id, $legacy_ids );
	$product              = $existing_product_id ? wc_get_product( $existing_product_id ) : new WC_Product_Simple();
	if ( ! $product ) {
		return new WP_Error( 'tgs_product_load_failed', 'No se pudo cargar el producto', array( 'status' => 500 ) );
	}

	$title              = sanitize_text_field( $payload['title'] ?? 'Presupuesto TGS' );
	$price_transfer_ars = ( (int) ( $payload['priceTransferCents'] ?? 0 ) ) / 100;
	$short_description  = sanitize_textarea_field( (string) ( $payload['shortDescription'] ?? '' ) );
	$description_html   = wp_kses_post( (string) ( $payload['descriptionHtml'] ?? '' ) );

	// Qué campos son "del sistema" (se pisan en cada publish) y cuáles "del
	// admin" (solo se fijan al crear): el título, el precio, las descripciones
	// y el estado son del sistema; el slug es del admin, porque cambiarlo
	// cambia la URL y rompe los enlaces ya compartidos.
	$product->set_name( $title );
	$product->set_status( 'publish' );
	$product->set_catalog_visibility( 'visible' );
	$product->set_regular_price( wc_format_decimal( $price_transfer_ars, 2 ) );
	// Descripción estándar de Woo además de la ficha custom: la leen los
	// feeds (Google Merchant, catálogo de Facebook/Instagram), la búsqueda
	// del tema y los emails de pedido, que si no veían un producto vacío.
	$product->set_short_description( $short_description );
	$product->set_description( $description_html );
	// PCs armadas a pedido: no se gestiona stock por unidad, siempre
	// figura disponible (nunca "sin existencias").
	$product->set_manage_stock( false );
	$product->set_stock_status( 'instock' );
	$product->set_backorders( 'no' );

	$sku = 'TGS-' . substr( preg_replace( '/[^A-Za-z0-9]/', '', $external_id ), 0, 24 );
	try {
		$product->set_sku( $sku );
	} catch ( WC_Data_Exception $e ) {
		// SKU tomado por otro producto (uno cargado a mano, por ejemplo): se
		// publica igual sin SKU antes que fallar la publicación entera.
		if ( ! $existing_product_id ) {
			$product->set_sku( '' );
		}
	}

	if ( ! $existing_product_id && ! empty( $payload['slug'] ) ) {
		$product->set_slug( sanitize_title( $payload['slug'] ) );
	}

	try {
		$product_id = $product->save();
	} catch ( Exception $e ) {
		return new WP_Error( 'tgs_product_save_failed', 'WooCommerce no pudo guardar el producto: ' . $e->getMessage(), array( 'status' => 400 ) );
	}

	// La categoría solo se asigna automáticamente la primera vez que se
	// publica el producto. Si el admin ya la cambió a mano desde
	// "Productos", un republish nunca la pisa.
	if ( ! $existing_product_id && 0 === tgs_sq_product_category_id( $product_id ) ) {
		// La categoría predeterminada se elige en Ajustes; si no hay, "TGS".
		$category_id = (int) get_option( TGS_SQ_OPTION_DEFAULT_CATEGORY, 0 );
		if ( ! $category_id || ! term_exists( $category_id, 'product_cat' ) ) {
			$category_id = tgs_sq_ensure_category();
		}
		if ( $category_id ) {
			wp_set_object_terms( $product_id, array( $category_id ), 'product_cat' );
		}
	}

	$thumbnail_source = ! empty( $payload['thumbnailUrl'] )
		? $payload['thumbnailUrl']
		: '';
	tgs_sq_maybe_set_featured_image( $product_id, $thumbnail_source );

	$meta = array(
		TGS_SQ_META_EXTERNAL_ID     => tgs_sq_meta_text( $external_id ),
		TGS_SQ_META_MANAGED         => '1',
		TGS_SQ_META_MODEL3D         => tgs_sq_meta_text( esc_url_raw( (string) ( $payload['model3dUrl'] ?? '' ) ) ),
		TGS_SQ_META_THUMBNAIL       => tgs_sq_meta_text( esc_url_raw( $thumbnail_source ) ),
		TGS_SQ_META_HERO_IMAGE      => tgs_sq_meta_text( esc_url_raw( (string) ( $payload['heroImageUrl'] ?? '' ) ) ),
		TGS_SQ_META_GALLERY         => tgs_sq_json( tgs_sq_sanitize_urls( $payload['gallery'] ?? array() ) ),
		TGS_SQ_META_TAGLINE         => tgs_sq_meta_text( sanitize_text_field( (string) ( $payload['tagline'] ?? '' ) ) ),
		TGS_SQ_META_HIGHLIGHTS      => tgs_sq_json( tgs_sq_sanitize_strings( $payload['highlights'] ?? array() ) ),
		TGS_SQ_META_AUDIENCE        => tgs_sq_meta_text( sanitize_text_field( (string) ( $payload['audience'] ?? '' ) ) ),
		TGS_SQ_META_VERSION         => (string) (int) ( $payload['versionNumber'] ?? 0 ),
		TGS_SQ_META_PRICE_LIST      => (string) (int) ( $payload['priceListCents'] ?? 0 ),
		TGS_SQ_META_PRICE_CASH      => (string) (int) ( $payload['priceCashCents'] ?? 0 ),
		TGS_SQ_META_PRICE_TRANSFER  => (string) (int) ( $payload['priceTransferCents'] ?? 0 ),
		TGS_SQ_META_INSTALLMENTS    => tgs_sq_json( $payload['installments'] ?? array() ),
		TGS_SQ_META_ITEMS           => tgs_sq_json( tgs_sq_sanitize_items( $payload['items'] ?? array() ) ),
		TGS_SQ_META_DESCRIPTION     => tgs_sq_meta_text( $description_html ),
		TGS_SQ_META_POWER           => tgs_sq_json( $payload['power'] ?? array() ),
		TGS_SQ_META_GAMES           => tgs_sq_json( $payload['games'] ?? array() ),
		TGS_SQ_META_COMPATIBILITY   => tgs_sq_json( $payload['compatibility'] ?? array() ),
	);
	foreach ( $meta as $key => $value ) {
		update_post_meta( $product_id, $key, $value );
	}

	// La variante de diseño NUNCA se pisa acá: si el producto es nuevo se le
	// asigna la variante predeterminada (Ajustes) una sola vez; si ya existía
	// (re-publish), se respeta lo que el admin haya elegido en WordPress.
	if ( '' === (string) get_post_meta( $product_id, TGS_SQ_META_VARIANT, true ) ) {
		update_post_meta( $product_id, TGS_SQ_META_VARIANT, tgs_sq_default_variant_slug() );
	}

	return $product_id;
}

/**
 * JSON listo para guardar en un meta de WordPress.
 *
 * Dos cuidados, los dos necesarios:
 *
 *  - `JSON_UNESCAPED_UNICODE`: sin esto los acentos se guardan escapados
 *    (`ó`). Como `update_post_meta()` aplica `wp_unslash()` por dentro,
 *    esa barra invertida se pierde y en la ficha terminaba apareciendo
 *    "ediciu00f3n" en vez de "edición".
 *  - `wp_slash()`: WordPress espera recibir el valor "slashed" porque lo
 *    des-escapa al guardarlo. Sin esto se comería las comillas del JSON.
 */
function tgs_sq_json( $value ) {
	return wp_slash( wp_json_encode( $value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
}

/** Texto plano listo para guardar en meta (ver tgs_sq_json). */
function tgs_sq_meta_text( $value ) {
	return wp_slash( (string) $value );
}

/** Lista de URLs válidas (para la galería). */
function tgs_sq_sanitize_urls( $urls ) {
	if ( ! is_array( $urls ) ) {
		return array();
	}
	$clean = array();
	foreach ( $urls as $url ) {
		$url = esc_url_raw( (string) $url );
		if ( '' !== $url ) {
			$clean[] = $url;
		}
	}
	return array_values( array_unique( $clean ) );
}

/** Lista de textos cortos (puntos fuertes). */
function tgs_sq_sanitize_strings( $values ) {
	if ( ! is_array( $values ) ) {
		return array();
	}
	$clean = array();
	foreach ( $values as $value ) {
		$value = sanitize_text_field( (string) $value );
		if ( '' !== $value ) {
			$clean[] = $value;
		}
	}
	return $clean;
}

/**
 * Limpia la lista de componentes que llega en el payload. Cada item trae
 * al menos name/imageUrl/specs; specs.line es la "parte" (CPU, Mother,
 * etc.) y specs no incluye precio individual a propósito — el precio que
 * se muestra siempre es el total de la PC, nunca por componente.
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
			'imageUrl'    => esc_url_raw( (string) ( $item['imageUrl'] ?? '' ) ),
			'description' => sanitize_text_field( $item['description'] ?? ( $specs['description'] ?? '' ) ),
			'part'        => sanitize_text_field( $specs['line'] ?? ( $item['part'] ?? '' ) ),
		);
	}
	return $clean;
}

/**
 * Pone el producto en borrador (no lo borra) cuando TGS-SMART-QUOTES pide
 * despublicar un presupuesto. También baja los que quedaron etiquetados con
 * ids viejos, para no dejar duplicados publicados.
 */
function tgs_sq_unpublish_product( $external_id, array $legacy_ids = array() ) {
	$ids = tgs_sq_find_product_ids( array_merge( array( $external_id ), $legacy_ids ) );
	// Despublicación pedida por el sistema: la protección no debe revertirla.
	tgs_sq_guard_allow( true );
	foreach ( $ids as $product_id ) {
		if ( 'trash' !== get_post_status( $product_id ) ) {
			wp_update_post( array( 'ID' => $product_id, 'post_status' => 'draft' ) );
		}
	}
	return $ids ? (int) $ids[0] : 0;
}
