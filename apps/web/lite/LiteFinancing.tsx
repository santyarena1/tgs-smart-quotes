"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import { BBVA_DEFAULT_BPS, financingTotalCents, isBbvaBank } from "@tgs/contracts";
import { bpsToPct, formatArs, parseArsToCents } from "../lib/money";
import { MoneyInput } from "../components/shared";
import type { FinancingPlan } from "../lib/types";
import bbvaLogo from "./fin-logos/bbva.jpg";
import bancoLogo from "./fin-logos/banco.png";
import mpLogo from "./fin-logos/mercadopago.png";
import goLogo from "./fin-logos/gocuotas.jpg";

const withInterest = (base: bigint, bps: number) => (base * BigInt(10000 + bps) + 5000n) / 10000n;
const norm = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Kind = "bbva" | "single" | "others" | "mp" | "go";

const LOGOS: Record<Kind, { src: string; alt: string }> = {
  bbva: { src: bbvaLogo.src, alt: "BBVA" },
  single: { src: bancoLogo.src, alt: "1 pago" },
  others: { src: bancoLogo.src, alt: "Otros bancos" },
  mp: { src: mpLogo.src, alt: "Mercado Pago" },
  go: { src: goLogo.src, alt: "GoCuotas" },
};

type Block = {
  id: string;
  kind: Kind;
  installments: number;
  interestBps: number;
  name: string;
  /** Monto financiado total (con interés). */
  total: bigint;
  /** Valor de cada cuota. */
  each: bigint;
};

/** Grupo visual según el banco cargado en Configuración. */
function kindOf(bank: string | null): Kind {
  const b = norm(bank ?? "");
  if (isBbvaBank(bank)) return "bbva";
  if (b.includes("go") && b.includes("cuota")) return "go";
  if (b.includes("mercado")) return "mp";
  return "others";
}

function nameOf(kind: Kind, plan: FinancingPlan): string {
  if (kind === "bbva") return "BBVA";
  if (kind === "go") return "GoCuotas";
  if (kind === "mp") return "Mercado Pago";
  return /otros/i.test(plan.bank ?? "") || !plan.bank ? "Otros Bancos" : plan.bank;
}

const ORDER: Kind[] = ["bbva", "single", "others", "mp", "go"];

/**
 * Cómo queda financiado lo que se está cargando. Misma cuenta que el PDF:
 * BBVA sale del efectivo + 8 %; el resto, del precio de lista (efectivo + interés de lista).
 * Cualquier banco en 1, 3 y 6 pagos vale lo mismo que la lista.
 */
