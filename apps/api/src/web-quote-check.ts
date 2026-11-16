/**
 * Presupuesto Web: vencimiento a los 2 días y revisión de precios y stock contra la tienda.
 *
 * Cada presupuesto web guarda en `QuoteVersion.webMeta` qué producto de la tienda es cada componente.
 * Pasado el vencimiento (o a pedido) se consulta la tienda:
 *   - sin stock / ya no publicado / cambió el precio → se guarda un aviso en `alertsJson` (se ve en los listados);
 *   - si la versión sigue en BORRADOR, además se actualizan los precios, la garantía (7 %) y los totales.
 * Una versión ya enviada es un documento congelado: solo recibe avisos.
 */
import { Controller, Logger, NotFoundException, Param, Post } from "@nestjs/common";
import { idSchema, type QuoteWebMeta } from "@tgs/contracts";
import { db, Prisma } from "@tgs/database";
import { formatArsFromCents } from "@tgs/pdf";
import { markupFromPrices, totals } from "@tgs/pricing";
import { ZodPipe } from "./infrastructure.js";
import { fetchStoreProductsByIds } from "./web-store.js";
import type { WebResult } from "./web-store-mapping.js";

const logger = new Logger("WebQuoteCheck");

/** Un presupuesto web vale 2 días. */
export const WEB_QUOTE_TTL_MS = 2 * 86_400_000;
/** Garantía extendida TGS: 7 % del total de los componentes (sin armado, garantía ni licencia), igual que al crearlo. */
export const EXTENDED_WARRANTY_BPS = 700n;

export type WebAlertType = "OUT_OF_STOCK" | "PRICE_CHANGED" | "NOT_FOUND";
export type WebAlert = { type: WebAlertType; itemName: string; message: string; at: string };
type MetaItem = QuoteWebMeta["items"][number];
export type StoreSnapshot = Pick<WebResult, "id" | "priceCents" | "inStock">;

/** Líneas que no son componentes: se recalculan o no se tocan. */
const EXTRA_RE = /^\s*(armado\b|garant[ií]a extendida|licencia\b.*windows|windows\s?11)/i;
const WARRANTY_RE = /^\s*garant[ií]a extendida/i;
export const isExtraLineName = (name: string) => EXTRA_RE.test(name);
export const isWarrantyLineName = (name: string) => WARRANTY_RE.test(name);

/** 7 % del total de componentes, redondeado al peso (mismo cálculo que el creador del presupuesto web). */
export function warrantyCents(componentsTotalCents: bigint): bigint {
  const raw = (componentsTotalCents * EXTENDED_WARRANTY_BPS + 5_000n) / 10_000n;
  return ((raw + 50n) / 100n) * 100n;
}

/** Compara lo guardado con lo que dice hoy la tienda. Un producto que ya no existe o sin stock avisa; un precio distinto avisa y se actualiza. */
export function diffWebItems(
  items: MetaItem[],
  current: Map<number, StoreSnapshot>,
  now: Date,
): { alerts: WebAlert[]; priceUpdates: Map<number, string> } {
  const alerts: WebAlert[] = [];
  const priceUpdates = new Map<number, string>();
  const at = now.toISOString();
  for (const item of items) {
    const live = current.get(item.webProductId);
    if (!live) {
      alerts.push({ type: "NOT_FOUND", itemName: item.name, at, message: `${item.name}: ya no figura publicado en la web.` });
      continue;
    }
    if (!live.inStock) {
      alerts.push({ type: "OUT_OF_STOCK", itemName: item.name, at, message: `${item.name}: sin stock en la web.` });
    }
    if (live.priceCents !== item.priceCents) {
      priceUpdates.set(item.webProductId, live.priceCents);
      alerts.push({
        type: "PRICE_CHANGED",
        itemName: item.name,
        at,
        message: `${item.name}: cambió el precio en la web (${formatArsFromCents(BigInt(item.priceCents))} → ${formatArsFromCents(BigInt(live.priceCents))}).`,
      });
    }
  }
  return { alerts, priceUpdates };
}

export function readWebMeta(raw: unknown): QuoteWebMeta | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) return null;
  return raw as QuoteWebMeta;
}

export type CheckResult = { versionId: string; alerts: WebAlert[]; updatedPrices: boolean };

