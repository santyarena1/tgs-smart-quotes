"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatArs } from "../lib/money";
import type { AuthUser } from "../lib/types";
import { Alert, EmptyState, Loading, PageHeader, Stat, StatStrip, errorMessage } from "./shared";

type Branch = { id: string; name: string };

type Summary = {
  families: number;
  countsByState: Record<string, number>;
  avgTicketCents: {
    ACEPTADO: string | null;
    RECHAZADO: string | null;
    NO_CONCRETADO: string | null;
  };
  unresolved: number;
  avgRequestToReadyMs: number | null;
  avgSentToAcceptanceMs: number | null;
};

type RankBlock = {
  sampleSize: number;
  items: { name: string; count: number }[];
};

function msToHuman(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function DashboardView({ user }: { user: AuthUser }) {
  const [data, setData] = useState<Summary | null>(null);
  const [accepted, setAccepted] = useState<RankBlock | null>(null);
  const [rejected, setRejected] = useState<RankBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");

  const isAdmin = user.role === "ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    api<{ items: Branch[] }>("/branches")
      .then((res) => setBranches(res.items))
      .catch(() => setBranches([]));
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, ranking] = await Promise.all([
        api<Summary>("/dashboard/summary", {
          query: isAdmin && branchId ? { branchId } : undefined,
        }),
        api<{ accepted: RankBlock; rejected: RankBlock }>("/dashboard/products", {
          query: { limit: 8 },
        }),
      ]);
      setData(summary);
      setAccepted(ranking.accepted);
      setRejected(ranking.rejected);
    } catch (err) {
      setError(errorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = data?.countsByState ?? {};

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Dashboard"
        subtitle="Métricas sobre la versión activa de cada presupuesto. Sin inflación por historial."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {isAdmin ? (
              <select
                aria-label="Filtrar por local"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Todos los locales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => void load()}>
              Recargar
            </button>
          </div>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {loading ? <Loading /> : null}

      {!loading && data ? (
        <>
          <StatStrip>
            <Stat
              label="Presupuestos"
              value={data.families}
              hint="Cada uno agrupa sus versiones"
              accent="var(--ink)"
            />
            <Stat
              label="Enviados"
              value={counts.ENVIADO ?? 0}
              hint="Esperando respuesta del cliente"
              accent="var(--info)"
            />
            <Stat
              label="Aceptados"
              value={counts.ACEPTADO ?? 0}
              hint={
                data.families
                  ? `${Math.round(((counts.ACEPTADO ?? 0) / data.families) * 100)}% del total`
                  : "Cerrados con venta"
              }
              accent="var(--ok)"
            />
            <Stat
              label="Sin resolver"
              value={data.unresolved}
              hint="Requieren seguimiento"
              accent="var(--red)"
            />
          </StatStrip>

          <div className="two-col" style={{ marginTop: "1rem" }}>
            <div className="card card-pad">
              <h3 className="panel-title">Ticket promedio (venta)</h3>
              <dl className="kv">
                <dt>Aceptado</dt>
                <dd className="money">{formatArs(data.avgTicketCents.ACEPTADO ?? "0")}</dd>
                <dt>Rechazado</dt>
                <dd className="money">{formatArs(data.avgTicketCents.RECHAZADO ?? "0")}</dd>
                <dt>No concretado</dt>
                <dd className="money">{formatArs(data.avgTicketCents.NO_CONCRETADO ?? "0")}</dd>
              </dl>
            </div>
            <div className="card card-pad">
              <h3 className="panel-title">Tiempos medios</h3>
              <dl className="kv">
                <dt>Solicitud → lista</dt>
                <dd>{msToHuman(data.avgRequestToReadyMs)}</dd>
                <dt>Envío → aceptación</dt>
                <dd>{msToHuman(data.avgSentToAcceptanceMs)}</dd>
              </dl>
            </div>
          </div>

          <div className="two-col" style={{ marginTop: "1rem" }}>
            <div className="card card-pad">
              <h3 className="panel-title">
                Productos en aceptados
                {accepted ? ` (n=${accepted.sampleSize})` : ""}
              </h3>
              {!accepted?.items.length ? (
                <EmptyState title="Sin datos">Todavía no hay aceptaciones.</EmptyState>
              ) : (
                <ul className="rank-list">
                  {accepted.items.map((row) => (
                    <li key={`a-${row.name}`}>
                      <span>{row.name}</span>
                      <strong>{row.count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card card-pad">
              <h3 className="panel-title">
                Productos en rechazados
                {rejected ? ` (n=${rejected.sampleSize})` : ""}
              </h3>
              {!rejected?.items.length ? (
                <EmptyState title="Sin datos">Todavía no hay rechazos.</EmptyState>
              ) : (
                <ul className="rank-list">
                  {rejected.items.map((row) => (
                    <li key={`r-${row.name}`}>
                      <span>{row.name}</span>
                      <strong>{row.count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
