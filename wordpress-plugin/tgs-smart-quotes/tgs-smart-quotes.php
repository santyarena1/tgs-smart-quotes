<?php
/**
 * Plugin Name: TGS Smart Quotes
 * Description: Publica presupuestos de TGS-SMART-QUOTES como productos de WooCommerce, con una ficha de producto 100% custom (independiente del tema) y variantes de diseño elegibles desde WordPress.
 * Version: 2.3.0
 * Author: The Gamer Shop
 * Text Domain: tgs-smart-quotes
 *
 * Reescritura completa (v2). Reemplaza la v1 (código minificado de una sola
 * línea por archivo). El contrato de la API REST (/wp-json/tgs/v1/publish,
 * /unpublish, /ping) se mantiene idéntico para no romper la integración con
 * TGS-SMART-QUOTES (packages/providers/src/wordpress.ts).
 */

defined( 'ABSPATH' ) || exit;

define( 'TGS_SQ_VERSION', '2.3.0' );
define( 'TGS_SQ_FILE', __FILE__ );
define( 'TGS_SQ_DIR', plugin_dir_path( __FILE__ ) );
define( 'TGS_SQ_URL', plugin_dir_url( __FILE__ ) );

// Meta keys usados en el post del producto WooCommerce. Centralizados acá
// para que todos los archivos usen exactamente las mismas claves.
define( 'TGS_SQ_META_EXTERNAL_ID', '_tgs_external_id' );
define( 'TGS_SQ_META_MANAGED', '_tgs_managed' );
define( 'TGS_SQ_META_VARIANT', '_tgs_variant' );
define( 'TGS_SQ_META_MODEL3D', '_tgs_model3d_url' );
define( 'TGS_SQ_META_THUMBNAIL', '_tgs_thumbnail_url' );
define( 'TGS_SQ_META_GALLERY', '_tgs_gallery' );
define( 'TGS_SQ_META_PRICE_LIST', '_tgs_price_list_cents' );
define( 'TGS_SQ_META_PRICE_CASH', '_tgs_price_cash_cents' );
define( 'TGS_SQ_META_PRICE_TRANSFER', '_tgs_price_transfer_cents' );
define( 'TGS_SQ_META_INSTALLMENTS', '_tgs_installments' );
define( 'TGS_SQ_META_ITEMS', '_tgs_items' );
define( 'TGS_SQ_META_DESCRIPTION', '_tgs_description_html' );
define( 'TGS_SQ_META_POWER', '_tgs_power' );
define( 'TGS_SQ_META_GAMES', '_tgs_games' );
define( 'TGS_SQ_META_COMPATIBILITY', '_tgs_compatibility' );

define( 'TGS_SQ_OPTION_HMAC_SECRET', 'tgs_sq_hmac_secret' );
define( 'TGS_SQ_OPTION_VARIANTS', 'tgs_sq_variants' );
define( 'TGS_SQ_DEFAULT_VARIANT', 'default' );

require_once TGS_SQ_DIR . 'includes/variants.php';
require_once TGS_SQ_DIR . 'includes/product-sync.php';
require_once TGS_SQ_DIR . 'includes/rest.php';
require_once TGS_SQ_DIR . 'includes/render.php';
require_once TGS_SQ_DIR . 'includes/admin.php';

/**
 * Aviso si WooCommerce no está activo: el plugin no puede hacer nada sin él.
 */
add_action( 'admin_notices', function () {
	if ( ! class_exists( 'WooCommerce' ) ) {
		echo '<div class="notice notice-error"><p><strong>TGS Smart Quotes:</strong> este plugin necesita que WooCommerce esté activo para funcionar.</p></div>';
	}
} );

/**
 * Al activar el plugin, nos aseguramos de que exista al menos la variante
 * "default" (con los bloques que ya se usaban antes) para que nada rompa
 * si un producto no tiene variante asignada todavía.
 */
register_activation_hook( TGS_SQ_FILE, function () {
	tgs_sq_ensure_default_variant();
} );
