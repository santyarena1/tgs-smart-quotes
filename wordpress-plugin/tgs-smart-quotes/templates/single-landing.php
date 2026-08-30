<?php
/**
 * Plantilla de producto 100% custom para lo publicado por TGS-SMART-QUOTES.
 *
 * Mantiene get_header()/get_footer() del tema (menú, logo, footer siguen
 * siendo los del sitio), pero agrega un spacer para compensar el header
 * de Impreza, que es "position: fixed" y NO reserva espacio en el layout
 * por sí solo (en el resto del sitio ese espacio lo pone un row vacío de
 * WPBakery puesto a mano en cada página — acá no hay WPBakery, así que lo
 * ponemos por código). Sin este spacer el header tapa el arranque del
 * contenido.
 */

defined( 'ABSPATH' ) || exit;

$product_id = get_the_ID();
if ( ! $product_id || ! wc_get_product( $product_id ) ) {
	get_header();
	echo '<main class="tgs-landing"><p>Producto no disponible.</p></main>';
	get_footer();
	return;
}

get_header();
?>
<div id="tgs-header-spacer" aria-hidden="true"></div>
<?php
tgs_sq_render_product( $product_id );
get_footer();
