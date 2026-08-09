<?php
defined('ABSPATH')||exit;
$id=get_the_ID();$product=wc_get_product($id);$meta=fn($key)=>get_post_meta($id,$key,true);$decode=fn($key)=>json_decode((string)$meta($key),true)?:[];
$layout=tgs_sq_layout($id);$data=['product'=>$product,'meta'=>$meta,'model'=>$meta('_tgs_model3d_url'),'thumb'=>$meta('_tgs_thumbnail_url'),'gallery'=>$decode('_tgs_gallery'),'items'=>$decode('_tgs_items'),'power'=>$decode('_tgs_power'),'games'=>$decode('_tgs_games'),'compat'=>$decode('_tgs_compatibility')];
get_header();echo '<main class="tgs-landing" style="'.esc_attr(tgs_sq_layout_style($layout)).'">';
foreach($layout['blocks'] as $block){if(!is_array($block)||empty($block['visible']))continue;tgs_sq_render_block(sanitize_key($block['type']??''),$data);}echo '</main>';get_footer();
