"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatArs } from "../lib/money";
import { Alert, EmptyState, Loading, PageHeader, Pill, SearchInput, errorMessage } from "./shared";

type CatalogItem = {
  mpn: string;
  title: string;
  description: string;
  priceCents: string;
  salePriceCents: string | null;
  stockQuantity: number;
  availability: string;
  brand: string | null;
  productType: string | null;
  imageUrl: string | null;
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  tags: string[];
  lastSyncedAt: string;
};

type CatalogResponse = {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: { productTypes: string[]; brands: string[]; availabilities: string[] };
  lastSyncedAt: string | null;
};

const PAGE_SIZE = 40;

function formatTimestamp(value: string | null) {
  if (!value) return "Todavía no se sincronizó";
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function availabilityLabel(value: string) {
  const labels: Record<string, string> = {
    in_stock: "En stock",
    out_of_stock: "Sin stock",
    discontinued: "Discontinuado",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function AcustockCatalogView() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<CatalogResponse["facets"]>({
    productTypes: [], brands: [], availabilities: [],
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [productType, setProductType] = useState("");
  const [brand, setBrand] = useState("");
  const [availability, setAvailability] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<CatalogResponse>("/catalog", {
        query: {
          q: query, productType, brand, availability, minPrice, maxPrice, sort, page,
          pageSize: PAGE_SIZE,
        },
      });
      setItems(response.items);
      setTotal(response.total);
      setFacets(response.facets);
      setLastSyncedAt(response.lastSyncedAt);
    } catch (err) {
      setError(errorMessage(err));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [availability, brand, maxPrice, minPrice, page, productType, query, sort]);

  useEffect(() => { void load(); }, [load]);

  async function sync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ synced: number; discontinued: number }>("/catalog/sync", {
        method: "POST",
      });
      setNotice(
        `Catálogo actualizado: ${result.synced} productos sincronizados y ${result.discontinued} discontinuados.`,
      );
      setPage(1);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        eyebrow="Catálogo externo"
        title="Catálogo AcuStock"
        subtitle={`Última actualización: ${formatTimestamp(lastSyncedAt)}`}
        actions={
          <button type="button" onClick={() => void sync()} disabled={syncing}>
            {syncing ? "Actualizando…" : "↻ Recargar catálogo"}
          </button>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, descripción o MPN" />
        <select
          value={productType}
          onChange={(event) => { setProductType(event.target.value); setPage(1); }}
          aria-label="Categoría"
          style={{ width: "auto", maxWidth: 230 }}
        >
          <option value="">Todas las categorías</option>
          {facets.productTypes.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          value={brand}
          onChange={(event) => { setBrand(event.target.value); setPage(1); }}
          aria-label="Marca"
          style={{ width: "auto", maxWidth: 200 }}
        >
          <option value="">Todas las marcas</option>
          {facets.brands.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          value={availability}
          onChange={(event) => { setAvailability(event.target.value); setPage(1); }}
          aria-label="Disponibilidad"
          style={{ width: "auto" }}
        >
          <option value="">Toda disponibilidad</option>
          {facets.availabilities.map((value) => (
            <option key={value} value={value}>{availabilityLabel(value)}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          value={minPrice}
          onChange={(event) => { setMinPrice(event.target.value); setPage(1); }}
          placeholder="Precio mín."
          aria-label="Precio mínimo en pesos"
          style={{ width: 125 }}
        />
        <input
          type="number"
          min="0"
          value={maxPrice}
          onChange={(event) => { setMaxPrice(event.target.value); setPage(1); }}
          placeholder="Precio máx."
          aria-label="Precio máximo en pesos"
          style={{ width: 125 }}
        />
        <select
          value={sort}
          onChange={(event) => { setSort(event.target.value); setPage(1); }}
          aria-label="Orden"
          style={{ width: "auto" }}
        >
          <option value="name_asc">Nombre A–Z</option>
          <option value="name_desc">Nombre Z–A</option>
          <option value="price_asc">Menor precio</option>
          <option value="price_desc">Mayor precio</option>
          <option value="stock_desc">Mayor stock</option>
        </select>
      </div>

      {loading ? (
        <Loading label="Cargando catálogo…" />
      ) : items.length === 0 ? (
        <EmptyState icon="⌕" title="Sin resultados">
          {lastSyncedAt
            ? "No encontramos productos con esos filtros."
            : "Usá “Recargar catálogo” para hacer la primera sincronización."}
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table style={{ minWidth: 1500 }}>
              <thead>
                <tr>
                  <th>Imagen</th><th>MPN</th><th>Producto</th><th>Categoría</th><th>Marca</th>
                  <th>Precio</th><th>Stock</th><th>Disponibilidad</th>
                  <th>Entrega / proveedor</th><th>Peso y medidas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.mpn}>
                    <td>
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          loading="lazy"
                          style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }}
                        />
                      ) : <span className="muted">—</span>}
                    </td>
                    <td><code>{item.mpn}</code></td>
                    <td>
                      <span className="cell-strong">{item.title}</span>
                      {item.description && item.description !== item.title
                        ? <span className="cell-sub">{item.description}</span>
                        : null}
                    </td>
                    <td>{item.productType ?? "—"}</td>
                    <td>{item.brand ?? "—"}</td>
                    <td className="num">
                      {item.salePriceCents ? (
                        <>
                          <span className="cell-sub" style={{ textDecoration: "line-through" }}>
                            {formatArs(item.priceCents)}
                          </span>
                          <strong>{formatArs(item.salePriceCents)}</strong>
                        </>
                      ) : formatArs(item.priceCents)}
                    </td>
                    <td className="num">{item.stockQuantity}</td>
                    <td>
                      <Pill tone={item.stockQuantity > 0 ? "ok" : "neutral"}>
                        {availabilityLabel(item.availability)}
                      </Pill>
                    </td>
                    <td>
                      {item.tags.length
                        ? item.tags.map((tag) => <span className="cell-sub" key={tag}>{tag}</span>)
                        : "—"}
                    </td>
                    <td>
                      <span className="cell-sub">Peso: {item.weightKg ?? "—"} kg</span>
                      <span className="cell-sub">
                        {item.lengthCm ?? "—"} × {item.widthCm ?? "—"} × {item.heightCm ?? "—"} cm
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar" style={{ marginTop: "0.85rem" }}>
            <span className="muted">{total} productos · Página {page} de {pages}</span>
            <div className="toolbar-actions">
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={page >= pages}
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
