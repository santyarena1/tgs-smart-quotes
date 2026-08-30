<?php
/**
 * Panel de administración: Ajustes (secreto HMAC), Productos publicados
 * (elegir variante y categoría por producto) y Variantes (crear/editar
 * diseños, incluidos los extras: WhatsApp, barra flotante, recomendadas,
 * formas de pago).
 */

defined( 'ABSPATH' ) || exit;

add_action( 'admin_menu', function () {
	add_menu_page(
		'TGS Smart Quotes',
		'TGS Smart Quotes',
		'manage_options',
		'tgs-sq',
		'tgs_sq_page_products',
		'dashicons-desktop',
		56
	);
	add_submenu_page( 'tgs-sq', 'Productos publicados', 'Productos', 'manage_options', 'tgs-sq', 'tgs_sq_page_products' );
	add_submenu_page( 'tgs-sq', 'Variantes de diseño', 'Variantes', 'manage_options', 'tgs-sq-variants', 'tgs_sq_page_variants' );
	add_submenu_page( 'tgs-sq', 'Ajustes', 'Ajustes', 'manage_options', 'tgs-sq-settings', 'tgs_sq_page_settings' );
} );

/* ---------------------------------------------------------------------
 * Ajustes: secreto HMAC compartido con TGS-SMART-QUOTES.
 * ------------------------------------------------------------------- */

function tgs_sq_page_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	if ( isset( $_POST['tgs_sq_settings_nonce'] ) && wp_verify_nonce( $_POST['tgs_sq_settings_nonce'], 'tgs_sq_settings' ) ) {
		$new_secret = isset( $_POST['tgs_hmac_secret'] ) ? sanitize_text_field( wp_unslash( $_POST['tgs_hmac_secret'] ) ) : '';
		if ( '' !== $new_secret ) {
			update_option( TGS_SQ_OPTION_HMAC_SECRET, $new_secret );
			echo '<div class="notice notice-success"><p>Secreto actualizado.</p></div>';
		}
	}

	$has_secret = '' !== tgs_sq_hmac_secret();
	?>
	<div class="wrap">
		<h1>TGS Smart Quotes — Ajustes</h1>
		<p>Este secreto tiene que ser <strong>exactamente el mismo</strong> que el configurado en TGS-SMART-QUOTES (Publicación Web → secreto HMAC). Se usa para firmar cada llamada a <code>/wp-json/tgs/v1/publish</code>.</p>
		<p>Estado actual: <?php echo $has_secret ? '<span style="color:#00a32a">✓ configurado</span>' : '<span style="color:#d63638">✗ sin configurar</span>'; ?></p>
		<form method="post">
			<?php wp_nonce_field( 'tgs_sq_settings', 'tgs_sq_settings_nonce' ); ?>
			<table class="form-table">
				<tr>
					<th><label for="tgs_hmac_secret">Secreto HMAC</label></th>
					<td>
						<input class="regular-text" type="password" id="tgs_hmac_secret" name="tgs_hmac_secret" value="" autocomplete="new-password">
						<p class="description">Dejalo vacío para conservar el valor actual.</p>
					</td>
				</tr>
			</table>
			<?php submit_button( 'Guardar' ); ?>
		</form>
		<hr>
		<p><strong>Endpoint de prueba (sin auth):</strong> <code><?php echo esc_url( rest_url( 'tgs/v1/ping' ) ); ?></code></p>
		<p class="description">La categoría de cada PC (dónde aparece en la tienda) y su variante de diseño se eligen desde "Productos", no acá — cada producto puede ir en una categoría distinta.</p>
	</div>
	<?php
}

/* ---------------------------------------------------------------------
 * Productos publicados: elegir variante y categoría por producto.
 * ------------------------------------------------------------------- */

