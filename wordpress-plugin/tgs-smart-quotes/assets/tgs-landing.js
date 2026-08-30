(function () {
	'use strict';

	// Corrige el alto del spacer del header fijo con la medida real
	// (el CSS trae un valor fallback para el primer pintado).
	function fixHeaderSpacer() {
		var header = document.getElementById( 'page-header' );
		var spacer = document.getElementById( 'tgs-header-spacer' );
		if ( ! header || ! spacer ) {
			return;
		}
		var height = header.offsetHeight;
		if ( height > 0 ) {
			spacer.style.height = height + 'px';
		}
	}

	window.addEventListener( 'load', fixHeaderSpacer );
	window.addEventListener( 'resize', fixHeaderSpacer );
	document.addEventListener( 'DOMContentLoaded', fixHeaderSpacer );

	// Barra flotante de compra (mobile): aparece después de scrollear el hero.
	document.addEventListener( 'DOMContentLoaded', function () {
		var sticky = document.querySelector( '.tgs-sticky' );
		var hero = document.querySelector( '.tgs-hero' );
		if ( ! sticky || ! hero || typeof IntersectionObserver === 'undefined' ) {
			return;
		}
		var observer = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					sticky.classList.toggle( 'is-visible', ! entry.isIntersecting );
				} );
			},
			{ threshold: 0 }
		);
		observer.observe( hero );
	} );
})();
