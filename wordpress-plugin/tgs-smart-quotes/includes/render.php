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

add_filter( 'template_include', function ( $template ) {
	if ( is_singular( 'product' ) && tgs_sq_is_managed_product() ) {
		$custom = TGS_SQ_DIR . 'templates/single-landing.php';
		if ( file_exists( $custom ) ) {
			return $custom;
		}
	}
	return $template;
}, 99 );

/**
 * Clase en <body> para poder scopear CSS (por ejemplo, ocultar el widget
 * flotante de WhatsApp del sitio SOLO en las fichas de PC). El resto del
 * sitio no se toca.
 */
add_filter( 'body_class', function ( $classes ) {
	if ( is_singular( 'product' ) && tgs_sq_is_managed_product() ) {
		$classes[] = 'tgs-managed-page';
	}
	return $classes;
} );

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

add_filter( 'script_loader_tag', function ( $tag, $handle ) {
	return 'tgs-model-viewer' === $handle ? str_replace( '<script ', '<script type="module" ', $tag ) : $tag;
}, 10, 2 );

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
		// La foto del hero es la marcada en los componentes; si no hay,
		// se usa la miniatura para no dejar la ficha sin imagen.
		'hero_image'   => $meta( TGS_SQ_META_HERO_IMAGE ) ?: $meta( TGS_SQ_META_THUMBNAIL ),
		'items'        => $decode( TGS_SQ_META_ITEMS ),
		'price_list'   => (int) $meta( TGS_SQ_META_PRICE_LIST ),
		'price_cash'   => (int) $meta( TGS_SQ_META_PRICE_CASH ),
		'price_transfer' => (int) $meta( TGS_SQ_META_PRICE_TRANSFER ),
		'installments' => $decode( TGS_SQ_META_INSTALLMENTS ),
		'description'  => (string) $meta( TGS_SQ_META_DESCRIPTION ),
		'games'        => $decode( TGS_SQ_META_GAMES ),
		'compat'       => $decode( TGS_SQ_META_COMPATIBILITY ),
		'extra'        => tgs_sq_default_extra(),
	);
}

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

/**
 * Hero de la ficha: foto/3D a la izquierda, precio + botón de compra +
 * WhatsApp a la derecha. Ya no es un bloque que se pueda tildar/destildar
 * ni reordenar — siempre va primero y siempre con este mismo armado, para
 * que ninguna PC pueda quedar publicada sin cabecera o con el precio
 * pegado abajo de cualquier manera.
 */
function tgs_sq_block_hero( array $d ) {
	echo '<section class="tgs-hero">';
	echo '<div class="tgs-viewer">';
	if ( $d['model3d_url'] ) {
		echo '<model-viewer src="' . esc_url( $d['model3d_url'] ) . '" camera-controls auto-rotate shadow-intensity="1"></model-viewer>';
	} elseif ( $d['hero_image'] ) {
		echo '<img src="' . esc_url( $d['hero_image'] ) . '" alt="' . esc_attr( $d['title'] ) . '">';
	}
	echo '</div>';
	echo '<div class="tgs-summary">';
	echo '<span class="tgs-kicker">THE GAMER SHOP</span>';
	echo '<h1 class="tgs-title">' . esc_html( $d['title'] ) . '</h1>';
	/* Caja de compra: precio + CTA agrupados en un solo panel para que el
	 * precio y el botón se lean como una unidad y no como dos cajas sueltas. */
	echo '<div class="tgs-buybox">';
	echo tgs_sq_price_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '<div class="tgs-actions">';
	woocommerce_template_single_add_to_cart();
	echo tgs_sq_whatsapp_button_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '</div>';
	echo '</div>';
	echo '</div>';
	echo '</section>';
}

/**
 * Plan de cuotas "titular" para el hero: el de más cuotas disponible.
 * Devuelve null si la variante no tiene cuotas cargadas.
 */
