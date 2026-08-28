export type CalculatorKind = 'CASH' | 'LIST' | 'PLAN';

export type FinancingSeedPlan = {
  bank: string | null;
  installments: number;
  interestBps: number;
  sortOrder: number;
  active?: boolean;
};

export type SeededPlan = {
  installments: number;
  interestBps: number;
  sortOrder: number;
};

export type SeededGroup = {
  key: string;
  label: string;
  kind: CalculatorKind;
  sortOrder: number;
  note: string | null;
  plans: SeededPlan[];
};

const DEFAULT_ORDER = [
  'cash',
  'list',
  'bbva',
  'mercadopago',
  'gocuotas',
  'otros-bancos',
] as const;

const DEFAULT_LABELS: Record<string, string> = {
  cash: 'Efectivo / Transferencia',
  list: 'Precio de lista',
  bbva: 'BBVA',
  mercadopago: 'Mercado Pago',
  visa: 'Visa',
  mastercard: 'Mastercard',
  gocuotas: 'Go Cuotas',
  'otros-bancos': 'Otros bancos',
};

const FALLBACK_OTROS: SeededPlan[] = [
  {installments: 3, interestBps: 1050, sortOrder: 0},
  {installments: 6, interestBps: 2150, sortOrder: 1},
  {installments: 12, interestBps: 9400, sortOrder: 2},
];

const FALLBACK_BBVA: SeededPlan[] = [
  {installments: 3, interestBps: 0, sortOrder: 0},
  {installments: 6, interestBps: 0, sortOrder: 1},
];

export const DEFAULT_BBVA_NOTE =
  '3 cuotas sin interés viernes y sábados. 6 cuotas sin interés 1 día al mes, generalmente a mediados.';

const DEFAULT_NOTES: Record<string, string> = {
  bbva: DEFAULT_BBVA_NOTE,
  'otros-bancos': 'Con interés. Los valores se calculan sobre el precio de lista.',
};

export function noteForKey(key: string, bbvaNote?: string | null): string | null {
  if (key === 'bbva') {
    const custom = bbvaNote?.trim();
    return custom || DEFAULT_NOTES.bbva!;
  }
  return DEFAULT_NOTES[key] ?? null;
}

function slug(value: string): string {
  const s = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'otro';
}

export function groupKeyFromBank(bank: string | null | undefined): string {
  const n = (bank ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (/bbva/.test(n)) return 'bbva';
  if (/mercado\s*pago|mercadopago/.test(n)) return 'mercadopago';
  if (/\bvisa\b/.test(n) || /master\s*card|\bmastercard\b|\bmaster\b/.test(n) || /otros?\s*bancos?/.test(n)) {
    return 'otros-bancos';
  }
  if (/go\s*cuotas|gocuotas/.test(n)) return 'gocuotas';
  if (!bank?.trim()) return 'otros-bancos';
  return slug(bank);
}

export function labelForKey(key: string, bank?: string | null): string {
  if (DEFAULT_LABELS[key]) return DEFAULT_LABELS[key]!;
  const trimmed = bank?.trim();
  if (trimmed) return trimmed;
  return key
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function uniquePlans(plans: SeededPlan[]): SeededPlan[] {
  const seen = new Set<number>();
  const result: SeededPlan[] = [];
  for (const plan of [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.installments - b.installments)) {
    if (seen.has(plan.installments)) continue;
    seen.add(plan.installments);
    result.push({
      installments: plan.installments,
      interestBps: plan.interestBps,
      sortOrder: result.length,
    });
  }
  return result.length ? result : [{installments: 1, interestBps: 0, sortOrder: 0}];
}

/** Arma los medios de la calculadora a partir de lista + planes de presupuestos. */
export function seedCalculatorGroups(
  listInterestBps: number,
  financing: FinancingSeedPlan[],
  options: {bbvaNote?: string | null} = {},
): SeededGroup[] {
  const listBps = Number.isFinite(listInterestBps) && listInterestBps > 0 ? Math.trunc(listInterestBps) : 0;
  const active = financing.filter((plan) => plan.active !== false);
  const byKey = new Map<string, {bank: string | null; plans: SeededPlan[]}>();

  for (const plan of active) {
    const key = groupKeyFromBank(plan.bank);
    const current = byKey.get(key) ?? {bank: plan.bank, plans: []};
    current.plans.push({
      installments: plan.installments,
      interestBps: plan.interestBps,
      sortOrder: plan.sortOrder,
    });
    if (!current.bank && plan.bank) current.bank = plan.bank;
    byKey.set(key, current);
  }

  const otrosPlans = uniquePlans(byKey.get('otros-bancos')?.plans ?? FALLBACK_OTROS);
  const referencePlans = otrosPlans.length ? otrosPlans : uniquePlans([{installments: 1, interestBps: listBps, sortOrder: 0}]);

  const groups: SeededGroup[] = [
    {
      key: 'cash',
      label: DEFAULT_LABELS.cash!,
      kind: 'CASH',
      sortOrder: 0,
      note: null,
      plans: [{installments: 1, interestBps: 0, sortOrder: 0}],
    },
    {
      key: 'list',
      label: DEFAULT_LABELS.list!,
      kind: 'LIST',
      sortOrder: 1,
      note: '1 pago con tarjeta.',
      plans: [{installments: 1, interestBps: listBps, sortOrder: 0}],
    },
  ];

  const extraKeys = [...byKey.keys()].filter((key) => !DEFAULT_ORDER.includes(key as (typeof DEFAULT_ORDER)[number]));
  const keys = [
    ...DEFAULT_ORDER.filter((key) => key !== 'cash' && key !== 'list'),
    ...extraKeys.sort(),
  ];

  for (const key of keys) {
    const matched = byKey.get(key);
    let plans: SeededPlan[];
    if (matched?.plans.length) {
      plans = uniquePlans(matched.plans);
    } else if (key === 'bbva') {
      plans = uniquePlans(FALLBACK_BBVA);
    } else {
      plans = referencePlans.map((plan, sortOrder) => ({...plan, sortOrder}));
    }
    groups.push({
      key,
      label: labelForKey(key, matched?.bank),
      kind: 'PLAN',
      sortOrder: groups.length,
      note: noteForKey(key, options.bbvaNote),
      plans,
    });
  }

  return groups;
}

/** Interés sobre un importe, misma fórmula que el PDF (half-up en centavos). */
export function applyInterestBps(baseCents: bigint, interestBps: number): bigint {
  const bps = Number.isFinite(interestBps) ? Math.max(0, Math.trunc(interestBps)) : 0;
  return (baseCents * BigInt(10000 + bps) + 5000n) / 10000n;
}

/** Cuota: interés sobre la base y división half-up, igual que en presupuestos. */
export function installmentCents(baseCents: bigint, installments: number, interestBps: number): bigint {
  const count = Number.isSafeInteger(installments) && installments > 0 ? installments : 1;
  const total = applyInterestBps(baseCents, interestBps);
  const n = BigInt(count);
  return (total + n / 2n) / n;
}