export const LiteFinancing = memo(function LiteFinancing({ totalCents: quoteCents, plans, listInterestBps, loaded, onHide, settingsHref = "/lite/configuracion?tab=financiacion" }: {
  totalCents: bigint;
  /** Tapa la columna (ojito). Se recuerda por usuario. */
  onHide: () => void;
  plans: FinancingPlan[];
  listInterestBps: number;
  loaded: boolean;
  /** Configuración de intereses: LITE y suite apuntan a su propia pantalla. */
  settingsHref?: string;
}) {
  // Monto manual: sirve para ver cómo queda en cuotas un valor cualquiera, sin cargar productos.
  const [manual, setManual] = useState("");
  const manualCents = useMemo(() => {
    if (!manual.trim()) return null;
    try { return BigInt(parseArsToCents(manual)); } catch { return null; }
  }, [manual]);
  const totalCents = manualCents ?? quoteCents;
  const hasTotal = totalCents > 0n;
  const listCents = useMemo(() => withInterest(totalCents, listInterestBps), [totalCents, listInterestBps]);

  const blocks = useMemo<Block[]>(() => {
    const block = (id: string, kind: Kind, installments: number, interestBps: number, name: string, total: bigint): Block => {
      const n = BigInt(installments);
      return { id, kind, installments, interestBps, name, total, each: (total + n / 2n) / n };
    };
    // 3 y 6 de cualquier banco van siempre, a precio de lista; lo configurado para esas cantidades no suma.
    const anyBank = [3, 6].map((n) => block(`any-${n}`, "others", n, 0, "Cualquier banco", listCents));
    const bbvaSeen = new Set<number>();
    const fromPlans: Block[] = [];
    for (const plan of plans) {
      const kind = kindOf(plan.bank);
      if (kind === "others" && (plan.installments === 3 || plan.installments === 6)) continue;
      if (kind === "bbva") {
        if (plan.installments === 1 || bbvaSeen.has(plan.installments)) continue;
        bbvaSeen.add(plan.installments);
      }
      const bps = kind === "bbva" && plan.interestBps <= 0 ? BBVA_DEFAULT_BPS : plan.interestBps;
      fromPlans.push(block(plan.id, kind, plan.installments, bps, nameOf(kind, plan), financingTotalCents(totalCents, listCents, plan)));
    }
    // BBVA en 1 pago: mismo recargo que sus cuotas.
    const bbvaPlan = plans.find((plan) => isBbvaBank(plan.bank));
    if (bbvaPlan) {
      const bps = bbvaPlan.interestBps > 0 ? bbvaPlan.interestBps : BBVA_DEFAULT_BPS;
      fromPlans.push(block("bbva-1", "bbva", 1, bps, "BBVA", financingTotalCents(totalCents, listCents, bbvaPlan)));
    }
    const single = block("single", "single", 1, listInterestBps, "1 pago · Cualquier banco", listCents);
    return [...fromPlans, ...anyBank, single].sort((a, b) =>
      ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.installments - b.installments);
  }, [plans, totalCents, listCents, listInterestBps]);

  return (
    <aside className="lt-fin" aria-label="Financiación">
      <div className="lt-fin-head">
        <h2>Financiación</h2>
        <button type="button" className="lt-gear lt-eye" onClick={onHide} title="Ocultar la financiación" aria-label="Ocultar la financiación">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <Link href={settingsHref} className="lt-gear" title="Configurar intereses y cuotas" aria-label="Configurar intereses y cuotas">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.62.8 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09c-.76 0-1.36.41-1.51 1z" />
          </svg>
        </Link>
      </div>

      <div className="lt-fin-cash">
        <span>{manualCents !== null ? "Efectivo / transf. (manual)" : "Super descuento TGS solo en efectivo o transferencia"}</span>
        <strong>{hasTotal ? formatArs(totalCents) : "—"}</strong>
      </div>
      <div className="lt-fin-manual">
        <MoneyInput className="lt-input" value={manual} onChange={setManual} placeholder="Probar otro monto…" aria-label="Monto manual para calcular cuotas" />
        {manual ? <button type="button" className="lt-fin-clear" onClick={() => setManual("")} aria-label="Volver al total del presupuesto" title="Volver al total del presupuesto">×</button> : null}
      </div>

      {!loaded ? (
        <p className="lt-fin-empty">Cargando planes…</p>
      ) : (
        <ul className="lt-fin-list">
          {blocks.map((b) => (
            <li key={b.id} className={`lt-fin-card k-${b.kind}${hasTotal ? "" : " dim"}`}>
              <img className="lt-fin-ico" src={LOGOS[b.kind].src} alt={LOGOS[b.kind].alt} width={56} height={56} />
              <div className="lt-fin-body">
                <div className="lt-fin-top">
                  <span className="lt-fin-n">{b.installments === 1 ? "1 pago" : `${b.installments} cuotas`}</span>
                  <span className={`lt-fin-tag${b.interestBps === 0 || b.kind === "bbva" ? " free" : ""}`}>{b.kind === "bbva" ? "Super precio BBVA" : b.interestBps === 0 ? "Sin interés" : `+${bpsToPct(b.interestBps)}%`}</span>
                </div>
                <strong className="lt-fin-amt">{hasTotal ? formatArs(b.each) : "—"}</strong>
                <div className="lt-fin-bot">
                  <span className="lt-fin-name">{b.name}</span>
                  <span className="lt-fin-total">Total: <b>{hasTotal ? formatArs(b.total) : "—"}</b></span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {loaded && !plans.length ? <p className="lt-fin-empty">No hay planes activos. <Link href={settingsHref}>Configurarlos</Link></p> : null}
      {loaded && !hasTotal ? <p className="lt-fin-empty">Cargá productos o un monto manual y las cuotas se calculan solas.</p> : null}
    </aside>
  );
});
