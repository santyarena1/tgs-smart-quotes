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

	// Visor de fotos: se abre al tocar la foto del hero o la de un componente.
	// Las fotos salen del JSON que imprime el plugin (#tgs-gallery-data).
	document.addEventListener( 'DOMContentLoaded', function () {
		var dataEl = document.getElementById( 'tgs-gallery-data' );
		if ( ! dataEl ) {
			return;
		}
		var photos;
		try { photos = JSON.parse( dataEl.textContent || '[]' ); } catch ( e ) { return; }
		if ( ! photos.length ) {
			return;
		}

		var box = document.createElement( 'div' );
		box.className = 'tgs-lightbox';
		box.hidden = true;
		box.innerHTML =
			'<button type="button" class="tgs-lightbox__close" aria-label="Cerrar">✕</button>' +
			'<button type="button" class="tgs-lightbox__nav tgs-lightbox__nav--prev" aria-label="Anterior">‹</button>' +
			'<figure class="tgs-lightbox__figure"><img alt=""><figcaption></figcaption></figure>' +
			'<button type="button" class="tgs-lightbox__nav tgs-lightbox__nav--next" aria-label="Siguiente">›</button>' +
			'<div class="tgs-lightbox__thumbs"></div>';
		document.body.appendChild( box );

		var img = box.querySelector( 'img' );
		var caption = box.querySelector( 'figcaption' );
		var thumbs = box.querySelector( '.tgs-lightbox__thumbs' );
		var current = 0;

		photos.forEach( function ( photo, index ) {
			var t = document.createElement( 'button' );
			t.type = 'button';
			t.className = 'tgs-lightbox__thumb';
			t.innerHTML = '<img src="' + photo.url + '" alt="" loading="lazy">';
			t.addEventListener( 'click', function () { show( index ); } );
			thumbs.appendChild( t );
		} );

		function show( index ) {
			current = ( index + photos.length ) % photos.length;
			img.src = photos[ current ].url;
			caption.textContent = photos[ current ].label || '';
			var all = thumbs.querySelectorAll( '.tgs-lightbox__thumb' );
			for ( var i = 0; i < all.length; i++ ) {
				all[ i ].classList.toggle( 'is-active', i === current );
			}
			var active = all[ current ];
			if ( active && active.scrollIntoView ) {
				active.scrollIntoView( { block: 'nearest', inline: 'center', behavior: 'smooth' } );
			}
		}
		function open( index ) {
			show( index );
			box.hidden = false;
			document.body.classList.add( 'tgs-lightbox-open' );
		}
		function close() {
			box.hidden = true;
			document.body.classList.remove( 'tgs-lightbox-open' );
		}

		box.querySelector( '.tgs-lightbox__close' ).addEventListener( 'click', close );
		box.querySelector( '.tgs-lightbox__nav--prev' ).addEventListener( 'click', function () { show( current - 1 ); } );
		box.querySelector( '.tgs-lightbox__nav--next' ).addEventListener( 'click', function () { show( current + 1 ); } );
		box.addEventListener( 'click', function ( e ) { if ( e.target === box ) { close(); } } );
		document.addEventListener( 'keydown', function ( e ) {
			if ( box.hidden ) { return; }
			if ( e.key === 'Escape' ) { close(); }
			if ( e.key === 'ArrowLeft' ) { show( current - 1 ); }
			if ( e.key === 'ArrowRight' ) { show( current + 1 ); }
		} );

		// Qué abre el visor: la foto del hero (bloques o diseño propio) y las
		// fotos de los componentes. Se busca por URL para saber cuál mostrar.
		function indexOfUrl( url ) {
			for ( var i = 0; i < photos.length; i++ ) {
				if ( photos[ i ].url === url ) { return i; }
			}
			return -1;
		}
		var openers = document.querySelectorAll( '.tgs-viewer img, .gx-frame img, .tgs-item-media img, .tgs-gallery img' );
		for ( var j = 0; j < openers.length; j++ ) {
			( function ( el ) {
				var idx = indexOfUrl( el.currentSrc || el.src ) ;
				if ( idx < 0 ) { idx = indexOfUrl( el.getAttribute( 'src' ) || '' ); }
				if ( idx < 0 ) { return; }
				el.classList.add( 'tgs-zoomable' );
				el.setAttribute( 'role', 'button' );
				el.setAttribute( 'tabindex', '0' );
				el.setAttribute( 'aria-label', 'Ver foto en grande' );
				el.addEventListener( 'click', function () { open( idx ); } );
				el.addEventListener( 'keydown', function ( e ) { if ( e.key === 'Enter' || e.key === ' ' ) { e.preventDefault(); open( idx ); } } );
			} )( openers[ j ] );
		}
	} );

	// "Sumale un monitor": elegir uno lo deja anotado en el campo oculto del
	// formulario de compra y en los links ?add-to-cart= (barra flotante), así
	// el servidor lo suma al carrito junto con la PC. Tocar el elegido lo saca.
	document.addEventListener( 'DOMContentLoaded', function () {
		var section = document.querySelector( '[data-tgs-monitors]' );
		if ( ! section ) {
			return;
		}
		var picks = section.querySelectorAll( '.tgs-monitor-pick' );
		var summary = section.querySelector( '.tgs-monitors-summary' );
		var summaryName = section.querySelector( '[data-monitor-summary-name]' );
		var summaryTotal = section.querySelector( '[data-monitor-summary-total]' );
		var pcPrice = parseFloat( section.getAttribute( 'data-pc-price' ) ) || 0;
		var currency = section.getAttribute( 'data-currency' ) || 'ARS';
		var formatter;
		try {
			formatter = new Intl.NumberFormat( 'es-AR', { style: 'currency', currency: currency, maximumFractionDigits: 0 } );
		} catch ( e ) {
			formatter = null;
		}
		function money( value ) {
			return formatter ? formatter.format( value ) : '$ ' + Math.round( value ).toLocaleString( 'es-AR' );
		}
		function setParam( href, id ) {
			var clean = href.replace( /([?&])tgs_addon_monitor=\d*(&|$)/, function ( m, sep, tail ) { return tail ? sep : ''; } );
			if ( ! id ) { return clean; }
			return clean + ( clean.indexOf( '?' ) >= 0 ? '&' : '?' ) + 'tgs_addon_monitor=' + id;
		}
		function apply( id, name, price ) {
			var inputs = document.querySelectorAll( '[data-tgs-addon-monitor]' );
			for ( var i = 0; i < inputs.length; i++ ) { inputs[ i ].value = id || ''; }
			var links = document.querySelectorAll( 'a[href*="add-to-cart="]' );
			for ( var j = 0; j < links.length; j++ ) { links[ j ].setAttribute( 'href', setParam( links[ j ].getAttribute( 'href' ), id ) ); }
			for ( var k = 0; k < picks.length; k++ ) {
				var on = !! id && picks[ k ].getAttribute( 'data-monitor-id' ) === id;
				picks[ k ].classList.toggle( 'is-selected', on );
				picks[ k ].setAttribute( 'aria-pressed', on ? 'true' : 'false' );
			}
			if ( summary ) {
				summary.hidden = ! id;
				if ( id ) {
					summaryName.textContent = name;
					summaryTotal.textContent = money( pcPrice + price );
				}
			}
		}
		for ( var p = 0; p < picks.length; p++ ) {
			( function ( pick ) {
				pick.addEventListener( 'click', function () {
					var id = pick.getAttribute( 'data-monitor-id' );
					if ( pick.classList.contains( 'is-selected' ) ) {
						apply( '', '', 0 );
						return;
					}
					apply( id, pick.getAttribute( 'data-monitor-name' ) || '', parseFloat( pick.getAttribute( 'data-monitor-price' ) ) || 0 );
				} );
			} )( picks[ p ] );
		}
	} );

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
					var visible = ! entry.isIntersecting;
					sticky.classList.toggle( 'is-visible', visible );
					// Mientras está escondida no debe existir para lectores de
					// pantalla ni recibir foco con el tabulador.
					sticky.setAttribute( 'aria-hidden', visible ? 'false' : 'true' );
				} );
			},
			{ threshold: 0 }
		);
		observer.observe( hero );
	} );
})();
