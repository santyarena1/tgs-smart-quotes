"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Alert, Field, Loading, PageHeader, errorMessage } from "./shared";
import { ProductContentEditor } from "./ProductContentEditor";

type Product = {
  id: string;
  name: string;
  active: boolean;
  description: string | null;
};

/**
 * Ficha reutilizable por componente: imagen y descripción. Una vez cargadas
 * acá, se usan automáticamente en cualquier presupuesto que incluya ese
 * componente al publicarlo en la tienda — no hay que volver a cargarlas
 * cada vez. También se puede editar lo mismo directamente desde un
 * presupuesto puntual, en "Publicación Web".
 */
export function ComponentContentView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingProducts(true);
    api<Product[]>("/products")
      .then(setProducts)
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoadingProducts(false));
  }, []);

  const selectProduct = (product: Product) => setSelected(product);

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        eyebrow="Catálogo"
        title="Fichas de Componentes"
        subtitle="Imagen y descripción por componente — se reutilizan solas en cualquier presupuesto que lo incluya."
      />

      {loadError ? <div style={{ marginTop: 16 }}><Alert tone="error">{loadError}</Alert></div> : null}

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h3 className="panel-title">Componente</h3>
        <Field label="Buscar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre del componente" />
        </Field>
        {loadingProducts ? (
          <Loading label="Cargando catálogo…" />
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, maxHeight: 220, overflowY: "auto" }}>
            {filteredProducts.slice(0, 60).map((p) => (
              <button
                key={p.id}
                type="button"
                className={selected?.id === p.id ? "btn-dark btn-sm" : "btn-ghost btn-sm"}
                onClick={() => selectProduct(p)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {!selected ? null : (
        <div style={{ marginTop: 20 }}>
          <ProductContentEditor
            key={selected.id}
            productId={selected.id}
            productName={selected.name}
            initialDescription={selected.description}
            onDescriptionSaved={(description) =>
              setProducts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, description } : p)))
            }
          />
        </div>
      )}
    </div>
  );
}