function tgs_sq_page_products() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	if ( isset( $_POST['tgs_sq_products_nonce'] ) && wp_verify_nonce( $_POST['tgs_sq_products_nonce'], 'tgs_sq_products' ) ) {
		$product_id = (int) ( $_POST['product_id'] ?? 0 );
		$variant    = sanitize_title( $_POST['variant'] ?? '' );
		$category_id = (int) ( $_POST['category_id'] ?? 0 );
		if ( $product_id && tgs_sq_get_variant( $variant ) ) {
			update_post_meta( $product_id, TGS_SQ_META_VARIANT, $variant );
		}
		if ( $product_id && $category_id ) {
			wp_set_object_terms( $product_id, array( $category_id ), 'product_cat' );
		}
		if ( $product_id ) {
			echo '<div class="notice notice-success"><p>Producto actualizado: "' . esc_html( get_the_title( $product_id ) ) . '".</p></div>';
		}
	}

	$products = get_posts( array(
		'post_type'      => 'product',
		'post_status'    => 'any',
		'numberposts'    => -1,
		'meta_key'       => TGS_SQ_META_MANAGED,
		'meta_value'     => '1',
		'orderby'        => 'date',
		'order'          => 'DESC',
	) );

	$variant_choices = tgs_sq_variant_choices();
	?>
	<div class="wrap">
		<h1>Productos publicados por TGS-SMART-QUOTES</h1>
		<?php if ( ! $products ) : ?>
			<p>Todavía no se publicó ningún presupuesto desde TGS-SMART-QUOTES. Cuando se publique el primero (desde "Publicación Web" en el sistema), va a aparecer acá.</p>
		<?php else : ?>
			<table class="widefat striped">
				<thead>
					<tr>
						<th>Producto</th>
						<th>External ID</th>
						<th>Estado</th>
						<th>Categoría</th>
						<th>Variante de diseño</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ( $products as $product ) : ?>
						<?php
						$external_id  = get_post_meta( $product->ID, TGS_SQ_META_EXTERNAL_ID, true );
						$current      = tgs_sq_product_variant_slug( $product->ID );
						$current_cat  = tgs_sq_product_category_id( $product->ID );
						?>
						<tr>
							<td>
								<a href="<?php echo esc_url( get_edit_post_link( $product->ID ) ); ?>"><?php echo esc_html( get_the_title( $product->ID ) ); ?></a><br>
								<a href="<?php echo esc_url( get_permalink( $product->ID ) ); ?>" target="_blank">Ver en el sitio →</a>
							</td>
							<td><code><?php echo esc_html( $external_id ); ?></code></td>
							<td><?php echo esc_html( get_post_status( $product->ID ) ); ?></td>
							<td>
								<form method="post" style="display:flex;gap:8px;align-items:center;">
									<?php wp_nonce_field( 'tgs_sq_products', 'tgs_sq_products_nonce' ); ?>
									<input type="hidden" name="product_id" value="<?php echo esc_attr( $product->ID ); ?>">
									<input type="hidden" name="variant" value="<?php echo esc_attr( $current ); ?>">
									<?php
									wp_dropdown_categories( array(
										'taxonomy'         => 'product_cat',
										'name'             => 'category_id',
										'selected'         => $current_cat,
										'show_option_none' => 'Sin categoría',
										'hide_empty'       => false,
										'hierarchical'     => true,
									) );
									?>
									<button type="submit" class="button">Guardar</button>
								</form>
							</td>
							<td>
								<form method="post" style="display:flex;gap:8px;align-items:center;">
									<?php wp_nonce_field( 'tgs_sq_products', 'tgs_sq_products_nonce' ); ?>
									<input type="hidden" name="product_id" value="<?php echo esc_attr( $product->ID ); ?>">
									<input type="hidden" name="category_id" value="<?php echo esc_attr( $current_cat ); ?>">
									<select name="variant">
										<?php foreach ( $variant_choices as $slug => $name ) : ?>
											<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $current, $slug ); ?>><?php echo esc_html( $name ); ?></option>
										<?php endforeach; ?>
									</select>
									<button type="submit" class="button">Guardar</button>
								</form>
							</td>
							<td></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
			<p class="description">Podés crear categorías nuevas normalmente desde Productos → Categorías de WooCommerce; después van a aparecer acá para elegir.</p>
		<?php endif; ?>
	</div>
	<?php
}

/* ---------------------------------------------------------------------
 * Variantes: listar, crear, editar, borrar.
 * ------------------------------------------------------------------- */

