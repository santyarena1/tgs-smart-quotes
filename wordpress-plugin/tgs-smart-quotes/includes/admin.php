<?php
/**
 * Panel de administración: Ajustes (secreto HMAC), Productos publicados
 * (elegir variante y categoría por producto) y Variantes (crear/editar
 * diseños, incluidos los extras: WhatsApp, barra flotante, recomendadas,
 * formas de pago).
 *
 * Todo el markup de estas pantallas cuelga de `.tgs-admin`, que es donde
 * engancha `assets/tgs-admin.css`.
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
 * Helpers de presentación (solo UI, no tocan datos).
 * ------------------------------------------------------------------- */

/**
 * Slugs de las páginas del plugin. Se usa para saber en qué pantallas hay
 * que encolar el CSS del admin y para armar la navegación.
 *
 * @return array slug => etiqueta corta.
 */
function tgs_sq_admin_pages() {
	return array(
		'tgs-sq'          => 'Productos',
		'tgs-sq-variants' => 'Variantes',
		'tgs-sq-settings' => 'Ajustes',
	);
}

/**
 * ¿La pantalla actual del admin es una del plugin?
 */
function tgs_sq_is_admin_page() {
	$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
	return '' !== $page && array_key_exists( $page, tgs_sq_admin_pages() );
}

/**
 * Normaliza un color a #RRGGBB para poder usarlo en <input type="color">.
 * Si el valor guardado no es un hex válido, devuelve el fallback.
 */
function tgs_sq_admin_hex( $value, $fallback ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	if ( preg_match( '/^#([0-9a-fA-F]{3})$/', $value, $matches ) ) {
		$short = $matches[1];
		return strtoupper( '#' . $short[0] . $short[0] . $short[1] . $short[1] . $short[2] . $short[2] );
	}
	if ( preg_match( '/^#[0-9a-fA-F]{6}$/', $value ) ) {
		return strtoupper( $value );
	}
	return $fallback;
}

/**
 * Cabecera de marca de cada pantalla.
 *
 * @param string $title    Título de la pantalla.
 * @param string $subtitle Bajada explicativa.
 * @param array  $chips    Lista de array( 'label' => string, 'state' => ok|warn|neutral|accent ).
 * @param array  $actions  Lista de array( 'label' => string, 'url' => string, 'primary' => bool ).
 */
function tgs_sq_admin_header( $title, $subtitle = '', $chips = array(), $actions = array() ) {
	?>
	<div class="tgs-hero">
		<div class="tgs-hero__main">
			<span class="tgs-hero__eyebrow">TGS Smart Quotes</span>
			<h1><?php echo esc_html( $title ); ?></h1>
			<?php if ( '' !== $subtitle ) : ?>
				<p class="tgs-hero__sub"><?php echo esc_html( $subtitle ); ?></p>
			<?php endif; ?>
			<?php if ( $chips ) : ?>
				<div class="tgs-hero__chips">
					<?php foreach ( $chips as $chip ) : ?>
						<span class="tgs-chip tgs-chip--<?php echo esc_attr( $chip['state'] ?? 'neutral' ); ?>"><?php echo esc_html( $chip['label'] ); ?></span>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
		</div>
		<?php if ( $actions ) : ?>
			<div class="tgs-hero__actions">
				<?php foreach ( $actions as $action ) : ?>
					<a class="tgs-btn <?php echo empty( $action['primary'] ) ? 'tgs-btn--ghost' : 'tgs-btn--primary'; ?>" href="<?php echo esc_url( $action['url'] ); ?>"><?php echo esc_html( $action['label'] ); ?></a>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>
	</div>
	<?php
}

/**
 * Barra de navegación entre las tres pantallas del plugin.
 *
 * Cierra con el marcador `wp-header-end`: es donde WordPress reubica los
 * avisos (notice) de la pantalla. Sin ese marcador los mete justo después
 * del <h1>, o sea adentro de la cabecera oscura.
 */
function tgs_sq_admin_nav( $current ) {
	?>
	<nav class="tgs-nav">
		<?php foreach ( tgs_sq_admin_pages() as $slug => $label ) : ?>
			<a class="<?php echo $slug === $current ? 'is-active' : ''; ?>" href="<?php echo esc_url( admin_url( 'admin.php?page=' . $slug ) ); ?>"><?php echo esc_html( $label ); ?></a>
		<?php endforeach; ?>
	</nav>
	<hr class="wp-header-end">
	<?php
}

