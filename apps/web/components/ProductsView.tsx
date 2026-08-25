"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { bpsToPct, formatArs, formatBps, parseArsToCents, pctToBps } from "../lib/money";
import type { Product, ProductQuoteUsage } from "../lib/types";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  Modal,
  MoneyInput,
  PageHeader,
  Pill,
  SearchInput,
  Stat,
  StatStrip,
  errorMessage,
} from "./shared";

type Draft = {
  id?: string;
  name: string;
  costArs: string;
  markupPct: string;
  saleArs: string;
  usesGeneralMarkup: boolean;
  active: boolean;
  priceMode: "markup" | "sale";
};

const emptyDraft = (): Draft => ({
  name: "",
  costArs: "",
  markupPct: "30",
  saleArs: "",
  usesGeneralMarkup: true,
  active: true,
  priceMode: "markup",
});

function centsToInput(cents: string): string {
  try {
    const v = BigInt(cents);
    return `${v / 100n},${(v % 100n).toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function ProductsView() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dupes, setDupes] = useState<{ score: number; name: string; id: string }[]>([]);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"skip" | "update">("skip");
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dupesOpen, setDupesOpen] = useState(false);
  const [dupesLoading, setDupesLoading] = useState(false);
  const [dupeGroups, setDupeGroups] = useState<
    {
      maxScore: number;
      members: {
        id: string;
        name: string;
        costCents: string;
        salePriceCents: string;
        markupBps: number;
        score: number;
        updatedAt: string;
        lastUsedAt: string | null;
        _count: { items: number };
      }[];
    }[]
  >([]);
  const [dupeKeep, setDupeKeep] = useState<Record<number, string>>({});
  const [dupeEnabled, setDupeEnabled] = useState<Record<number, boolean>>({});
  const [merging, setMerging] = useState(false);
  const [dupeThreshold, setDupeThreshold] = useState(70);
  const [usage, setUsage] = useState<ProductQuoteUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [selectedMergeOpen, setSelectedMergeOpen] = useState(false);
  const [selectedKeepId, setSelectedKeepId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api<Product[]>("/products"));
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

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedFilter(filter), 180);
    return () => window.clearTimeout(handle);
  }, [filter]);

  useEffect(() => {
    if (!editOpen || draft.id || draft.name.trim().length < 3) {
      setDupes([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void api<{ matches: { id: string; name: string; score: number }[] }>("/products/duplicates", {
        query: { name: draft.name.trim() },
      })
        .then((res) => setDupes(res.matches ?? []))
        .catch(() => setDupes([]));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draft.name, draft.id, editOpen]);

  function openNew() {
    setDraft(emptyDraft());
    setDupes([]);
    setUsage([]);
    setEditOpen(true);
  }

  function openEdit(product: Product) {
    setDraft({
      id: product.id,
      name: product.name,
      costArs: centsToInput(product.costCents),
      markupPct: bpsToPct(product.markupBps),
      saleArs: centsToInput(product.salePriceCents),
      usesGeneralMarkup: product.usesGeneralMarkup,
      active: product.active,
      priceMode: "markup",
    });
    setDupes([]);
    setEditOpen(true);
    setUsage([]);
    setUsageLoading(true);
    void api<{ quotes: ProductQuoteUsage[] }>(`/products/${product.id}/quotes`)
      .then((res) => setUsage(res.quotes ?? []))
      .catch(() => setUsage([]))
      .finally(() => setUsageLoading(false));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const costCents = parseArsToCents(draft.costArs);
      const body: Record<string, unknown> = {
        name: draft.name.trim(),
        costCents,
        usesGeneralMarkup: draft.usesGeneralMarkup,
        defaultLineId: draft.id
          ? (items.find((p) => p.id === draft.id)?.defaultLineId ?? null)
          : null,
        active: draft.active,
      };
      if (draft.priceMode === "sale") {
        body.salePriceCents = parseArsToCents(draft.saleArs);
        body.markupBps = 0;
      } else {
        body.markupBps = pctToBps(draft.markupPct);
      }
      if (draft.id) {
        await api(`/products/${draft.id}`, { method: "PUT", body });
        setNotice("Producto actualizado.");
      } else {
        await api("/products", { method: "POST", body });
        setNotice("Producto creado.");
      }
      setEditOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!window.confirm("¿Eliminar este producto del catálogo activo?")) return;
    setError(null);
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setNotice("Producto eliminado (queda inactivo).");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`¿Eliminar ${ids.length} producto${ids.length === 1 ? "" : "s"} del catálogo activo?`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ deactivated: number }>("/products/bulk-delete", {
        method: "POST",
        body: { ids },
      });
      setSelected(new Set());
      setNotice(`Se eliminaron ${res.deactivated} productos (quedan inactivos).`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function findDuplicates(thresholdOverride?: number) {
    setDupesOpen(true);
    setDupesLoading(true);
    setError(null);
    setDupeKeep({});
    try {
      let threshold = thresholdOverride ?? dupeThreshold;
      if (thresholdOverride === undefined) {
        const ai = await api<{ productSimilarityThreshold: number }>("/settings/ai").catch(() => null);
        if (ai?.productSimilarityThreshold != null) {
          threshold = ai.productSimilarityThreshold;
          setDupeThreshold(threshold);
        }
      }
      const res = await api<{
        threshold: number;
        groups: {
          maxScore: number;
          members: {
            id: string;
            name: string;
            costCents: string;
            salePriceCents: string;
            markupBps: number;
            score: number;
            updatedAt: string;
            lastUsedAt: string | null;
            _count: { items: number };
          }[];
        }[];
      }>("/products/duplicate-groups", {
        query: { threshold },
      });
      setDupeThreshold(res.threshold);
      setDupeGroups(res.groups);
      const defaults: Record<number, string> = {};
      const enabled: Record<number, boolean> = {};
      res.groups.forEach((g, i) => {
        if (g.members[0]) defaults[i] = g.members[0].id;
        enabled[i] = true;
      });
      setDupeKeep(defaults);
      setDupeEnabled(enabled);
      if (!res.groups.length) {
        setNotice(`No se encontraron grupos duplicados (umbral ${res.threshold}%).`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setDupeGroups([]);
    } finally {
      setDupesLoading(false);
    }
  }

  function autoPickKeepers() {
    const keepers: Record<number, string> = {};
    const enabled: Record<number, boolean> = {};
    dupeGroups.forEach((group, index) => {
      const best = [...group.members].sort((a, b) =>
        b._count.items - a._count.items ||
        new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime() ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
        a.name.localeCompare(b.name, "es"),
      )[0];
      if (best) keepers[index] = best.id;
      enabled[index] = Boolean(best);
    });
    setDupeKeep(keepers);
    setDupeEnabled(enabled);
  }

  async function mergeAllGroups() {
    const groups = dupeGroups.flatMap((group, index) => {
      const keepId = dupeKeep[index];
      if (!dupeEnabled[index] || !keepId) return [];
      return [{ keepId, mergeIds: group.members.map((member) => member.id).filter((id) => id !== keepId) }];
    });
    if (!groups.length) return;
    if (!window.confirm(`¿Unificar ${groups.length} grupos seleccionados? Cada grupo se procesa de forma independiente.`)) return;
    setMerging(true);
    setError(null);
    try {
      const result = await api<{ succeeded: number; failed: number }>("/products/merge-bulk", {
        method: "POST",
        body: { groups },
      });
      setNotice(`Unificación masiva: ${result.succeeded} grupos listos${result.failed ? `, ${result.failed} con error` : ""}.`);
      setSelected(new Set());
      await load();
      await findDuplicates(dupeThreshold);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMerging(false);
    }
  }

  function openSelectedMerge() {
    const candidates = items.filter((item) => selected.has(item.id));
    if (candidates.length < 2) return;
    setSelectedKeepId(candidates[0]?.id ?? "");
    setSelectedMergeOpen(true);
  }

  async function mergeSelected() {
    const mergeIds = [...selected].filter((id) => id !== selectedKeepId);
    if (!selectedKeepId || !mergeIds.length) return;
    setMerging(true);
    setError(null);
    try {
      await api("/products/merge", { method: "POST", body: { keepId: selectedKeepId, mergeIds } });
      setNotice(`Se unificaron ${mergeIds.length} productos en el elegido.`);
      setSelected(new Set());
      setSelectedMergeOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMerging(false);
    }
  }

  function useExistingProduct(productId: string) {
    const product = items.find((item) => item.id === productId);
    setEditOpen(false);
    setDupes([]);
    setSelected(new Set([productId]));
    setFilter(product?.name ?? "");
    setNotice(`Se seleccionó “${product?.name ?? "el producto existente"}”; no se creó uno nuevo.`);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const ids = filtered.map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function runImport(e: FormEvent) {
    e.preventDefault();
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const rows = importText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, cost, markup] = line.split(";").map((x) => x.trim());
          if (!name || !cost) throw new Error(`Fila inválida: ${line}`);
          return {
            name,
            costCents: parseArsToCents(cost),
            markupBps: markup ? pctToBps(markup) : 3000,
            usesGeneralMarkup: !markup,
            active: true,
          };
        });
      if (!rows.length) throw new Error("No hay filas para importar.");

      const BATCH = 250;
      const summary = {
        total: rows.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as string[],
      };
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const part = await api<{
          total: number;
          created: number;
          updated: number;
          skipped: number;
          errors: string[];
        }>("/products/import", {
          method: "POST",
          body: { rows: chunk, mode: importMode },
        });
        summary.created += part.created;
        summary.updated += part.updated;
        summary.skipped += part.skipped;
        if (part.errors?.length) summary.errors.push(...part.errors);
        setNotice(
          `Importando… ${Math.min(i + BATCH, rows.length)} / ${rows.length}`,
        );
      }

      setNotice(
        `Importación: ${summary.created} creados, ${summary.updated} actualizados, ${summary.skipped} omitidos` +
          (summary.errors.length ? `. Errores: ${summary.errors.slice(0, 3).join("; ")}` : ""),
      );
      if (summary.errors.length && summary.created + summary.updated === 0) {
        setError(summary.errors[0] ?? "La importación falló");
      }
      setImportText("");
      setImportOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const filtered = useMemo(
    () => {
      const tokens = normalizeSearch(debouncedFilter).split(/\s+/).filter(Boolean);
      return items.filter((p) => {
        if (!showInactive && !p.active) return false;
        const name = normalizeSearch(p.name);
        return tokens.every((token) => name.includes(token));
      });
    },
    [items, debouncedFilter, showInactive],
  );

  const activeCount = items.filter((p) => p.active).length;
  const generalCount = items.filter((p) => p.usesGeneralMarkup).length;

  return (
    <div>
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        subtitle="Precio bidireccional: cargá costo + markup, o fijá el precio de venta y el markup se calcula solo."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => void findDuplicates()}>
              Buscar duplicados
            </button>
            <button type="button" className="btn-ghost" onClick={() => setImportOpen(true)}>
              Importar
            </button>
            <button type="button" onClick={openNew}>
              + Nuevo producto
            </button>
          </>
        }
      />

      <StatStrip>
        <Stat label="Productos activos" value={activeCount} accent="var(--red)" />
        <Stat label="Total en catálogo" value={items.length} accent="var(--ink)" />
        <Stat
          label="Con markup general"
          value={generalCount}
          hint="Usan el markup global"
          accent="var(--info)"
        />
      </StatStrip>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="toolbar">
        <SearchInput value={filter} onChange={setFilter} placeholder="Buscar producto por nombre" />
        <Checkbox label="Ver inactivos" checked={showInactive} onChange={setShowInactive} />
        {selected.size > 0 ? (
          <div className="toolbar-actions">
            <span className="muted">{selected.size} seleccionados</span>
            {selected.size >= 2 ? (
              <button type="button" className="btn-sm" onClick={openSelectedMerge}>
                Unificar seleccionados
              </button>
            ) : null}
            <button type="button" className="btn-danger btn-sm" onClick={() => void bulkDelete()}>
              Eliminar seleccionados
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Limpiar
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="❏" title="Sin productos">
          {filter ? "No hay coincidencias." : "Cargá productos o usá la importación masiva."}
        </EmptyState>
      ) : (
        <>
        <div className="table-wrap desktop-list">
          <table>
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                    onChange={toggleSelectAllVisible}
                    aria-label="Seleccionar visibles"
                  />
                </th>
                <th>Producto</th>
                <th>Costo</th>
                <th>Markup</th>
                <th>Venta</th>
                <th>Último uso</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className={`clickable${p.active ? "" : " dim"}${selected.has(p.id) ? " selected" : ""}`}
                  onClick={() => openEdit(p)}
                >
                  <td className="check-col" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      aria-label={`Seleccionar ${p.name}`}
                    />
                  </td>
                  <td>
                    <span className="cell-strong">{p.name}</span>
                  </td>
                  <td className="num">{formatArs(p.costCents)}</td>
                  <td className="num">
                    {formatBps(p.markupBps)}
                    {p.usesGeneralMarkup ? <span className="cell-sub">general</span> : null}
                  </td>
                  <td className="num">{formatArs(p.salePriceCents)}</td>
                  <td>
                    <span className="cell-sub">{formatTs(p.lastUsedAt)}</span>
                  </td>
                  <td>
                    {p.active ? <Pill tone="ok">Activo</Pill> : <Pill tone="neutral">Inactivo</Pill>}
                  </td>
                  <td>
                    <div className="row-actions">
                      {p.active ? (
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deactivate(p.id);
                          }}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list" aria-label="Productos">
          {filtered.map((p) => <article key={p.id} className={`mobile-list-card${p.active ? "" : " dim"}`} onClick={() => openEdit(p)}>
            <div className="mobile-card-head">
              <label className="mobile-card-select" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Seleccionar ${p.name}`} /><span>Seleccionar</span></label>
              {p.active ? <Pill tone="ok">Activo</Pill> : <Pill tone="neutral">Inactivo</Pill>}
            </div>
            <div className="mobile-card-title">{p.name}</div>
            <div className="mobile-product-prices"><div><span>Costo</span><strong>{formatArs(p.costCents)}</strong></div><div><span>Markup</span><strong>{formatBps(p.markupBps)}</strong>{p.usesGeneralMarkup ? <small>general</small> : null}</div><div><span>Venta</span><strong>{formatArs(p.salePriceCents)}</strong></div></div>
            <div className="mobile-card-actions" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => openEdit(p)}>Editar</button>{p.active ? <button type="button" className="btn-danger" onClick={() => void deactivate(p.id)}>Eliminar</button> : null}</div>
          </article>)}
        </div>
        </>
      )}

      {/* Editor */}
      <Modal
        open={editOpen}
        title={draft.id ? "Editar producto" : "Nuevo producto"}
        onClose={() => setEditOpen(false)}
        wide={Boolean(draft.id)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="product-form" disabled={saving}>
              {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear producto"}
            </button>
          </>
        }
      >
        <form id="product-form" className="form-grid" onSubmit={save}>
          <Field label="Nombre" htmlFor="prod-name">
            <input
              id="prod-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              autoFocus
            />
          </Field>
          {dupes.length > 0 ? (
            <div className="duplicate-suggestion" role="alert">
              <strong>Antes de crear: ya hay un producto muy parecido</strong>
              <span>
                {dupes[0]?.name} · {dupes[0] ? formatArs(items.find((p) => p.id === dupes[0]?.id)?.salePriceCents ?? "0") : ""} · {dupes[0]?.score}% de similitud
              </span>
              <div className="toolbar-actions">
                <button type="button" className="btn-sm" onClick={() => useExistingProduct(dupes[0]!.id)}>
                  Usar ese producto
                </button>
                <button type="submit" className="btn-ghost btn-sm">
                  Crear igual
                </button>
              </div>
              {dupes.length > 1 ? (
                <small>También: {dupes.slice(1, 4).map((d) => `${d.name} (${d.score}%)`).join(" · ")}</small>
              ) : null}
            </div>
          ) : null}
          <div className="grid-2">
            <Field label="Costo (ARS)" htmlFor="prod-cost" hint="Ej: 150000,50">
              <MoneyInput
                id="prod-cost"
                value={draft.costArs}
                onChange={(v) => setDraft({ ...draft, costArs: v })}
                required
              />
            </Field>
            <Field label="Cómo fijar el precio">
              <select
                value={draft.priceMode}
                onChange={(e) => setDraft({ ...draft, priceMode: e.target.value as Draft["priceMode"] })}
              >
                <option value="markup">Por markup (%)</option>
                <option value="sale">Por precio de venta</option>
              </select>
            </Field>
          </div>
          {draft.priceMode === "markup" ? (
            <Field label="Markup (%)" htmlFor="prod-markup">
              <input
                id="prod-markup"
                value={draft.markupPct}
                onChange={(e) => setDraft({ ...draft, markupPct: e.target.value })}
                placeholder="30"
                disabled={draft.usesGeneralMarkup}
                required={!draft.usesGeneralMarkup}
              />
            </Field>
          ) : (
            <Field label="Precio de venta (ARS)" htmlFor="prod-sale">
              <MoneyInput
                id="prod-sale"
                value={draft.saleArs}
                onChange={(v) => setDraft({ ...draft, saleArs: v })}
                required
              />
            </Field>
          )}
          <div className="grid-2">
            <Checkbox
              label="Usa markup general"
              checked={draft.usesGeneralMarkup}
              onChange={(usesGeneralMarkup) => setDraft({ ...draft, usesGeneralMarkup })}
            />
            <Checkbox
              label="Activo"
              checked={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
          </div>

          {draft.id ? (
            <div className="product-usage">
              <p className="section-label">Presupuestos donde aparece</p>
              {usageLoading ? (
                <p className="muted">Cargando…</p>
              ) : usage.length === 0 ? (
                <p className="muted">Todavía no figura en ningún presupuesto.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nº</th>
                        <th>Nombre</th>
                        <th>Cliente</th>
                        <th>Estado</th>
                        <th>Uso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((row) => (
                        <tr key={row.familyId}>
                          <td>
                            <strong>{row.visibleNumber}</strong>
                            <span className="cell-sub">v{row.version}</span>
                          </td>
                          <td>{row.internalName}</td>
                          <td>{row.customerName ?? "—"}</td>
                          <td>
                            <Pill tone="neutral">{row.state}</Pill>
                          </td>
                          <td>
                            <span className="cell-sub">
                              {formatTs(row.usedAt)}
                              {row.quantity > 1 ? ` · ×${row.quantity}` : ""}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </form>
      </Modal>

      {/* Import */}
      <Modal
        open={importOpen}
        title="Importar productos"
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setImportOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="import-form" disabled={importing || !importText.trim()}>
              {importing ? "Importando…" : "Importar filas"}
            </button>
          </>
        }
      >
        <form id="import-form" className="form-grid" onSubmit={runImport}>
          <p className="section-note">
            Una fila por línea con el formato <code>nombre;costoARS;markup%?</code>. Si omitís el
            markup, se usa el markup general.
          </p>
          <Field label="Filas">
            <textarea
              rows={7}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"Ryzen 5 5600;180000,00;30\nRTX 4060;450000,00"}
            />
          </Field>
          <Field label="Si el producto ya existe">
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as "skip" | "update")}
            >
              <option value="skip">Omitir existentes</option>
              <option value="update">Actualizar existentes</option>
            </select>
          </Field>
        </form>
      </Modal>

      <Modal
        open={selectedMergeOpen}
        title="Unificar productos seleccionados"
        onClose={() => setSelectedMergeOpen(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setSelectedMergeOpen(false)}>
              Cancelar
            </button>
            <button type="button" disabled={merging || !selectedKeepId} onClick={() => void mergeSelected()}>
              {merging ? "Unificando…" : "Unificar en el elegido"}
            </button>
          </>
        }
      >
        <p className="section-note">
          Elegí cuál queda activo. Los presupuestos y combos de los demás pasan a este producto.
        </p>
        <div className="merge-picker">
          {items.filter((item) => selected.has(item.id)).map((item) => (
            <label key={item.id} className="merge-picker-row">
              <input
                type="radio"
                name="selected-merge-keep"
                checked={selectedKeepId === item.id}
                onChange={() => setSelectedKeepId(item.id)}
              />
              <strong>{item.name}</strong>
              <span>{formatArs(item.salePriceCents)}</span>
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={dupesOpen}
        title="Duplicados detectados"
        onClose={() => setDupesOpen(false)}
        wide
        footer={
          <button type="button" className="btn-ghost" onClick={() => setDupesOpen(false)}>
            Cerrar
          </button>
        }
      >
        <p className="section-note">
          Coincidencias por similitud de nombre (sin IA). Elegí cuál conservar y unificá: los
          presupuestos y combos pasan al producto elegido; el resto queda inactivo. El umbral
          permanente está en <strong>Configuración → IA → Umbral similitud de productos</strong>.
        </p>
        <div className="toolbar" style={{ marginTop: 0 }}>
          <Field label="Umbral para esta búsqueda (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={dupeThreshold}
              onChange={(e) => setDupeThreshold(Number(e.target.value))}
              style={{ maxWidth: "7rem" }}
            />
          </Field>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={dupesLoading}
            onClick={() => void findDuplicates(dupeThreshold)}
          >
            {dupesLoading ? "Buscando…" : "Volver a buscar"}
          </button>
        </div>
        {dupesLoading ? (
          <Loading />
        ) : dupeGroups.length === 0 ? (
          <EmptyState icon="◎" title="Sin grupos duplicados">
            No hay productos activos parecidos según el umbral de Configuración.
          </EmptyState>
        ) : (
          <div className="dupe-groups">
            <div className="dupe-bulk-actions">
              <button type="button" className="btn-ghost btn-sm" onClick={autoPickKeepers}>
                Seleccionar automáticamente el mejor de cada grupo
              </button>
              <button type="button" className="btn-sm" disabled={merging} onClick={() => void mergeAllGroups()}>
                {merging ? "Unificando…" : "Unificar todos los grupos seleccionados"}
              </button>
            </div>
            <p className="section-note">
              La selección automática prioriza el más usado en presupuestos, después el uso y la actualización más recientes.
            </p>
            {dupeGroups.map((group, index) => (
              <div key={index} className="dupe-group">
                <div className="dupe-group-head">
                  <label>
                    <input
                      type="checkbox"
                      checked={dupeEnabled[index] ?? false}
                      onChange={(event) => setDupeEnabled((prev) => ({ ...prev, [index]: event.target.checked }))}
                    />{" "}
                    <strong>Grupo {index + 1} · {group.members.length}</strong>
                  </label>
                  <span className="muted">similitud hasta {group.maxScore}%</span>
                </div>
                <div className="dupe-members" role="radiogroup" aria-label={`Producto a conservar del grupo ${index + 1}`}>
                  {group.members.map((m) => (
                    <label key={m.id} className="dupe-member">
                      <input
                        type="radio"
                        name={`dupe-keep-${index}`}
                        checked={dupeKeep[index] === m.id}
                        onChange={() => setDupeKeep((prev) => ({ ...prev, [index]: m.id }))}
                      />
                      <strong>{m.name}</strong>
                      <span>{m._count.items} usos</span>
                      <span>{m.score}%</span>
                      <span>{formatArs(m.salePriceCents)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
