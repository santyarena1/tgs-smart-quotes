"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { errorMessage } from "../components/shared";

export type NodoProvider = { id: string; name: string; offers: number; stale: boolean; status: string; lastSyncedAt: string | null };

export type NodoResult = {
  offerId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  providerId: string;
  providerName: string;
  stock: number | null;
  inStock: boolean;
  stale: boolean;
  costIvaCents: string;
  costNetCents: string;
  originalCurrency: "USD" | "ARS";
  originalCostIva: number;
  fxRate: number;
};

/** Producto publicado en la tienda web (precio de venta al público, en centavos). */
export type WebResult = {
  id: number;
  name: string;
  sku: string | null;
  priceCents: string;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
};

/** Color de la fuente "Productos web". */
export const WEB_COLOR = "#800020"; // bordó

/** Color de cada distribuidor conocido (por nombre, sin tildes ni espacios). */
const PROVIDER_COLORS: Record<string, string> = {
  elit: "#f97316", // naranja
  newbytes: "#2563eb", // azul
  nb: "#2563eb",
  air: "#7c3aed", // violeta
  invid: "#0ea5e9", // celeste
  gruponucleo: "#f0562b", // rojo anaranjado, entre el rojo de Solution y el naranja de Elit
  nucleo: "#f0562b",
  ashir: "#eab308", // amarillo
  sentey: "#a98467", // gris anaranjado
  newtree: "#16a34a", // verde
  solutionbox: "#dc2626", // rojo
  polytech: "#ec4899", // rosa
  distecna: "#1e3a8a", // azul oscuro
};

/** Los distribuidores de demostración van en blanco y negro. */
const DEMO_COLOR = "#27272a";

/** Para distribuidores nuevos o sin color asignado: tonos que no se confunden con los de arriba. */
const FALLBACK = ["#0d9488", "#65a30d", "#475569", "#0891b2", "#c026d3", "#9a3412", "#4f46e5", "#be185d"];

export const slug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export function providerColor(providers: NodoProvider[], providerId: string): string {
  const name = providers.find((p) => p.id === providerId)?.name;
  const key = name ? slug(name) : "";
  if (key.startsWith("distribuidorademo")) return DEMO_COLOR;
  const known = key ? PROVIDER_COLORS[key] : undefined;
  if (known) return known;
  let hash = 0;
  for (const ch of providerId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length]!;
}

/** Lista de distribuidores de NODO; si NODO no está configurado queda vacía y `error` explica por qué. */
export function useNodoProviders(enabled = true) {
  const [providers, setProviders] = useState<NodoProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api<{ items: NodoProvider[] }>("/nodo/providers")
      .then((res) => { if (!cancelled) { setProviders(res.items); setError(null); } })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [enabled]);
  return { providers, error };
}

/** Busca en NODO con espera al tipear, solo en los distribuidores indicados (ids). Sin ids no busca. */
export function useNodoSearch(query: string, providerIds: string[], totalProviders: number) {
  const [items, setItems] = useState<NodoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();
  const active = providerIds.length > 0 && q.length >= 2;
  const idsKey = providerIds.join(",");
  // Con todos prendidos no hace falta filtrar por distribuidor.
  const providerParam = providerIds.length >= totalProviders ? "" : idsKey;

  useEffect(() => {
    if (!active) { setItems([]); setLoading(false); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void api<{ items: NodoResult[] }>("/nodo/search", { query: { q, ...(providerParam ? { provider: providerParam } : {}) } })
        .then((res) => { if (!cancelled) { setItems(res.items); setError(null); } })
        .catch((err) => { if (!cancelled) { setItems([]); setError(errorMessage(err)); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [active, q, providerParam]);

  return useMemo(() => ({ items, loading: active && loading, error: active ? error : null }), [items, loading, error, active]);
}

/** Busca en la tienda web con espera al tipear. */
export function useWebSearch(query: string, enabled: boolean) {
  const [items, setItems] = useState<WebResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();
  const active = enabled && q.length >= 2;

  useEffect(() => {
    if (!active) { setItems([]); setLoading(false); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void api<{ items: WebResult[] }>("/web-products/search", { query: { q } })
        .then((res) => { if (!cancelled) { setItems(res.items); setError(null); } })
        .catch((err) => { if (!cancelled) { setItems([]); setError(errorMessage(err)); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [active, q]);

  return useMemo(() => ({ items, loading: active && loading, error: active ? error : null }), [items, loading, error, active]);
}

export type SourceSelection = {
  /** Buscar en los productos propios del sistema. */
  own: boolean;
  /** Buscar en los productos de la tienda web. */
  web: boolean;
  /** Ids de los distribuidores prendidos. */
  activeIds: string[];
  toggleOwn: () => void;
  toggleWeb: () => void;
  toggleProvider: (id: string) => void;
  /** Prende todas las fuentes. */
  all: () => void;
  /** Apaga todas las fuentes. */
  none: () => void;
  /** Deja prendida solo una fuente: "own", "web" o el id de un distribuidor. */
  only: (key: string) => void;
};

const SOURCES_KEY = "tgs.search.sources.v1";

/** Qué fuentes se consultan al buscar. Se guarda en el navegador como lista de apagadas: un distribuidor nuevo arranca prendido. */
export function useSourceSelection(providers: NodoProvider[]): SourceSelection {
  const [state, setState] = useState<{ own: boolean; web: boolean; off: string[] }>({ own: true, web: true, off: [] });
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SOURCES_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { own?: boolean; web?: boolean; off?: string[] };
        setState({ own: saved.own !== false, web: saved.web !== false, off: Array.isArray(saved.off) ? saved.off : [] });
      }
    } catch { /* sin storage */ }
  }, []);
  const save = useCallback((next: { own: boolean; web: boolean; off: string[] }) => {
    setState(next);
    try { window.localStorage.setItem(SOURCES_KEY, JSON.stringify(next)); } catch { /* sin storage */ }
  }, []);
  const activeIds = useMemo(() => providers.filter((p) => !state.off.includes(p.id)).map((p) => p.id), [providers, state.off]);
  return useMemo(() => ({
    own: state.own,
    web: state.web,
    activeIds,
    toggleOwn: () => save({ ...state, own: !state.own }),
    toggleWeb: () => save({ ...state, web: !state.web }),
    toggleProvider: (id: string) => save({ ...state, off: state.off.includes(id) ? state.off.filter((x) => x !== id) : [...state.off, id] }),
    all: () => save({ own: true, web: true, off: [] }),
    none: () => save({ own: false, web: false, off: providers.map((p) => p.id) }),
    only: (key: string) => save({
      own: key === "own",
      web: key === "web",
      off: providers.filter((p) => p.id !== key).map((p) => p.id),
    }),
  }), [state, activeIds, providers, save]);
}
