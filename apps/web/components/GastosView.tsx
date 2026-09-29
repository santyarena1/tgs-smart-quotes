"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { centsToInput, formatArs, parseArsToCents } from "../lib/money";
import {
  Alert,
  Checkbox,
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
import {
  canAdvanceExpensePeriod,
  currentExpensePeriod,
  expensePeriodLabel,
  shiftExpensePeriod,
} from "../lib/expense-period";

/**
 * Gastos mensuales recurrentes.
 *
 * El gasto es solo el concepto ("Alquiler", "Internet"): no tiene monto fijo ni
 * se ajusta por IPC. Al darlo de alta se puede cargar el importe y si ya está
 * pago. Cada mes se completa lo que realmente se pagó (también el mes siguiente)
 * y el módulo suma el total del período.
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

function periodoActual(): string {
  return currentExpensePeriod();
}

function nombrePeriodo(period: string): string {
  return expensePeriodLabel(period);
}

function moverPeriodo(period: string, meses: number): string {
  return shiftExpensePeriod(period, meses);
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
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevoPagado, setNuevoPagado] = useState(false);
  const [nuevoEnMesSiguiente, setNuevoEnMesSiguiente] = useState(false);
  const [creando, setCreando] = useState(false);
  /** Gasto cuyo nombre se está editando, y el texto en curso. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [pagados, setPagados] = useState<Record<string, boolean>>({});
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
      setPagados(Object.fromEntries(res.items.map((g) => [g.id, g.paid])));
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
      await api(`/expenses/${gasto.id}/payments/${period}`, {
        method: "PUT",
        body: { amountCents, paid: amountCents ? (pagados[gasto.id] ?? gasto.paid) : false },
      });
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
      await cargar();
    } finally {
      setMarcando(null);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.trim()) return;
    const texto = nuevoMonto.trim();
    if (nuevoPagado && !texto) {
      setError("Para marcarlo como pagado, cargá el importe.");
      return;
    }
    const hoy = periodoActual();
    const periodDestino = nuevoEnMesSiguiente && period === hoy ? moverPeriodo(hoy, 1) : period;
    setCreando(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: nuevo.trim(), period: periodDestino };
      if (texto) {
        body.amountCents = parseArsToCents(texto);
        body.paid = nuevoPagado;
      }
      await api("/expenses", { method: "POST", body });
      setNuevo("");
      setNuevoMonto("");
      setNuevoPagado(false);
      setNuevoEnMesSiguiente(false);
      if (periodDestino !== period) setPeriod(periodDestino);
      else await cargar();
      setAviso(
        texto
          ? nuevoPagado
            ? `Gasto agregado y marcado como pagado en ${nombrePeriodo(periodDestino)}.`
            : `Gasto agregado con el importe de ${nombrePeriodo(periodDestino)}.`
          : "Gasto agregado. Aparece todos los meses hasta que lo archives.",
      );
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

  const hoy = periodoActual();
  const mesSiguiente = moverPeriodo(hoy, 1);
  const esMesActual = period === hoy;
  const esMesAdelantado = period > hoy;
  const puedeAvanzar = canAdvanceExpensePeriod(period);
  const total = useMemo(() => datos?.totalCents ?? "0", [datos]);

  const cambiarMontoNuevo = (valor: string) => {
    setNuevoMonto(valor);
    if (!valor.trim()) {
      setNuevoPagado(false);
      setNuevoEnMesSiguiente(false);
    }
  };

  const cambiarPagadoFila = (gasto: Gasto, pagado: boolean) => {
    const texto = (montos[gasto.id] ?? "").trim();
    if (pagado && !texto) return;
    setPagados((prev) => ({ ...prev, [gasto.id]: pagado }));
    const amountEditado = texto !== (gasto.amountCents === null ? "" : centsToInput(gasto.amountCents));
    if (!amountEditado && gasto.amountCents !== null) {
      void marcarPago(gasto, pagado);
    }
  };

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
        subtitle="Alta con monto y tilde de pagado. También se puede cargar el mes siguiente."
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
              disabled={!puedeAvanzar}
              title={puedeAvanzar ? `Cargar pagos de ${nombrePeriodo(moverPeriodo(period, 1))}` : "Solo se puede cargar hasta el mes siguiente"}
              onClick={() => setPeriod(moverPeriodo(period, 1))}
            >
              Mes siguiente →
            </button>
            {!esMesActual ? (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPeriod(hoy)}>
                Ir al mes actual
              </button>
            ) : null}
            {esMesAdelantado ? <Pill tone="ok">Mes siguiente</Pill> : null}
          </div>
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
            <span>Ver archivados</span>
          </label>
        </div>

        {esMesActual && puedeAvanzar ? (
          <Alert tone="info">
            <span style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              Podés registrar un pago de {nombrePeriodo(mesSiguiente)} aunque todavía no sea el día 1.
              <button type="button" className="btn-dark btn-sm" onClick={() => setPeriod(mesSiguiente)}>
                Ir a {nombrePeriodo(mesSiguiente)}
              </button>
            </span>
          </Alert>
        ) : null}
        {esMesAdelantado ? (
          <Alert tone="ok">
            Estás cargando {nombrePeriodo(period)}: los importes y tildes quedan en ese mes, no en {nombrePeriodo(hoy)}.
          </Alert>
        ) : null}

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
              const textoMonto = montos[gasto.id] ?? "";
              const pagadoLocal = pagados[gasto.id] ?? gasto.paid;
              const editado =
                textoMonto !== (gasto.amountCents === null ? "" : centsToInput(gasto.amountCents)) ||
                pagadoLocal !== gasto.paid;
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
                            : `Cargado: ${formatArs(gasto.amountCents)} — pendiente`}
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
                      onChange={(v) => {
                        setMontos((prev) => ({ ...prev, [gasto.id]: v }));
                        if (!v.trim()) setPagados((prev) => ({ ...prev, [gasto.id]: false }));
                      }}
                      placeholder="0"
                      style={{ width: 150 }}
                    />
                    <Checkbox
                      label="Pagado"
                      checked={pagadoLocal}
                      disabled={marcando === gasto.id || !textoMonto.trim()}
                      onChange={(pagado) => cambiarPagadoFila(gasto, pagado)}
                    />
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={guardando === gasto.id || !editado}
                      title="Guarda el importe y si está pago"
                      onClick={() => void guardarMonto(gasto)}
                    >
                      {guardando === gasto.id ? "Guardando…" : "Guardar"}
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

        <form onSubmit={crear} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del gasto (ej. Alquiler)"
            style={{ flex: "1 1 180px" }}
          />
          <MoneyInput
            aria-label="Monto del gasto"
            value={nuevoMonto}
            onChange={cambiarMontoNuevo}
            placeholder="Monto"
            style={{ width: 150 }}
          />
          <Checkbox
            label="Ya está pago"
            checked={nuevoPagado}
            disabled={!nuevoMonto.trim()}
            onChange={setNuevoPagado}
          />
          {esMesActual && puedeAvanzar ? (
            <Checkbox
              label={`Pago de ${nombrePeriodo(mesSiguiente)}`}
              checked={nuevoEnMesSiguiente}
              disabled={!nuevoMonto.trim()}
              onChange={setNuevoEnMesSiguiente}
            />
          ) : null}
          <button type="submit" className="btn-dark btn-sm" disabled={creando || !nuevo.trim()}>
            {creando ? "Agregando…" : "Agregar gasto"}
          </button>
        </form>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {esMesAdelantado
            ? `El alta con monto queda cargada en ${nombrePeriodo(period)}.`
            : "El gasto queda para todos los meses. En el alta ya podés poner el monto y si está pago."}
        </span>
      </section>
    </div>
  );
}
