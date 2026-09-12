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
 *  - "custom": un único bloque de código pegado directamente en el admin
 *    (HTML que puede traer su propio <style> adentro), con placeholders
 *    tipo {{titulo}} que el plugin reemplaza por los datos reales del
 *    producto. Para cuando se quiere un diseño 100% a medida que no encaja
 *    en el sistema de bloques.
 *
 *    Es un solo campo a propósito: en la versión vieja había dos (HTML y
 *    CSS por separado) y la ficha quedaba sin estilos cada vez que alguien
 *    llenaba uno y se olvidaba del otro.
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
	// El hero (foto/3D + título + precio + botón de compra + WhatsApp) ya no
	// es un bloque opcional: siempre se arma igual, con un diseño fijo y
	// probado, para que ninguna ficha de producto pueda quedar "sin cabecera"
	// por accidente. Lo mismo pasaba con "Consumo": se sacó del todo porque
	// ahora la fuente se carga como componente propio de la PC.
	return array(
		'addToCartSticky'=> 'Barra flotante de compra (mobile)',
		'specs'          => 'Componentes de la PC (foto + nombre)',
		'description'    => 'Descripción',
		'games'          => 'Juegos recomendados',
		'gallery'        => 'Galería de fotos de los componentes',
		'compatibility'  => 'Notas de compatibilidad',
		'payment'        => 'Formas de pago y cuotas',
		'shipping'       => 'Envíos y retiro (zonas y costos de WooCommerce)',
		'monitors'       => 'Sumale un monitor (se agrega al carrito con la PC)',
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
			$visible = ! in_array( $type, array( 'payment', 'recommended', 'gallery', 'monitors' ), true );
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
		// "Sumale un monitor": la categoría se elige en Ajustes; acá solo el
		// título y cuántos mostrar.
		'monitors_title'     => 'Sumale un monitor',
		'monitors_count'     => 6,
		// 'settings' = los monitores elegidos + categoría de Ajustes;
		// 'custom' = solo los de 'monitors_products' de esta variante.
		'monitors_source'    => 'settings',
		'monitors_products'  => array(),
		'monitors_featured'  => 0,
		// Modal "Completá tu setup" después de agregar al carrito (ver upsell.php).
		'upsell_enabled'           => true,
		'upsell_discount_pct'      => 10,
		'upsell_monitor_discount_pct' => 5,
		'upsell_headline'          => 'Pssst… ¡ya está en tu carrito! 🎉',
		'upsell_text'              => 'Ahora que estamos: si sumás un teclado, un mouse o auriculares en este mismo paso, te llevás {{descuento}}% de descuento en cualquiera de estos. Después de esta pantalla, el descuento se va.',
		'upsell_no_monitor_text'   => 'Ya sé, ya sé: tenés monitor y "no necesitás otro". Pero mirá igual los que tenemos, porque a este precio y con {{descuento_monitor}}% extra no vas a encontrar uno mejor en ningún lado.',
		'upsell_keyboard_category' => 0,
		'upsell_keyboard_products' => array(),
		'upsell_keyboard_featured' => 0,
		'upsell_mouse_featured'    => 0,
		'upsell_headset_featured'  => 0,
		'upsell_mouse_category'    => 0,
		'upsell_mouse_products'    => array(),
		'upsell_headset_category'  => 0,
		'upsell_headset_products'  => array(),
		'payment_methods'    => 'Efectivo, transferencia, tarjeta de crédito y débito',
		// Aclaración de las cuotas. Toda mención a "cuotas sin interés" lleva un
		// asterisco que remite a este texto, en el pie de Formas de pago.
		'financing_terms'    => 'Las cuotas sin interés aplican con las tarjetas y bancos indicados, sujetas a disponibilidad de la promoción y a las condiciones del emisor al momento de la compra. Los importes son orientativos y pueden variar.',
		// Disclaimer de los textos generados con IA (descripción, componentes,
		// juegos, compatibilidad). Vacío = no se muestra.
		'ai_disclaimer'      => 'Texto generado con inteligencia artificial a partir de los componentes; puede contener errores u omisiones.',
	);
}

/**
 * Placeholders disponibles en el modo "Diseño propio (pegar código)".
 *
 * clave => explicación de una línea (se muestra tal cual en el admin y es
 * la misma lista que resuelve tgs_sq_placeholder_values() al renderizar).
 * Los nombres van en español, como el resto del admin, y siempre entre
 * llaves dobles: {{titulo}}.
 *
 * Si un placeholder no tiene datos para ese producto se reemplaza por vacío
 * (nunca queda el {{...}} literal a la vista).
 */
