/**
 * Selector de monitores (Ajustes → Ficha de producto).
 *
 * Buscador propio (ver tgs_sq_ajax_search_products en admin.php): busca por
 * palabras sueltas en nombre y SKU, muestra foto, precio y stock, y arma una
 * lista ordenable. El orden de la lista es el orden en que se muestran en la
 * ficha; se manda como inputs ocultos monitor_products[].
 */
(function () {
	'use strict';

	var root = document.querySelector('[data-tgs-monitor-picker]');
	if (!root || typeof window.tgsSqAdmin === 'undefined') {
		return;
	}
	var cfg = window.tgsSqAdmin;
	var input = root.querySelector('[data-picker-search]');
	var results = root.querySelector('[data-picker-results]');
	var list = root.querySelector('[data-picker-list]');
	var empty = root.querySelector('[data-picker-empty]');
	var timer = null;
	var lastQuery = '';

	function esc(text) {
		return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
			return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
		});
	}

	function chosenIds() {
		return Array.prototype.map.call(list.querySelectorAll('[data-picker-item]'), function (el) {
			return el.getAttribute('data-picker-item');
		});
	}

	function refresh() {
		var items = list.querySelectorAll('[data-picker-item]');
		empty.hidden = items.length > 0;
		for (var i = 0; i < items.length; i++) {
			items[i].querySelector('[data-move="up"]').disabled = i === 0;
			items[i].querySelector('[data-move="down"]').disabled = i === items.length - 1;
			items[i].querySelector('.tgs-picker__pos').textContent = String(i + 1);
		}
	}

	function card(p, mode) {
		var stock = p.inStock ? '<span class="tgs-chip tgs-chip--ok">' + esc(p.stockLabel) + '</span>' : '<span class="tgs-chip tgs-chip--warn">' + esc(p.stockLabel) + '</span>';
		var thumb = p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span class="tgs-picker__noimg">Sin foto</span>';
		var actions = mode === 'result'
			? '<button type="button" class="tgs-btn tgs-btn--small tgs-btn--primary" data-add>Agregar</button>'
			: '<span class="tgs-picker__pos"></span>'
				+ '<button type="button" class="tgs-btn tgs-btn--small" data-move="up" title="Subir">▲</button>'
				+ '<button type="button" class="tgs-btn tgs-btn--small" data-move="down" title="Bajar">▼</button>'
				+ '<button type="button" class="tgs-btn tgs-btn--small tgs-btn--danger" data-remove title="Quitar">✕</button>'
				+ '<input type="hidden" name="monitor_products[]" value="' + esc(p.id) + '">';
		return '<div class="tgs-picker__card" data-picker-item="' + esc(p.id) + '">'
			+ '<span class="tgs-picker__media">' + thumb + '</span>'
			+ '<span class="tgs-picker__body">'
			+ '<a class="tgs-picker__name" href="' + esc(p.editUrl) + '" target="_blank" rel="noopener">' + esc(p.name) + '</a>'
			+ '<span class="tgs-picker__meta">' + (p.sku ? '<code>' + esc(p.sku) + '</code> · ' : '') + '<strong>' + p.priceHtml + '</strong> · ' + stock + '</span>'
			+ '</span>'
			+ '<span class="tgs-picker__actions">' + actions + '</span>'
			+ '</div>';
	}

	function render(products) {
		var chosen = chosenIds();
		var html = '';
		for (var i = 0; i < products.length; i++) {
			if (chosen.indexOf(String(products[i].id)) >= 0) {
				continue;
			}
			html += card(products[i], 'result');
		}
		results.innerHTML = html || '<p class="tgs-picker__none">No se encontraron productos simples publicados con ese texto.</p>';
		results.hidden = false;
		results._products = products;
	}

	function search(query) {
		lastQuery = query;
		if (query.length < 2) {
			results.hidden = true;
			return;
		}
		results.innerHTML = '<p class="tgs-picker__none">Buscando…</p>';
		results.hidden = false;
		var body = new URLSearchParams({action: 'tgs_sq_search_products', nonce: cfg.nonce, q: query});
		fetch(cfg.ajaxUrl, {method: 'POST', credentials: 'same-origin', body: body})
			.then(function (r) { return r.json(); })
			.then(function (data) {
				if (query !== lastQuery) { return; }
				render(data && data.success ? data.data : []);
			})
			.catch(function () {
				results.innerHTML = '<p class="tgs-picker__none">No se pudo buscar. Probá de nuevo.</p>';
			});
	}

	input.addEventListener('input', function () {
		clearTimeout(timer);
		var q = input.value.trim();
		timer = setTimeout(function () { search(q); }, 250);
	});
	input.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') { e.preventDefault(); search(input.value.trim()); }
		if (e.key === 'Escape') { results.hidden = true; }
	});

	results.addEventListener('click', function (e) {
		var btn = e.target.closest('[data-add]');
		if (!btn) { return; }
		var el = btn.closest('[data-picker-item]');
		var id = el.getAttribute('data-picker-item');
		var product = null;
		for (var i = 0; i < (results._products || []).length; i++) {
			if (String(results._products[i].id) === id) { product = results._products[i]; }
		}
		if (!product) { return; }
		list.insertAdjacentHTML('beforeend', card(product, 'chosen'));
		el.remove();
		refresh();
	});

	list.addEventListener('click', function (e) {
		var el = e.target.closest('[data-picker-item]');
		if (!el) { return; }
		if (e.target.closest('[data-remove]')) {
			el.remove();
			refresh();
			if (!results.hidden && lastQuery) { search(lastQuery); }
			return;
		}
		var move = e.target.closest('[data-move]');
		if (!move) { return; }
		if (move.getAttribute('data-move') === 'up' && el.previousElementSibling) {
			el.parentNode.insertBefore(el, el.previousElementSibling);
		} else if (move.getAttribute('data-move') === 'down' && el.nextElementSibling) {
			el.parentNode.insertBefore(el.nextElementSibling, el);
		}
		refresh();
	});

	document.addEventListener('click', function (e) {
		if (!root.contains(e.target)) { results.hidden = true; }
	});

	refresh();
})();
