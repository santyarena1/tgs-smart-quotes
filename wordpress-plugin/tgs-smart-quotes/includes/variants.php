<?php
/**
 * Registro de "variantes" de diseño para la ficha de producto custom.
 *
 * Una variante es un preset de diseño que se puede asignar a cada producto
 * publicado por TGS-SMART-QUOTES, elegido desde WordPress (no lo decide el
 * backend de presupuestos). Dos modos posibles:
 *
 *  - "blocks": arma la página combinando los bloques predefinidos del
 *    plugin (hero3d, priceBox, gallery, specs, etc.) con una paleta de
 *    colores/tipografía (tokens).
 *  - "custom": HTML + CSS pegados directamente en el admin, con
 *    placeholders tipo {{titulo}} que el plugin reemplaza por los datos
 *    reales del producto. Para cuando se quiere un diseño 100% a medida
 *    que no encaja en el sistema de bloques.
 *
 * Además de bloques/tokens, cada variante tiene un set de "extras"
 * (whatsapp, barra flotante, recomendadas, formas de pago) que se pueden
 * prender/apagar y personalizar, y están disponibles tanto como bloque
 * (modo blocks) como placeholder (modo custom).
 *
 * Se guardan como un único option de WordPress (array serializado). No hace
 * falta una tabla nueva ni un custom post type para esto.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Lista de tipos de bloque disponibles en modo "blocks", con una etiqueta
 * legible para mostrar en el admin.
 */
function tgs_sq_block_types() {
	return array(
		'hero3d'         => 'Hero (visor 3D o imagen + título)',
		'priceBox'       => 'Caja de precio + botón agregar al carrito',
		'addToCartSticky'=> 'Barra flotante de compra (mobile)',
		'gallery'        => 'Galería de imágenes',
		'specs'          => 'Componentes de la PC (foto + nombre)',
		'description'    => 'Descripción',
		'power'          => 'Consumo / potencia recomendada',
		'games'          => 'Juegos recomendados',
		'compatibility'  => 'Notas de compatibilidad',
		'payment'        => 'Formas de pago y cuotas',
		'whatsapp'       => 'Botón de WhatsApp',
		'recommended'    => 'Recomendadas de la casa (PCs de precio similar)',
	);
}

/**
 * Bloques y tokens por defecto para la variante "default" — son los mismos
 * que ya se usaban en la v1 del plugin, para no cambiar nada visualmente
 * hasta que se diseñen variantes nuevas a propósito.
 */
function tgs_sq_default_blocks() {
	$types = array_keys( tgs_sq_block_types() );
	return array_map(
		function ( $type ) {
			// Los bloques nuevos (payment/whatsapp/recommended) arrancan
			// apagados por default: hay que cargar número de WhatsApp,
			// etc. antes de que tenga sentido mostrarlos.
			$visible = ! in_array( $type, array( 'payment', 'whatsapp', 'recommended' ), true );
			return array( 'type' => $type, 'visible' => $visible );
		},
		$types
	);
}

function tgs_sq_default_tokens() {
	return array(
		'accent' => '#E31B23',
		'bg'     => '#080B12',
		'text'   => '#F8FAFC',
		'radius' => 24,
		'font'   => 'Inter, system-ui, sans-serif',
	);
}

/**
 * Configuración de los bloques "extra" (no son solo on/off de bloque: cada
 * uno tiene campos propios). Vive separado de `blocks` porque estos campos
 * también se usan en modo "custom" (como placeholders), no solo en modo
 * "blocks".
 */
function tgs_sq_default_extra() {
	return array(
		'whatsapp_number'    => '',
		'whatsapp_message'   => 'Hola! Quiero consultar por {{title}}',
		'sticky_label'       => 'Agregar al carrito',
		'recommended_title'  => 'Recomendadas de la casa',
		'recommended_count'  => 4,
		'payment_methods'    => 'Efectivo, transferencia, tarjeta de crédito y débito',
	);
}