function tgs_sq_placeholder_docs() {
	return array(
		'titulo'                 => 'Nombre de la PC.',
		'permalink'              => 'URL de esta misma ficha (sirve para links o botones de compartir).',
		'precio_lista'           => 'Precio de lista ya formateado (ej: $1.500.000,00).',
		'precio_efectivo'        => 'Precio en efectivo ya formateado.',
		'precio_transferencia'   => 'Precio por transferencia ya formateado (es el precio principal).',
		'caja_precios'           => 'El bloque de precios completo del plugin: transferencia + efectivo + mejor cuota.',
		'cuotas'                 => 'Una línea con la mejor financiación disponible (ej: "Hasta 12 cuotas de $125.000").',
		'cuotas_detalle'         => 'Financiación detallada: "Hasta N cuotas sin interés del precio de lista con Tarjeta X", una línea por plan sin interés y el link "Más opciones de pago" (abre el panel de formas de pago).',
		'formas_de_pago'         => 'Sección completa de formas de pago con todos los planes de cuotas.',
		'descripcion'            => 'Descripción de la PC, como HTML listo para mostrar.',
		'imagen_destacada'       => 'La foto principal como etiqueta <img> lista para usar.',
		'imagen_destacada_url'   => 'Solo la URL de la foto principal (para poner en un src o en un background).',
		'modelo_3d'              => 'Visor 3D del gabinete, si la PC tiene modelo cargado.',
		'modelo_3d_url'          => 'Solo la URL del modelo 3D.',
		'componentes'            => 'Sección con los componentes de la PC (foto + nombre + detalle).',
		'juegos'                 => 'Sección de juegos recomendados con el rendimiento estimado.',
		'bajada'                 => 'Bajada corta debajo del título (la propone la IA del sistema).',
		'condiciones_cuotas'     => 'Texto de condiciones de las cuotas (el que remite el asterisco), ya formateado.',
		'envios'                 => 'Sección "Envíos y retiro" con las zonas, métodos y costos configurados en WooCommerce.',
		'aviso_ia'               => 'Aviso de "generado con IA", ya formateado.',
		'puntos_fuertes'         => 'Lista de puntos fuertes de la PC (3 a 5 líneas).',
		'galeria'                => 'Galería con las fotos de los componentes.',
		'compatibilidad'         => 'Sección con las notas de compatibilidad del armado.',
		'recomendadas'           => 'Sección de "Recomendadas de la casa" (otras PCs de precio similar).',
		'monitores'              => 'Sección "Sumale un monitor": monitores elegibles que se agregan al carrito junto con la PC (vacía si no hay categoría configurada en Ajustes).',
		'boton_carrito'          => 'Botón de agregar al carrito de WooCommerce (con cantidad y stock).',
		'boton_whatsapp'         => 'Botón de consulta por WhatsApp (vacío si la variante no tiene número cargado).',
		'barra_flotante'         => 'Barra fija de compra para el celular (nombre + precio + botón).',
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
		'custom_code' => '',
		// Compatibilidad hacia atrás con las variantes que se guardaron
		// cuando el código a medida eran dos campos separados. Ya no se
		// escriben nunca: quedan vacíos y solo se leen al migrar.
		'custom_html' => '',
		'custom_css'  => '',
		'updated_at'  => current_time( 'mysql' ),
	);
}

/**
 * Código a medida de una variante, resolviendo la compatibilidad hacia
 * atrás: si la variante viene de una versión vieja (custom_html + custom_css
 * separados) se arma un único bloque metiendo el CSS adentro de un <style>,
 * que es justamente lo que ahora escribe el admin en un solo campo.
 */
function tgs_sq_variant_custom_code( $variant ) {
	$code = trim( (string) ( $variant['custom_code'] ?? '' ) );
	if ( '' !== $code ) {
		return $code;
	}
	$html = trim( (string) ( $variant['custom_html'] ?? '' ) );
	$css  = trim( (string) ( $variant['custom_css'] ?? '' ) );
	if ( '' === $html ) {
		return '';
	}
	return '' === $css ? $html : "<style>\n" . $css . "\n</style>\n" . $html;
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
	// Ídem con el modo y el código a medida: cualquier variante vieja se
	// lee como "blocks" salvo que tenga guardado explícitamente 'custom'.
	$variant['mode']        = tgs_sq_normalize_mode( $variant['mode'] ?? '' );
	$variant['custom_code'] = tgs_sq_variant_custom_code( $variant );
	return $variant;
}

/**
 * Solo existen dos modos; cualquier otra cosa cae en "blocks", que es el
 * modo que siempre produce una ficha completa.
 */
function tgs_sq_normalize_mode( $mode ) {
	return 'custom' === $mode ? 'custom' : 'blocks';
}

function tgs_sq_save_variant( $variant ) {
	$variants                        = tgs_sq_get_variants();
	$slug                             = sanitize_title( $variant['slug'] );
	$variant['slug']                  = $slug;
	$variant['mode']                  = tgs_sq_normalize_mode( $variant['mode'] ?? '' );
	$variant['custom_code']           = (string) ( $variant['custom_code'] ?? '' );
	$variant['custom_html']           = '';
	$variant['custom_css']            = '';
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
		return tgs_sq_default_variant_slug();
	}
	return $slug;
}

/**
 * Variante predeterminada (Ajustes → Diseño predeterminado): la que reciben
 * las PCs nuevas al publicarse y la que se usa si un producto apunta a una
 * variante que ya no existe. Si la elegida se borró, cae a "default".
 */
function tgs_sq_default_variant_slug() {
	$slug = sanitize_title( (string) get_option( TGS_SQ_OPTION_DEFAULT_VARIANT, '' ) );
	if ( '' === $slug || ! isset( tgs_sq_get_variants()[ $slug ] ) ) {
		return TGS_SQ_DEFAULT_VARIANT;
	}
	return $slug;
}
