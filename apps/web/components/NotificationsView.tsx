"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Alert, EmptyState, Loading, PageHeader, Pill, errorMessage } from "./shared";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  draft?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  actedAt?: string | null;
  createdAt: string;
};

export function NotificationsView() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<NotificationRow[]>("/notifications", {
        query: { unread: unreadOnly || undefined, limit: 100 },
      });
      setRows(data);
    } catch (err) {
      setError(errorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(id: string, patch: { read?: boolean; acted?: boolean }) {
    setBusyId(id);
    setError(null);
    try {
      await api(`/notifications/${id}/mark`, { method: "POST", body: patch });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Notificaciones"
        subtitle="Alertas de solicitudes listas, envíos ambiguos y presupuestos sin actividad."
        actions={
          <>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Solo no leídas
            </label>
            <button type="button" className="btn-ghost" onClick={() => void load()}>
              Recargar
            </button>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {loading ? <Loading /> : null}

      {!loading && !rows.length ? (
        <EmptyState icon="🔔" title="Sin notificaciones">
          {unreadOnly ? "No hay pendientes." : "Cuando haya alertas aparecerán aquí."}
        </EmptyState>
      ) : null}

      {!loading && rows.length ? (
        <>
          <p className="section-note" style={{ marginBottom: "0.75rem" }}>
            {unread} sin leer · {rows.length} listadas
          </p>
          <ul className="notif-list">
            {rows.map((row) => (
              <li key={row.id} className={row.readAt ? "read" : "unread"}>
                <div className="notif-head">
                  <strong>{row.title}</strong>
                  {!row.readAt ? <Pill tone="warn">Nueva</Pill> : null}
                  {row.actedAt ? <Pill tone="ok">Accionada</Pill> : null}
                </div>
                <p>{row.body}</p>
                {row.draft ? (
                  <pre className="notif-draft">{row.draft}</pre>
                ) : null}
                <div className="notif-meta">
                  <span>{row.type}</span>
                  <span>{new Date(row.createdAt).toLocaleString("es-AR")}</span>
                </div>
                <div className="form-actions">
                  {!row.readAt ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={busyId === row.id}
                      onClick={() => void mark(row.id, { read: true })}
                    >
                      Marcar leída
                    </button>
                  ) : null}
                  {!row.actedAt ? (
                    <button
                      type="button"
                      className="btn-sm"
                      disabled={busyId === row.id}
                      onClick={() => void mark(row.id, { acted: true, read: true })}
                    >
                      Marcar accionada
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
