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
	// Tipografías de la ficha: Inter para texto (legible y con contraste
	// contra los títulos) y Rajdhani para títulos y números (más "gamer").
	// Se sirven desde el plugin (assets/fonts, @font-face en tgs-landing.css):
	// pedirlas a Google Fonts dependía de que ningún plugin de optimización
	// las bloqueara o difiriera, y el título salía con la fuente del sistema.
	wp_enqueue_style( 'tgs-landing', TGS_SQ_URL . 'assets/tgs-landing.css', array(), TGS_SQ_VERSION );
	wp_enqueue_script( 'tgs-landing', TGS_SQ_URL . 'assets/tgs-landing.js', array(), TGS_SQ_VERSION, true );

	$model3d = get_post_meta( get_the_ID(), TGS_SQ_META_MODEL3D, true );
	if ( $model3d ) {
		wp_enqueue_script( 'tgs-model-viewer', TGS_SQ_URL . 'assets/model-viewer.min.js', array(), TGS_SQ_VERSION, true );
	}
} );

// Precarga de la fuente del título para que no "salte" al cargar.
add_action( 'wp_head', function () {
	if ( is_singular( 'product' ) && tgs_sq_is_managed_product() ) {
		echo '<link rel="preload" as="font" type="font/woff2" crossorigin href="' . esc_url( TGS_SQ_URL . 'assets/fonts/rajdhani-latin-700.woff2' ) . '">' . "\n";
	}
}, 1 );

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
		'tagline'      => (string) $meta( TGS_SQ_META_TAGLINE ),
		'highlights'   => $decode( TGS_SQ_META_HIGHLIGHTS ),
		'audience'     => (string) $meta( TGS_SQ_META_AUDIENCE ),
		'gallery'      => $decode( TGS_SQ_META_GALLERY ),
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
	echo tgs_sq_tagline_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo tgs_sq_highlights_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
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
 * ¿Este plan es sin interés? Lo decide el dato y no un texto escrito a mano:
 * `interestBps` es el recargo en puntos básicos, así que 0 = sin interés.
 */
function tgs_sq_plan_sin_interes( $plan ) {
	return is_array( $plan ) && 0 === (int) ( $plan['interestBps'] ?? 0 );
}

/**
 * Plan "titular" para el hero y la barra de compra.
 *
 * Gana el de más cuotas SIN INTERÉS, que es el que mejor vende; solo si no hay
 * ninguno sin interés se cae al de más cuotas. Devuelve null si el presupuesto
 * no tiene cuotas cargadas.
 */
function tgs_sq_best_installment_plan( $plans ) {
	$best     = null;
	$best_sin = null;
	foreach ( (array) $plans as $plan ) {
		if ( ! is_array( $plan ) || empty( $plan['installments'] ) || empty( $plan['installmentCents'] ) ) {
			continue;
		}
		if ( null === $best || (int) $plan['installments'] > (int) $best['installments'] ) {
			$best = $plan;
		}
		if ( tgs_sq_plan_sin_interes( $plan )
			&& ( null === $best_sin || (int) $plan['installments'] > (int) $best_sin['installments'] ) ) {
			$best_sin = $plan;
		}
	}
	return $best_sin ?: $best;
}

/**
 * Línea de financiación lista para mostrar, por ejemplo:
 * "Hasta 12 cuotas sin interés de $157.148 con BBVA".
 *
 * Tanto el "sin interés" como el banco salen del plan cargado, así la ficha
 * nunca promete una condición que el presupuesto no tenga.
 */
function tgs_sq_installment_line( $plan, array $d = array() ) {
	if ( ! is_array( $plan ) || empty( $plan['installments'] ) || empty( $plan['installmentCents'] ) ) {
		return '';
	}
	$linea = 'Hasta ' . (int) $plan['installments'] . ' cuotas';
	if ( tgs_sq_plan_sin_interes( $plan ) ) {
		$linea .= ' sin interés' . ( $d ? tgs_sq_financing_mark( $d ) : '' );
	}
	$linea .= ' de ' . wp_kses_post( wc_price( ( (int) $plan['installmentCents'] ) / 100 ) );
	$banco = trim( (string) ( $plan['bank'] ?? '' ) );
	if ( '' !== $banco ) {
		$linea .= ' con ' . esc_html( $banco );
	}
	return $linea;
}