/** Revisa una versión web contra la tienda. Si la tienda no responde devuelve null y se reintenta en la próxima pasada. */
export async function checkWebVersion(versionId: string, now = new Date()): Promise<CheckResult | null> {
  const version = await db.quoteVersion.findUnique({ where: { id: versionId }, include: { items: true } });
  const meta = version ? readWebMeta(version.webMeta) : null;
  if (!version || !meta) return null;

  let live: WebResult[];
  try {
    live = await fetchStoreProductsByIds(meta.items.map((i) => i.webProductId));
  } catch (error) {
    logger.warn(JSON.stringify({ event: "web_quote_check_failed", versionId, error: error instanceof Error ? error.message : String(error) }));
    return null;
  }
  const { alerts, priceUpdates } = diffWebItems(meta.items, new Map(live.map((p) => [p.id, p])), now);
  const draft = version.state === "BORRADOR";
  const nextExpiry = new Date(now.getTime() + WEB_QUOTE_TTL_MS);

  if (!draft || priceUpdates.size === 0) {
    await db.quoteVersion.update({
      where: { id: versionId },
      data: {
        checkedAt: now,
        alertsJson: alerts as unknown as Prisma.InputJsonValue,
        ...(draft ? { expiresAt: nextExpiry } : {}),
      },
    });
    return { versionId, alerts, updatedPrices: false };
  }

  await db.$transaction(async (tx) => {
    const byName = new Map(meta.items.map((i) => [i.name.trim().toUpperCase(), i]));
    const rows = version.items.map((item) => ({ ...item }));
    for (const row of rows) {
      const entry = byName.get(row.frozenName.trim().toUpperCase());
      const next = entry ? priceUpdates.get(entry.webProductId) : undefined;
      if (!entry || next === undefined) continue;
      row.frozenSalePriceCents = BigInt(next);
      row.frozenMarkupBps = markupFromPrices(row.frozenCostCents, row.frozenSalePriceCents);
      row.subtotalCents = row.frozenSalePriceCents * BigInt(row.quantity);
    }
    // La garantía depende del total de los componentes.
    const componentsTotal = rows.filter((r) => !isExtraLineName(r.frozenName)).reduce((sum, r) => sum + r.subtotalCents, 0n);
    for (const row of rows) {
      if (!isWarrantyLineName(row.frozenName)) continue;
      row.frozenSalePriceCents = warrantyCents(componentsTotal);
      row.frozenMarkupBps = markupFromPrices(row.frozenCostCents, row.frozenSalePriceCents);
      row.subtotalCents = row.frozenSalePriceCents * BigInt(row.quantity);
    }
    for (const row of rows) {
      await tx.quoteItem.update({
        where: { id: row.id },
        data: { frozenSalePriceCents: row.frozenSalePriceCents, frozenMarkupBps: row.frozenMarkupBps, subtotalCents: row.subtotalCents },
      });
    }
    const sum = totals(rows.map((r) => ({ costCents: r.frozenCostCents, salePriceCents: r.frozenSalePriceCents, quantity: r.quantity })));
    const nextMeta: QuoteWebMeta = {
      ...meta,
      items: meta.items.map((i) => ({ ...i, priceCents: priceUpdates.get(i.webProductId) ?? i.priceCents })),
    };
    await tx.quoteVersion.update({
      where: { id: versionId },
      data: {
        totalCostCents: sum.costCents,
        totalSaleCents: sum.saleCents,
        profitCents: sum.profitCents,
        effectiveMarkupBps: sum.effectiveMarkupBps,
        webMeta: nextMeta as unknown as Prisma.InputJsonValue,
        checkedAt: now,
        expiresAt: nextExpiry,
        alertsJson: alerts as unknown as Prisma.InputJsonValue,
      },
    });
  });
  return { versionId, alerts, updatedPrices: true };
}

/** Versiones web vencidas que todavía no se revisaron después de vencer. */
export async function checkExpiredWebVersions(now = new Date()): Promise<number> {
  const due = await db.quoteVersion.findMany({
    where: { webMeta: { not: Prisma.DbNull }, expiresAt: { lte: now }, state: { in: ["BORRADOR", "ENVIADO"] } },
    select: { id: true },
    take: 25,
    orderBy: { expiresAt: "asc" },
  });
  let done = 0;
  for (const { id } of due) {
    try {
      if (await checkWebVersion(id, now)) done += 1;
    } catch (error) {
      logger.warn(JSON.stringify({ event: "web_quote_check_error", versionId: id, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  return done;
}

let timer: NodeJS.Timeout | null = null;

/** Cada 15 minutos revisa los presupuestos web vencidos. */
export function startWebQuoteWatcher(): void {
  if (timer) return;
  const tick = async () => {
    try {
      await checkExpiredWebVersions();
    } catch (error) {
      logger.warn(JSON.stringify({ event: "web_quote_watcher_failed", error: error instanceof Error ? error.message : String(error) }));
    } finally {
      timer = setTimeout(() => void tick(), 15 * 60_000);
    }
  };
  timer = setTimeout(() => void tick(), 60_000);
}

@Controller("quotes")
export class WebQuoteCheckController {
  /** Revisar ahora los precios y el stock de la versión activa de un presupuesto web. */
  @Post(":id/web-check")
  async check(@Param("id", new ZodPipe(idSchema)) id: string) {
    const family = await db.quoteFamily.findUnique({ where: { id }, select: { activeVersion: true } });
    if (!family) throw new NotFoundException("Presupuesto inexistente");
    const version = await db.quoteVersion.findUnique({
      where: { familyId_version: { familyId: id, version: family.activeVersion } },
      select: { id: true, webMeta: true },
    });
    if (!version || !readWebMeta(version.webMeta)) throw new NotFoundException("Este presupuesto no es un Presupuesto Web");
    const result = await checkWebVersion(version.id);
    if (!result) return { checked: false, alerts: [], updatedPrices: false };
    return { checked: true, alerts: result.alerts, updatedPrices: result.updatedPrices };
  }
}
