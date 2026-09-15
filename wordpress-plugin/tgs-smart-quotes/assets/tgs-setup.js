/**
 * "Potenciá tu setup" + guía de la ficha (ver includes/setup.php).
 *
 *  - Pestañas por categoría y tarjetas que se marcan/desmarcan.
 *  - Los extras elegidos van al campo oculto del formulario de compra y a
 *    los links ?add-to-cart= (barra flotante): el servidor los suma con la PC.
 *  - Barra de fuego: N extras × % por producto; ahorro sobre los extras (y
 *    la PC si la variante lo tiene prendido). Es solo informativa: el
 *    descuento real lo calcula el carrito (woocommerce_cart_calculate_fees).
 *  - Al agregar al carrito (por AJAX) se muestra un aviso corto con el ahorro
 *    y los botones de checkout; si el AJAX falla, el formulario sigue solo.
 *  - Guía: rail con scroll-spy en escritorio; en celular, botón que abre la
 *    misma lista como hoja inferior.
 */
(function () {
	'use strict';

	function ready( fn ) {
		var done = false;
		function run() { if ( ! done ) { done = true; fn(); } }
		if ( document.readyState !== 'loading' ) { run(); return; }
		document.addEventListener( 'DOMContentLoaded', run );
		window.addEventListener( 'load', run );
		setTimeout( function () { if ( document.readyState !== 'loading' ) { run(); } }, 1500 );
	}
	function esc( text ) {
		return String( text == null ? '' : text ).replace( /[&<>"']/g, function ( c ) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ];
		} );
	}
	function moneyFormatter( currency ) {
		var formatter = null;
		try { formatter = new Intl.NumberFormat( 'es-AR', { style: 'currency', currency: currency || 'ARS', maximumFractionDigits: 0 } ); } catch ( e ) { formatter = null; }
		return function ( value ) { return formatter ? formatter.format( value ) : '$ ' + Math.round( value ).toLocaleString( 'es-AR' ); };
	}

	/* ------------------------------------------------------------------ */
	/* Sección "Potenciá tu setup"                                         */
	/* ------------------------------------------------------------------ */
	ready( function () {
		var dataEl = document.getElementById( 'tgs-setup-data' );
		if ( ! dataEl ) { return; }
		// Sin sección (variante solo con combos) se usa un nodo suelto: todas
		// las búsquedas dan vacío y el resto del módulo sigue funcionando.
		var section = document.querySelector( '[data-tgs-setup]' ) || document.createElement( 'div' );
		var cfg;
		try { cfg = JSON.parse( dataEl.textContent || 'null' ); } catch ( e ) { return; }
		if ( ! cfg ) { return; }
		var money = moneyFormatter( cfg.currency );
		var selected = {}; // id -> { name, price, group }
		var order = [];    // ids en el orden en que se eligieron

		// --- Pestañas ---
		var tabs = section.querySelectorAll( '[data-setup-tab]' );
		var panels = section.querySelectorAll( '[data-setup-panel]' );
		function showTab( key ) {
			var i;
			for ( i = 0; i < tabs.length; i++ ) {
				var on = tabs[ i ].getAttribute( 'data-setup-tab' ) === key;
				tabs[ i ].classList.toggle( 'is-active', on );
				tabs[ i ].setAttribute( 'aria-selected', on ? 'true' : 'false' );
			}
			for ( i = 0; i < panels.length; i++ ) { panels[ i ].hidden = panels[ i ].getAttribute( 'data-setup-panel' ) !== key; }
		}
		for ( var t = 0; t < tabs.length; t++ ) {
			( function ( tab ) { tab.addEventListener( 'click', function () { showTab( tab.getAttribute( 'data-setup-tab' ) ); } ); } )( tabs[ t ] );
		}

		// --- Cálculo ---
		function count() { return order.length; }
		function pct() { return count() * ( cfg.pct || 0 ); }
		function extrasSum() { var s = 0; order.forEach( function ( id ) { s += selected[ id ].price; } ); return s; }
		function base() { return extrasSum() + ( cfg.applyPc ? cfg.pcPrice : 0 ); }
		function savings() { return Math.round( base() * pct() / 100 ); }
		function total() { return cfg.pcPrice + extrasSum() - savings(); }

		// --- Campo oculto + links de la barra flotante ---
		function setParam( href, ids ) {
			var clean = href.replace( /([?&])tgs_addon_extras=[^&]*(&|$)/, function ( m, sep, tail ) { return tail ? sep : ''; } );
			if ( ! ids ) { return clean; }
			return clean + ( clean.indexOf( '?' ) >= 0 ? '&' : '?' ) + 'tgs_addon_extras=' + encodeURIComponent( ids );
		}
		function syncForm() {
			var ids = order.join( ',' );
			var inputs = document.querySelectorAll( '[data-tgs-addon-extras]' );
			for ( var i = 0; i < inputs.length; i++ ) { inputs[ i ].value = ids; }
			var links = document.querySelectorAll( 'a[href*="add-to-cart="]' );
			for ( var j = 0; j < links.length; j++ ) { links[ j ].setAttribute( 'href', setParam( links[ j ].getAttribute( 'href' ), ids ) ); }
		}

		// --- Barra de fuego (sección + guía) ---
		var fireFill = section.querySelector( '[data-fire-fill]' );
		var firePct = section.querySelector( '[data-fire-pct]' );
		var fireHint = section.querySelector( '[data-fire-hint]' );
		var fireBox = section.querySelector( '[data-tgs-fire]' );
		var guideFire = document.querySelector( '[data-guide-fire]' );
		var guideFireText = document.querySelector( '[data-guide-fire-text]' );
		function renderFire() {
			var n = count();
			var p = pct();
			var save = savings();
			// La barra se llena de a pasos; a partir de 8 extras queda al tope.
			if ( fireFill ) { fireFill.style.width = Math.min( 100, ( n / 8 ) * 100 ) + '%'; }
			if ( firePct ) { firePct.textContent = '−' + p + '%'; }
			if ( fireBox ) {
				fireBox.classList.toggle( 'is-on', n > 0 );
				fireBox.classList.toggle( 'is-hot', n >= 3 );
				fireBox.classList.toggle( 'is-blazing', n >= 6 );
			}
			if ( fireHint ) {
				fireHint.textContent = n
					? ( n === 1 ? '1 extra' : n + ' extras' ) + ' · ahorrás ' + money( save ) + ( cfg.applyPc ? ' (aplica a la PC también)' : '' ) + ' · el próximo suma +' + cfg.pct + '%'
					: 'Sumá un extra y arrancá con ' + cfg.pct + '% de descuento.';
			}
			if ( guideFire ) {
				guideFire.hidden = ! n;
				if ( guideFireText ) { guideFireText.textContent = '🔥 −' + p + '% · ahorrás ' + money( save ); }
			}
			// Contador por pestaña.
			for ( var i = 0; i < tabs.length; i++ ) {
				var key = tabs[ i ].getAttribute( 'data-setup-tab' );
				var c = order.filter( function ( id ) { return selected[ id ].group === key; } ).length;
				var badge = tabs[ i ].querySelector( '[data-setup-tab-count]' );
				if ( badge ) { badge.hidden = ! c; badge.textContent = String( c ); }
			}
		}

		// --- Resumen ---
		var summary = section.querySelector( '[data-setup-summary]' );
		var summaryList = section.querySelector( '[data-setup-summary-list]' );
		function renderSummary() {
			if ( ! summary ) { return; }
			var n = count();
			summary.hidden = ! n;
			if ( ! n ) { return; }
			summaryList.innerHTML = order.map( function ( id ) {
				var it = selected[ id ];
				return '<span class="tgs-setup__chip"><b>' + esc( it.name ) + '</b> ' + esc( money( it.price ) ) + ' <button type="button" class="tgs-setup__chip-x" data-setup-remove="' + esc( id ) + '" aria-label="Quitar">✕</button></span>';
			} ).join( '' );
			var set = function ( sel, text ) { var el = section.querySelector( sel ); if ( el ) { el.textContent = text; } };
			set( '[data-setup-sum-pc]', money( cfg.pcPrice ) );
			set( '[data-setup-sum-extras]', money( extrasSum() ) );
			set( '[data-setup-sum-off]', money( savings() ) + ' (−' + pct() + '%)' );
			set( '[data-setup-sum-total]', money( total() ) );
		}
		section.addEventListener( 'click', function ( e ) {
			var x = e.target.closest( '[data-setup-remove]' );
			if ( x ) { toggle( x.getAttribute( 'data-setup-remove' ) ); }
		} );

		// --- Barra de compra (precio grande = total, mini barra arriba) ---
		var barPriceEls = document.querySelectorAll( '.gx-buybar__value, .tgs-sticky-price' );
		var barPriceOriginal = Array.prototype.map.call( barPriceEls, function ( el ) { return el.innerHTML; } );
		var barFinEls = document.querySelectorAll( '.gx-barfin__line' );
		var barFinOriginal = Array.prototype.map.call( barFinEls, function ( el ) { return el.innerHTML; } );
		function renderBar() {
			var bars = document.querySelectorAll( '.gx-buybar' ).length ? document.querySelectorAll( '.gx-buybar' ) : document.querySelectorAll( '.tgs-sticky' );
			var i;
			document.querySelectorAll( '.tgs-minibar' ).forEach( function ( el ) { el.remove(); } );
			var n = count();
			if ( ! n ) {
				for ( i = 0; i < barPriceEls.length; i++ ) { barPriceEls[ i ].innerHTML = barPriceOriginal[ i ]; }
				for ( i = 0; i < barFinEls.length; i++ ) { barFinEls[ i ].innerHTML = barFinOriginal[ i ]; }
				return;
			}
			var tot = total();
			var cuota = '';
			if ( cfg.bestN > 0 ) {
				// Las cuotas se calculan sobre el precio de lista de la PC + extras, menos el descuento.
				var listTotal = cfg.pcList + extrasSum() - savings();
				var per = ( listTotal * ( 1 + cfg.bestBps / 10000 ) ) / cfg.bestN;
				cuota = cfg.bestN + ' cuotas' + ( cfg.bestBps === 0 ? ' sin interés' : '' ) + ' de ' + money( per );
			}
			for ( i = 0; i < barPriceEls.length; i++ ) { barPriceEls[ i ].textContent = money( tot ); }
			for ( i = 0; i < barFinEls.length; i++ ) { if ( cuota ) { barFinEls[ i ].textContent = cuota; } }
			var html = '<div class="tgs-minibar tgs-minibar--fire" role="status">'
				+ '<span class="tgs-minibar__full"><strong>🔥 Total ' + esc( money( tot ) ) + '</strong>'
				+ ( cuota ? ' <em>· ' + esc( cuota ) + '</em>' : '' )
				+ ' <i>—</i> ' + n + ( n === 1 ? ' extra' : ' extras' ) + ' <b>−' + pct() + '%</b> · ahorrás ' + esc( money( savings() ) ) + '</span>'
				+ '<span class="tgs-minibar__short">🔥 ' + n + ( n === 1 ? ' extra' : ' extras' ) + ' · <b>−' + pct() + '%</b> · ahorrás ' + esc( money( savings() ) ) + '</span>'
				+ '</div>';
			for ( i = 0; i < bars.length; i++ ) { bars[ i ].insertAdjacentHTML( 'afterbegin', html ); }
		}

		// --- Elegir / quitar ---
		var picks = section.querySelectorAll( '[data-setup-id]' );
		function toggle( id ) {
			if ( selected[ id ] ) {
				delete selected[ id ];
				order = order.filter( function ( x ) { return x !== id; } );
			} else {
				var pick = section.querySelector( '[data-setup-id="' + id + '"]' );
				if ( ! pick ) { return; }
				selected[ id ] = { name: pick.getAttribute( 'data-setup-name' ) || '', price: parseFloat( pick.getAttribute( 'data-setup-price' ) ) || 0, group: pick.getAttribute( 'data-setup-group' ) || '' };
				order.push( id );
			}
			for ( var i = 0; i < picks.length; i++ ) {
				var on = !! selected[ picks[ i ].getAttribute( 'data-setup-id' ) ];
				picks[ i ].classList.toggle( 'is-selected', on );
				picks[ i ].setAttribute( 'aria-pressed', on ? 'true' : 'false' );
			}
			syncForm();
			renderFire();
			renderSummary();
			renderBar();
		}
		for ( var p = 0; p < picks.length; p++ ) {
			( function ( pick ) { pick.addEventListener( 'click', function () { toggle( pick.getAttribute( 'data-setup-id' ) ); } ); } )( picks[ p ] );
		}
		renderFire();

		// --- Agregar al carrito por AJAX + aviso ---
		if ( ! window.fetch ) { return; }
		function addToCart( productId, extra ) {
			var body = new URLSearchParams( { product_id: String( productId ), quantity: '1' } );
			Object.keys( extra || {} ).forEach( function ( k ) { if ( extra[ k ] ) { body.set( k, extra[ k ] ); } } );
			return fetch( cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body, headers: { 'X-Requested-With': 'XMLHttpRequest' } } )
				.then( function ( r ) { return r.json(); } )
				.then( function ( json ) {
					if ( ! json || json.error ) { throw new Error( 'add_to_cart_failed' ); }
					if ( window.jQuery && json.fragments ) {
						try { window.jQuery( document.body ).trigger( 'added_to_cart', [ json.fragments, json.cart_hash ] ); } catch ( e ) { /* el tema no puede frenar el aviso */ }
					}
					return json;
				} );
		}
		var overlay = null;
		function closeDone() {
			if ( ! overlay ) { return; }
			overlay.remove();
			overlay = null;
			document.body.classList.remove( 'tgs-up-open' );
		}
		// Combos (BLOCK-10 etapa 3): si no eligió extras, el aviso ofrece los
		// packs armados desde TGS. Cada uno entra al carrito con tgs_combo_from
		// (la PC recién agregada), que es lo que habilita a los ocultos.
		var comboAdded = {};
		function comboCard( c ) {
			return '<article class="tgs-combo-card">'
				+ '<span class="tgs-combo-card__media">' + ( c.image ? '<img src="' + esc( c.image ) + '" alt="" loading="lazy">' : '' ) + ( c.pct ? '<b class="tgs-combo-card__pct">−' + esc( String( c.pct ).replace( /\.0$/, '' ) ) + '%</b>' : '' ) + '</span>'
				+ '<span class="tgs-combo-card__body">'
				+ '<span class="tgs-combo-card__name">' + esc( c.name ) + '</span>'
				+ ( c.items && c.items.length ? '<span class="tgs-combo-card__items">' + esc( c.items.join( ' + ' ) ) + '</span>' : ( c.tagline ? '<span class="tgs-combo-card__items">' + esc( c.tagline ) + '</span>' : '' ) )
				+ '<span class="tgs-combo-card__price">' + ( c.regularHtml ? '<s>' + esc( c.regularHtml ) + '</s> ' : '' ) + '<strong>' + esc( c.priceHtml ) + '</strong></span>'
				+ '<span class="tgs-combo-card__actions">'
				+ '<button type="button" class="tgs-up__btn tgs-up__btn--primary tgs-combo-card__add" data-combo-add="' + esc( c.id ) + '">Sumar al carrito</button>'
				+ ( c.hidden ? '' : '<a class="tgs-combo-card__link" href="' + esc( c.url ) + '" target="_blank" rel="noopener">Ver combo</a>' )
				+ '</span></span></article>';
		}
		function markCombo( id, state ) {
			var buttons = overlay ? overlay.querySelectorAll( '[data-combo-add="' + id + '"]' ) : [];
			for ( var i = 0; i < buttons.length; i++ ) {
				buttons[ i ].disabled = state !== 'idle';
				buttons[ i ].classList.toggle( 'is-added', state === 'added' );
				buttons[ i ].textContent = state === 'busy' ? 'Sumando…' : state === 'added' ? '✓ En el carrito' : 'Sumar al carrito';
			}
		}
		function addCombo( id ) {
			if ( comboAdded[ id ] ) { return; }
			markCombo( id, 'busy' );
			addToCart( id, { tgs_combo_from: String( cfg.productId ) } )
				.then( function () { comboAdded[ id ] = true; markCombo( id, 'added' ); } )
				.catch( function () { markCombo( id, 'idle' ); } );
		}
		function showDone() {
			var n = count();
			var combos = ! n && cfg.combos && cfg.combos.items && cfg.combos.items.length ? cfg.combos : null;
			var html = '<div class="tgs-done' + ( combos ? ' tgs-done--combos' : '' ) + '" role="dialog" aria-modal="true" aria-label="' + esc( cfg.doneTitle || 'Ya está en tu carrito' ) + '">'
				+ '<div class="tgs-done__box">'
				+ '<button type="button" class="tgs-done__close" data-done-close aria-label="Cerrar">✕</button>'
				+ '<span class="tgs-done__check">✓</span>'
				+ '<h2 class="tgs-done__title">' + esc( cfg.doneTitle || '¡Ya está en tu carrito!' ) + '</h2>'
				+ '<p class="tgs-done__pc">' + esc( cfg.pcTitle ) + ( n ? ' + ' + n + ( n === 1 ? ' extra' : ' extras' ) : '' ) + '</p>'
				+ ( n ? '<p class="tgs-done__fire">🔥 Descuento setup <b>−' + pct() + '%</b> · ahorrás <b>' + esc( money( savings() ) ) + '</b></p>' : '' )
				+ ( ! combos && cfg.doneText ? '<p class="tgs-done__text">' + esc( cfg.doneText ) + '</p>' : '' )
				+ ( combos
					? '<div class="tgs-combos">'
						+ '<h3 class="tgs-combos__title">' + esc( combos.headline || 'Completá tu setup con un combo' ) + '</h3>'
						+ ( combos.text ? '<p class="tgs-combos__text">' + esc( combos.text ) + '</p>' : '' )
						+ '<div class="tgs-combos__grid">' + combos.items.map( comboCard ).join( '' ) + '</div>'
						+ '</div>'
					: '' )
				+ '<div class="tgs-done__actions">'
				+ '<a class="tgs-up__btn tgs-up__btn--primary" href="' + esc( cfg.checkoutUrl ) + '">Finalizar compra →</a>'
				+ '<a class="tgs-up__btn tgs-up__btn--ghost" href="' + esc( cfg.cartUrl ) + '">Ver carrito</a>'
				+ '<button type="button" class="tgs-up__btn tgs-up__btn--link" data-done-close>Seguir viendo</button>'
				+ '</div>'
				+ '</div></div>';
			var wrap = document.createElement( 'div' );
			wrap.innerHTML = html;
			overlay = wrap.firstChild;
			document.body.appendChild( overlay );
			document.body.classList.add( 'tgs-up-open' );
			overlay.addEventListener( 'click', function ( e ) {
				if ( e.target === overlay || e.target.closest( '[data-done-close]' ) ) { closeDone(); return; }
				var add = e.target.closest( '[data-combo-add]' );
				if ( add ) { addCombo( add.getAttribute( 'data-combo-add' ) ); }
			} );
			document.addEventListener( 'keydown', function onKey( e ) { if ( e.key === 'Escape' ) { closeDone(); document.removeEventListener( 'keydown', onKey ); } } );
		}
		var busy = false;
		function addPcThenNotify( fallback ) {
			if ( busy ) { return; }
			busy = true;
			var buttons = document.querySelectorAll( 'form.cart button[type="submit"], .tgs-sticky a.button' );
			for ( var i = 0; i < buttons.length; i++ ) { buttons[ i ].classList.add( 'is-loading' ); }
			addToCart( cfg.productId, { tgs_addon_extras: order.join( ',' ) } )
				.then( function () {
					busy = false;
					try { showDone(); } catch ( err ) { window.location.href = cfg.cartUrl; }
				}, function ( err ) {
					busy = false;
					if ( window.console ) { console.warn( 'tgs setup add_to_cart', err ); }
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
					addPcThenNotify( function () { form.setAttribute( 'data-tgs-bypass', '1' ); form.submit(); } );
				} );
			} )( forms[ f ] );
		}
		var links = document.querySelectorAll( 'a[href*="add-to-cart="]' );
		for ( var l = 0; l < links.length; l++ ) {
			( function ( link ) {
				link.addEventListener( 'click', function ( e ) {
					e.preventDefault();
					addPcThenNotify( function () { window.location.href = link.getAttribute( 'href' ); } );
				} );
			} )( links[ l ] );
		}
	} );

	/* ------------------------------------------------------------------ */
	/* Guía de la ficha                                                    */
	/* ------------------------------------------------------------------ */
	ready( function () {
		var nav = document.querySelector( '[data-tgs-guide-nav]' );
		var fab = document.querySelector( '[data-guide-open]' );
		if ( ! nav ) { if ( fab ) { fab.remove(); } return; }
		var links = nav.querySelectorAll( '[data-guide-target]' );
		var targets = [];
		for ( var i = 0; i < links.length; i++ ) {
			var el = document.getElementById( links[ i ].getAttribute( 'data-guide-target' ) );
			if ( el ) { targets.push( { link: links[ i ], el: el } ); }
		}
		function headerOffset() {
			var header = document.getElementById( 'page-header' );
			return ( header ? header.offsetHeight : 0 ) + 16;
		}
		function go( id ) {
			var el = document.getElementById( id );
			if ( ! el ) { return; }
			var top = el.getBoundingClientRect().top + window.pageYOffset - headerOffset();
			window.scrollTo( { top: Math.max( 0, top ), behavior: 'smooth' } );
		}
		nav.addEventListener( 'click', function ( e ) {
			var link = e.target.closest( '[data-guide-target]' );
			if ( ! link ) { return; }
			e.preventDefault();
			go( link.getAttribute( 'data-guide-target' ) );
			closeSheet();
		} );
		// Scroll-spy: la sección que pasa la mitad de la pantalla es la activa.
		function spy() {
			var y = window.pageYOffset + window.innerHeight * 0.4;
			var active = null;
			for ( var j = 0; j < targets.length; j++ ) {
				if ( targets[ j ].el.offsetTop <= y ) { active = targets[ j ]; }
			}
			for ( var k = 0; k < targets.length; k++ ) { targets[ k ].link.classList.toggle( 'is-active', targets[ k ] === active ); }
		}
		var ticking = false;
		window.addEventListener( 'scroll', function () {
			if ( ticking ) { return; }
			ticking = true;
			window.requestAnimationFrame( function () { spy(); ticking = false; } );
		} );
		spy();
		// Celular: la misma guía como hoja inferior.
		function openSheet() { nav.classList.add( 'is-open' ); document.body.classList.add( 'tgs-guide-open' ); }
		function closeSheet() { nav.classList.remove( 'is-open' ); document.body.classList.remove( 'tgs-guide-open' ); }
		if ( fab ) { fab.addEventListener( 'click', function () { if ( nav.classList.contains( 'is-open' ) ) { closeSheet(); } else { openSheet(); } } ); }
		document.addEventListener( 'click', function ( e ) {
			if ( nav.classList.contains( 'is-open' ) && ! nav.contains( e.target ) && ! ( fab && fab.contains( e.target ) ) ) { closeSheet(); }
		} );
		document.addEventListener( 'keydown', function ( e ) { if ( e.key === 'Escape' ) { closeSheet(); } } );
	} );
})();
