/**
 * Sincronización automática de precios + republicación web.
 *
 * Cuando un producto del catálogo cambia de precio, cualquier presupuesto
 * "PC armada" marcado con QuoteFamily.autoRepublish=true, cuya versión
 * activa esté en borrador y use ese producto, se recalcula (mismos campos
 * que el endpoint manual POST /quotes/:id/prices) y, si ya estaba
 * publicado en WordPress, se vuelve a publicar solo.
 *
 * Solo actúa sobre versiones BORRADOR: una versión enviada es un
 * documento congelado (no se toca), igual que en la sincronización manual.
 * Cualquier error de un presupuesto puntual no interrumpe a los demás
 * (se loguea y se sigue).
 */

import { db } from '@tgs/database';
import { publishQuote } from '@tgs/providers';
import { pricingTotals } from './quotes.js';

export async function syncAutoRepublishForProduct(productId: string): Promise<void> {
  const affectedItems = await db.quoteItem.findMany({
    where: {
      productId,
      version: {
        state: 'BORRADOR',
        family: { autoRepublish: true, isBuiltPc: true },
      },
    },
    select: { versionId: true },
    distinct: ['versionId'],
  });
  if (!affectedItems.length) return;

  for (const { versionId } of affectedItems) {
    try {
      await syncOneVersion(versionId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[auto-republish] fallo al sincronizar versión ${versionId}:`, error);
    }
  }
}

async function syncOneVersion(versionId: string): Promise<void> {
  const shouldRepublish = await db.$transaction(async (tx) => {
    const version = await tx.quoteVersion.findUnique({
      where: { id: versionId },
      include: {
        items: true,
        family: { select: { autoRepublish: true, isBuiltPc: true } },
        webPublication: { select: { status: true } },
      },
    });
    if (!version || version.state !== 'BORRADOR' || !version.family.autoRepublish || !version.family.isBuiltPc) {
      return false;
    }

    const productIds = Array.from(new Set(version.items.map((item) => item.productId).filter((id): id is string => Boolean(id))));
    if (!productIds.length) return false;
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((product) => [product.id, product]));

    for (const item of version.items) {
      if (!item.productId) continue;
      const product = productById.get(item.productId);
      if (!product) continue;
      await tx.quoteItem.update({
        where: { id: item.id },
        data: {
          frozenCostCents: product.costCents,
          frozenMarkupBps: product.markupBps,
          frozenSalePriceCents: product.salePriceCents,
          subtotalCents: product.salePriceCents * BigInt(item.quantity),
          masterPriceAt: product.updatedAt,
          masterCostCents: product.costCents,
          masterSaleCents: product.salePriceCents,
        },
      });
    }

    const items = await tx.quoteItem.findMany({ where: { versionId: version.id } });
    const totals = pricingTotals(items as any);
    await tx.quoteVersion.update({
      where: { id: version.id },
      data: {
        totalCostCents: totals.costCents,
        totalSaleCents: totals.saleCents,
        profitCents: totals.profitCents,
        effectiveMarkupBps: totals.effectiveMarkupBps,
      },
    });

    return version.webPublication?.status === 'PUBLISHED';
  });

  if (shouldRepublish) {
    await publishQuote(versionId);
  }
}
