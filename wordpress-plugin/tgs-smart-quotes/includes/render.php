<?php
/**
 * Decide cuándo mostrar la ficha custom, encola los assets, y renderiza
 * la variante asignada a cada producto (modo "blocks" o modo "custom").
 */

defined( 'ABSPATH' ) || exit;

function tgs_sq_is_managed_product( $post_id = 0 ) {
	$post_id = $post_id ?: get_the_ID();
	return $post_id && '1' === get_post_meta( $post_id, TGS_SQ_META_MANAGED, true );
}

/**
 * Reemplaza la plantilla de producto del tema por la nuestra, SOLO para
 * productos publicados por TGS-SMART-QUOTES.
 */
add_filter( 'template_include', function ( $template ) {
	if ( is_singular( 'product' ) && tgs_sq_is_managed_product() ) {
		$custom = TGS_SQ_DIR . 'templates/single-landing.php';
		if ( file_exists( $custom ) ) {
			return $custom;
		}
	}
	return $template;
}, 99 );

add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_singular( 'product' ) || ! tgs_sq_is_managed_product() ) {
		return;
	}
	wp_enqueue_style( 'tgs-landing', TGS_SQ_URL . 'assets/tgs-landing.css', array(), TGS_SQ_VERSION );
	wp_enqueue_script( 'tgs-landing', TGS_SQ_URL . 'assets/tgs-landing.js', array(), TGS_SQ_VERSION, true );

	$model3d = get_post_meta( get_the_ID(), TGS_SQ_META_MODEL3D, true );
	if ( $model3d ) {
		wp_enqueue_script( 'tgs-model-viewer', TGS_SQ_URL . 'assets/model-viewer.min.js', array(), TGS_SQ_VERSION, true );
	}
} );

// <model-viewer> es un web component: el script tiene que cargar como module.
add_filter( 'script_loader_tag', function ( $tag, $handle ) {
	return 'tgs-model-viewer' === $handle ? str_replace( '<script ', '<script type="module" ', $tag ) : $tag;
}, 10, 2 );

/**
 * Junta todos los datos del producto en un solo array, listo para pasarle
 * a cualquiera de los dos modos de render (blocks o custom).
 */
function tgs_sq_collect_product_data( $product_id ) {
	$meta = function ( $key ) use ( $product_id ) {
		return get_post_meta( $product_id, $key, true );
	};
	$decode = function ( $key ) use ( $meta ) {
		$value = json_decode( (string) $meta( $key ), true );
		return is_array( $value ) ? $value : array();
	};

	return array(
		'product_id'   => $product_id,
		'product'      => wc_get_product( $product_id ),
		'title'        => get_the_title( $product_id ),
		'permalink'    => get_permalink( $product_id ),
		'model3d_url'  => $meta( TGS_SQ_META_MODEL3D ),
		'thumbnail'    => $meta( TGS_SQ_META_THUMBNAIL ),
		'gallery'      => $decode( TGS_SQ_META_GALLERY ),
		'items'        => $decode( TGS_SQ_META_ITEMS ),
		'price_list'   => (int) $meta( TGS_SQ_META_PRICE_LIST ),
		'price_cash'   => (int) $meta( TGS_SQ_META_PRICE_CASH ),
		'price_transfer' => (int) $meta( TGS_SQ_META_PRICE_TRANSFER ),
		'installments' => $decode( TGS_SQ_META_INSTALLMENTS ),
		'description'  => (string) $meta( TGS_SQ_META_DESCRIPTION ),
		'power'        => $decode( TGS_SQ_META_POWER ),
		'games'        => $decode( TGS_SQ_META_GAMES ),
		'compat'       => $decode( TGS_SQ_META_COMPATIBILITY ),
	);
}

/* ---------------------------------------------------------------------
 * Modo "blocks"
 * ------------------------------------------------------------------- */

function tgs_sq_layout_style_vars( array $tokens ) {
	$accent = sanitize_hex_color( $tokens['accent'] ?? '' ) ?: '#E31B23';
	$bg     = sanitize_hex_color( $tokens['bg'] ?? '' ) ?: '#080B12';
	$text   = sanitize_hex_color( $tokens['text'] ?? '' ) ?: '#F8FAFC';
	$radius = max( 0, (float) ( $tokens['radius'] ?? 24 ) );
	$font   = str_replace( array( ';', ':', '{', '}', '<', '>' ), '', sanitize_text_field( $tokens['font'] ?? 'Inter, system-ui, sans-serif' ) );

	return sprintf(
		'--tgs-accent:%s;--tgs-bg:%s;--tgs-text:%s;--tgs-radius:%spx;--tgs-font:%s;',
		$accent,
		$bg,
		$text,
		$radius,
		$font
	);
}

function tgs_sq_render_block( $type, array $data ) {
	$renderer = 'tgs_sq_block_' . $type;
	if ( function_exists( $renderer ) ) {
		$renderer( $data );
	}
}

