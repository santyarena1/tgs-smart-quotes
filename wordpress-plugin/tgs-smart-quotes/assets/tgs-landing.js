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

	// "Completá tu setup": la PC (y el monitor elegido) se agregan al carrito
	// por AJAX y recién ahí se abre el modal con los carruseles (ver
	// includes/upsell.php). Si el AJAX falla, el formulario sigue su curso
	// normal, así nunca se pierde una venta por el modal.
	document.addEventListener( 'DOMContentLoaded', function () {
		var dataEl = document.getElementById( 'tgs-upsell-data' );
		if ( ! dataEl || ! window.fetch ) { return; }
		var cfg;
		try { cfg = JSON.parse( dataEl.textContent || 'null' ); } catch ( e ) { return; }
		if ( ! cfg ) { return; }

		function esc( text ) {
			return String( text == null ? '' : text ).replace( /[&<>"']/g, function ( c ) {
				return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ];
			} );
		}
		function money( value ) {
			try {
				return new Intl.NumberFormat( 'es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 } ).format( value );
			} catch ( e ) { return '$ ' + Math.round( value ); }
		}
		function selectedMonitor() {
			var input = document.querySelector( '[data-tgs-addon-monitor]' );
			return input && input.value ? input.value : '';
		}

		// Alta por AJAX con el endpoint estándar de WooCommerce (wc-ajax=add_to_cart).
		function addToCart( productId, extra ) {
			var body = new URLSearchParams( { product_id: String( productId ), quantity: '1' } );
			Object.keys( extra || {} ).forEach( function ( k ) { if ( extra[ k ] ) { body.set( k, extra[ k ] ); } } );
			return fetch( cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body, headers: { 'X-Requested-With': 'XMLHttpRequest' } } )
				.then( function ( r ) { return r.json(); } )
				.then( function ( json ) {
					if ( ! json || json.error ) { throw new Error( 'add_to_cart_failed' ); }
					// Actualiza el mini-carrito del tema (si usa los fragments de Woo).
					if ( window.jQuery && json.fragments ) {
						window.jQuery( document.body ).trigger( 'added_to_cart', [ json.fragments, json.cart_hash ] );
					}
					return json;
				} );
		}

		// --- Modal ---
		var modal = null;
		var added = {};

		function carousel( group ) {
			var cards = group.items.map( function ( p ) {
				var off = cfg.discountPct ? p.price * ( 1 - cfg.discountPct / 100 ) : 0;
				return '<div class="tgs-up__card" data-up-id="' + esc( p.id ) + '">'
					+ '<a class="tgs-up__media" href="' + esc( p.url ) + '" target="_blank" rel="noopener">' + ( p.image ? '<img src="' + esc( p.image ) + '" alt="" loading="lazy">' : '' ) + '</a>'
					+ '<div class="tgs-up__body">'
					+ '<span class="tgs-up__name">' + esc( p.name ) + '</span>'
					+ ( cfg.discountPct
						? '<span class="tgs-up__price"><s>' + esc( p.priceHtml ) + '</s> <b>' + esc( money( off ) ) + '</b></span>'
						: '<span class="tgs-up__price"><b>' + esc( p.priceHtml ) + '</b></span>' )
					+ '<button type="button" class="tgs-up__add" data-up-add="' + esc( p.id ) + '">'
					+ ( cfg.discountPct ? 'Sumar con −' + cfg.discountPct + '%' : 'Sumar al carrito' ) + '</button>'
					+ '</div></div>';
			} ).join( '' );
			// Carrusel infinito: la tira va duplicada y se desplaza con CSS; con
			// pocos productos se repite más veces para que nunca quede un hueco.
			var times = group.items.length >= 6 ? 2 : 4;
			var track = '';
			for ( var i = 0; i < times; i++ ) { track += cards; }
			var seconds = Math.max( 18, group.items.length * times * 3.2 );
			return '<section class="tgs-up__group" data-up-group="' + esc( group.key ) + '">'
				+ '<header class="tgs-up__ghead"><h3>' + esc( group.label ) + '</h3><span>' + esc( group.kicker ) + '</span></header>'
				+ '<div class="tgs-up__viewport"><div class="tgs-up__track" style="animation-duration:' + seconds + 's">' + track + '</div></div>'
				+ '</section>';
		}

		function build( hasMonitor ) {
			var pct = cfg.discountPct;
			var text = ( cfg.text || '' ).replace( /\{\{\s*descuento\s*\}\}/g, String( pct ) );
			var noMon = ( cfg.noMonitorText || '' ).replace( /\{\{\s*descuento\s*\}\}/g, String( pct ) );
			var groups = cfg.groups.slice();
			if ( ! hasMonitor && cfg.monitors ) { groups.unshift( cfg.monitors ); }
			var html = '<div class="tgs-up" role="dialog" aria-modal="true" aria-label="Completá tu setup">'
				+ '<div class="tgs-up__box">'
				+ '<button type="button" class="tgs-up__close" data-up-close aria-label="Cerrar">✕</button>'
				+ '<div class="tgs-up__head">'
				+ '<span class="tgs-up__check">✓</span>'
				+ '<div>'
				+ '<h2 class="tgs-up__title">' + esc( cfg.headline || 'Pssst… ¡ya está en tu carrito!' ) + '</h2>'
				+ ( text ? '<p class="tgs-up__text">' + esc( text ) + '</p>' : '' )
				+ ( ! hasMonitor && cfg.monitors && noMon ? '<p class="tgs-up__text tgs-up__text--wink">' + esc( noMon ) + '</p>' : '' )
				+ '</div>'
				+ ( pct ? '<span class="tgs-up__badge">−' + pct + '%<small>solo ahora</small></span>' : '' )
				+ '</div>'
				+ '<div class="tgs-up__groups">' + groups.map( carousel ).join( '' ) + '</div>'
				+ '<footer class="tgs-up__foot">'
				+ '<span class="tgs-up__count" data-up-count></span>'
				+ '<a class="tgs-up__btn tgs-up__btn--ghost" href="' + esc( cfg.cartUrl ) + '">Ver carrito</a>'
				+ '<a class="tgs-up__btn tgs-up__btn--primary" href="' + esc( cfg.checkoutUrl ) + '">Finalizar compra →</a>'
				+ '<button type="button" class="tgs-up__btn tgs-up__btn--link" data-up-close>Seguir viendo</button>'
				+ '</footer>'
				+ '</div></div>';
			var wrap = document.createElement( 'div' );
			wrap.innerHTML = html;
			modal = wrap.firstChild;
			document.body.appendChild( modal );
			document.body.classList.add( 'tgs-up-open' );
			modal.addEventListener( 'click', function ( e ) {
				if ( e.target === modal || e.target.closest( '[data-up-close]' ) ) { close(); return; }
				var btn = e.target.closest( '[data-up-add]' );
				if ( btn ) { addUpsell( btn.getAttribute( 'data-up-add' ) ); }
			} );
			document.addEventListener( 'keydown', onKey );
			updateCount();
		}
		function onKey( e ) { if ( e.key === 'Escape' ) { close(); } }
		function close() {
			if ( ! modal ) { return; }
			modal.remove();
			modal = null;
			document.body.classList.remove( 'tgs-up-open' );
			document.removeEventListener( 'keydown', onKey );
		}
		function updateCount() {
			var n = Object.keys( added ).length;
			var el = modal && modal.querySelector( '[data-up-count]' );
			if ( el ) { el.textContent = n ? ( n === 1 ? '1 producto sumado' : n + ' productos sumados' ) + ( cfg.discountPct ? ' con −' + cfg.discountPct + '%' : '' ) : ''; }
		}
		function markAdded( id, state ) {
			var buttons = modal.querySelectorAll( '[data-up-add="' + id + '"]' );
			for ( var i = 0; i < buttons.length; i++ ) {
				buttons[ i ].disabled = state !== 'idle';
				buttons[ i ].classList.toggle( 'is-added', state === 'added' );
				buttons[ i ].textContent = state === 'busy' ? 'Sumando…' : state === 'added' ? '✓ En el carrito' : ( cfg.discountPct ? 'Sumar con −' + cfg.discountPct + '%' : 'Sumar al carrito' );
			}
		}
		function addUpsell( id ) {
			if ( added[ id ] ) { return; }
			markAdded( id, 'busy' );
			addToCart( id, { tgs_upsell: cfg.variant } )
				.then( function () { added[ id ] = true; markAdded( id, 'added' ); updateCount(); } )
				.catch( function () { markAdded( id, 'idle' ); } );
		}

		// --- Intercepción del "Agregar al carrito" de la PC ---
		var busy = false;
		function addPcThenOpen( fallback ) {
			if ( busy ) { return; }
			busy = true;
			var monitor = selectedMonitor();
			var buttons = document.querySelectorAll( 'form.cart button[type="submit"], .tgs-sticky a.button' );
			for ( var i = 0; i < buttons.length; i++ ) { buttons[ i ].classList.add( 'is-loading' ); }
			addToCart( cfg.productId, { tgs_addon_monitor: monitor } )
				.then( function () { busy = false; build( Boolean( monitor ) ); } )
				.catch( function () { busy = false; fallback(); } )
				.then( function () { for ( var j = 0; j < buttons.length; j++ ) { buttons[ j ].classList.remove( 'is-loading' ); } } );
		}
		var forms = document.querySelectorAll( 'form.cart' );
		for ( var f = 0; f < forms.length; f++ ) {
			( function ( form ) {
				form.addEventListener( 'submit', function ( e ) {
					if ( form.getAttribute( 'data-tgs-bypass' ) ) { return; }
					e.preventDefault();
					addPcThenOpen( function () { form.setAttribute( 'data-tgs-bypass', '1' ); form.submit(); } );
				} );
			} )( forms[ f ] );
		}
		var links = document.querySelectorAll( 'a[href*="add-to-cart="]' );
		for ( var l = 0; l < links.length; l++ ) {
			( function ( link ) {
				link.addEventListener( 'click', function ( e ) {
					e.preventDefault();
					addPcThenOpen( function () { window.location.href = link.getAttribute( 'href' ); } );
				} );
			} )( links[ l ] );
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
