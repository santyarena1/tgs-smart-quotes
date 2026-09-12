(function () {
	'use strict';

	// Arranque robusto: en este sitio otro script frena DOMContentLoaded con
	// stopImmediatePropagation() y los handlers registrados después nunca
	// corrían (el modal no abría). Se corre ya si el DOM está parseado y, si
	// no, se escucha DOMContentLoaded Y window.load, con un solo disparo.
	function ready( fn ) {
		var done = false;
		function run() { if ( ! done ) { done = true; fn(); } }
		if ( document.readyState !== 'loading' ) { run(); return; }
		document.addEventListener( 'DOMContentLoaded', run );
		window.addEventListener( 'load', run );
		setTimeout( function () { if ( document.readyState !== 'loading' ) { run(); } }, 1500 );
	}

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
	ready( function () {
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
	ready( function () {
		var section = document.querySelector( '[data-tgs-monitors]' );
		if ( ! section ) {
			return;
		}
		var picks = section.querySelectorAll( '.tgs-monitor-pick' );
		var summary = section.querySelector( '.tgs-monitors-summary' );
		var summaryName = section.querySelector( '[data-monitor-summary-name]' );
		var summaryTotal = section.querySelector( '[data-monitor-summary-total]' );
		var pcPrice = parseFloat( section.getAttribute( 'data-pc-price' ) ) || 0;
		var pcList = parseFloat( section.getAttribute( 'data-pc-list' ) ) || pcPrice;
		var pcTitle = section.getAttribute( 'data-pc-title' ) || 'PC';
		var bestN = parseInt( section.getAttribute( 'data-best-n' ) || '0', 10 );
		var bestBps = parseInt( section.getAttribute( 'data-best-bps' ) || '0', 10 );
		var currency = section.getAttribute( 'data-currency' ) || 'ARS';
		// Precios originales de la barra de compra, para restaurarlos al quitar el monitor.
		var barPriceEls = document.querySelectorAll( '.gx-buybar__value, .tgs-sticky-price' );
		var barPriceOriginal = Array.prototype.map.call( barPriceEls, function ( el ) { return el.innerHTML; } );
		var barFinEls = document.querySelectorAll( '.gx-barfin__line' );
		var barFinOriginal = Array.prototype.map.call( barFinEls, function ( el ) { return el.innerHTML; } );
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
			updateBar( id, name, price );
		}

		// Barra de compra: con monitor, el precio grande pasa a ser el total y
		// aparece una mini barra arriba con el detalle (PC + monitor = total,
		// N cuotas de $X). Sin monitor, se restaura todo.
		function updateBar( id, name, price ) {
			// Solo la barra más externa: en el diseño propio la barra del plugin va adentro de la del diseño.
			var bars = document.querySelectorAll( '.gx-buybar' ).length ? document.querySelectorAll( '.gx-buybar' ) : document.querySelectorAll( '.tgs-sticky' );
			var i;
			document.querySelectorAll( '.tgs-minibar' ).forEach( function ( el ) { el.remove(); } );
			if ( ! id ) {
				for ( i = 0; i < barPriceEls.length; i++ ) { barPriceEls[ i ].innerHTML = barPriceOriginal[ i ]; }
				for ( i = 0; i < barFinEls.length; i++ ) { barFinEls[ i ].innerHTML = barFinOriginal[ i ]; }
				return;
			}
			var total = pcPrice + price;
			var esc = function ( t ) { return String( t ).replace( /[&<>"]/g, function ( c ) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ c ]; } ); };
			var cuota = '';
			if ( bestN > 0 ) {
				var per = ( ( pcList + price ) * ( 1 + bestBps / 10000 ) ) / bestN;
				cuota = bestN + ' cuotas' + ( bestBps === 0 ? ' sin interés' : '' ) + ' de ' + money( per );
			}
			for ( i = 0; i < barPriceEls.length; i++ ) { barPriceEls[ i ].textContent = money( total ); }
			for ( i = 0; i < barFinEls.length; i++ ) { if ( cuota ) { barFinEls[ i ].textContent = cuota; } }
			var html = '<div class="tgs-minibar" role="status">'
				// Lo importante primero (total y cuotas): si no entra, se corta el nombre del monitor, no el total.
				+ '<span class="tgs-minibar__full">'
				+ '<strong>Total ' + esc( money( total ) ) + '</strong>'
				+ ( cuota ? ' <em>· ' + esc( cuota ) + '</em>' : '' )
				+ ' <i>—</i> <b>PC</b> ' + esc( money( pcPrice ) ) + ' <i>+</i> <b>' + esc( name ) + '</b> ' + esc( money( price ) )
				+ '</span>'
				+ '<span class="tgs-minibar__short">✓ Con monitor: <b>' + esc( name ) + '</b></span>'
				+ '</div>';
			for ( i = 0; i < bars.length; i++ ) { bars[ i ].insertAdjacentHTML( 'afterbegin', html ); }
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
	ready( function () {
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
		// Monitor elegido en la ficha: el campo oculto del formulario de Woo, o
		// (si el diseño propio no trae el formulario) la tarjeta marcada en la
		// sección "Sumale un monitor". Antes solo se miraba el campo: sin
		// formulario, el modal creía que no había monitor y ofrecía monitores.
		function selectedMonitor() {
			var input = document.querySelector( '[data-tgs-addon-monitor]' );
			if ( input && input.value ) { return input.value; }
			var pick = document.querySelector( '.tgs-monitor-pick.is-selected' );
			return pick ? ( pick.getAttribute( 'data-monitor-id' ) || '' ) : '';
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
						try { window.jQuery( document.body ).trigger( 'added_to_cart', [ json.fragments, json.cart_hash ] ); } catch ( e ) { /* un handler del tema no puede frenar el modal */ }
					}
					return json;
				} );
		}

		// --- Modal ---
		var modal = null;
		var added = {};

		function groupPct( group ) { return group.key === 'monitor' ? cfg.monitorDiscountPct : cfg.discountPct; }
		function sorted( group ) {
			return group.items.slice().sort( function ( a, b ) { return ( b.featured ? 1 : 0 ) - ( a.featured ? 1 : 0 ); } );
		}
		function card( group, p ) {
			var pct = groupPct( group );
			var off = pct ? p.price * ( 1 - pct / 100 ) : 0;
			return '<div class="tgs-up__card' + ( p.featured ? ' tgs-up__card--featured' : '' ) + '" data-up-id="' + esc( p.id ) + '" data-up-open="' + esc( group.key ) + ':' + esc( p.id ) + '" role="button" tabindex="0">'
				+ ( p.featured ? '<span class="tgs-up__star">★ Más elegido</span>' : '' )
				+ '<span class="tgs-up__media">' + ( p.image ? '<img src="' + esc( p.image ) + '" alt="" loading="lazy">' : '' ) + '</span>'
				+ '<div class="tgs-up__body">'
				+ '<span class="tgs-up__name">' + esc( p.name ) + '</span>'
				+ ( pct
					? '<span class="tgs-up__price"><s>' + esc( p.priceHtml ) + '</s> <b>' + esc( money( off ) ) + '</b></span>'
					: '<span class="tgs-up__price"><b>' + esc( p.priceHtml ) + '</b></span>' )
				+ '<span class="tgs-up__actions">'
				+ '<button type="button" class="tgs-up__add" data-up-add="' + esc( p.id ) + '" data-up-kind="' + esc( group.key === 'monitor' ? 'monitor' : 'setup' ) + '" data-up-pct="' + esc( pct ) + '">' + ( pct ? 'Sumar −' + pct + '%' : 'Sumar' ) + '</button>'
				+ '<button type="button" class="tgs-up__peek" data-up-open="' + esc( group.key ) + ':' + esc( p.id ) + '">Ver</button>'
				+ '</span>'
				+ '</div></div>';
		}

		// Carrusel infinito (tira duplicada que se desplaza sola; se frena al
		// pasar el mouse). "Ver todos" abre la grilla completa del grupo.
		// Carrusel con flechas en las puntas: en escritorio avanza solo de a un
		// producto cada 3,5 s (se frena al pasar el mouse) y las flechas saltan
		// una página; en celular no avanza solo y las flechas pasan de a uno.
		// Al llegar al final vuelve al principio (sensación de infinito).
		function carousel( group ) {
			var pct = groupPct( group );
			var items = sorted( group );
			var cards = items.map( function ( p ) { return card( group, p ); } ).join( '' );
			return '<section class="tgs-up__group" data-up-group="' + esc( group.key ) + '">'
				+ '<header class="tgs-up__ghead"><h3>' + esc( group.label ) + ( pct ? ' <em class="tgs-up__gpct">−' + pct + '%</em>' : '' ) + '</h3><span>' + esc( group.kicker ) + '</span>'
				+ '<span class="tgs-up__pos" data-up-pos>1 / ' + items.length + '</span>'
				+ '<button type="button" class="tgs-up__all" data-up-all="' + esc( group.key ) + '">Ver todos (' + items.length + ') →</button></header>'
				+ '<div class="tgs-up__row">'
				+ '<button type="button" class="tgs-up__arrow tgs-up__arrow--prev" data-up-prev aria-label="Anterior">‹</button>'
				+ '<div class="tgs-up__viewport" data-up-viewport><div class="tgs-up__track">' + cards + '</div></div>'
				+ '<button type="button" class="tgs-up__arrow tgs-up__arrow--next" data-up-next aria-label="Siguiente">›</button>'
				+ '</div>'
				+ '</section>';
		}

		var autoTimers = [];
		function stopAuto() {
			autoTimers.forEach( clearInterval );
			autoTimers = [];
		}
		function cardStep( viewport ) {
			var first = viewport.querySelector( '.tgs-up__card' );
			if ( ! first ) { return viewport.clientWidth; }
			var gap = parseFloat( getComputedStyle( viewport.querySelector( '.tgs-up__track' ) ).columnGap || getComputedStyle( viewport.querySelector( '.tgs-up__track' ) ).gap ) || 12;
			return first.getBoundingClientRect().width + gap;
		}
		function slide( viewport, dir, byPage ) {
			var step = cardStep( viewport );
			var amount = byPage ? Math.max( step, Math.floor( viewport.clientWidth / step ) * step ) : step;
			var max = viewport.scrollWidth - viewport.clientWidth;
			var target = viewport.scrollLeft + dir * amount;
			if ( dir > 0 && viewport.scrollLeft >= max - 4 ) { target = 0; }
			if ( dir < 0 && viewport.scrollLeft <= 4 ) { target = max; }
			viewport.scrollTo( { left: Math.max( 0, Math.min( max, target ) ), behavior: 'smooth' } );
		}
		function updatePos( viewport ) {
			var group = viewport.closest( '.tgs-up__group' );
			var pos = group && group.querySelector( '[data-up-pos]' );
			if ( ! pos ) { return; }
			var total = viewport.querySelectorAll( '.tgs-up__card' ).length;
			var index = Math.min( total, Math.round( viewport.scrollLeft / cardStep( viewport ) ) + 1 );
			pos.textContent = index + ' / ' + total;
		}
		function initCarousels() {
			stopAuto();
			var desktop = window.matchMedia( '(min-width: 721px)' ).matches;
			modal.querySelectorAll( '[data-up-viewport]' ).forEach( function ( viewport ) {
				viewport.addEventListener( 'scroll', function () { updatePos( viewport ); }, { passive: true } );
				if ( ! desktop ) {
					// En celular cada tarjeta ocupa el ancho visible entre las flechas.
					var w = Math.max( 200, viewport.clientWidth - 8 );
					viewport.querySelectorAll( '.tgs-up__card' ).forEach( function ( c ) { c.style.flexBasis = w + 'px'; c.style.maxWidth = w + 'px'; } );
				}
				updatePos( viewport );
				if ( ! desktop ) { return; }
				var paused = false;
				viewport.addEventListener( 'mouseenter', function () { paused = true; } );
				viewport.addEventListener( 'mouseleave', function () { paused = false; } );
				autoTimers.push( setInterval( function () {
					if ( ! paused && document.body.contains( viewport ) ) { slide( viewport, 1, false ); }
				}, 3500 ) );
			} );
		}

		// Vista "Ver todos": grilla con todos los productos del grupo.
		function gridView( group ) {
			var pct = groupPct( group );
			return '<div class="tgs-up__sub">'
				+ '<header class="tgs-up__subhead"><button type="button" class="tgs-up__back" data-up-home>← Volver</button>'
				+ '<h3>' + esc( group.label ) + ( pct ? ' <em class="tgs-up__gpct">−' + pct + '%</em>' : '' ) + '</h3><span>' + esc( group.kicker ) + '</span></header>'
				+ '<div class="tgs-up__grid">' + sorted( group ).map( function ( p ) { return card( group, p ); } ).join( '' ) + '</div>'
				+ '</div>';
		}

		// Vista previa de un producto: foto grande, precio con descuento y CTA.
		function previewView( group, p ) {
			var pct = groupPct( group );
			var off = pct ? p.price * ( 1 - pct / 100 ) : 0;
			return '<div class="tgs-up__sub tgs-up__preview">'
				+ '<header class="tgs-up__subhead"><button type="button" class="tgs-up__back" data-up-back="' + esc( group.key ) + '">← Volver</button><span>' + esc( group.label ) + '</span></header>'
				+ '<div class="tgs-up__pv">'
				+ '<div class="tgs-up__pv-media">' + ( p.imageLarge || p.image ? '<img src="' + esc( p.imageLarge || p.image ) + '" alt="">' : '' ) + ( p.featured ? '<span class="tgs-up__star tgs-up__star--big">★ Más elegido</span>' : '' ) + '</div>'
				+ '<div class="tgs-up__pv-body">'
				+ '<h3 class="tgs-up__pv-name">' + esc( p.name ) + '</h3>'
				+ ( p.description ? '<p class="tgs-up__pv-desc">' + esc( p.description ) + '</p>' : '' )
				+ '<div class="tgs-up__pv-price">'
				+ ( pct ? '<s>' + esc( p.priceHtml ) + '</s><b>' + esc( money( off ) ) + '</b><em>−' + pct + '% solo ahora</em>' : '<b>' + esc( p.priceHtml ) + '</b>' )
				+ '</div>'
				+ '<button type="button" class="tgs-up__add tgs-up__add--big" data-up-add="' + esc( p.id ) + '" data-up-kind="' + esc( group.key === 'monitor' ? 'monitor' : 'setup' ) + '" data-up-pct="' + esc( pct ) + '">' + ( pct ? 'Sumar al carrito con −' + pct + '%' : 'Sumar al carrito' ) + '</button>'
				+ '<a class="tgs-up__pv-link" href="' + esc( p.url ) + '" target="_blank" rel="noopener">Ver ficha completa ↗</a>'
				+ '</div></div></div>';
		}

		var groupsShown = [];
		function findGroup( key ) {
			for ( var i = 0; i < groupsShown.length; i++ ) { if ( groupsShown[ i ].key === key ) { return groupsShown[ i ]; } }
			return null;
		}
		function findItem( group, id ) {
			for ( var i = 0; i < group.items.length; i++ ) { if ( String( group.items[ i ].id ) === String( id ) ) { return group.items[ i ]; } }
			return null;
		}
		function setView( html ) {
			var body = modal.querySelector( '[data-up-body]' );
			body.innerHTML = html;
			body.scrollTop = 0;
			initCarousels();
			var box = modal.querySelector( '.tgs-up__box' );
			box.classList.remove( 'is-swap' );
			void box.offsetWidth;
			box.classList.add( 'is-swap' );
			syncAdded();
		}
		function homeView() {
			setView( '<div class="tgs-up__groups">' + groupsShown.map( carousel ).join( '' ) + '</div>' );
		}
		function syncAdded() {
			Object.keys( added ).forEach( function ( id ) { markAdded( id, 'added' ); } );
		}

		function build( hasMonitor ) {
			var pct = cfg.discountPct;
			var fill = function ( s ) {
				return ( s || '' ).replace( /\{\{\s*descuento_monitor\s*\}\}/g, String( cfg.monitorDiscountPct || 0 ) ).replace( /\{\{\s*descuento\s*\}\}/g, String( pct ) );
			};
			var text = fill( cfg.text );
			var noMon = fill( cfg.noMonitorText );
			groupsShown = cfg.groups.slice();
			if ( ! hasMonitor && cfg.monitors ) { groupsShown.unshift( cfg.monitors ); }
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
				+ '<div class="tgs-up__body-wrap" data-up-body></div>'
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
			homeView();
			modal.addEventListener( 'click', function ( e ) {
				if ( e.target === modal || e.target.closest( '[data-up-close]' ) ) { close(); return; }
				var btn = e.target.closest( '[data-up-add]' );
				if ( btn ) { addUpsell( btn.getAttribute( 'data-up-add' ), btn.getAttribute( 'data-up-kind' ), btn.getAttribute( 'data-up-pct' ) ); return; }
				var arrow = e.target.closest( '[data-up-prev], [data-up-next]' );
				if ( arrow ) {
					var vp = arrow.parentNode.querySelector( '[data-up-viewport]' );
					if ( vp ) { slide( vp, arrow.hasAttribute( 'data-up-next' ) ? 1 : -1, window.matchMedia( '(min-width: 721px)' ).matches ); }
					return;
				}
				var all = e.target.closest( '[data-up-all]' );
				if ( all ) { var g = findGroup( all.getAttribute( 'data-up-all' ) ); if ( g ) { setView( gridView( g ) ); } return; }
				if ( e.target.closest( '[data-up-home]' ) ) { homeView(); return; }
				var back = e.target.closest( '[data-up-back]' );
				if ( back ) { var gb = findGroup( back.getAttribute( 'data-up-back' ) ); if ( gb ) { setView( gridView( gb ) ); } else { homeView(); } return; }
				var open = e.target.closest( '[data-up-open]' );
				if ( open ) {
					var parts = open.getAttribute( 'data-up-open' ).split( ':' );
					var go = findGroup( parts[ 0 ] );
					var item = go && findItem( go, parts[ 1 ] );
					if ( item ) { setView( previewView( go, item ) ); }
				}
			} );
			modal.addEventListener( 'keydown', function ( e ) {
				if ( ( e.key === 'Enter' || e.key === ' ' ) && e.target.matches( '.tgs-up__card' ) ) { e.preventDefault(); e.target.click(); }
			} );
			document.addEventListener( 'keydown', onKey );
			updateCount();
		}
		function onKey( e ) { if ( e.key === 'Escape' ) { close(); } }
		function close() {
			if ( ! modal ) { return; }
			stopAuto();
			modal.remove();
			modal = null;
			document.body.classList.remove( 'tgs-up-open' );
			document.removeEventListener( 'keydown', onKey );
		}
		function updateCount() {
			var n = Object.keys( added ).length;
			var el = modal && modal.querySelector( '[data-up-count]' );
			if ( el ) { el.textContent = n ? ( n === 1 ? '1 producto sumado con descuento' : n + ' productos sumados con descuento' ) : ''; }
		}
		function markAdded( id, state ) {
			var buttons = modal.querySelectorAll( '[data-up-add="' + id + '"]' );
			for ( var i = 0; i < buttons.length; i++ ) {
				var pct = Number( buttons[ i ].getAttribute( 'data-up-pct' ) ) || 0;
				buttons[ i ].disabled = state !== 'idle';
				buttons[ i ].classList.toggle( 'is-added', state === 'added' );
				buttons[ i ].textContent = state === 'busy' ? 'Sumando…' : state === 'added' ? '✓ En el carrito' : ( pct ? 'Sumar con −' + pct + '%' : 'Sumar al carrito' );
			}
		}
		function addUpsell( id, kind ) {
			if ( added[ id ] ) { return; }
			markAdded( id, 'busy' );
			addToCart( id, { tgs_upsell: cfg.variant, tgs_upsell_kind: kind || 'setup' } )
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
				.then( function () {
					busy = false;
					// Ya está en el carrito: si el modal fallara por lo que sea, no se
					// vuelve a agregar (nada de reenviar el formulario): se va al carrito.
					try {
						build( Boolean( monitor ) );
					} catch ( err ) {
						if ( window.console ) { console.error( 'tgs upsell modal', err ); }
						window.location.href = cfg.cartUrl;
					}
				}, function ( err ) {
					busy = false;
					if ( window.console ) { console.warn( 'tgs upsell add_to_cart', err ); }
					fallback();
				} )
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
	ready( fixHeaderSpacer );

	// Barra flotante de compra (mobile): aparece después de scrollear el hero.
	ready( function () {
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