function tgs_sq_block_hero3d( array $d ) {
	echo '<section class="tgs-hero"><div class="tgs-viewer">';
	if ( $d['model3d_url'] ) {
		echo '<model-viewer src="' . esc_url( $d['model3d_url'] ) . '" camera-controls auto-rotate shadow-intensity="1"></model-viewer>';
	} elseif ( $d['thumbnail'] ) {
		echo '<img src="' . esc_url( $d['thumbnail'] ) . '" alt="' . esc_attr( $d['title'] ) . '">';
	}
	echo '</div><div class="tgs-heading"><span class="tgs-kicker">THE GAMER SHOP</span><h1>' . esc_html( $d['title'] ) . '</h1></div></section>';
}

function tgs_sq_block_pricebox( array $d ) {
	echo '<section class="tgs-summary"><h2>Tu equipo</h2><div class="tgs-price"><small>Transferencia</small><strong>'
		. wp_kses_post( wc_price( $d['price_transfer'] / 100 ) )
		. '</strong><span>Efectivo ' . wp_kses_post( wc_price( $d['price_cash'] / 100 ) ) . '</span></div>';
	woocommerce_template_single_add_to_cart();
	echo '</section>';
}

function tgs_sq_block_addtocartsticky( array $d ) {
	if ( ! $d['product'] ) {
		return;
	}
	echo '<div class="tgs-sticky" aria-hidden="true"><span>' . esc_html( $d['title'] ) . '</span><strong>'
		. wp_kses_post( $d['product']->get_price_html() )
		. '</strong><a href="' . esc_url( $d['product']->add_to_cart_url() ) . '" class="button">Agregar al carrito</a></div>';
}

function tgs_sq_block_gallery( array $d ) {
	if ( empty( $d['gallery'] ) ) {
		return;
	}
	echo '<section><h2>Galería</h2><div class="tgs-gallery">';
	foreach ( $d['gallery'] as $url ) {
		echo '<img src="' . esc_url( $url ) . '" alt="Imagen del equipo">';
	}
	echo '</div></section>';
}

/**
 * Lista de componentes: foto + nombre + (si viene) descripción breve y a
 * qué parte corresponde. Nunca se muestra precio por componente — el
 * precio siempre es el total, en el bloque priceBox.
 */
function tgs_sq_block_specs( array $d ) {
	if ( empty( $d['items'] ) ) {
		return;
	}
	echo '<section><h2>Componentes y especificaciones</h2><div class="tgs-items">';
	foreach ( $d['items'] as $item ) {
		echo '<div class="tgs-item">';
		if ( ! empty( $item['imageUrl'] ) ) {
			echo '<img src="' . esc_url( $item['imageUrl'] ) . '" alt="">';
		}
		echo '<div class="tgs-item-info">';
		if ( ! empty( $item['part'] ) ) {
			echo '<span class="tgs-item-part">' . esc_html( $item['part'] ) . '</span>';
		}
		echo '<span class="tgs-item-name">' . esc_html( $item['name'] ?? '' ) . '</span>';
		if ( ! empty( $item['description'] ) ) {
			echo '<span class="tgs-item-desc">' . esc_html( $item['description'] ) . '</span>';
		}
		echo '</div></div>';
	}
	echo '</div></section>';
}

function tgs_sq_block_description( array $d ) {
	if ( ! $d['description'] ) {
		return;
	}
	echo '<section><h2>Descripción</h2>' . wp_kses_post( $d['description'] ) . '</section>';
}

function tgs_sq_block_power( array $d ) {
	if ( empty( $d['power'] ) ) {
		return;
	}
	$watts = $d['power']['watts'] ?? '—';
	$psu   = $d['power']['psu'] ?? '—';
	$note  = $d['power']['note'] ?? '';
	echo '<section><h2>Potencia</h2><p>' . esc_html( "{$watts} W · fuente {$psu} W" ) . '<br><small>' . esc_html( $note ) . '</small></p></section>';
}

function tgs_sq_block_games( array $d ) {
	if ( empty( $d['games'] ) ) {
		return;
	}
	echo '<section><h2>Juegos</h2>';
	foreach ( $d['games'] as $game ) {
		echo '<p><strong>' . esc_html( $game['name'] ?? '' ) . '</strong> · ' . esc_html( $game['tier'] ?? '' ) . '</p>';
	}
	echo '</section>';
}

function tgs_sq_block_compatibility( array $d ) {
	if ( empty( $d['compat'] ) ) {
		return;
	}
	echo '<section><h2>Compatibilidad</h2><ul>';
	foreach ( $d['compat'] as $line ) {
		echo '<li>' . esc_html( $line ) . '</li>';
	}
	echo '</ul></section>';
}

