"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatArs } from "../lib/money";
import type { Combo, Product } from "../lib/types";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Pill,
  SearchInput,
  Stat,
  StatStrip,
  errorMessage,
  useKeyboardNav,
} from "./shared";

type DraftItem = {
  key: string;
  productId: string;
  name: string;
  quantity: string;
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  items: DraftItem[];
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  active: true,
  items: [],
});

export function CombosView() {
  const [items, setItems] = useState<Combo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [productQuery, setProductQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [combos, catalog] = await Promise.all([
        api<Combo[]>("/combos"),
        api<Product[]>("/products").catch(() => [] as Product[]),
      ]);
      setItems(combos);
      setProducts(catalog.filter((p) => p.active));
    } catch (err) {
      setError(errorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((c) => {
      if (!showInactive && !c.active) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
    });
  }, [items, filter, showInactive]);

  const productMatches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(draft.items.map((i) => i.productId));
    return products
      .filter((p) => !taken.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [productQuery, products, draft.items]);

  const {
    activeIndex: productActive,
    setActiveIndex: setProductActive,
    onKeyDown: onProductKeyDown,
  } = useKeyboardNav({
    itemCount: productMatches.length,
    enabled: editOpen && productMatches.length > 0,
    resetKey: productQuery,
    onSelect: (index) => {
      const p = productMatches[index];
      if (p) addProduct(p);
    },
    onEscape: () => setProductQuery(""),
  });

  function openNew() {
    setDraft(emptyDraft());
    setProductQuery("");
    setEditOpen(true);
  }

  function openEdit(combo: Combo) {
    setDraft({
      id: combo.id,
      name: combo.name,
      description: combo.description ?? "",
      active: combo.active,
      items: [...combo.items]
        .sort((a, b) => a.position - b.position)
        .map((row) => ({
          key: crypto.randomUUID(),
          productId: row.productId,
          name: row.product?.name ?? "Producto",
          quantity: String(row.quantity),
        })),
    });
    setProductQuery("");
    setEditOpen(true);
  }

  function addProduct(product: Product) {
    setDraft((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          quantity: "1",
        },
      ],
    }));
    setProductQuery("");
  }

  function removeDraftItem(key: string) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.key !== key),
    }));
  }

  function setQty(key: string, quantity: string) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, quantity } : i)),
    }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft.items.length) {
      setError("Agregá al menos un producto al combo");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        active: draft.active,
        items: draft.items.map((row, position) => ({
          productId: row.productId,
          quantity: Math.max(1, Number(row.quantity) || 1),
          position,
        })),
      };
      if (draft.id) {
        await api(`/combos/${draft.id}`, { method: "PUT", body });
        setNotice("Combo actualizado");
      } else {
        await api("/combos", { method: "POST", body });
        setNotice("Combo creado");
      }
      setEditOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(combo: Combo) {
    if (!window.confirm(`¿Desactivar el combo “${combo.name}”?`)) return;
    setError(null);
    try {
      await api(`/combos/${combo.id}`, { method: "DELETE" });
      setNotice("Combo desactivado");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const activeCount = items.filter((c) => c.active).length;

  return (
    <div>
      <PageHeader
        title="Combos"
        subtitle="Agrupá productos frecuentes. En el presupuesto se expanden como ítems individuales."
        actions={
          <button type="button" onClick={openNew}>
            + Nuevo combo
          </button>
        }
      />

      <StatStrip>
        <Stat label="Combos" value={String(items.length)} />
        <Stat label="Activos" value={String(activeCount)} />
      </StatStrip>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="toolbar">
        <SearchInput
          value={filter}
          onChange={setFilter}
          placeholder="Buscar combo…"
        />
        <Checkbox
          checked={showInactive}
          onChange={setShowInactive}
          label="Mostrar inactivos"
        />
      </div>

      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState icon="⊞" title="Sin combos">
          Creá un combo con varios productos para agregarlos de un toque al presupuesto.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Productos</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((combo) => (
                <tr key={combo.id}>
                  <td>
                    <strong>{combo.name}</strong>
                    {combo.description ? (
                      <span className="cell-sub">{combo.description}</span>
                    ) : null}
                  </td>
                  <td>
                    <span className="cell-sub">
                      {combo.items.length} producto{combo.items.length === 1 ? "" : "s"}
                    </span>
                    <div className="combo-preview">
                      {combo.items
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .slice(0, 4)
                        .map((row) => (
                          <span key={row.productId + String(row.position)}>
                            {row.quantity > 1 ? `${row.quantity}× ` : ""}
                            {row.product?.name ?? "—"}
                          </span>
                        ))}
                      {combo.items.length > 4 ? (
                        <span>+{combo.items.length - 4} más</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <Pill tone={combo.active ? "ok" : "neutral"}>
                      {combo.active ? "Activo" : "Inactivo"}
                    </Pill>
                  </td>
                  <td className="row-actions">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(combo)}>
                      Editar
                    </button>
                    {combo.active ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => void deactivate(combo)}
                      >
                        Desactivar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editOpen}
        title={draft.id ? "Editar combo" : "Nuevo combo"}
        onClose={() => setEditOpen(false)}
      >
        <form className="form-grid" onSubmit={(e) => void save(e)}>
          <Field label="Nombre">
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Ej. Extras PC básica"
            />
          </Field>
          <Field label="Descripción" hint="Opcional">
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Opcional"
            />
          </Field>
          <Checkbox
            checked={draft.active}
            onChange={(active) => setDraft((d) => ({ ...d, active }))}
            label="Activo (visible en el buscador de presupuestos)"
          />

          <div className="combo-editor">
            <p className="section-label">Productos del combo</p>
            <SearchInput
              value={productQuery}
              onChange={setProductQuery}
              onKeyDown={onProductKeyDown}
              placeholder="Buscar producto para agregar… (↑↓ Enter)"
            />
            {productMatches.length > 0 ? (
              <div className="picker-results inline" role="listbox">
                {productMatches.map((p, idx) => (
                  <button
                    key={p.id}
                    id={`combo-prod-opt-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={productActive === idx}
                    className={`picker-option${productActive === idx ? " is-active" : ""}`}
                    onMouseEnter={() => setProductActive(idx)}
                    onClick={() => addProduct(p)}
                  >
                    <span className="po-name">{p.name}</span>
                    <span className="po-price">{formatArs(p.salePriceCents)}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {draft.items.length === 0 ? (
              <p className="muted">Todavía no hay productos en este combo.</p>
            ) : (
              <div className="table-wrap mt">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="num">Cant.</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.items.map((row) => (
                      <tr key={row.key}>
                        <td>{row.name}</td>
                        <td className="num">
                          <input
                            className="input-sm"
                            inputMode="numeric"
                            value={row.quantity}
                            onChange={(e) => setQty(row.key, e.target.value)}
                            aria-label={`Cantidad de ${row.name}`}
                          />
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => removeDraftItem(row.key)}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
