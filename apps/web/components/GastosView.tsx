"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { centsToInput, formatArs, parseArsToCents } from "../lib/money";
import {
  Alert,
  EmptyState,
  Field,
  Loading,
  MoneyInput,
  PageHeader,
  Pill,
  Stat,
  StatStrip,
  errorMessage,
} from "./shared";

/**
 * Gastos mensuales recurrentes.
 *
 * El gasto es solo el concepto ("Alquiler", "Internet"): no tiene monto fijo ni
 * se ajusta por IPC. Cada mes se completa lo que realmente se pagó y el módulo
 * suma el total del período.
 *
 * Igual que Empleados, es solo para administradores, y además pide una clave
 * antes de mostrar nada.
 */

type Gasto = {
  id: string;
  name: string;
  note: string | null;
  active: boolean;
  /** null = todavía no se cargó este mes (distinto de haber pagado $0). */
  amountCents: string | null;
  /** El importe puede estar cargado y el gasto todavia no estar pago. */
  paid: boolean;
  paidAt: string | null;
  paymentNote: string | null;
};

type Respuesta = {
  period: string;
  items: Gasto[];
  totalCents: string;
  pagadoCents: string;
  pendienteCents: string;
  cargados: number;
  pagados: number;
  sinCargar: number;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function periodoActual(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

function nombrePeriodo(period: string): string {
  const anio = period.slice(0, 4);
  const mes = Number(period.slice(4, 6));
  return `${MESES[mes - 1] ?? ""} ${anio}`;
}

function moverPeriodo(period: string, meses: number): string {
  const anio = Number(period.slice(0, 4));
  const mes = Number(period.slice(4, 6)) - 1 + meses;
  const fecha = new Date(anio, mes, 1);
  return `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

export function GastosView() {
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [clave, setClave] = useState("");
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  const [period, setPeriod] = useState(periodoActual());
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Texto que se está editando en cada fila, por id de gasto. */
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  /** Gasto cuyo nombre se está editando, y el texto en curso. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [verArchivados, setVerArchivados] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificando(true);
    setErrorClave(null);
    try {
      await api("/expenses/unlock", { method: "POST", body: { key: clave } });
      setDesbloqueado(true);
      setClave("");
    } catch (err) {
      setErrorClave(errorMessage(err));
    } finally {
      setVerificando(false);
    }
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api<Respuesta>("/expenses", {
        query: { period, ...(verArchivados ? { includeArchived: "1" } : {}) },
      });
      setDatos(res);
      setMontos(
        Object.fromEntries(res.items.map((g) => [g.id, g.amountCents === null ? "" : centsToInput(g.amountCents)])),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCargando(false);
    }
  }, [period, verArchivados]);

  useEffect(() => {
    if (desbloqueado) void cargar();
  }, [desbloqueado, cargar]);

  const guardarMonto = async (gasto: Gasto) => {
    const texto = (montos[gasto.id] ?? "").trim();
    setGuardando(gasto.id);
    setError(null);
    setAviso(null);
    try {
      // Vacío borra el registro: el mes vuelve a quedar "sin cargar".
      const amountCents = texto ? parseArsToCents(texto) : null;
      await api(`/expenses/${gasto.id}/payments/${period}`, { method: "PUT", body: { amountCents } });
      await cargar();
      setAviso(texto ? `${gasto.name}: guardado.` : `${gasto.name}: se borró lo cargado de este mes.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(null);
    }
  };

  /**
   * Confirma o da de baja el pago. Es una acción aparte de guardar el importe:
   * primero se carga cuánto es y después se confirma que se pagó.
   */
  const marcarPago = async (gasto: Gasto, pagado: boolean) => {
    setMarcando(gasto.id);
    setError(null);
    setAviso(null);
    try {
      await api(`/expenses/${gasto.id}/payments/${period}/paid`, { method: "PUT", body: { paid: pagado } });
      await cargar();
      setAviso(pagado ? `${gasto.name}: confirmado como pagado.` : `${gasto.name}: vuelve a quedar pendiente de pago.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMarcando(null);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.trim()) return;
    setCreando(true);
    setError(null);
    try {
      await api("/expenses", { method: "POST", body: { name: nuevo.trim() } });
      setNuevo("");
      await cargar();
      setAviso("Gasto agregado. Aparece todos los meses hasta que lo archives.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreando(false);
    }
  };

  /** Cambia el nombre del gasto (el historial de pagos no se toca). */
  const renombrar = async (gasto: Gasto) => {
    const nombre = (nombres[gasto.id] ?? "").trim();
    if (!nombre || nombre === gasto.name) {
      setEditandoId(null);
      return;
    }
    setError(null);
    setAviso(null);
    try {
      await api(`/expenses/${gasto.id}`, { method: "PUT", body: { name: nombre } });
      setEditandoId(null);
      await cargar();
      setAviso("Nombre actualizado.");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  /**
   * Borra el gasto y todo lo cargado en él. Se avisa fuerte porque, a
   * diferencia de archivar, esto no se puede deshacer.
   */
  const eliminar = async (gasto: Gasto) => {
    if (
      !confirm(
        `¿Eliminar "${gasto.name}" definitivamente?\n\nSe borra también todo lo que cargaste de este gasto en meses anteriores. Si solo querés que deje de aparecer, usá Archivar.`,
      )
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    try {
      await api(`/expenses/${gasto.id}`, { method: "DELETE" });
      await cargar();
      setAviso(`"${gasto.name}" se eliminó junto con su historial.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const archivar = async (gasto: Gasto) => {
    const accion = gasto.active ? "archivar" : "reactivar";
    if (gasto.active && !confirm(`¿Archivar "${gasto.name}"? Deja de aparecer en los meses nuevos, pero se conserva lo ya cargado.`)) return;
    setError(null);
    try {
      await api(`/expenses/${gasto.id}`, { method: "PUT", body: { active: !gasto.active } });
      await cargar();
      setAviso(`${gasto.name}: ${accion === "archivar" ? "archivado" : "reactivado"}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const esMesActual = period === periodoActual();
  const total = useMemo(() => datos?.totalCents ?? "0", [datos]);

  if (!desbloqueado) {
    return (
      <div>
        <PageHeader eyebrow="Administración" title="Gastos mensuales" subtitle="Módulo protegido." />
        <section className="card card-pad" style={{ marginTop: 20, maxWidth: 420, display: "grid", gap: 12 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>Ingresá la clave</h3>
          {errorClave ? <Alert tone="error">{errorClave}</Alert> : null}
          <form onSubmit={entrar} style={{ display: "grid", gap: 12 }}>
            <Field label="Clave">
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                autoFocus
                placeholder="••••••"
              />
            </Field>
            <div>
              <button type="submit" className="btn-dark" disabled={verificando || !clave.trim()}>
                {verificando ? "Verificando…" : "Entrar"}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Gastos mensuales"
        subtitle="Cargá mes a mes lo que pagaste de cada gasto fijo."
      />

      {/* Selector de mes: el gasto es el mismo todos los meses, lo que cambia
          es lo que se pagó. */}
      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPeriod(moverPeriodo(period, -1))}>
              ← Mes anterior
            </button>
            <strong style={{ textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>
              {nombrePeriodo(period)}
            </strong>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={esMesActual}
              onClick={() => setPeriod(moverPeriodo(period, 1))}
            >
              Mes siguiente →
            </button>
            {!esMesActual ? (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPeriod(periodoActual())}>
                Ir al mes actual
              </button>
            ) : null}
          </div>
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
            <span>Ver archivados</span>
          </label>
        </div>

        {datos ? (
          <StatStrip>
            <Stat label="Total del mes" value={formatArs(total)} hint="Todo lo cargado, pagado o no" />
            <Stat label="Ya pagado" value={formatArs(datos.pagadoCents)} hint={`${datos.pagados} de ${datos.cargados} cargados`} />
            <Stat label="Falta pagar" value={formatArs(datos.pendienteCents)} />
            <Stat label="Sin cargar" value={String(Math.max(0, datos.sinCargar))} hint="Gastos sin importe este mes" />
          </StatStrip>
        ) : null}
      </section>

      {error ? <div style={{ marginTop: 12 }}><Alert tone="error">{error}</Alert></div> : null}
      {aviso ? <div style={{ marginTop: 12 }}><Alert tone="ok">{aviso}</Alert></div> : null}

      <section className="card card-pad" style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <h3 className="panel-title" style={{ margin: 0 }}>Gastos</h3>

        {cargando ? (
          <Loading label="Cargando gastos…" />
        ) : !datos || datos.items.length === 0 ? (
          <EmptyState title="Todavía no hay gastos cargados">
            Agregá el primero abajo: por ejemplo alquiler, internet o el contador.
          </EmptyState>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {datos.items.map((gasto) => {
              const editado = (montos[gasto.id] ?? "") !== (gasto.amountCents === null ? "" : centsToInput(gasto.amountCents));
              return (
                <div
                  key={gasto.id}
                  className="card card-pad"
                  style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: gasto.active ? 1 : 0.6 }}
                >
                  <div style={{ display: "grid", gap: 2, flex: "1 1 200px", minWidth: 0 }}>
                    {editandoId === gasto.id ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <input
                          value={nombres[gasto.id] ?? gasto.name}
                          autoFocus
                          onChange={(e) => setNombres((prev) => ({ ...prev, [gasto.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void renombrar(gasto);
                            if (e.key === "Escape") setEditandoId(null);
                          }}
                          style={{ flex: "1 1 160px" }}
                        />
                        <button type="button" className="btn-dark btn-sm" onClick={() => void renombrar(gasto)}>
                          Guardar
                        </button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditandoId(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <strong>{gasto.name}</strong>
                    )}
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {!gasto.active
                        ? "Archivado"
                        : gasto.amountCents === null
                          ? "Sin cargar este mes"
                          : gasto.paid
                            ? `Pagado: ${formatArs(gasto.amountCents)}`
                            : `Cargado: ${formatArs(gasto.amountCents)} — falta confirmar el pago`}
                    </span>
                  </div>

                  {/* Tres estados distintos: sin cargar, cargado sin pagar y pagado. */}
                  {gasto.amountCents === null ? (
                    <Pill tone="neutral">Sin cargar</Pill>
                  ) : gasto.paid ? (
                    <Pill tone="ok">Pagado</Pill>
                  ) : (
                    <Pill tone="warn">A pagar</Pill>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MoneyInput
                      aria-label={`Importe pagado de ${gasto.name}`}
                      value={montos[gasto.id] ?? ""}
                      onChange={(v) => setMontos((prev) => ({ ...prev, [gasto.id]: v }))}
                      placeholder="0"
                      style={{ width: 150 }}
                    />
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={guardando === gasto.id || !editado}
                      title="Guarda el importe del mes, sin darlo por pagado"
                      onClick={() => void guardarMonto(gasto)}
                    >
                      {guardando === gasto.id ? "Guardando…" : "Guardar importe"}
                    </button>
                    {/* Confirmar el pago es una acción aparte: se puede tener el
                        importe cargado y todavía no haberlo pagado. */}
                    <button
                      type="button"
                      className={gasto.paid ? "btn-ghost btn-sm" : "btn-dark btn-sm"}
                      disabled={marcando === gasto.id || gasto.amountCents === null || editado}
                      title={
                        gasto.amountCents === null
                          ? "Primero guardá el importe de este mes"
                          : editado
                            ? "Guardá el importe antes de confirmar el pago"
                            : undefined
                      }
                      onClick={() => void marcarPago(gasto, !gasto.paid)}
                    >
                      {marcando === gasto.id
                        ? "Guardando…"
                        : gasto.paid
                          ? "Marcar como no pagado"
                          : "Confirmar pago"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setNombres((prev) => ({ ...prev, [gasto.id]: gasto.name }));
                        setEditandoId(editandoId === gasto.id ? null : gasto.id);
                      }}
                    >
                      Renombrar
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void archivar(gasto)}>
                      {gasto.active ? "Archivar" : "Reactivar"}
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void eliminar(gasto)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={crear} style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del gasto (ej. Alquiler)"
            style={{ flex: "1 1 240px" }}
          />
          <button type="submit" className="btn-dark btn-sm" disabled={creando || !nuevo.trim()}>
            {creando ? "Agregando…" : "Agregar gasto"}
          </button>
        </form>
        <span className="muted" style={{ fontSize: 12.5 }}>
          El gasto queda para todos los meses. Lo que cambia mes a mes es el importe que cargás acá.
        </span>
      </section>
    </div>
  );
}