function tgs_sq_render_blocks_mode( array $variant, array $data ) {
	echo '<main class="tgs-landing" style="' . esc_attr( tgs_sq_layout_style_vars( $variant['tokens'] ?? array() ) ) . '">';
	foreach ( ( $variant['blocks'] ?? array() ) as $block ) {
		if ( empty( $block['visible'] ) ) {
			continue;
		}
		tgs_sq_render_block( sanitize_key( $block['type'] ?? '' ), $data );
	}
	echo '</main>';
}

/* ---------------------------------------------------------------------
 * Modo "custom": HTML/CSS pegado a mano en el admin, con placeholders.
 * ------------------------------------------------------------------- */

function tgs_sq_custom_placeholders( array $data ) {
	$gallery_html = '';
	foreach ( $data['gallery'] as $url ) {
		$gallery_html .= '<img src="' . esc_url( $url ) . '" alt="">';
	}

	$items_html = '';
	foreach ( $data['items'] as $item ) {
		$items_html .= '<div class="tgs-item">';
		if ( ! empty( $item['imageUrl'] ) ) {
			$items_html .= '<img src="' . esc_url( $item['imageUrl'] ) . '" alt="">';
		}
		$items_html .= '<div class="tgs-item-info">';
		if ( ! empty( $item['part'] ) ) {
			$items_html .= '<span class="tgs-item-part">' . esc_html( $item['part'] ) . '</span>';
		}
		$items_html .= '<span class="tgs-item-name">' . esc_html( $item['name'] ?? '' ) . '</span>';
		if ( ! empty( $item['description'] ) ) {
			$items_html .= '<span class="tgs-item-desc">' . esc_html( $item['description'] ) . '</span>';
		}
		$items_html .= '</div></div>';
	}

	$model3d_html = '';
	if ( $data['model3d_url'] ) {
		$model3d_html = '<model-viewer src="' . esc_url( $data['model3d_url'] ) . '" camera-controls auto-rotate shadow-intensity="1"></model-viewer>';
	} elseif ( $data['thumbnail'] ) {
		$model3d_html = '<img src="' . esc_url( $data['thumbnail'] ) . '" alt="' . esc_attr( $data['title'] ) . '">';
	}

	ob_start();
	if ( $data['product'] ) {
		woocommerce_template_single_add_to_cart();
	}
	$add_to_cart_html = ob_get_clean();

	return array(
		'{{title}}'             => esc_html( $data['title'] ),
		'{{permalink}}'         => esc_url( $data['permalink'] ),
		'{{price_list}}'        => wp_kses_post( wc_price( $data['price_list'] / 100 ) ),
		'{{price_cash}}'        => wp_kses_post( wc_price( $data['price_cash'] / 100 ) ),
		'{{price_transfer}}'    => wp_kses_post( wc_price( $data['price_transfer'] / 100 ) ),
		'{{description_html}}'  => wp_kses_post( $data['description'] ),
		'{{gallery_html}}'      => $gallery_html,
		'{{items_html}}'        => $items_html,
		'{{model3d_html}}'      => $model3d_html,
		'{{add_to_cart_html}}'  => $add_to_cart_html,
		'{{power_watts}}'       => esc_html( $data['power']['watts'] ?? '' ),
		'{{power_psu}}'         => esc_html( $data['power']['psu'] ?? '' ),
		'{{power_note}}'        => esc_html( $data['power']['note'] ?? '' ),
	);
}

function tgs_sq_render_custom_mode( array $variant, array $data ) {
	$replacements = tgs_sq_custom_placeholders( $data );
	$html         = strtr( (string) ( $variant['custom_html'] ?? '' ), $replacements );

	if ( ! empty( $variant['custom_css'] ) ) {
		echo '<style id="tgs-variant-custom-css">' . wp_strip_all_tags( $variant['custom_css'] ) . '</style>';
	}

	echo '<main class="tgs-landing tgs-landing--custom" style="' . esc_attr( tgs_sq_layout_style_vars( $variant['tokens'] ?? array() ) ) . '">';
	// El HTML de la variante lo escribe un admin de confianza (no un
	// usuario del sitio), así que se imprime tal cual: es la única forma
	// de permitir diseño 100% libre pedido explícitamente.
	echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '</main>';
}

/**
 * Punto de entrada único: arma los datos, resuelve la variante asignada
 * al producto, y la renderiza en el modo que corresponda.
 */
function tgs_sq_render_product( $product_id ) {
	tgs_sq_ensure_default_variant();
	$data         = tgs_sq_collect_product_data( $product_id );
	$variant_slug = tgs_sq_product_variant_slug( $product_id );
	$variant      = tgs_sq_get_variant( $variant_slug ) ?: tgs_sq_get_variant( TGS_SQ_DEFAULT_VARIANT );

	if ( 'custom' === ( $variant['mode'] ?? 'blocks' ) && ! empty( $variant['custom_html'] ) ) {
		tgs_sq_render_custom_mode( $variant, $data );
	} else {
		tgs_sq_render_blocks_mode( $variant, $data );
	}
}
