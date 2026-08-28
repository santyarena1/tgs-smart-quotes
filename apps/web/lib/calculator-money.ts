/** Misma fórmula que el PDF / presupuestos: half-up en centavos, sin floats. */
export function applyInterestBps(baseCents: bigint, interestBps: number): bigint {
  const bps = Number.isFinite(interestBps) ? Math.max(0, Math.trunc(interestBps)) : 0;
  return (baseCents * BigInt(10000 + bps) + 5000n) / 10000n;
}

export function installmentCents(baseCents: bigint, installments: number, interestBps: number): bigint {
  const count = Number.isSafeInteger(installments) && installments > 0 ? installments : 1;
  const total = applyInterestBps(baseCents, interestBps);
  const n = BigInt(count);
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
