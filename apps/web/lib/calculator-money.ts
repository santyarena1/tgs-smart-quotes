function normalizedBps(interestBps: number): number {
  return Number.isFinite(interestBps) ? Math.max(0, Math.trunc(interestBps)) : 0;
}

function installmentCount(installments: number): number {
  return Number.isSafeInteger(installments) && installments > 0 ? installments : 1;
}

/** Misma fórmula que el PDF / presupuestos: half-up en centavos, sin floats. */
export function applyInterestBps(baseCents: bigint, interestBps: number): bigint {
  const bps = normalizedBps(interestBps);
  return (baseCents * BigInt(10000 + bps) + 5000n) / 10000n;
}

export function installmentCents(baseCents: bigint, installments: number, interestBps: number): bigint {
  const total = applyInterestBps(baseCents, interestBps);
  const n = BigInt(installmentCount(installments));
  return (total + n / 2n) / n;
}

/**
 * Total de un medio de la calculadora.
 * El % se aplica una sola vez sobre el efectivo. 0% = cuotas sin interés (precio de lista).
 * No se acumula el % de lista con el del medio: 13% de $10 es $11, no $13.
 */
export function planTotalCents(
  cashCents: bigint,
  listCents: bigint,
  interestBps: number,
): bigint {
  const bps = normalizedBps(interestBps);
  if (bps === 0) return listCents;
  return applyInterestBps(cashCents, bps);
}

export function planInstallmentCents(
  cashCents: bigint,
  listCents: bigint,
  installments: number,
  interestBps: number,
): bigint {
  const total = planTotalCents(cashCents, listCents, interestBps);
  const n = BigInt(installmentCount(installments));
  return (total + n / 2n) / n;
}

export function slugFromLabel(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "medio";
}