function tgs_sq_best_installment_plan( $plans ) {
	$best = null;
	foreach ( (array) $plans as $plan ) {
		if ( ! is_array( $plan ) || empty( $plan['installments'] ) || empty( $plan['installmentCents'] ) ) {
			continue;
		}
		if ( null === $best || (int) $plan['installments'] > (int) $best['installments'] ) {
			$best = $plan;
		}
	}
	return $best;
}

/**
 * Bloque de precio del hero: transferencia (precio principal), efectivo
 * (secundario) y, si hay cuotas cargadas, la mejor financiación.
 */
function tgs_sq_price_html( array $d ) {
	ob_start();
	echo '<div class="tgs-price">';
	echo '<span class="tgs-price-label">Transferencia</span>';
	echo '<strong class="tgs-price-value">' . wp_kses_post( wc_price( $d['price_transfer'] / 100 ) ) . '</strong>';
	echo '<span class="tgs-price-cash">Efectivo ' . wp_kses_post( wc_price( $d['price_cash'] / 100 ) ) . '</span>';
	$best = tgs_sq_best_installment_plan( $d['installments'] );
	if ( $best ) {
		echo '<span class="tgs-price-financing">Hasta <strong>' . esc_html( (int) $best['installments'] ) . ' cuotas</strong> de '
			. wp_kses_post( wc_price( ( (int) $best['installmentCents'] ) / 100 ) ) . '</span>';
	}
	echo '</div>';
	return ob_get_clean();
}

function tgs_sq_sticky_html( array $d ) {
	if ( ! $d['product'] ) {
		return '';
	}
	$label = $d['extra']['sticky_label'] ?? 'Agregar al carrito';
	return '<div class="tgs-sticky" aria-hidden="true"><div class="tgs-sticky-info"><span class="tgs-sticky-name">'
		. esc_html( $d['title'] ) . '</span><strong class="tgs-sticky-price">'
		. wp_kses_post( $d['product']->get_price_html() )
		. '</strong></div><a href="' . esc_url( $d['product']->add_to_cart_url() ) . '" class="button">' . esc_html( $label ) . '</a></div>';
}