function tgs_sq_page_variants() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	tgs_sq_ensure_default_variant();

	// Borrar.
	if ( isset( $_GET['delete'], $_GET['_wpnonce'] ) && wp_verify_nonce( $_GET['_wpnonce'], 'tgs_sq_delete_variant' ) ) {
		tgs_sq_delete_variant( sanitize_title( $_GET['delete'] ) );
		echo '<div class="notice notice-success"><p>Variante borrada. Los productos que la usaban vuelven a "Default".</p></div>';
	}

	// ¿Estamos editando una variante puntual?
	$editing_slug = isset( $_GET['edit'] ) ? sanitize_title( $_GET['edit'] ) : '';
	$creating_new = isset( $_GET['new'] );

	if ( $editing_slug || $creating_new ) {
		tgs_sq_render_variant_editor( $editing_slug );
		return;
	}

	$variants = tgs_sq_get_variants();
	?>
	<div class="wrap">
		<h1>Variantes de diseño <a href="<?php echo esc_url( add_query_arg( 'new', '1' ) ); ?>" class="page-title-action">Crear nueva</a></h1>
		<p>Cada variante es un diseño posible para la ficha de producto. Se asignan por producto desde "Productos".</p>
		<table class="widefat striped">
			<thead><tr><th>Nombre</th><th>Modo</th><th>Actualizada</th><th></th></tr></thead>
			<tbody>
				<?php foreach ( $variants as $slug => $variant ) : ?>
					<tr>
						<td><strong><?php echo esc_html( $variant['name'] ); ?></strong> <code><?php echo esc_html( $slug ); ?></code></td>
						<td><?php echo 'custom' === $variant['mode'] ? 'Código a medida' : 'Bloques'; ?></td>
						<td><?php echo esc_html( $variant['updated_at'] ?? '' ); ?></td>
						<td>
							<a href="<?php echo esc_url( add_query_arg( 'edit', $slug ) ); ?>">Editar</a>
							<?php if ( TGS_SQ_DEFAULT_VARIANT !== $slug ) : ?>
								| <a href="<?php echo esc_url( wp_nonce_url( add_query_arg( 'delete', $slug ), 'tgs_sq_delete_variant' ) ); ?>" onclick="return confirm('¿Borrar esta variante? Los productos que la usan vuelven a Default.');">Borrar</a>
							<?php endif; ?>
						</td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	</div>
	<?php
}