/**
 * Etiqueta legible + color para el estado de un post de WooCommerce.
 */
function tgs_sq_admin_status_chip( $status ) {
	$map = array(
		'publish' => array( 'Publicado', 'ok' ),
		'draft'   => array( 'Borrador', 'warn' ),
		'pending' => array( 'Pendiente de revisión', 'warn' ),
		'private' => array( 'Privado', 'neutral' ),
		'future'  => array( 'Programado', 'neutral' ),
		'trash'   => array( 'En la papelera', 'warn' ),
	);
	if ( isset( $map[ $status ] ) ) {
		return array( 'label' => $map[ $status ][0], 'state' => $map[ $status ][1] );
	}
	return array( 'label' => $status, 'state' => 'neutral' );
}

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
	<div class="wrap tgs-admin">
		<?php
		tgs_sq_admin_header(
			'Ajustes',
			'Acá se configura la conexión entre este sitio y el sistema TGS-SMART-QUOTES. Es lo único que hace falta para que los presupuestos se publiquen solos.',
			array(
				$has_secret
					? array( 'label' => 'Conexión configurada', 'state' => 'ok' )
					: array( 'label' => 'Falta configurar el secreto', 'state' => 'warn' ),
			)
		);
		tgs_sq_admin_nav( 'tgs-sq-settings' );
		?>

		<div class="tgs-cards">
			<form method="post">
				<?php wp_nonce_field( 'tgs_sq_settings', 'tgs_sq_settings_nonce' ); ?>
				<div class="tgs-card">
					<div class="tgs-card__head">
						<div class="tgs-card__head-row">
							<h2>Secreto HMAC</h2>
							<span class="tgs-chip tgs-chip--<?php echo $has_secret ? 'ok' : 'warn'; ?>"><?php echo $has_secret ? 'Configurado' : 'Sin configurar'; ?></span>
						</div>
						<p>Este secreto tiene que ser exactamente el mismo que el configurado en TGS-SMART-QUOTES (Publicación Web → secreto HMAC). Se usa para firmar cada llamada a la API de publicación.</p>
					</div>
					<div class="tgs-card__body">
						<div class="tgs-fields tgs-fields--single">
							<div class="tgs-field">
								<label for="tgs_hmac_secret">Secreto HMAC</label>
								<input class="regular-text" type="password" id="tgs_hmac_secret" name="tgs_hmac_secret" value="" autocomplete="new-password" placeholder="<?php echo $has_secret ? '••••••••••••••••' : 'Pegá acá el secreto'; ?>">
								<p class="description">Dejalo vacío para conservar el valor actual. Por seguridad nunca se muestra el secreto guardado.</p>
							</div>
						</div>
					</div>
					<div class="tgs-card__footer">
						<button type="submit" class="tgs-btn tgs-btn--primary">Guardar</button>
						<p>Si cambiás el secreto acá, acordate de cambiarlo también del otro lado.</p>
					</div>
				</div>
			</form>

			<div class="tgs-card">
				<div class="tgs-card__head">
					<h2>Datos de la conexión</h2>
					<p>Información técnica por si hay que probar la integración a mano.</p>
				</div>
				<div class="tgs-card__body">
					<div class="tgs-datalist">
						<div class="tgs-datalist__row">
							<span class="tgs-datalist__key">Endpoint de prueba (sin auth)</span>
							<span class="tgs-datalist__value"><code><?php echo esc_url( rest_url( 'tgs/v1/ping' ) ); ?></code></span>
						</div>
						<div class="tgs-datalist__row">
							<span class="tgs-datalist__key">Endpoint de publicación (firmado)</span>
							<span class="tgs-datalist__value"><code><?php echo esc_url( rest_url( 'tgs/v1/publish' ) ); ?></code></span>
						</div>
					</div>
					<p class="tgs-help">La categoría de cada PC (dónde aparece en la tienda) y su variante de diseño se eligen desde "Productos", no acá — cada producto puede ir en una categoría distinta.</p>
				</div>
			</div>
		</div>
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
	$total           = count( $products );
	?>
	<div class="wrap tgs-admin">
		<?php
		$chips = array(
			array(
				'label' => 1 === $total ? '1 PC publicada' : sprintf( '%d PCs publicadas', $total ),
				'state' => $total ? 'ok' : 'neutral',
			),
			array(
				'label' => 1 === count( $variant_choices ) ? '1 variante de diseño' : sprintf( '%d variantes de diseño', count( $variant_choices ) ),
				'state' => 'neutral',
			),
		);
		tgs_sq_admin_header(
			'Productos publicados',
			'Las PCs que TGS-SMART-QUOTES publicó en esta tienda. Para cada una podés elegir en qué categoría aparece y con qué diseño se ve la ficha.',
			$chips
		);
		tgs_sq_admin_nav( 'tgs-sq' );
		?>

		<div class="tgs-cards">
			<?php if ( ! $products ) : ?>
				<div class="tgs-card">
					<div class="tgs-card__body tgs-empty">
						<span class="tgs-empty__icon" aria-hidden="true">＋</span>
						<h2>Todavía no hay ninguna PC publicada</h2>
						<p>Todavía no se publicó ningún presupuesto desde TGS-SMART-QUOTES. Cuando se publique el primero (desde "Publicación Web" en el sistema), va a aparecer acá.</p>
					</div>
				</div>
			<?php else : ?>
				<div class="tgs-card">
					<div class="tgs-card__head">
						<h2>Listado de PCs</h2>
						<p>Cada cambio se guarda por separado: elegí la categoría o la variante y tocá "Guardar" en esa misma fila.</p>
					</div>
					<div class="tgs-card__body tgs-card__body--flush">
						<div class="tgs-tablewrap">
							<table class="tgs-table">
								<thead>
									<tr>
										<th>Producto</th>
										<th>External ID</th>
										<th>Estado</th>
										<th>Categoría</th>
										<th>Variante de diseño</th>
									</tr>
								</thead>
								<tbody>
									<?php foreach ( $products as $product ) : ?>
										<?php
										$external_id = get_post_meta( $product->ID, TGS_SQ_META_EXTERNAL_ID, true );
										$current     = tgs_sq_product_variant_slug( $product->ID );
										$current_cat = tgs_sq_product_category_id( $product->ID );
										$status      = get_post_status( $product->ID );
										$status_chip = tgs_sq_admin_status_chip( $status );
										?>
										<tr>
											<td data-label="Producto">
												<a class="tgs-table__title" href="<?php echo esc_url( get_edit_post_link( $product->ID ) ); ?>"><?php echo esc_html( get_the_title( $product->ID ) ); ?></a>
												<a class="tgs-table__meta" href="<?php echo esc_url( get_permalink( $product->ID ) ); ?>" target="_blank" rel="noopener">Ver en el sitio →</a>
											</td>
											<td data-label="External ID"><code><?php echo esc_html( $external_id ); ?></code></td>
											<td data-label="Estado">
												<span class="tgs-chip tgs-chip--<?php echo esc_attr( $status_chip['state'] ); ?>" title="<?php echo esc_attr( $status ); ?>"><?php echo esc_html( $status_chip['label'] ); ?></span>
											</td>
											<td data-label="Categoría">
												<form method="post" class="tgs-inlineform">
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
													<button type="submit" class="tgs-btn tgs-btn--small">Guardar</button>
												</form>
											</td>
											<td data-label="Variante de diseño">
												<form method="post" class="tgs-inlineform">
													<?php wp_nonce_field( 'tgs_sq_products', 'tgs_sq_products_nonce' ); ?>
													<input type="hidden" name="product_id" value="<?php echo esc_attr( $product->ID ); ?>">
													<input type="hidden" name="category_id" value="<?php echo esc_attr( $current_cat ); ?>">
													<select name="variant">
														<?php foreach ( $variant_choices as $slug => $name ) : ?>
															<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $current, $slug ); ?>><?php echo esc_html( $name ); ?></option>
														<?php endforeach; ?>
													</select>
													<button type="submit" class="tgs-btn tgs-btn--small">Guardar</button>
												</form>
											</td>
										</tr>
									<?php endforeach; ?>
								</tbody>
							</table>
						</div>
					</div>
					<div class="tgs-card__footer">
						<p>Podés crear categorías nuevas normalmente desde Productos → Categorías de WooCommerce; después van a aparecer acá para elegir.</p>
					</div>
				</div>
			<?php endif; ?>
		</div>
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

	// Cuántos productos usa cada variante (los que no tienen una asignada
	// cuentan para "default", que es la que termina renderizándose).
	$usage       = array();
	$managed_ids = get_posts( array(
		'post_type'   => 'product',
		'post_status' => 'any',
		'fields'      => 'ids',
		'numberposts' => -1,
		'meta_key'    => TGS_SQ_META_MANAGED,
		'meta_value'  => '1',
	) );
	foreach ( $managed_ids as $managed_id ) {
		$used           = tgs_sq_product_variant_slug( $managed_id );
		$usage[ $used ] = ( $usage[ $used ] ?? 0 ) + 1;
	}
	?>
	<div class="wrap tgs-admin">
		<?php
		tgs_sq_admin_header(
			'Variantes de diseño',
			'Cada variante es un diseño posible para la ficha de producto. Se asignan por producto desde "Productos".',
			array(
				array(
					'label' => 1 === count( $variants ) ? '1 variante' : sprintf( '%d variantes', count( $variants ) ),
					'state' => 'neutral',
				),
			),
			array(
				array(
					'label'   => 'Crear nueva variante',
					'url'     => add_query_arg( 'new', '1' ),
					'primary' => true,
				),
			)
		);
		tgs_sq_admin_nav( 'tgs-sq-variants' );
		?>

		<div class="tgs-cards">
			<div class="tgs-card">
				<div class="tgs-card__head">
					<h2>Variantes guardadas</h2>
					<p>La variante "Default" no se puede borrar: es la que se usa cuando un producto no tiene ninguna asignada.</p>
				</div>
				<div class="tgs-card__body tgs-card__body--flush">
					<div class="tgs-tablewrap">
						<table class="tgs-table">
							<thead>
								<tr>
									<th>Nombre</th>
									<th>En uso</th>
									<th>Actualizada</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								<?php foreach ( $variants as $slug => $variant ) : ?>
									<?php $count = $usage[ $slug ] ?? 0; ?>
									<tr>
										<td data-label="Nombre">
											<a class="tgs-table__title" href="<?php echo esc_url( add_query_arg( 'edit', $slug ) ); ?>"><?php echo esc_html( $variant['name'] ); ?></a>
											<span class="tgs-table__meta"><code><?php echo esc_html( $slug ); ?></code></span>
											<?php if ( TGS_SQ_DEFAULT_VARIANT === $slug ) : ?>
												<span class="tgs-chip tgs-chip--accent">Predeterminada</span>
											<?php endif; ?>
										</td>
										<td data-label="En uso">
											<?php if ( $count ) : ?>
												<span class="tgs-chip tgs-chip--ok"><?php echo esc_html( 1 === $count ? '1 PC' : $count . ' PCs' ); ?></span>
											<?php else : ?>
												<span class="tgs-chip tgs-chip--neutral">Sin usar</span>
											<?php endif; ?>
										</td>
										<td data-label="Actualizada"><?php echo esc_html( $variant['updated_at'] ?? '' ); ?></td>
										<td data-label="Acciones">
											<div class="tgs-table__actions">
												<a class="tgs-btn tgs-btn--small" href="<?php echo esc_url( add_query_arg( 'edit', $slug ) ); ?>">Editar</a>
												<?php if ( TGS_SQ_DEFAULT_VARIANT !== $slug ) : ?>
													<a class="tgs-btn tgs-btn--small tgs-btn--danger" href="<?php echo esc_url( wp_nonce_url( add_query_arg( 'delete', $slug ), 'tgs_sq_delete_variant' ) ); ?>" onclick="return confirm('¿Borrar esta variante? Los productos que la usan vuelven a Default.');">Borrar</a>
												<?php endif; ?>
											</div>
										</td>
									</tr>
								<?php endforeach; ?>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
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
			'mode'        => 'blocks',
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

	$is_default    = $slug && TGS_SQ_DEFAULT_VARIANT === $slug;
	$visible_count = count( array_filter( $blocks_map ) );
	$accent_hex    = tgs_sq_admin_hex( $tokens['accent'] ?? '', '#E31B23' );
	$bg_hex        = tgs_sq_admin_hex( $tokens['bg'] ?? '', '#080B12' );
	$text_hex      = tgs_sq_admin_hex( $tokens['text'] ?? '', '#F8FAFC' );
	$preview_radius = max( 0, min( 60, (float) ( $tokens['radius'] ?? 24 ) ) );

	$chips = array();
	if ( $slug ) {
		$chips[] = array( 'label' => 'Slug: ' . $slug, 'state' => 'neutral' );
	}
	$chips[] = array(
		'label' => 1 === $visible_count ? '1 sección opcional activa' : sprintf( '%d secciones opcionales activas', $visible_count ),
		'state' => $visible_count ? 'ok' : 'neutral',
	);
	$chips[] = '' !== $extra['whatsapp_number']
		? array( 'label' => 'WhatsApp cargado', 'state' => 'ok' )
		: array( 'label' => 'WhatsApp sin número', 'state' => 'warn' );
	?>
	<div class="wrap tgs-admin">
		<?php
		tgs_sq_admin_header(
			$slug ? 'Editar variante: ' . ( $variant['name'] ?? $slug ) : 'Nueva variante',
			'La ficha siempre se arma con el diseño fijo del plugin. Acá elegís la paleta, qué secciones se muestran y los textos de abajo.',
			$chips,
			array(
				array(
					'label' => '← Volver al listado',
					'url'   => remove_query_arg( array( 'edit', 'new' ) ),
				),
			)
		);
		tgs_sq_admin_nav( 'tgs-sq-variants' );
		?>

		<form method="post">
			<?php wp_nonce_field( 'tgs_sq_variant_save', 'tgs_sq_variant_nonce' ); ?>

			<div class="tgs-cards">

				<div class="tgs-card">
					<div class="tgs-card__head">
						<h2>Identidad</h2>
						<p>La ficha siempre se arma con el diseño fijo del plugin (foto/3D + precio + botón de compra a la izquierda, secciones abajo). No hay HTML ni CSS para escribir: lo único que se configura por variante es la paleta, qué secciones mostrar y los textos de WhatsApp/pago/recomendadas de abajo.</p>
					</div>
					<div class="tgs-card__body">
						<div class="tgs-fields">
							<div class="tgs-field">
								<label for="name">Nombre</label>
								<input type="text" class="regular-text" id="name" name="name" value="<?php echo esc_attr( $variant['name'] ); ?>" required placeholder="Ej: PC Gamer" <?php echo $is_default ? 'readonly' : ''; ?>>
								<?php if ( $is_default ) : ?>
									<p class="description">Es la variante predeterminada del plugin: el nombre no se puede cambiar, pero sí todo lo demás.</p>
								<?php else : ?>
									<p class="description">Es solo para identificarla en el listado y en el selector de cada producto.</p>
								<?php endif; ?>
							</div>
						</div>
					</div>
				</div>

				<div class="tgs-card">
					<div class="tgs-card__head">
						<h2>Paleta</h2>
						<p>Los colores y la tipografía con los que se pinta la ficha de producto en el sitio.</p>
					</div>
					<div class="tgs-card__body">
						<div class="tgs-fields">
							<div class="tgs-field">
								<label for="accent">Color de acento</label>
								<div class="tgs-color">
									<input type="color" class="tgs-color__picker" value="<?php echo esc_attr( $accent_hex ); ?>" aria-label="Elegir color de acento" tabindex="-1">
									<input type="text" class="tgs-color__text" id="accent" name="accent" value="<?php echo esc_attr( $tokens['accent'] ); ?>" placeholder="#E31B23">
								</div>
								<p class="description">Se usa en el precio, los botones y los detalles destacados.</p>
							</div>
							<div class="tgs-field">
								<label for="bg">Fondo</label>
								<div class="tgs-color">
									<input type="color" class="tgs-color__picker" value="<?php echo esc_attr( $bg_hex ); ?>" aria-label="Elegir color de fondo" tabindex="-1">
									<input type="text" class="tgs-color__text" id="bg" name="bg" value="<?php echo esc_attr( $tokens['bg'] ); ?>" placeholder="#080B12">
								</div>
							</div>
							<div class="tgs-field">
								<label for="text">Texto</label>
								<div class="tgs-color">
									<input type="color" class="tgs-color__picker" value="<?php echo esc_attr( $text_hex ); ?>" aria-label="Elegir color de texto" tabindex="-1">
									<input type="text" class="tgs-color__text" id="text" name="text" value="<?php echo esc_attr( $tokens['text'] ); ?>" placeholder="#F8FAFC">
								</div>
								<p class="description">Tiene que contrastar bien con el fondo elegido.</p>
							</div>
							<div class="tgs-field">
								<label for="radius">Radio de bordes</label>
								<div class="tgs-inputgroup">
									<input type="number" id="radius" name="radius" value="<?php echo esc_attr( $tokens['radius'] ); ?>" min="0" max="60">
									<span class="tgs-suffix">px</span>
								</div>
								<p class="description">0 = esquinas rectas. Cuanto más alto, más redondeadas las tarjetas.</p>
							</div>
							<div class="tgs-field tgs-field--wide">
								<label for="font">Tipografía (CSS font-family)</label>
								<input type="text" id="font" name="font" value="<?php echo esc_attr( $tokens['font'] ); ?>" list="tgs-font-stacks">
								<datalist id="tgs-font-stacks">
									<option value="Inter, system-ui, sans-serif"></option>
									<option value="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"></option>
									<option value="Georgia, Times New Roman, serif"></option>
									<option value="ui-monospace, SFMono-Regular, Menlo, monospace"></option>
								</datalist>
								<p class="description">Se escribe como en CSS: primero la fuente que querés y después alternativas separadas por comas.</p>
							</div>
						</div>

						<div class="tgs-palette-preview" style="background:<?php echo esc_attr( $bg_hex ); ?>;color:<?php echo esc_attr( $text_hex ); ?>;border-radius:<?php echo esc_attr( $preview_radius ); ?>px;font-family:<?php echo esc_attr( $tokens['font'] ); ?>;">
							<span class="tgs-palette-preview__title">Así se ve la paleta guardada</span>
							<span class="tgs-palette-preview__price" style="color:<?php echo esc_attr( $accent_hex ); ?>;">$ 1.234.567 con transferencia</span>
							<span class="tgs-palette-preview__cta" style="background:<?php echo esc_attr( $accent_hex ); ?>;border-radius:<?php echo esc_attr( min( 999, $preview_radius ) ); ?>px;">Agregar al carrito</span>
						</div>
						<p class="tgs-help">La vista previa muestra los valores ya guardados: volvé a guardar para verla actualizada.</p>
					</div>
				</div>

				<div class="tgs-card">
					<div class="tgs-card__head">
						<div class="tgs-card__head-row">
							<h2>Secciones visibles</h2>
							<span class="tgs-chip tgs-chip--<?php echo $visible_count ? 'ok' : 'neutral'; ?>"><?php echo esc_html( $visible_count . ' de ' . count( $block_types ) ); ?></span>
						</div>
						<p>El hero (foto, precio y botón de compra) y el botón de WhatsApp van siempre — no se pueden ocultar. Estas son las secciones opcionales de abajo.</p>
					</div>
					<div class="tgs-card__body">
						<div class="tgs-toggles">
							<?php foreach ( $block_types as $type => $label ) : ?>
								<label class="tgs-toggle">
									<input type="checkbox" name="block_<?php echo esc_attr( $type ); ?>" <?php checked( ! empty( $blocks_map[ $type ] ) ); ?>>
									<span><?php echo esc_html( $label ); ?></span>
								</label>
							<?php endforeach; ?>
						</div>
					</div>
				</div>

				<div class="tgs-sectiontitle">
					<h2>Extras</h2>
					<p>Estos campos alimentan las secciones de arriba: el botón de WhatsApp del hero, la barra flotante de compra, las recomendadas y las formas de pago.</p>
				</div>

				<div class="tgs-card">
					<div class="tgs-card__head">
						<div class="tgs-card__head-row">
							<h2>WhatsApp</h2>
							<span class="tgs-chip tgs-chip--<?php echo '' !== $extra['whatsapp_number'] ? 'ok' : 'warn'; ?>"><?php echo '' !== $extra['whatsapp_number'] ? 'Botón activo' : 'Botón oculto'; ?></span>
						</div>
						<p>El botón de consulta directa que aparece junto al precio.</p>
					</div>
					<div class="tgs-card__body">
						<div class="tgs-fields">
							<div class="tgs-field">
								<label for="whatsapp_number">WhatsApp — número</label>
								<input type="text" id="whatsapp_number" name="whatsapp_number" value="<?php echo esc_attr( $extra['whatsapp_number'] ); ?>" placeholder="5491122223333 (con código de país, sin +)">
								<p class="description">Vacío = el botón de WhatsApp no se muestra, aunque el bloque esté tildado.</p>
							</div>
							<div class="tgs-field">
								<label for="whatsapp_message">WhatsApp — mensaje predefinido</label>
								<input type="text" id="whatsapp_message" name="whatsapp_message" value="<?php echo esc_attr( $extra['whatsapp_message'] ); ?>" placeholder="Hola! Quiero consultar por {{title}}">
								<p class="description">Podés usar <code>{{title}}</code>, se reemplaza por el nombre de la PC.</p>
							</div>
						</div>
					</div>
				</div>

				<div class="tgs-card">
					<div class="tgs-card__head">
						<h2>Barra flotante y recomendadas</h2>
						<p>La barra de compra que se pega abajo en el celular y el listado de PCs sugeridas al final de la ficha.</p>
					</div>
					<div class="tgs-card__body">
						<div class="tgs-fields">
							<div class="tgs-field">
								<label for="sticky_label">Barra flotante — texto del botón</label>
								<input type="text" id="sticky_label" name="sticky_label" value="<?php echo esc_attr( $extra['sticky_label'] ); ?>" placeholder="Agregar al carrito">
								<p class="description">Solo se ve si la sección "Barra flotante de compra (mobile)" está tildada arriba.</p>
							</div>
							<div class="tgs-field">
								<label for="recommended_title">Recomendadas — título de la sección</label>
								<input type="text" id="recommended_title" name="recommended_title" value="<?php echo esc_attr( $extra['recommended_title'] ); ?>" placeholder="Recomendadas de la casa">
							</div>
							<div class="tgs-field">
								<label for="recommended_count">Recomendadas — cuántas mostrar</label>
								<div class="tgs-inputgroup">
									<input type="number" id="recommended_count" name="recommended_count" value="<?php echo esc_attr( $extra['recommended_count'] ); ?>" min="1" max="8">
									<span class="tgs-suffix">PCs</span>
								</div>
								<p class="description">Se eligen automáticamente otras PCs publicadas con precio parecido a esta.</p>
							</div>
						</div>
					</div>
				</div>

				<div class="tgs-card">
					<div class="tgs-card__head">
						<h2>Formas de pago</h2>
						<p>El texto que se muestra en la sección de pago de la ficha.</p>
					</div>
					<div class="tgs-card__body">
						<div class="tgs-fields tgs-fields--single">
							<div class="tgs-field">
								<label for="payment_methods">Formas de pago — texto</label>
								<input type="text" id="payment_methods" name="payment_methods" value="<?php echo esc_attr( $extra['payment_methods'] ); ?>" placeholder="Efectivo, transferencia, tarjeta de crédito y débito">
								<p class="description">Las cuotas/planes de financiación se listan automáticamente debajo si el presupuesto los trae.</p>
							</div>
						</div>
					</div>
					<div class="tgs-card__footer">
						<button type="submit" class="tgs-btn tgs-btn--primary">Guardar variante</button>
						<a class="tgs-btn" href="<?php echo esc_url( remove_query_arg( array( 'edit', 'new' ) ) ); ?>">Cancelar</a>
						<p>Los cambios se aplican a todos los productos que usan esta variante.</p>
					</div>
				</div>

			</div>
		</form>
	</div>
	<script>
	(function () {
		var wraps = document.querySelectorAll('.tgs-admin .tgs-color');
		for (var i = 0; i < wraps.length; i++) {
			(function (wrap) {
				var text = wrap.querySelector('.tgs-color__text');
				var picker = wrap.querySelector('.tgs-color__picker');
				if (!text || !picker) {
					return;
				}
				picker.addEventListener('input', function () {
					text.value = picker.value.toUpperCase();
				});
				text.addEventListener('input', function () {
					var value = text.value.trim();
					if (/^#[0-9a-fA-F]{6}$/.test(value)) {
						picker.value = value;
					}
				});
			})(wraps[i]);
		}
	})();
	</script>
	<?php
}
