<?php
/**
 * Plugin Name: TGS Smart Quotes
 * Description: Publica presupuestos TGS como productos WooCommerce con landing 3D.
 * Version: 1.0.0
 */
defined('ABSPATH') || exit;
define('TGS_SQ_VERSION','1.0.0');
define('TGS_SQ_DIR',plugin_dir_path(__FILE__));
define('TGS_SQ_URL',plugin_dir_url(__FILE__));
require_once TGS_SQ_DIR.'includes/rest.php';
require_once TGS_SQ_DIR.'includes/render.php';
add_action('admin_menu',function(){add_options_page('TGS Smart Quotes','TGS Smart Quotes','manage_options','tgs-smart-quotes','tgs_sq_settings_page');});
add_action('admin_init',function(){register_setting('tgs_sq','tgs_hmac_secret',['type'=>'string','sanitize_callback'=>function($value){$clean=sanitize_text_field($value);return $clean!==''?$clean:(string)get_option('tgs_hmac_secret','');}]);});
function tgs_sq_settings_page(){if(!current_user_can('manage_options'))return;?><div class="wrap"><h1><?php echo esc_html__('TGS Smart Quotes','tgs-smart-quotes');?></h1><form method="post" action="options.php"><?php settings_fields('tgs_sq');?><table class="form-table"><tr><th><label for="tgs_hmac_secret">Secreto HMAC</label></th><td><input class="regular-text" type="password" id="tgs_hmac_secret" name="tgs_hmac_secret" value="" autocomplete="new-password"><p class="description">Dejalo vacío para conservar el valor actual.</p></td></tr></table><?php submit_button();?></form></div><?php }