function tgs_sq_blank_variant( $slug = '', $name = '' ) {
	return array(
		'slug'        => $slug,
		'name'        => $name,
		'mode'        => 'blocks', // 'blocks' | 'custom'
		'tokens'      => tgs_sq_default_tokens(),
		'blocks'      => tgs_sq_default_blocks(),
		'extra'       => tgs_sq_default_extra(),
		'custom_html' => '',
		'custom_css'  => '',
		'updated_at'  => current_time( 'mysql' ),
	);
}

/**
 * Devuelve todas las variantes guardadas, indexadas por slug.
 */
function tgs_sq_get_variants() {
	$variants = get_option( TGS_SQ_OPTION_VARIANTS, array() );
	return is_array( $variants ) ? $variants : array();
}

function tgs_sq_get_variant( $slug ) {
	$variants = tgs_sq_get_variants();
	if ( ! isset( $variants[ $slug ] ) ) {
		return null;
	}
	$variant          = $variants[ $slug ];
	// Compatibilidad hacia atrás: variantes guardadas antes de que
	// existiera 'extra' no lo tienen, así que se completa con defaults.
	$variant['extra'] = wp_parse_args( $variant['extra'] ?? array(), tgs_sq_default_extra() );
	return $variant;
}

function tgs_sq_save_variant( $variant ) {
	$variants                        = tgs_sq_get_variants();
	$slug                             = sanitize_title( $variant['slug'] );
	$variant['slug']                  = $slug;
	$variant['extra']                 = wp_parse_args( $variant['extra'] ?? array(), tgs_sq_default_extra() );
	$variant['updated_at']            = current_time( 'mysql' );
	$variants[ $slug ]                = $variant;
	update_option( TGS_SQ_OPTION_VARIANTS, $variants );
	return $variant;
}

/**
 * Borra una variante. Si algún producto la tenía asignada, esos productos
 * vuelven a la variante "default" para no dejar nada roto.
 */
function tgs_sq_delete_variant( $slug ) {
	if ( $slug === TGS_SQ_DEFAULT_VARIANT ) {
		return false; // La variante default nunca se borra.
	}
	$variants = tgs_sq_get_variants();
	unset( $variants[ $slug ] );
	update_option( TGS_SQ_OPTION_VARIANTS, $variants );

	$product_ids = get_posts( array(
		'post_type'      => 'product',
		'post_status'    => 'any',
		'fields'         => 'ids',
		'numberposts'    => -1,
		'meta_key'       => TGS_SQ_META_VARIANT,
		'meta_value'     => $slug,
	) );
	foreach ( $product_ids as $product_id ) {
		update_post_meta( $product_id, TGS_SQ_META_VARIANT, TGS_SQ_DEFAULT_VARIANT );
	}

	return true;
}

/**
 * Garantiza que exista la variante "default". Se llama al activar el
 * plugin y también como red de seguridad al renderizar, por si alguien
 * borró el option a mano.
 */
function tgs_sq_ensure_default_variant() {
	$variants = tgs_sq_get_variants();
	if ( isset( $variants[ TGS_SQ_DEFAULT_VARIANT ] ) ) {
		return;
	}
	$default         = tgs_sq_blank_variant( TGS_SQ_DEFAULT_VARIANT, 'Default' );
	$default['mode'] = 'blocks';
	tgs_sq_save_variant( $default );
}

/**
 * slug => nombre, para usar en un <select> del admin.
 */
function tgs_sq_variant_choices() {
	tgs_sq_ensure_default_variant();
	$choices = array();
	foreach ( tgs_sq_get_variants() as $slug => $variant ) {
		$choices[ $slug ] = $variant['name'] !== '' ? $variant['name'] : $slug;
	}
	return $choices;
}

/**
 * Variante asignada a un producto puntual (o "default" si no tiene).
 */
function tgs_sq_product_variant_slug( $product_id ) {
	$slug = get_post_meta( $product_id, TGS_SQ_META_VARIANT, true );
	if ( ! $slug || ! tgs_sq_get_variant( $slug ) ) {
		return TGS_SQ_DEFAULT_VARIANT;
	}
	return $slug;
}
