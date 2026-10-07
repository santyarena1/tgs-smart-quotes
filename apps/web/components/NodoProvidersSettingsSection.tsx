"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../lib/api";
import { providerColor, type NodoProvider } from "../lib/nodo";
import { providerLogo } from "../lib/nodo-logos";
import { timeAgo, timeAgoShort } from "../lib/time-ago";
import { Alert, Loading, errorMessage } from "./shared";

type ProviderRow = NodoProvider & { enabled: boolean };

/** Iniciales para los distribuidores sin logo (por ejemplo los de demostración). */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !/^distribuidora$/i.test(w));
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [words[0]?.slice(0, 2) ?? "?"]).join("").toUpperCase();
}

function statusLine(r: ProviderRow, now: number): { tone: "ok" | "warn" | "off"; text: string } {
  const when = timeAgoShort(r.lastSyncedAt, now);
  if (r.status === "paused") return { tone: "off", text: r.lastSyncedAt ? `Pausado · ${when}` : "Pausado" };
  if (r.status === "error") return { tone: "warn", text: `Con error · ${when}` };
  if (r.stale) return { tone: "warn", text: `Desactualizado · ${when}` };
  return { tone: "ok", text: r.lastSyncedAt ? `Sincronizado ${when}` : "Sin datos todavía" };
}

/**
 * Ajustes → Distribuidores: qué distribuidores de NODO aparecen al buscar productos en los presupuestos.
 * Lo que se apaga acá desaparece para todos los usuarios, en LITE y en el sistema completo.
 */
export function NodoProvidersSettingsSection() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // El "hace X" se va actualizando solo.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: ProviderRow[] }>("/nodo/settings");
      setRows(res.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setRows([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /** Vuelve a leer al instante el estado de cada distribuidor (NODO sincroniza solo, de forma continua). */
  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await api<{ items: ProviderRow[] }>("/nodo/refresh", { method: "POST" });
      setRows(res.items);
      setNow(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  /** Cambia varios a la vez; se ve al instante y vuelve atrás si el servidor no lo guarda. */
  async function setEnabled(ids: string[], enabled: boolean) {
    if (!rows || !ids.length) return;
    const before = rows;
    setRows(rows.map((r) => (ids.includes(r.id) ? { ...r, enabled } : r)));
    setSaving(true);
    setError(null);
    try {
      await api("/nodo/settings", { method: "PUT", body: { ids, enabled } });
    } catch (err) {
      setRows(before);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const lastSync = useMemo(() => {
    const times = (rows ?? []).map((r) => (r.lastSyncedAt ? new Date(r.lastSyncedAt).getTime() : 0)).filter(Boolean);
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  }, [rows]);

  if (rows === null) return <Loading />;
  const active = rows.filter((r) => r.enabled).length;

  return (
    <section className="nodo-cfg">
      <header className="nodo-cfg-head">
        <div>
          <h2>Distribuidores</h2>
          <p className="muted">
            Elegí en cuáles se puede buscar al armar un presupuesto. Lo que apagues no aparece para ningún usuario, ni en LITE ni en el sistema completo.
          </p>
        </div>
        <div className="nodo-sync-box">
          <button type="button" className="nodo-btn primary" disabled={syncing} onClick={() => void syncNow()} title="NODO sincroniza solo y de forma continua. Este botón vuelve a leer al instante el estado y los precios de cada distribuidor.">
            <span className={`nodo-spin${syncing ? " on" : ""}`} aria-hidden="true">↻</span>
            {syncing ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
          <span className="nodo-last" title={lastSync ? new Date(lastSync).toLocaleString("es-AR") : undefined}>
            Última sincronización {timeAgo(lastSync, now)}
          </span>
        </div>
      </header>

      <div className="nodo-cfg-bar">
        <span className="nodo-chip plain"><strong>{active}</strong> de {rows.length} activos</span>
        <span className="nodo-bulk">
          <button type="button" className="nodo-btn" disabled={saving || active === rows.length} onClick={() => void setEnabled(rows.map((r) => r.id), true)}>Activar todos</button>
          <button type="button" className="nodo-btn" disabled={saving || active === 0} onClick={() => void setEnabled(rows.map((r) => r.id), false)}>Desactivar todos</button>
        </span>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {rows.length === 0 && !error ? <p className="muted">NODO no devolvió distribuidores.</p> : null}

      <ul className="nodo-grid">
        {rows.map((r) => {
          const logo = providerLogo(r.name);
          const st = statusLine(r, now);
          return (
            <li key={r.id} className={`nodo-card${r.enabled ? "" : " off"}`} style={{ "--nc": providerColor(rows, r.id) } as CSSProperties}>
              <div className="nodo-logo">
                {logo ? <img src={logo} alt="" width={48} height={48} /> : <span>{initials(r.name)}</span>}
              </div>
              <div className="nodo-info">
                <strong className="nodo-name">{r.name}</strong>
                <span className="nodo-sub">{r.offers.toLocaleString("es-AR")} productos</span>
                <span className={`nodo-status ${st.tone}`} title={r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString("es-AR") : undefined}>
                  <span className="nodo-dot" aria-hidden="true" /> {st.text}
                </span>
              </div>
              <label className="bot-switch big nodo-switch" title={r.enabled ? "Activo: aparece al buscar" : "Apagado: no aparece al buscar"}>
                <input type="checkbox" checked={r.enabled} disabled={saving} onChange={(e) => void setEnabled([r.id], e.target.checked)} aria-label={`Usar ${r.name}`} />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