function tgs_sq_render_variant_editor( $slug ) {
	$existing = $slug ? tgs_sq_get_variant( $slug ) : null;
	$variant  = $existing ?: tgs_sq_blank_variant( '', '' );

	if ( isset( $_POST['tgs_sq_variant_nonce'] ) && wp_verify_nonce( $_POST['tgs_sq_variant_nonce'], 'tgs_sq_variant_save' ) ) {
		$posted_slug = $slug ?: sanitize_title( $_POST['slug'] ?? '' );
		if ( '' === $posted_slug ) {
			$posted_slug = sanitize_title( $_POST['name'] ?? '' );
		}

		$blocks = array();
		foreach ( array_keys( tgs_sq_block_types() ) as $type ) {
			$blocks[] = array(
				'type'    => $type,
				'visible' => ! empty( $_POST['block_' . $type] ),
			);
		}

		$variant = array(
			'slug'        => $posted_slug,
			'name'        => sanitize_text_field( $_POST['name'] ?? $posted_slug ),
			'mode'        => in_array( $_POST['mode'] ?? 'blocks', array( 'blocks', 'custom' ), true ) ? $_POST['mode'] : 'blocks',
			'tokens'      => array(
				'accent' => sanitize_hex_color( $_POST['accent'] ?? '' ) ?: '#E31B23',
				'bg'     => sanitize_hex_color( $_POST['bg'] ?? '' ) ?: '#080B12',
				'text'   => sanitize_hex_color( $_POST['text'] ?? '' ) ?: '#F8FAFC',
				'radius' => max( 0, (float) ( $_POST['radius'] ?? 24 ) ),
				'font'   => sanitize_text_field( $_POST['font'] ?? 'Inter, system-ui, sans-serif' ),
			),
			'blocks'      => $blocks,
			'extra'       => array(
				'whatsapp_number'   => preg_replace( '/[^0-9]/', '', $_POST['whatsapp_number'] ?? '' ),
				'whatsapp_message'  => sanitize_text_field( $_POST['whatsapp_message'] ?? '' ),
				'sticky_label'      => sanitize_text_field( $_POST['sticky_label'] ?? '' ),
				'recommended_title' => sanitize_text_field( $_POST['recommended_title'] ?? '' ),
				'recommended_count' => max( 1, min( 8, (int) ( $_POST['recommended_count'] ?? 4 ) ) ),
				'payment_methods'   => sanitize_text_field( $_POST['payment_methods'] ?? '' ),
			),
			// El HTML/CSS lo carga un administrador de confianza a propósito
			// (es la vía para "pegar código directo" de un diseño 100% a
			// medida), por eso no se sanitiza con wp_kses acá.
			'custom_html' => wp_unslash( $_POST['custom_html'] ?? '' ),
			'custom_css'  => wp_unslash( $_POST['custom_css'] ?? '' ),
		);

		tgs_sq_save_variant( $variant );
		echo '<div class="notice notice-success"><p>Variante guardada.</p></div>';
		$slug    = $posted_slug;
		$variant = tgs_sq_get_variant( $slug );
	}

	$block_types = tgs_sq_block_types();
	$blocks_map  = array();
	foreach ( ( $variant['blocks'] ?? array() ) as $block ) {
		$blocks_map[ $block['type'] ] = ! empty( $block['visible'] );
	}
	$tokens = $variant['tokens'] ?? tgs_sq_default_tokens();
	$extra  = wp_parse_args( $variant['extra'] ?? array(), tgs_sq_default_extra() );
	?>
	<div class="wrap">
		<h1><?php echo $slug ? 'Editar variante' : 'Nueva variante'; ?></h1>
		<a href="<?php echo esc_url( remove_query_arg( array( 'edit', 'new' ) ) ); ?>">← Volver al listado</a>

		<form method="post" style="max-width:900px;margin-top:16px;">
			<?php wp_nonce_field( 'tgs_sq_variant_save', 'tgs_sq_variant_nonce' ); ?>

			<table class="form-table">
				<tr>
					<th><label for="name">Nombre</label></th>
					<td><input type="text" class="regular-text" id="name" name="name" value="<?php echo esc_attr( $variant['name'] ); ?>" required placeholder="Ej: PC Gamer" <?php echo $slug && TGS_SQ_DEFAULT_VARIANT === $slug ? 'readonly' : ''; ?>></td>
				</tr>
				<tr>
					<th><label for="mode">Modo</label></th>
					<td>
						<select id="mode" name="mode">
							<option value="blocks" <?php selected( $variant['mode'], 'blocks' ); ?>>Bloques predefinidos</option>
							<option value="custom" <?php selected( $variant['mode'], 'custom' ); ?>>Código a medida (HTML/CSS)</option>
						</select>
						<p class="description"><strong>"Bloques" es el modo recomendado</strong>: arma la página combinando las secciones de abajo con un diseño ya terminado (tarjetas, tipografía, colores) — no hay que escribir ni un línea de HTML ni CSS, y no se puede "romper" el diseño por accidente. "Código a medida" pega HTML/CSS propio con placeholders tipo <code>{{title}}</code>; da control total, pero si te olvidás de completar el CSS la página queda sin estilos (con esta versión del plugin, al menos conserva una tarjeta y tipografía base de emergencia).</p>
					</td>
				</tr>
			</table>

			<h2>Paleta (aplica en ambos modos)</h2>
			<table class="form-table">
				<tr><th><label for="accent">Color de acento</label></th><td><input type="text" id="accent" name="accent" value="<?php echo esc_attr( $tokens['accent'] ); ?>" class="regular-text" placeholder="#E31B23"></td></tr>
				<tr><th><label for="bg">Fondo</label></th><td><input type="text" id="bg" name="bg" value="<?php echo esc_attr( $tokens['bg'] ); ?>" class="regular-text" placeholder="#080B12"></td></tr>
				<tr><th><label for="text">Texto</label></th><td><input type="text" id="text" name="text" value="<?php echo esc_attr( $tokens['text'] ); ?>" class="regular-text" placeholder="#F8FAFC"></td></tr>
				<tr><th><label for="radius">Radio de bordes (px)</label></th><td><input type="number" id="radius" name="radius" value="<?php echo esc_attr( $tokens['radius'] ); ?>" min="0" max="60"></td></tr>
				<tr><th><label for="font">Tipografía (CSS font-family)</label></th><td><input type="text" id="font" name="font" value="<?php echo esc_attr( $tokens['font'] ); ?>" class="regular-text"></td></tr>
			</table>

			<h2>Bloques visibles (modo "Bloques predefinidos")</h2>
			<table class="form-table">
				<?php foreach ( $block_types as $type => $label ) : ?>
					<tr>
						<th></th>
						<td>
							<label>
								<input type="checkbox" name="block_<?php echo esc_attr( $type ); ?>" <?php checked( ! empty( $blocks_map[ $type ] ) ); ?>>
								<?php echo esc_html( $label ); ?>
							</label>
						</td>
					</tr>
				<?php endforeach; ?>
			</table>

			<h2>Extras (WhatsApp, barra flotante, recomendadas, pago)</h2>
			<p class="description">Estos campos alimentan tanto los bloques de arriba (Botón de WhatsApp, Barra flotante, Recomendadas, Formas de pago) como sus placeholders equivalentes en modo "Código a medida".</p>
			<table class="form-table">
				<tr>
					<th><label for="whatsapp_number">WhatsApp — número</label></th>
					<td><input type="text" id="whatsapp_number" name="whatsapp_number" value="<?php echo esc_attr( $extra['whatsapp_number'] ); ?>" class="regular-text" placeholder="5491122223333 (con código de país, sin +)">
					<p class="description">Vacío = el botón de WhatsApp no se muestra, aunque el bloque esté tildado.</p></td>
				</tr>
				<tr>
					<th><label for="whatsapp_message">WhatsApp — mensaje predefinido</label></th>
					<td><input type="text" id="whatsapp_message" name="whatsapp_message" value="<?php echo esc_attr( $extra['whatsapp_message'] ); ?>" class="regular-text" placeholder="Hola! Quiero consultar por {{title}}">
					<p class="description">Podés usar <code>{{title}}</code>, se reemplaza por el nombre de la PC.</p></td>
				</tr>
				<tr>
					<th><label for="sticky_label">Barra flotante — texto del botón</label></th>
					<td><input type="text" id="sticky_label" name="sticky_label" value="<?php echo esc_attr( $extra['sticky_label'] ); ?>" class="regular-text" placeholder="Agregar al carrito"></td>
				</tr>
				<tr>
					<th><label for="recommended_title">Recomendadas — título de la sección</label></th>
					<td><input type="text" id="recommended_title" name="recommended_title" value="<?php echo esc_attr( $extra['recommended_title'] ); ?>" class="regular-text" placeholder="Recomendadas de la casa"></td>
				</tr>
				<tr>
					<th><label for="recommended_count">Recomendadas — cuántas mostrar</label></th>
					<td><input type="number" id="recommended_count" name="recommended_count" value="<?php echo esc_attr( $extra['recommended_count'] ); ?>" min="1" max="8">
					<p class="description">Se eligen automáticamente otras PCs publicadas con precio parecido a esta.</p></td>
				</tr>
				<tr>
					<th><label for="payment_methods">Formas de pago — texto</label></th>
					<td><input type="text" id="payment_methods" name="payment_methods" value="<?php echo esc_attr( $extra['payment_methods'] ); ?>" class="regular-text" placeholder="Efectivo, transferencia, tarjeta de crédito y débito">
					<p class="description">Las cuotas/planes de financiación se listan automáticamente debajo si el presupuesto los trae.</p></td>
				</tr>
			</table>

			<h2>Código a medida (modo "Código a medida")</h2>
			<p class="description">
				Placeholders disponibles: <code>{{title}}</code>, <code>{{price_list}}</code>, <code>{{price_cash}}</code>, <code>{{price_transfer}}</code>,
				<code>{{gallery_html}}</code>, <code>{{items_html}}</code>, <code>{{description_html}}</code>, <code>{{model3d_html}}</code>,
				<code>{{add_to_cart_html}}</code>, <code>{{sticky_html}}</code>, <code>{{whatsapp_button_html}}</code>, <code>{{payment_html}}</code>,
				<code>{{recommended_html}}</code>, <code>{{power_watts}}</code>, <code>{{power_psu}}</code>, <code>{{power_note}}</code>, <code>{{permalink}}</code>.
			</p>
			<p>
				<label for="custom_html">HTML</label><br>
				<textarea id="custom_html" name="custom_html" rows="16" style="width:100%;font-family:monospace;"><?php echo esc_textarea( $variant['custom_html'] ); ?></textarea>
			</p>
			<p>
				<label for="custom_css">CSS</label><br>
				<span class="description" style="display:block;margin-bottom:6px;">Importante: si dejás este campo vacío, la página se ve sin diseño (solo texto). El HTML de arriba no trae estilos propios — hay que pegarlos acá.</span>
				<textarea id="custom_css" name="custom_css" rows="12" style="width:100%;font-family:monospace;"><?php echo esc_textarea( $variant['custom_css'] ); ?></textarea>
			</p>

			<?php submit_button( 'Guardar variante' ); ?>
		</form>
	</div>
	<?php
}
