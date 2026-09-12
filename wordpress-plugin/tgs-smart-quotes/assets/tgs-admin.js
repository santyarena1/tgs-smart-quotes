/**
 * Selector de monitores (Ajustes → Ficha de producto y Variantes).
 *
 * Buscador amplio propio (ver tgs_sq_ajax_search_products en admin.php):
 * texto por palabras sueltas en nombre y SKU, filtro por categoría y stock,
 * orden por precio/nombre/fecha, paginado. En los resultados se tildan
 * varios y se agregan de una. La lista de elegidos se ordena a mano (▲ ▼)
 * o de un golpe por precio/nombre; su orden es el orden en la ficha y se
 * manda como inputs ocultos (data-picker-name).
 */
(function () {
	'use strict';

	if (typeof window.tgsSqAdmin === 'undefined') {
		return;
	}
	var cfg = window.tgsSqAdmin;
	document.querySelectorAll('[data-tgs-monitor-picker]').forEach(initPicker);

	function esc(text) {
		return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
			return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
		});
	}

	function initPicker(root) {
		var inputName = root.getAttribute('data-picker-name') || 'monitor_products[]';
		// "Más elegido": uno por lista, va primero y con etiqueta en la ficha/modal.
		var featuredInput = root.querySelector('[data-picker-featured]');
		var $ = function (sel) { return root.querySelector(sel); };
		var input = $('[data-picker-search]');
		var category = $('[data-picker-category]');
		var sort = $('[data-picker-sort]');
		var inStock = $('[data-picker-instock]');
		var results = $('[data-picker-results]');
		var resultsList = $('[data-picker-results-list]');
		var countEl = $('[data-picker-count]');
		var moreBtn = $('[data-picker-more]');
		var addSelectedBtn = $('[data-picker-add-selected]');
		var list = $('[data-picker-list]');
		var empty = $('[data-picker-empty]');
		var chosenCount = $('[data-picker-chosen-count]');
		var timer = null;
		var products = {};
		var state = {page: 1, total: 0, key: ''};

		function chosenIds() {
			return Array.prototype.map.call(list.querySelectorAll('[data-picker-item]'), function (el) {
				return el.getAttribute('data-picker-item');
			});
		}

		function refresh() {
			var items = list.querySelectorAll('[data-picker-item]');
			empty.hidden = items.length > 0;
			chosenCount.textContent = String(items.length);
			if (featuredInput) {
				var stillThere = false;
				for (var s = 0; s < items.length; s++) {
					var on = items[s].getAttribute('data-picker-item') === featuredInput.value;
					items[s].classList.toggle('is-featured', on);
					var starBtn = items[s].querySelector('[data-star]');
					if (starBtn) { starBtn.classList.toggle('is-on', on); starBtn.title = on ? 'Es el "más elegido"' : 'Marcar como "más elegido"'; }
					if (on) { stillThere = true; }
				}
				if (!stillThere) { featuredInput.value = ''; }
			}
			for (var i = 0; i < items.length; i++) {
				items[i].querySelector('[data-move="up"]').disabled = i === 0;
				items[i].querySelector('[data-move="down"]').disabled = i === items.length - 1;
				items[i].querySelector('.tgs-picker__pos').textContent = String(i + 1);
			}
			updateSelectedCount();
		}

		function cardHtml(p, mode) {
			var stock = '<span class="tgs-chip tgs-chip--' + (p.inStock ? 'ok' : 'warn') + '">' + esc(p.stockLabel) + '</span>';
			var thumb = p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span class="tgs-picker__noimg">Sin foto</span>';
			var lead = mode === 'result' ? '<label class="tgs-picker__tick"><input type="checkbox" data-pick></label>' : '';
			var actions = mode === 'result'
				? '<button type="button" class="tgs-btn tgs-btn--small tgs-btn--primary" data-add>Agregar</button>'
				: '<span class="tgs-picker__pos"></span>'
					+ (featuredInput ? '<button type="button" class="tgs-btn tgs-btn--small tgs-picker__star" data-star title="Marcar como &quot;más elegido&quot;">★</button>' : '')
					+ '<button type="button" class="tgs-btn tgs-btn--small" data-move="up" title="Subir">▲</button>'
					+ '<button type="button" class="tgs-btn tgs-btn--small" data-move="down" title="Bajar">▼</button>'
					+ '<button type="button" class="tgs-btn tgs-btn--small tgs-btn--danger" data-remove title="Quitar">✕</button>'
					+ '<input type="hidden" name="' + esc(inputName) + '" value="' + esc(p.id) + '">';
			return '<div class="tgs-picker__card' + (mode === 'result' ? ' tgs-picker__card--result' : '') + '" data-picker-item="' + esc(p.id) + '" data-price="' + esc(p.price) + '" data-name="' + esc(p.name) + '">'
				+ lead
				+ '<span class="tgs-picker__media">' + thumb + '</span>'
				+ '<span class="tgs-picker__body">'
				+ '<a class="tgs-picker__name" href="' + esc(p.editUrl) + '" target="_blank" rel="noopener">' + esc(p.name) + '</a>'
				+ '<span class="tgs-picker__meta">' + (p.sku ? '<code>' + esc(p.sku) + '</code> · ' : '') + '<strong>' + p.priceHtml + '</strong> · ' + stock + '</span>'
				+ '</span>'
				+ '<span class="tgs-picker__actions">' + actions + '</span>'
				+ '</div>';
		}

		function renderResults(rows, append) {
			var chosen = chosenIds();
			var html = '';
			for (var i = 0; i < rows.length; i++) {
				products[String(rows[i].id)] = rows[i];
				if (chosen.indexOf(String(rows[i].id)) >= 0) { continue; }
				html += cardHtml(rows[i], 'result');
			}
			if (append) {
				resultsList.insertAdjacentHTML('beforeend', html);
			} else {
				resultsList.innerHTML = html || '<p class="tgs-picker__none">No hay productos simples publicados que coincidan. Probá con menos palabras o destildá "Solo con stock".</p>';
			}
			var shown = resultsList.querySelectorAll('[data-picker-item]').length;
			countEl.textContent = state.total + ' resultado' + (state.total === 1 ? '' : 's') + (shown < state.total ? ' · mostrando ' + shown : '');
			moreBtn.hidden = state.page * 30 >= state.total;
			results.hidden = false;
			updateSelectedCount();
		}

		function search(append) {
			var key = JSON.stringify([input.value.trim(), category.value, sort.value, inStock.checked]);
			if (!append) {
				state.page = 1;
				state.key = key;
				resultsList.innerHTML = '<p class="tgs-picker__none">Buscando…</p>';
				results.hidden = false;
			} else {
				state.page += 1;
			}
			var body = new URLSearchParams({
				action: 'tgs_sq_search_products', nonce: cfg.nonce,
				q: input.value.trim(), category: category.value, sort: sort.value,
				in_stock: inStock.checked ? '1' : '', page: String(state.page)
			});
			fetch(cfg.ajaxUrl, {method: 'POST', credentials: 'same-origin', body: body})
				.then(function (r) { return r.json(); })
				.then(function (data) {
					if (!append && key !== state.key) { return; }
					var payload = data && data.success ? data.data : {rows: [], total: 0};
					state.total = payload.total || 0;
					renderResults(payload.rows || [], append);
				})
				.catch(function () {
					resultsList.innerHTML = '<p class="tgs-picker__none">No se pudo buscar. Probá de nuevo.</p>';
				});
		}

		function addProduct(id) {
			var p = products[String(id)];
			if (!p || chosenIds().indexOf(String(id)) >= 0) { return; }
			list.insertAdjacentHTML('beforeend', cardHtml(p, 'chosen'));
			var el = resultsList.querySelector('[data-picker-item="' + id + '"]');
			if (el) { el.remove(); }
		}

		function updateSelectedCount() {
			var n = resultsList.querySelectorAll('[data-pick]:checked').length;
			addSelectedBtn.disabled = n === 0;
			addSelectedBtn.textContent = 'Agregar tildados (' + n + ')';
		}

		function sortChosen(mode) {
			var items = Array.prototype.slice.call(list.querySelectorAll('[data-picker-item]'));
			items.sort(function (a, b) {
				if (mode === 'name') { return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'), 'es'); }
				var pa = parseFloat(a.getAttribute('data-price')) || 0;
				var pb = parseFloat(b.getAttribute('data-price')) || 0;
				return mode === 'price_desc' ? pb - pa : pa - pb;
			});
			items.forEach(function (el) { list.appendChild(el); });
			refresh();
		}

		// --- eventos: buscador ---
		input.addEventListener('input', function () {
			clearTimeout(timer);
			timer = setTimeout(function () { search(false); }, 300);
		});
		input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') { e.preventDefault(); search(false); }
			if (e.key === 'Escape') { results.hidden = true; }
		});
		category.addEventListener('change', function () { search(false); });
		sort.addEventListener('change', function () { search(false); });
		inStock.addEventListener('change', function () { search(false); });
		$('[data-picker-go]').addEventListener('click', function () { search(false); });
		moreBtn.addEventListener('click', function () { search(true); });
		$('[data-picker-close]').addEventListener('click', function () { results.hidden = true; });
		$('[data-picker-select-all]').addEventListener('click', function () {
			var ticks = resultsList.querySelectorAll('[data-pick]');
			var all = Array.prototype.every.call(ticks, function (t) { return t.checked; });
			ticks.forEach(function (t) { t.checked = !all; });
			updateSelectedCount();
		});
		addSelectedBtn.addEventListener('click', function () {
			var ids = Array.prototype.map.call(resultsList.querySelectorAll('[data-pick]:checked'), function (t) {
				return t.closest('[data-picker-item]').getAttribute('data-picker-item');
			});
			ids.forEach(addProduct);
			refresh();
		});
		resultsList.addEventListener('change', function (e) {
			if (e.target.matches('[data-pick]')) { updateSelectedCount(); }
		});
		resultsList.addEventListener('click', function (e) {
			var btn = e.target.closest('[data-add]');
			if (!btn) { return; }
			addProduct(btn.closest('[data-picker-item]').getAttribute('data-picker-item'));
			refresh();
		});

		// --- eventos: lista de elegidos ---
		list.addEventListener('click', function (e) {
			var el = e.target.closest('[data-picker-item]');
			if (!el) { return; }
			if (e.target.closest('[data-remove]')) {
				el.remove();
				refresh();
				return;
			}
			if (e.target.closest('[data-star]') && featuredInput) {
				var id = el.getAttribute('data-picker-item');
				featuredInput.value = featuredInput.value === id ? '' : id;
				refresh();
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
		root.querySelectorAll('[data-picker-sort-chosen]').forEach(function (btn) {
			btn.addEventListener('click', function () { sortChosen(btn.getAttribute('data-picker-sort-chosen')); });
		});
		$('[data-picker-clear]').addEventListener('click', function () {
			if (!list.querySelector('[data-picker-item]') || !window.confirm('¿Quitar todos los monitores elegidos?')) { return; }
			list.innerHTML = '';
			refresh();
		});

		refresh();
	}
})();
