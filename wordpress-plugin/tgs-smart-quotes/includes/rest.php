<?php
/**
 * API REST que consume TGS-SMART-QUOTES (packages/providers/src/wordpress.ts
 * y apps/api/src/external-module.ts). El contrato NO cambia respecto a la
 * v1 del plugin:
 *
 *   GET  /wp-json/tgs/v1/ping       -> { ok, version }        (sin auth)
 *   POST /wp-json/tgs/v1/publish    -> { ok, productId, url } (HMAC)
 *   POST /wp-json/tgs/v1/unpublish  -> { ok, productId }      (HMAC)
 *
 * Auth: header X-TGS-Signature = HMAC-SHA256(body, secret) en hex,
 * comparado con hash_equals contra el secreto guardado en el option
 * tgs_sq_hmac_secret (se configura desde TGS Smart Quotes > Ajustes).
 */

defined( 'ABSPATH' ) || exit;

function tgs_sq_hmac_secret() {
	return (string) get_option( TGS_SQ_OPTION_HMAC_SECRET, '' );
}

function tgs_sq_verify_signature( WP_REST_Request $request ) {
	$secret = tgs_sq_hmac_secret();
	if ( '' === $secret ) {
		return false;
	}
	$provided = strtolower( trim( (string) $request->get_header( 'X-TGS-Signature' ) ) );
	if ( ! preg_match( '/^[a-f0-9]{64}$/', $provided ) ) {
		return false;
	}
	$expected = hash_hmac( 'sha256', $request->get_body(), $secret );
	return hash_equals( $expected, $provided );
}

function tgs_sq_require_signature( WP_REST_Request $request ) {
	return tgs_sq_verify_signature( $request )
		? true
		: new WP_Error( 'tgs_unauthorized', 'Firma HMAC inválida o ausente', array( 'status' => 401 ) );
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'tgs/v1', '/ping', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => function () {
			return array( 'ok' => true, 'version' => TGS_SQ_VERSION );
		},
	) );

	register_rest_route( 'tgs/v1', '/publish', array(
		'methods'             => 'POST',
		'permission_callback' => 'tgs_sq_require_signature',
		'callback'            => 'tgs_sq_rest_publish',
	) );

	register_rest_route( 'tgs/v1', '/unpublish', array(
		'methods'             => 'POST',
		'permission_callback' => 'tgs_sq_require_signature',
		'callback'            => 'tgs_sq_rest_unpublish',
	) );
} );

function tgs_sq_rest_publish( WP_REST_Request $request ) {
	$payload = $request->get_json_params();
	if ( ! is_array( $payload ) ) {
		return new WP_Error( 'tgs_invalid_json', 'Body inválido', array( 'status' => 400 ) );
	}

	$result = tgs_sq_sync_product( $payload );
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	return array(
		'ok'        => true,
		'productId' => $result,
		'url'       => get_permalink( $result ),
	);
}

function tgs_sq_rest_unpublish( WP_REST_Request $request ) {
	$payload     = $request->get_json_params();
	$external_id = sanitize_text_field( is_array( $payload ) ? ( $payload['externalId'] ?? '' ) : '' );
	if ( '' === $external_id ) {
		return new WP_Error( 'tgs_missing_external_id', 'externalId es obligatorio', array( 'status' => 400 ) );
	}
	$product_id = tgs_sq_unpublish_product( $external_id );
	return array(
		'ok'        => true,
		'productId' => $product_id ?: null,
	);
}
