<?php
defined('ABSPATH') || exit;
function tgs_sq_managed($id=0){$id=$id?:get_the_ID();return $id&&get_post_meta($id,'_tgs_managed',true)==='1';}
add_filter('template_include',function($template){return is_singular('product')&&tgs_sq_managed()?TGS_SQ_DIR.'templates/single-landing.php':$template;},99);
add_filter('script_loader_tag',function($tag,$handle){return $handle==='tgs-model-viewer'?str_replace('<script ','<script type="module" ',$tag):$tag;},10,2);add_action('wp_enqueue_scripts',function(){if(!is_singular('product')||!tgs_sq_managed())return;wp_enqueue_style('tgs-landing',TGS_SQ_URL.'assets/tgs-landing.css',[],TGS_SQ_VERSION);wp_enqueue_script('tgs-landing',TGS_SQ_URL.'assets/tgs-landing.js',[],TGS_SQ_VERSION,true);wp_enqueue_script('tgs-model-viewer',TGS_SQ_URL.'assets/model-viewer.min.js',[],TGS_SQ_VERSION,true);});
function tgs_sq_image_html($html,$post_id=0){$id=$post_id?:get_the_ID();if(!tgs_sq_managed($id))return $html;$url=get_post_meta($id,'_tgs_thumbnail_url',true);return $url?'<img class="tgs-product-thumbnail" src="'.esc_url($url).'" alt="'.esc_attr(get_the_title($id)).'" loading="lazy">':$html;}
add_filter('post_thumbnail_html','tgs_sq_image_html',20,2);add_filter('woocommerce_single_product_image_thumbnail_html',fn($html)=>tgs_sq_image_html($html),20);add_filter('woocommerce_product_get_image',function($html,$product){return tgs_sq_image_html($html,$product->get_id());},20,2);