/**
 * Financiación detallada para el hero ({{cuotas_detalle}}):
 *   Hasta 6 cuotas sin interés del precio de lista con Tarjeta BBVA*
 *   · 3 cuotas sin interés de $X
 *   · 6 cuotas sin interés de $Y
 *   MÁS OPCIONES DE PAGO  (abre el panel de formas de pago)
 * Solo lista los planes SIN interés; los demás quedan en el panel. Vacío si
 * el presupuesto no tiene cuotas.
 */
function tgs_sq_installments_detail_html( array $d ) {
	$plans = array();
	foreach ( (array) $d['installments'] as $plan ) {
		if ( is_array( $plan ) && ! empty( $plan['installments'] ) && ! empty( $plan['installmentCents'] ) && tgs_sq_plan_sin_interes( $plan ) ) {
			$plans[] = $plan;
		}
	}
	if ( ! $plans ) {
		return '';
	}
	usort( $plans, function ( $a, $b ) { return (int) $a['installments'] <=> (int) $b['installments']; } );
	$max   = end( $plans );
	$banks = array_values( array_unique( array_filter( array_map( function ( $plan ) { return trim( (string) ( $plan['bank'] ?? '' ) ); }, $plans ) ) ) );
	$head  = 'Hasta ' . (int) $max['installments'] . ' cuotas sin interés del precio de lista';
	if ( $banks ) {
		$head .= ' con Tarjeta ' . implode( ' / ', $banks );
	}
	$html  = '<div class="tgs-fin-detail">';
	$html .= '<div class="tgs-fin-detail__head">' . esc_html( $head ) . tgs_sq_financing_mark( $d ) . '</div>';
	$html .= '<ul class="tgs-fin-detail__list">';
	foreach ( $plans as $plan ) {
		$html .= '<li><b>' . (int) $plan['installments'] . ' cuotas sin interés</b> de ' . wp_kses_post( wc_price( ( (int) $plan['installmentCents'] ) / 100 ) ) . '</li>';
	}
	$html .= '</ul>';
	$html .= '<button type="button" class="tgs-fin-detail__more" data-gx-pay-open>Más opciones de pago</button>';
	$html .= '</div>';
	return $html;
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
		echo '<span class="tgs-price-financing">' . wp_kses_post( tgs_sq_installment_line( $best, $d ) ) . '</span>';
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
	echo '</div>';
	echo tgs_sq_ai_note_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '</section>';
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
	echo '<section class="tgs-section-card"><h2>Descripción</h2><div class="tgs-prose">' . wp_kses_post( $description ) . '</div>' . tgs_sq_ai_note_html( $d ) . '</section>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

/** Bajada debajo del título del hero (vacío si no hay). */
function tgs_sq_tagline_html( array $d ) {
	if ( empty( $d['tagline'] ) ) {
		return '';
	}
	return '<p class="tgs-tagline">' . esc_html( $d['tagline'] ) . '</p>';
}

/** Puntos fuertes en el hero, como lista corta con tilde. */
function tgs_sq_highlights_html( array $d ) {
	if ( empty( $d['highlights'] ) || ! is_array( $d['highlights'] ) ) {
		return '';
	}
	$html = '<ul class="tgs-highlights">';
	foreach ( $d['highlights'] as $line ) {
		$line = (string) $line;
		if ( '' === $line ) {
			continue;
		}
		$html .= '<li>' . esc_html( $line ) . '</li>';
	}
	return $html . '</ul>';
}

/**
 * Juegos con el rendimiento estimado. Si el análisis trae resolución y
 * calidad por separado se muestran como etiquetas; si no, el texto del tier
 * como siempre. Todo es estimado y así lo dice el pie.
 */
function tgs_sq_block_games( array $d ) {
	if ( empty( $d['games'] ) ) {
		return;
	}
	echo '<section class="tgs-section-card"><h2>Juegos</h2>';
	if ( ! empty( $d['audience'] ) ) {
		echo '<p class="tgs-audience">' . esc_html( $d['audience'] ) . '</p>';
	}
	echo '<div class="tgs-games">';
	foreach ( $d['games'] as $game ) {
		$resolution = (string) ( $game['resolution'] ?? '' );
		$settings   = (string) ( $game['settings'] ?? '' );
		$fps        = trim( (string) ( $game['fps'] ?? '' ) );
		// Resolución y calidad también como atributos: los diseños propios
		// pueden pintar una barra de rendimiento con CSS según el nivel.
		echo '<div class="tgs-game" data-resolution="' . esc_attr( sanitize_title( $resolution ) ) . '" data-settings="' . esc_attr( sanitize_title( $settings ) ) . '">';
		echo '<span class="tgs-game-name">' . esc_html( $game['name'] ?? '' ) . '</span>';
		if ( '' !== $resolution || '' !== $settings || '' !== $fps ) {
			echo '<span class="tgs-game-badges">';
			if ( '' !== $resolution ) {
				echo '<span class="tgs-game-badge">' . esc_html( $resolution ) . '</span>';
			}
			if ( '' !== $settings ) {
				echo '<span class="tgs-game-badge tgs-game-badge--settings">' . esc_html( $settings ) . '</span>';
			}
			// Rango de FPS estimado por la IA (ej: "90-120 FPS"); nunca un número exacto.
			if ( '' !== $fps ) {
				echo '<span class="tgs-game-badge tgs-game-badge--fps" title="Estimado">~' . esc_html( $fps ) . '</span>';
			}
			echo '</span>';
		} elseif ( ! empty( $game['tier'] ) ) {
			echo '<span class="tgs-game-tier">' . esc_html( $game['tier'] ) . '</span>';
		}
		if ( ! empty( $game['note'] ) ) {
			echo '<span class="tgs-game-note">' . esc_html( $game['note'] ) . '</span>';
		}
		echo '</div>';
	}
	echo '</div>';
	echo '<p class="tgs-games-footnote">Rendimiento y FPS estimados según los componentes. Pueden variar con la configuración del juego, los drivers y el monitor.</p>';
	echo tgs_sq_ai_note_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '</section>';
}

/** Galería de fotos de los componentes (bloque opcional). */
function tgs_sq_block_gallery( array $d ) {
	if ( empty( $d['gallery'] ) || ! is_array( $d['gallery'] ) ) {
		return;
	}
	echo '<section class="tgs-section-card"><h2>Galería</h2><div class="tgs-gallery">';
	foreach ( $d['gallery'] as $url ) {
		$url = (string) $url;
		if ( '' === $url ) {
			continue;
		}
		echo '<img src="' . esc_url( $url ) . '" alt="" loading="lazy">';
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
	echo '</ul>';
	echo tgs_sq_ai_note_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '</section>';
}

/** Asterisco que remite a las condiciones de las cuotas (vacío si no hay texto). */
function tgs_sq_financing_mark( array $d ) {
	$terms = trim( (string) ( $d['extra']['financing_terms'] ?? '' ) );
	if ( '' === $terms ) {
		return '';
	}
	return '<sup class="tgs-fin-mark" title="' . esc_attr( $terms ) . '">*</sup>';
}

/** Condiciones de las cuotas, para el pie de Formas de pago. */
function tgs_sq_financing_terms_html( array $d ) {
	$terms = trim( (string) ( $d['extra']['financing_terms'] ?? '' ) );
	if ( '' === $terms ) {
		return '';
	}
	return '<p class="tgs-fin-terms">* ' . esc_html( $terms ) . '</p>';
}

/** Aviso de "generado con IA", al pie de cada sección con texto de la IA. */
function tgs_sq_ai_note_html( array $d ) {
	$note = trim( (string) ( $d['extra']['ai_disclaimer'] ?? '' ) );
	if ( '' === $note ) {
		return '';
	}
	return '<p class="tgs-ai-note">' . esc_html( $note ) . '</p>';
}

/**
 * Envíos y retiro, leídos de la configuración real de WooCommerce (zonas de
 * envío y sus métodos, con el costo cargado ahí). Así la ficha promete lo
 * mismo que va a cobrar el checkout, y si cambia un precio de envío no hay
 * que tocar nada acá.
 */
function tgs_sq_shipping_options( $product = null ) {
	if ( ! class_exists( 'WC_Shipping_Zones' ) ) {
		return array();
	}
	$rows  = array();
	$zones = WC_Shipping_Zones::get_zones();
	// Métodos que el admin pidió no mostrar en la ficha (Ajustes → Envíos),
	// por ejemplo tarifas pensadas para otros productos ("Pesados (Silla Gamer)").
	$hidden = tgs_sq_hidden_shipping_titles();
	// Clase de envío de la PC, para leer el costo por clase de las tarifas planas.
	$product_class_id = ( $product instanceof WC_Product ) ? (int) $product->get_shipping_class_id() : 0;
	$class_ids        = array();
	if ( function_exists( 'WC' ) && WC()->shipping() ) {
		foreach ( (array) WC()->shipping()->get_shipping_classes() as $class ) {
			$class_ids[] = (int) $class->term_id;
		}
	}
	// La zona 0 es "Resto del mundo": cubre lo que no cae en ninguna otra.
	$zones[] = array( 'zone_name' => 'Resto del país', 'shipping_methods' => WC_Shipping_Zones::get_zone( 0 )->get_shipping_methods( true ) );
	foreach ( $zones as $zone ) {
		$zone_name = (string) ( $zone['zone_name'] ?? '' );
		foreach ( (array) ( $zone['shipping_methods'] ?? array() ) as $method ) {
			if ( ! is_object( $method ) || ! $method->is_enabled() ) {
				continue;
			}
			$title = (string) $method->get_title();
			$type  = (string) $method->id;
			if ( in_array( tgs_sq_shipping_key( $title ), $hidden, true ) ) {
				continue;
			}
			$cost  = '';
			if ( 'free_shipping' === $type ) {
				$cost = 'Gratis';
				$min  = (float) $method->get_option( 'min_amount' );
				if ( $min > 0 && in_array( $method->get_option( 'requires' ), array( 'min_amount', 'either', 'both' ), true ) ) {
					$cost = 'Gratis desde ' . wp_strip_all_tags( wc_price( $min ) );
				}
			} elseif ( 'local_pickup' === $type ) {
				$raw  = (float) $method->get_option( 'cost' );
				$cost = $raw > 0 ? wp_strip_all_tags( wc_price( $raw ) ) : 'Sin costo';
			} elseif ( 'flat_rate' === $type ) {
				$raw = (string) $method->get_option( 'cost' );
				// Tarifa plana con costos por clase de envío: se suma el de la
				// clase de la PC (o el "sin clase"). Si la tarifa SOLO tiene costos
				// para otras clases (sillas, pesados...), no aplica a esta PC y no
				// se muestra: la ficha no puede prometer un envío que el checkout
				// no va a ofrecer con ese precio.
				$class_raw  = '';
				$has_others = false;
				foreach ( $class_ids as $class_id ) {
					$value = (string) $method->get_option( 'class_cost_' . $class_id );
					if ( $class_id === $product_class_id ) {
						$class_raw = $value;
					} elseif ( '' !== $value ) {
						$has_others = true;
					}
				}
				if ( '' === $class_raw && ! $product_class_id ) {
					$class_raw = (string) $method->get_option( 'no_class_cost' );
				}
				if ( '' === $raw && '' === $class_raw && $has_others ) {
					continue;
				}
				if ( ( '' === $raw || is_numeric( $raw ) ) && ( '' === $class_raw || is_numeric( $class_raw ) ) ) {
					$total = (float) $raw + (float) $class_raw;
					$cost  = $total > 0 ? wp_strip_all_tags( wc_price( $total ) ) : 'Sin costo';
				} else {
					// Un costo con fórmula ([qty], [fee]) no se puede mostrar como número.
					$cost = 'Se calcula al comprar';
				}
			} else {
				$raw = (string) $method->get_option( 'cost' );
				if ( '' !== $raw && is_numeric( $raw ) ) {
					$cost = (float) $raw > 0 ? wp_strip_all_tags( wc_price( (float) $raw ) ) : 'Sin costo';
				} elseif ( '' !== $raw ) {
					$cost = 'Se calcula al comprar';
				}
			}
			$rows[] = array(
				'zone'   => $zone_name,
				'title'  => $title,
				'type'   => $type,
				'cost'   => $cost,
				'pickup' => 'local_pickup' === $type,
			);
		}
	}
	return $rows;
}

/**
 * Sección "Envíos y retiro". Retiro en local primero, después los envíos
 * agrupados por zona. Si Woo no tiene zonas cargadas, solo la promesa.
 */
/** Clave normalizada para comparar títulos de métodos de envío. */
function tgs_sq_shipping_key( $title ) {
	return strtolower( trim( preg_replace( '/\s+/', ' ', (string) $title ) ) );
}

/** Títulos de métodos de envío que no se muestran en la ficha (Ajustes → Envíos, uno por línea). */
function tgs_sq_hidden_shipping_titles() {
	$raw  = (string) get_option( TGS_SQ_OPTION_HIDDEN_SHIPPING, '' );
	$keys = array();
	foreach ( preg_split( '/\r\n|\r|\n/', $raw ) as $line ) {
		$key = tgs_sq_shipping_key( $line );
		if ( '' !== $key ) {
			$keys[] = $key;
		}
	}
	return $keys;
}

function tgs_sq_shipping_html( array $d ) {
	$rows    = tgs_sq_shipping_options( $d['product'] );
	$pickups = array_values( array_filter( $rows, function ( $r ) { return $r['pickup']; } ) );
	$ships   = array_values( array_filter( $rows, function ( $r ) { return ! $r['pickup']; } ) );
	ob_start();
	echo '<section class="tgs-section-card tgs-shipping"><h2>Envíos y retiro</h2>';
	echo '<p class="tgs-shipping-lead"><strong>Enviamos a todo el país.</strong> El costo se calcula en el checkout según tu ubicación, con las mismas tarifas y opciones de siempre.</p>';
	if ( $pickups || $ships ) {
		echo '<div class="tgs-shipping-grid">';
		foreach ( $pickups as $row ) {
			echo '<div class="tgs-shipping-row tgs-shipping-row--pickup"><span class="tgs-shipping-title">' . esc_html( $row['title'] ) . '</span>';
			if ( $row['zone'] && 'Resto del país' !== $row['zone'] ) {
				echo '<span class="tgs-shipping-zone">' . esc_html( $row['zone'] ) . '</span>';
			}
			echo '<span class="tgs-shipping-cost">' . esc_html( $row['cost'] ?: 'Sin costo' ) . '</span></div>';
		}
		foreach ( $ships as $row ) {
			echo '<div class="tgs-shipping-row"><span class="tgs-shipping-title">' . esc_html( $row['title'] ) . '</span>';
			if ( $row['zone'] ) {
				echo '<span class="tgs-shipping-zone">' . esc_html( $row['zone'] ) . '</span>';
			}
			if ( $row['cost'] ) {
				echo '<span class="tgs-shipping-cost">' . esc_html( $row['cost'] ) . '</span>';
			}
			echo '</div>';
		}
		echo '</div>';
	}
	echo '</section>';
	return ob_get_clean();
}

function tgs_sq_block_shipping( array $d ) {
	echo tgs_sq_shipping_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
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
			if ( tgs_sq_plan_sin_interes( $plan ) ) {
				echo ' <span class="tgs-installment-free">sin interés' . tgs_sq_financing_mark( $d ) . '</span>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			}
			if ( $per ) {
				echo ' de <span class="tgs-installment-amount">' . wp_kses_post( $per ) . '</span>';
			}
			echo '</span>';
			echo '</div>';
		}
		echo '</div>';
		echo tgs_sq_financing_terms_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
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
		// Primero la imagen destacada de WooCommerce (copia local que el plugin
		// baja al publicar); la URL del sistema queda de respaldo por si aún no
		// se descargó.
		$thumb   = get_the_post_thumbnail_url( $pid, 'woocommerce_thumbnail' ) ?: get_post_meta( $pid, TGS_SQ_META_THUMBNAIL, true );
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

/* ---------------------------------------------------------------------
 * "Sumale un monitor": monitores de una categoría de WooCommerce
 * (Ajustes → Monitores) que el cliente puede elegir en la ficha. Al agregar
 * la PC al carrito, el monitor elegido entra junto con ella.
 * ------------------------------------------------------------------- */

function tgs_sq_monitor_category_id() {
	return (int) get_option( TGS_SQ_OPTION_MONITOR_CATEGORY, 0 );
}

/** IDs de monitores elegidos a mano en Ajustes, en el orden guardado. */
function tgs_sq_monitor_product_ids() {
	$ids = get_option( TGS_SQ_OPTION_MONITOR_PRODUCTS, array() );
	return array_values( array_filter( array_map( 'absint', (array) $ids ) ) );
}

/** ¿Producto simple, publicado, comprable y con stock? */
function tgs_sq_monitor_usable( $product_id ) {
	if ( 'publish' !== get_post_status( $product_id ) || tgs_sq_is_managed_product( $product_id ) ) {
		return null;
	}
	$product = wc_get_product( $product_id );
	// Solo productos simples: una variación necesitaría elegir atributos
	// y eso no entra en un click desde la ficha de la PC.
	if ( ! $product || ! $product->is_type( 'simple' ) || ! $product->is_purchasable() || ! $product->is_in_stock() ) {
		return null;
	}
	return $product;
}

/**
 * Monitores para la sección: primero los elegidos a mano (Ajustes), después
 * los de la categoría configurada, sin repetir y hasta `count`.
 */
function tgs_sq_monitor_products( $count, array $extra = array() ) {
	if ( ! function_exists( 'wc_get_product' ) ) {
		return array();
	}
	$count    = max( 1, (int) $count );
	$products = array();
	$seen     = array();
	// La variante puede traer su propia lista; en ese caso no se usa ni la
	// lista global ni la categoría.
	$custom = 'custom' === ( $extra['monitors_source'] ?? 'settings' );
	$ids    = $custom ? array_values( array_filter( array_map( 'absint', (array) ( $extra['monitors_products'] ?? array() ) ) ) ) : tgs_sq_monitor_product_ids();
	foreach ( $ids as $product_id ) {
		$product = tgs_sq_monitor_usable( $product_id );
		if ( $product ) {
			$products[]          = $product;
			$seen[ $product_id ] = true;
		}
	}
	$category_id = $custom ? 0 : tgs_sq_monitor_category_id();
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

/** ¿Este ID es un monitor elegible? Se valida antes de sumarlo al carrito. */
function tgs_sq_is_addon_monitor( $product_id ) {
	$product_id = absint( $product_id );
	if ( ! $product_id ) {
		return false;
	}
	$category_id = tgs_sq_monitor_category_id();
	$chosen      = in_array( $product_id, tgs_sq_monitor_product_ids(), true );
	// También vale si alguna variante lo eligió para su propia lista.
	if ( ! $chosen ) {
		foreach ( tgs_sq_get_variants() as $variant ) {
			if ( in_array( $product_id, array_map( 'absint', (array) ( $variant['extra']['monitors_products'] ?? array() ) ), true ) ) {
				$chosen = true;
				break;
			}
		}
	}
	if ( ! $chosen && ! ( $category_id && has_term( $category_id, 'product_cat', $product_id ) ) ) {
		return false;
	}
	return (bool) tgs_sq_monitor_usable( $product_id );
}

function tgs_sq_monitors_html( array $d ) {
	if ( ! $d['product'] ) {
		return '';
	}
	$count    = (int) ( $d['extra']['monitors_count'] ?? 6 );
	$monitors = tgs_sq_monitor_products( $count, (array) $d['extra'] );
	if ( empty( $monitors ) ) {
		return '';
	}
	$title    = $d['extra']['monitors_title'] ?? 'Sumale un monitor';
	$pc_price = (float) $d['product']->get_price();
	ob_start();
	echo '<section class="tgs-section-card tgs-monitors" data-tgs-monitors data-pc-price="' . esc_attr( $pc_price ) . '" data-currency="' . esc_attr( get_woocommerce_currency() ) . '">';
	echo '<h2>' . esc_html( $title ) . '</h2>';
	echo '<p class="tgs-monitors-lead">Elegí uno y se agrega al carrito junto con la PC. Tocalo de nuevo para sacarlo.</p>';
	echo '<div class="tgs-monitors-grid">';
	foreach ( $monitors as $monitor ) {
		$pid   = $monitor->get_id();
		$thumb = get_the_post_thumbnail_url( $pid, 'woocommerce_thumbnail' );
		echo '<div class="tgs-monitor-card">';
		echo '<button type="button" class="tgs-monitor-pick" aria-pressed="false" data-monitor-id="' . esc_attr( $pid ) . '" data-monitor-name="' . esc_attr( $monitor->get_name() ) . '" data-monitor-price="' . esc_attr( (float) $monitor->get_price() ) . '">';
		echo '<span class="tgs-monitor-media">';
		if ( $thumb ) {
			echo '<img src="' . esc_url( $thumb ) . '" alt="" loading="lazy">';
		}
		echo '</span>';
		echo '<span class="tgs-monitor-body">';
		echo '<span class="tgs-monitor-name">' . esc_html( $monitor->get_name() ) . '</span>';
		echo '<span class="tgs-monitor-price">' . wp_kses_post( $monitor->get_price_html() ) . '</span>';
		echo '<span class="tgs-monitor-cta"><span class="tgs-monitor-cta--add">+ Agregar</span><span class="tgs-monitor-cta--added">✓ Elegido</span></span>';
		echo '</span>';
		echo '</button>';
		echo '<a class="tgs-monitor-link" href="' . esc_url( get_permalink( $pid ) ) . '" target="_blank" rel="noopener">Ver ficha</a>';
		echo '</div>';
	}
	echo '</div>';
	echo '<p class="tgs-monitors-summary" hidden>Al agregar al carrito entra la PC + <strong data-monitor-summary-name></strong>. Total: <strong data-monitor-summary-total></strong></p>';
	echo '</section>';
	return ob_get_clean();
}

function tgs_sq_block_monitors( array $d ) {
	echo tgs_sq_monitors_html( $d ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

/**
 * Campo oculto en el formulario de compra de la PC: el JS de la ficha le
 * pone el ID del monitor elegido y el hook de abajo lo suma al carrito.
 */
add_action( 'woocommerce_after_add_to_cart_button', function () {
	if ( tgs_sq_is_managed_product() ) {
		echo '<input type="hidden" name="tgs_addon_monitor" value="" data-tgs-addon-monitor>';
	}
} );

/**
 * Cuando entra una PC al carrito con un monitor elegido, se agrega también
 * el monitor (1 unidad). Vale tanto para el formulario como para los links
 * ?add-to-cart= de la barra flotante. El monitor se valida de nuevo acá:
 * el ID viene del navegador.
 */
add_action( 'woocommerce_add_to_cart', function ( $cart_item_key, $product_id ) {
	static $adding = false;
	if ( $adding || empty( $_REQUEST['tgs_addon_monitor'] ) || ! tgs_sq_is_managed_product( $product_id ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}
	$monitor_id = absint( $_REQUEST['tgs_addon_monitor'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( ! tgs_sq_is_addon_monitor( $monitor_id ) || ! WC()->cart ) {
		return;
	}
	$adding = true;
	WC()->cart->add_to_cart( $monitor_id, 1 );
	$adding = false;
}, 10, 2 );

/**
 * Tipos de bloque que ya no son "opcionales": se imprimen siempre como
 * parte del hero (ver tgs_sq_block_hero). Si una variante vieja todavía
 * los tiene guardados en su lista de bloques, se ignoran acá para no
 * duplicarlos — así ninguna variante creada con una versión anterior del
 * plugin puede romper la página nueva.
 */
function tgs_sq_legacy_block_types() {
	// 'gallery' volvió como bloque real (fotos de los componentes) en 2.11.
	return array( 'hero3d', 'pricebox', 'whatsapp', 'power' );
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
		$cuotas = tgs_sq_installment_line( $best, $d );
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
		'cuotas_detalle'       => tgs_sq_installments_detail_html( $d ),
		'formas_de_pago'       => tgs_sq_payment_html( $d ),
		'descripcion'          => wp_kses_post( $description ),
		'imagen_destacada'     => $imagen,
		'imagen_destacada_url' => esc_url( (string) $d['hero_image'] ),
		'modelo_3d'            => $modelo,
		'modelo_3d_url'        => esc_url( (string) $d['model3d_url'] ),
		'componentes'          => tgs_sq_capture_block( 'specs', $d ),
		'juegos'               => tgs_sq_capture_block( 'games', $d ),
		'bajada'               => esc_html( (string) $d['tagline'] ),
		'condiciones_cuotas'   => tgs_sq_financing_terms_html( $d ),
		'envios'               => tgs_sq_shipping_html( $d ),
		'aviso_ia'             => tgs_sq_ai_note_html( $d ),
		'puntos_fuertes'       => tgs_sq_highlights_html( $d ),
		'galeria'              => tgs_sq_capture_block( 'gallery', $d ),
		'compatibilidad'       => tgs_sq_capture_block( 'compatibility', $d ),
		'recomendadas'         => tgs_sq_recommended_html( $d ),
		'monitores'            => tgs_sq_monitors_html( $d ),
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

	// Datos para el visor de fotos (lightbox) y datos estructurados para
	// Google: van en cualquiera de los dos modos, antes de la ficha.
	tgs_sq_gallery_data_html( $data );
	tgs_sq_structured_data_html( $data );

	$custom_code = tgs_sq_variant_custom_code( $variant );
	if ( 'custom' === tgs_sq_normalize_mode( $variant['mode'] ?? '' ) && '' !== $custom_code ) {
		tgs_sq_render_custom_mode( $variant, $data );
		return;
	}

	tgs_sq_render_blocks_mode( $variant, $data );
}

/**
 * Fotos para el visor: la principal primero y después las de los
 * componentes, con su nombre como pie. El JS del plugin arma el lightbox
 * al tocar la foto del hero o cualquier foto de componente.
 */
function tgs_sq_gallery_data_html( array $d ) {
	$photos = array();
	if ( ! empty( $d['hero_image'] ) ) {
		$photos[] = array( 'url' => esc_url_raw( $d['hero_image'] ), 'label' => (string) $d['title'] );
	}
	foreach ( (array) $d['items'] as $item ) {
		if ( ! is_array( $item ) || empty( $item['imageUrl'] ) ) {
			continue;
		}
		$label = trim( (string) ( $item['part'] ?? '' ) );
		$label = ( '' !== $label ? $label . ' · ' : '' ) . (string) ( $item['name'] ?? '' );
		$photos[] = array( 'url' => esc_url_raw( $item['imageUrl'] ), 'label' => $label );
	}
	if ( count( $photos ) < 1 ) {
		return;
	}
	echo '<script type="application/json" id="tgs-gallery-data">' . wp_json_encode( $photos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG ) . '</script>';
}

/**
 * schema.org Product: precio, disponibilidad, imagen y descripción, para
 * que Google muestre el resultado enriquecido. WooCommerce ya emite uno
 * básico, pero sin imagen ni descripción cuando la ficha es custom.
 */
function tgs_sq_structured_data_html( array $d ) {
	$product = $d['product'];
	if ( ! $product ) {
		return;
	}
	$price = $d['price_transfer'] > 0 ? round( $d['price_transfer'] / 100, 2 ) : (float) $product->get_price();
	$description = trim( wp_strip_all_tags( (string) $product->get_short_description() ) );
	if ( '' === $description ) {
		$description = trim( wp_strip_all_tags( (string) $d['description'] ) );
	}
	$images = array_values( array_filter( array( $d['hero_image'], $d['thumbnail'] ) ) );
	foreach ( (array) $d['gallery'] as $url ) {
		if ( $url ) {
			$images[] = $url;
		}
	}
	$schema = array(
		'@context'    => 'https://schema.org',
		'@type'       => 'Product',
		'name'        => (string) $d['title'],
		'description' => mb_substr( $description, 0, 500 ),
		'image'       => array_values( array_unique( array_map( 'esc_url_raw', $images ) ) ),
		'sku'         => (string) $product->get_sku(),
		'brand'       => array( '@type' => 'Brand', 'name' => 'The Gamer Shop' ),
		'offers'      => array(
			'@type'           => 'Offer',
			'url'             => (string) $d['permalink'],
			'priceCurrency'   => get_woocommerce_currency(),
			'price'           => number_format( $price, 2, '.', '' ),
			'availability'    => 'https://schema.org/InStock',
			'itemCondition'   => 'https://schema.org/NewCondition',
			'seller'          => array( '@type' => 'Organization', 'name' => 'The Gamer Shop' ),
		),
	);
	echo '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . '</script>';
}