function tgs_sq_block_addtocartsticky( array $d ) {
	echo tgs_sq_sticky_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

// La sección de galería se eliminó: repetía las mismas fotos de los
// componentes que ya se muestran abajo. La ficha usa la imagen destacada de la
// PC en el hero, y cada componente su foto principal.

function tgs_sq_block_specs( array $d ) {
	if ( empty( $d['items'] ) ) {
		return;
	}
	echo '<section class="tgs-section-card"><h2>Componentes</h2><div class="tgs-items">';
	foreach ( $d['items'] as $item ) {
		echo '<div class="tgs-item">';
		/* El recuadro va siempre, tenga imagen o no: así todas las filas de la
		 * grilla arrancan con la misma sangría y no quedan desalineadas. */
		echo '<div class="tgs-item-media">';
		if ( ! empty( $item['imageUrl'] ) ) {
			echo '<img src="' . esc_url( $item['imageUrl'] ) . '" alt="" loading="lazy">';
		}
		echo '</div>';
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
	/* Si la descripción se cargó como texto plano (sin etiquetas), la pasamos
	 * por wpautop para que los saltos de línea se vean como párrafos y no como
	 * un bloque de texto corrido. Si ya trae HTML, se respeta tal cual. */
	$description = (string) $d['description'];
	if ( $description === wp_strip_all_tags( $description ) ) {
		$description = wpautop( $description );
	}
	echo '<section class="tgs-section-card"><h2>Descripción</h2><div class="tgs-prose">' . wp_kses_post( $description ) . '</div></section>';
}

function tgs_sq_block_games( array $d ) {
	if ( empty( $d['games'] ) ) {
		return;
	}
	echo '<section class="tgs-section-card"><h2>Juegos</h2><div class="tgs-games">';
	foreach ( $d['games'] as $game ) {
		echo '<div class="tgs-game"><span class="tgs-game-name">' . esc_html( $game['name'] ?? '' ) . '</span>';
		if ( ! empty( $game['tier'] ) ) {
			echo '<span class="tgs-game-tier">' . esc_html( $game['tier'] ) . '</span>';
		}
		echo '</div>';
	}
	echo '</div></section>';
}

function tgs_sq_block_compatibility( array $d ) {
	if ( empty( $d['compat'] ) ) {
		return;
	}
	echo '<section class="tgs-section-card"><h2>Compatibilidad</h2><ul class="tgs-compat">';
	foreach ( $d['compat'] as $line ) {
		echo '<li>' . esc_html( $line ) . '</li>';
	}
	echo '</ul></section>';
}

function tgs_sq_payment_html( array $d ) {
	$methods = $d['extra']['payment_methods'] ?? '';
	ob_start();
	echo '<section class="tgs-section-card tgs-payment"><h2>Formas de pago</h2>';
	if ( $methods ) {
		echo '<p class="tgs-payment-methods">' . esc_html( $methods ) . '</p>';
	}
	if ( ! empty( $d['installments'] ) ) {
		echo '<div class="tgs-installments">';
		foreach ( $d['installments'] as $plan ) {
			if ( ! is_array( $plan ) || empty( $plan['installments'] ) ) {
				continue;
			}
			$bank         = $plan['bank'] ?? '';
			$installments = (int) $plan['installments'];
			$per          = isset( $plan['installmentCents'] ) ? wc_price( ( (int) $plan['installmentCents'] ) / 100 ) : '';
			echo '<div class="tgs-installment-row">';
			if ( $bank ) {
				echo '<span class="tgs-installment-bank">' . esc_html( $bank ) . '</span>';
			}
			echo '<span class="tgs-installment-plan"><span class="tgs-installment-count">' . esc_html( $installments ) . ' cuotas</span>';
			if ( $per ) {
				echo ' de <span class="tgs-installment-amount">' . wp_kses_post( $per ) . '</span>';
			}
			echo '</span>';
			echo '</div>';
		}
		echo '</div>';
	}
	echo '</section>';
	return ob_get_clean();
}

function tgs_sq_block_payment( array $d ) {
	echo tgs_sq_payment_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

function tgs_sq_whatsapp_button_html( array $d ) {
	$number = preg_replace( '/[^0-9]/', '', $d['extra']['whatsapp_number'] ?? '' );
	if ( '' === $number ) {
		return '';
	}
	$message = strtr( (string) ( $d['extra']['whatsapp_message'] ?? '' ), array( '{{title}}' => $d['title'] ) );
	$url     = 'https://api.whatsapp.com/send?phone=' . rawurlencode( $number ) . '&text=' . rawurlencode( $message );
	return '<a class="tgs-whatsapp-btn" href="' . esc_url( $url ) . '" target="_blank" rel="noopener noreferrer" aria-label="Consultar por WhatsApp">'
		. '<svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M16 3C9 3 3 9 3 16c0 2.6.8 5 2.1 7L3 29l6.2-2c2 .9 4.2 1.4 6.8 1.4 7 0 13-6 13-13S23 3 16 3zm0 23.6c-2.3 0-4.5-.6-6.4-1.7l-.5-.3-4.6 1.5 1.5-4.5-.3-.5C4.6 19.2 4 17.6 4 16 4 9.5 9.5 4 16 4s12 5.5 12 12-5.5 12-12 12zm6.6-9c-.4-.2-2.1-1-2.4-1.2-.3-.1-.6-.2-.8.2-.2.4-.9 1.2-1.2 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3.1-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.2-.2.3-.4.4-.6.1-.3 0-.5-.1-.7-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.9 5.1.8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 2.1-.9 2.4-1.7.3-.8.3-1.5.2-1.7-.1-.1-.3-.2-.7-.4z"/></svg>'
		. '<span>Consultar por WhatsApp</span></a>';
}

function tgs_sq_get_recommended_products( $product_id, $price_cents, $count = 4 ) {
	$count = max( 1, (int) $count );
	if ( $price_cents <= 0 ) {
		return array();
	}
	$band    = 0.2;
	$results = array();
	for ( $tries = 0; $tries < 4 && count( $results ) < $count; $tries++ ) {
		$min   = (int) round( $price_cents * ( 1 - $band ) );
		$max   = (int) round( $price_cents * ( 1 + $band ) );
		$query = new WP_Query( array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'post__not_in'   => array( $product_id ),
			'meta_key'       => TGS_SQ_META_MANAGED,
			'meta_value'     => '1',
			'meta_query'     => array(
				array(
					'key'     => TGS_SQ_META_PRICE_TRANSFER,
					'value'   => array( max( 0, $min ), $max ),
					'compare' => 'BETWEEN',
					'type'    => 'NUMERIC',
				),
			),
		) );
		$results = $query->posts;
		$band   += 0.2;
	}
	usort( $results, function ( $a, $b ) use ( $price_cents ) {
		$pa = (int) get_post_meta( $a->ID, TGS_SQ_META_PRICE_TRANSFER, true );
		$pb = (int) get_post_meta( $b->ID, TGS_SQ_META_PRICE_TRANSFER, true );
		return abs( $pa - $price_cents ) <=> abs( $pb - $price_cents );
	} );
	return array_slice( $results, 0, $count );
}

function tgs_sq_recommended_html( array $d ) {
	$count = (int) ( $d['extra']['recommended_count'] ?? 4 );
	$posts = tgs_sq_get_recommended_products( $d['product_id'], $d['price_transfer'], $count );
	if ( empty( $posts ) ) {
		return '';
	}
	$title = $d['extra']['recommended_title'] ?? 'Recomendadas de la casa';
	ob_start();
	echo '<section class="tgs-section-card tgs-recommended"><h2>' . esc_html( $title ) . '</h2><div class="tgs-recommended-grid">';
	foreach ( $posts as $post ) {
		$pid     = $post->ID;
		$thumb   = get_post_meta( $pid, TGS_SQ_META_THUMBNAIL, true );
		$product = wc_get_product( $pid );
		echo '<a class="tgs-recommended-card" href="' . esc_url( get_permalink( $pid ) ) . '">';
		/* El contenedor de la imagen va siempre para que todas las tarjetas
		 * midan lo mismo aunque a alguna le falte la foto. */
		echo '<span class="tgs-recommended-media">';
		if ( $thumb ) {
			echo '<img src="' . esc_url( $thumb ) . '" alt="" loading="lazy">';
		}
		echo '</span>';
		echo '<span class="tgs-recommended-body">';
		echo '<span class="tgs-recommended-name">' . esc_html( get_the_title( $pid ) ) . '</span>';
		if ( $product ) {
			echo '<span class="tgs-recommended-price">' . wp_kses_post( $product->get_price_html() ) . '</span>';
		}
		echo '</span>';
		echo '</a>';
	}
	echo '</div></section>';
	return ob_get_clean();
}

function tgs_sq_block_recommended( array $d ) {
	echo tgs_sq_recommended_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

/**
 * Tipos de bloque que ya no son "opcionales": se imprimen siempre como
 * parte del hero (ver tgs_sq_block_hero). Si una variante vieja todavía
 * los tiene guardados en su lista de bloques, se ignoran acá para no
 * duplicarlos — así ninguna variante creada con una versión anterior del
 * plugin puede romper la página nueva.
 */
function tgs_sq_legacy_block_types() {
	return array( 'hero3d', 'pricebox', 'whatsapp', 'power', 'gallery' );
}

function tgs_sq_render_blocks_mode( array $variant, array $data ) {
	echo '<main class="tgs-landing" style="' . esc_attr( tgs_sq_layout_style_vars( $variant['tokens'] ?? array() ) ) . '">';
	tgs_sq_block_hero( $data );
	$legacy = tgs_sq_legacy_block_types();
	foreach ( ( $variant['blocks'] ?? array() ) as $block ) {
		if ( empty( $block['visible'] ) ) {
			continue;
		}
		$type = sanitize_key( $block['type'] ?? '' );
		if ( in_array( $type, $legacy, true ) ) {
			continue;
		}
		tgs_sq_render_block( $type, $data );
	}
	echo '</main>';
}

/* ---------------------------------------------------------------------
 * Modo "Diseño propio (pegar código)".
 * ------------------------------------------------------------------- */

/**
 * Corre un renderer de bloque y devuelve su HTML en vez de imprimirlo.
 * Los bloques que no tienen datos no imprimen nada, así que el placeholder
 * correspondiente queda vacío en lugar de romper la página.
 */
function tgs_sq_capture_block( $type, array $d ) {
	ob_start();
	tgs_sq_render_block( $type, $d );
	return (string) ob_get_clean();
}

/**
 * Valores de todos los placeholders documentados en tgs_sq_placeholder_docs(),
 * ya listos para reemplazar en el código pegado por el admin.
 *
 * Devuelve un mapa '{{clave}}' => HTML. Cualquier placeholder documentado que
 * no tenga datos para este producto queda como string vacío: nunca se muestra
 * un {{...}} literal en la ficha publicada.
 */
function tgs_sq_placeholder_values( array $d ) {
	$price = function ( $cents ) {
		$cents = (int) $cents;
		return $cents > 0 ? wc_price( $cents / 100 ) : '';
	};

	$cart = '';
	if ( $d['product'] && function_exists( 'woocommerce_template_single_add_to_cart' ) ) {
		ob_start();
		woocommerce_template_single_add_to_cart();
		$cart = (string) ob_get_clean();
	}

	$description = (string) $d['description'];
	if ( '' !== $description && $description === wp_strip_all_tags( $description ) ) {
		$description = wpautop( $description );
	}

	$best    = tgs_sq_best_installment_plan( $d['installments'] );
	$cuotas  = '';
	if ( $best ) {
		$cuotas = 'Hasta ' . (int) $best['installments'] . ' cuotas de '
			. wp_kses_post( wc_price( ( (int) $best['installmentCents'] ) / 100 ) );
	}

	$imagen = $d['hero_image']
		? '<img src="' . esc_url( $d['hero_image'] ) . '" alt="' . esc_attr( $d['title'] ) . '">'
		: '';
	$modelo = $d['model3d_url']
		? '<model-viewer src="' . esc_url( $d['model3d_url'] ) . '" camera-controls auto-rotate shadow-intensity="1"></model-viewer>'
		: '';

	$values = array(
		'titulo'               => esc_html( $d['title'] ),
		'permalink'            => esc_url( $d['permalink'] ),
		'precio_lista'         => $price( $d['price_list'] ),
		'precio_efectivo'      => $price( $d['price_cash'] ),
		'precio_transferencia' => $price( $d['price_transfer'] ),
		'caja_precios'         => tgs_sq_price_html( $d ),
		'cuotas'               => $cuotas,
		'formas_de_pago'       => tgs_sq_payment_html( $d ),
		'descripcion'          => wp_kses_post( $description ),
		'imagen_destacada'     => $imagen,
		'imagen_destacada_url' => esc_url( (string) $d['hero_image'] ),
		'modelo_3d'            => $modelo,
		'modelo_3d_url'        => esc_url( (string) $d['model3d_url'] ),
		'componentes'          => tgs_sq_capture_block( 'specs', $d ),
		'juegos'               => tgs_sq_capture_block( 'games', $d ),
		'compatibilidad'       => tgs_sq_capture_block( 'compatibility', $d ),
		'recomendadas'         => tgs_sq_recommended_html( $d ),
		'boton_carrito'        => $cart,
		'boton_whatsapp'       => tgs_sq_whatsapp_button_html( $d ),
		'barra_flotante'       => tgs_sq_sticky_html( $d ),
	);

	// Red de seguridad: si algún día se documenta un placeholder nuevo y
	// alguien se olvida de darle valor acá, se resuelve a vacío igual.
	$map = array();
	foreach ( array_keys( tgs_sq_placeholder_docs() ) as $key ) {
		$map[ '{{' . $key . '}}' ] = (string) ( $values[ $key ] ?? '' );
	}
	return $map;
}

/**
 * Reemplaza los placeholders del código pegado por el admin.
 */
function tgs_sq_apply_placeholders( $code, array $d ) {
	return strtr( (string) $code, tgs_sq_placeholder_values( $d ) );
}

/**
 * Imprime la ficha usando el código a medida de la variante.
 *
 * El wrapper `.tgs-custom` es la red de seguridad: trae tipografía, ancho
 * máximo, espaciado y los colores de la paleta de la variante, todo con
 * especificidad cero (ver `:where(.tgs-custom)` en assets/tgs-landing.css)
 * para que cualquier regla que el admin escriba en su propio <style> la
 * pise sin pelear. Así, aunque el código pegado no traiga nada de CSS, la
 * ficha nunca se ve como texto plano sin formato.
 */
function tgs_sq_render_custom_mode( array $variant, array $data ) {
	$style = tgs_sq_layout_style_vars( $variant['tokens'] ?? array() )
		. 'background:var(--tgs-bg);color:var(--tgs-text);font-family:var(--tgs-font);';
	// Lleva también `tgs-landing`: los estilos del plugin están scopeados a esa
	// clase (para ganarle al CSS del tema, que usa el mismo prefijo `tgs-`), así
	// que los fragmentos que entran por placeholder salen igual de bien acá.
	echo '<main class="tgs-landing tgs-custom" style="' . esc_attr( $style ) . '">';
	/*
	 * Salida sin escapar A PROPÓSITO: esto ES la funcionalidad del modo
	 * "Diseño propio". El código lo pega un administrador de confianza
	 * (se exige `current_user_can( 'manage_options' )` + nonce al guardar,
	 * ver tgs_sq_render_variant_editor()), igual que el HTML que cualquier
	 * admin puede escribir en un post con el editor de WordPress.
	 */
	echo tgs_sq_apply_placeholders( tgs_sq_variant_custom_code( $variant ), $data ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '</main>';
}

/**
 * Renderiza la ficha con el modo de la variante.
 *
 * Por defecto se arma con el sistema de bloques (diseño fijo y probado del
 * plugin). Si la variante está en modo "custom" y tiene código cargado, se
 * usa ese código; si está en "custom" pero el código quedó vacío, se cae a
 * bloques a propósito: una ficha con el diseño de siempre es infinitamente
 * mejor que una página en blanco.
 */
function tgs_sq_render_product( $product_id ) {
	tgs_sq_ensure_default_variant();
	$data          = tgs_sq_collect_product_data( $product_id );
	$variant_slug  = tgs_sq_product_variant_slug( $product_id );
	$variant       = tgs_sq_get_variant( $variant_slug ) ?: tgs_sq_get_variant( TGS_SQ_DEFAULT_VARIANT );
	$data['extra'] = wp_parse_args( $variant['extra'] ?? array(), tgs_sq_default_extra() );

	$custom_code = tgs_sq_variant_custom_code( $variant );
	if ( 'custom' === tgs_sq_normalize_mode( $variant['mode'] ?? '' ) && '' !== $custom_code ) {
		tgs_sq_render_custom_mode( $variant, $data );
		return;
	}

	tgs_sq_render_blocks_mode( $variant, $data );
}
