<?php
/**
 * Protección de las PCs publicadas por el sistema.
 *
 * Otros plugins que sincronizan catálogo (por ejemplo AcuStock Sync con
 * "Pasar a borrador si no está en XML") recorren todos los productos de
 * WooCommerce y mandan a borrador (con stock 0) los que no conocen: nuestras
 * PCs tienen SKU propio (TGS-...), así que las despublicaban cada media hora.
 *
 * Acá se escucha cada cambio de estado de un producto del sistema: si lo
 * saca de "publicado" algo que NO es una persona (cron, sync por AJAX, REST
 * de terceros) ni el propio sistema (API /unpublish, botón Despublicar de
 * "Productos"), se vuelve a publicar en el acto y se restauran el stock y la
 * visibilidad. Se puede apagar en Ajustes → Ficha de producto.
 */

defined( 'ABSPATH' ) || exit;

/** Marca "este cambio de estado lo hace el sistema a propósito": no proteger. */
function tgs_sq_guard_allow( $allow = true ) {
	$GLOBALS['tgs_sq_guard_allow'] = (bool) $allow;
}

function tgs_sq_guard_enabled() {
	return '0' !== (string) get_option( TGS_SQ_OPTION_GUARD_PUBLISHED, '1' );
}

/**
 * ¿El cambio viene de una persona usando el admin de WordPress? Editor del
 * producto (post.php / edición rápida / acciones en lote de la lista): sí.
 * Cron, AJAX de plugins de sync, REST de terceros, WP-CLI: no.
 */
function tgs_sq_guard_is_human_admin_action() {
	if ( wp_doing_cron() || ( defined( 'WP_CLI' ) && WP_CLI ) || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return false;
	}
	if ( ! is_user_logged_in() || ! current_user_can( 'edit_products' ) ) {
		return false;
	}
	$action = sanitize_key( $_REQUEST['action'] ?? '' ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( wp_doing_ajax() ) {
		// Edición rápida de la lista de productos; cualquier otro AJAX (syncs) no.
		return 'inline-save' === $action;
	}
	if ( ! is_admin() ) {
		return false;
	}
	$script = basename( (string) ( $_SERVER['SCRIPT_NAME'] ?? '' ) );
	// post.php: guardar/actualizar/tirar a la papelera desde el editor.
	// edit.php: acciones en lote (papelera, edición en lote) de la lista.
	return in_array( $script, array( 'post.php', 'edit.php' ), true );
}

add_action( 'transition_post_status', function ( $new_status, $old_status, $post ) {
	if ( ! $post instanceof WP_Post || 'product' !== $post->post_type || 'publish' !== $old_status || 'publish' === $new_status ) {
		return;
	}
	if ( ! tgs_sq_guard_enabled() || ! empty( $GLOBALS['tgs_sq_guard_allow'] ) ) {
		return;
	}
	if ( '1' !== get_post_meta( $post->ID, TGS_SQ_META_MANAGED, true ) ) {
		return;
	}
	if ( tgs_sq_guard_is_human_admin_action() ) {
		return;
	}
	// Se restaura después de que quien lo cambió termine de guardar (stock,
	// visibilidad, etc.), no en el medio de su propio guardado.
	$product_id = (int) $post->ID;
	add_action( 'shutdown', function () use ( $product_id, $new_status ) {
		tgs_sq_guard_restore( $product_id, $new_status );
	} );
}, 10, 3 );

/**
 * Lo mismo si un sync deja la PC "sin existencias" (stock 0) sin cambiarle el
 * estado: en la tienda aparece como no disponible aunque siga publicada.
 */
function tgs_sq_guard_watch_stock( $meta_id, $post_id, $meta_key, $meta_value ) {
	if ( '_stock_status' !== $meta_key || 'instock' === $meta_value || 'product' !== get_post_type( $post_id ) ) {
		return;
	}
	if ( ! tgs_sq_guard_enabled() || ! empty( $GLOBALS['tgs_sq_guard_allow'] ) || '1' !== get_post_meta( $post_id, TGS_SQ_META_MANAGED, true ) ) {
		return;
	}
	if ( tgs_sq_guard_is_human_admin_action() ) {
		return;
	}
	$product_id = (int) $post_id;
	add_action( 'shutdown', function () use ( $product_id ) {
		tgs_sq_guard_restore( $product_id, 'outofstock' );
	} );
}
add_action( 'updated_post_meta', 'tgs_sq_guard_watch_stock', 10, 4 );
add_action( 'added_post_meta', 'tgs_sq_guard_watch_stock', 10, 4 );

function tgs_sq_guard_restore( $product_id, $from_status ) {
	static $done = array();
	if ( isset( $done[ $product_id ] ) ) {
		return;
	}
	$done[ $product_id ] = true;
	if ( 'publish' === get_post_status( $product_id ) && 'instock' === get_post_meta( $product_id, '_stock_status', true ) ) {
		return;
	}
	tgs_sq_guard_allow( true );
	if ( 'trash' === get_post_status( $product_id ) ) {
		wp_untrash_post( $product_id );
	}
	wp_update_post( array( 'ID' => $product_id, 'post_status' => 'publish' ) );
	$product = wc_get_product( $product_id );
	if ( $product ) {
		// PCs armadas a pedido: sin control de stock y siempre disponibles
		// (los syncs las dejan con stock 0 y "sin existencias").
		$product->set_status( 'publish' );
		$product->set_catalog_visibility( 'visible' );
		$product->set_manage_stock( false );
		$product->set_stock_status( 'instock' );
		$product->save();
	}
	tgs_sq_guard_allow( false );
	$count = (int) get_post_meta( $product_id, '_tgs_guard_count', true ) + 1;
	update_post_meta( $product_id, '_tgs_guard_count', (string) $count );
	update_post_meta( $product_id, '_tgs_guard_last', current_time( 'mysql' ) . ' (' . sanitize_key( $from_status ) . ')' );
}
