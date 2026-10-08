import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { db } from '@tgs/database';
import { z } from 'zod';
import { ZodPipe } from './infrastructure.js';
import { categoryFor, type IvaCategory } from './iva-categories.js';

/** Hasta cuánto suma una misma categoría y alícuota por búsqueda, para que una búsqueda larga no tape lo que se elige a mano. */
const MAX_PER_BATCH = 3;

export type IvaObservation = { name: string; nodoCategory?: string | null; ivaBps: number };

/** Anota las alícuotas vistas (NODO o elegidas al presupuestar). Nunca rompe el flujo que lo llama. */
export async function recordIvaObservations(observations: IvaObservation[]): Promise<void> {
  try {
    const counts = new Map<string, { category: IvaCategory; ivaBps: number; n: number }>();
    for (const obs of observations) {
      if (!Number.isInteger(obs.ivaBps) || obs.ivaBps < 0 || obs.ivaBps > 10000) continue;
      const category = categoryFor(obs.name, obs.nodoCategory);
      if (!category) continue;
      const id = `${category.key}|${obs.ivaBps}`;
      const entry = counts.get(id) ?? { category, ivaBps: obs.ivaBps, n: 0 };
      entry.n += 1;
      counts.set(id, entry);
    }
    for (const { category, ivaBps, n } of counts.values()) {
      const inc = Math.min(n, MAX_PER_BATCH);
      await db.ivaCategoryStat.upsert({
        where: { categoryKey_ivaBps: { categoryKey: category.key, ivaBps } },
        update: { samples: { increment: inc }, lastSeenAt: new Date() },
        create: { categoryKey: category.key, ivaBps, samples: inc },
      });
    }
  } catch {
    // La memoria es una ayuda: si falla, el presupuesto sigue igual.
  }
}

export type IvaSuggestion = { ivaBps: number; categoryKey: string; categoryLabel: string; samples: number };

/** La alícuota más vista en la categoría del producto, o null si no se reconoce o todavía no hay datos. */
export async function suggestIva(name: string, nodoCategory?: string | null): Promise<IvaSuggestion | null> {
  const category = categoryFor(name, nodoCategory);
  if (!category) return null;
  const top = await db.ivaCategoryStat.findFirst({
    where: { categoryKey: category.key },
    orderBy: [{ samples: 'desc' }, { lastSeenAt: 'desc' }],
  });
  return top ? { ivaBps: top.ivaBps, categoryKey: category.key, categoryLabel: category.label, samples: top.samples } : null;
}

const suggestQuery = z.object({ name: z.string().trim().min(2).max(300) }).strict();
const learnBody = z
  .object({ items: z.array(z.object({ name: z.string().trim().min(2).max(300), ivaBps: z.number().int().min(0).max(10000) }).strict()).min(1).max(200) })
  .strict();

@Controller('iva')
export class IvaController {
  /** Sugerencia de IVA para un producto (por nombre) según lo aprendido de su categoría. */
  @Get('suggest')
  async suggest(@Query(new ZodPipe(suggestQuery)) query: z.infer<typeof suggestQuery>) {
    return { suggestion: await suggestIva(query.name) };
  }

  /** Lo que se eligió al armar un presupuesto también enseña a la memoria. */
  @Post('learn')
  async learn(@Body(new ZodPipe(learnBody)) body: z.infer<typeof learnBody>) {
    await recordIvaObservations(body.items);
    return { ok: true };
  }

  /** Memoria completa: la alícuota más vista de cada categoría (para revisar qué aprendió). */
  @Get('memory')
  async memory() {
    const rows = await db.ivaCategoryStat.findMany({ orderBy: [{ categoryKey: 'asc' }, { samples: 'desc' }] });
    const byCategory = new Map<string, Array<{ ivaBps: number; samples: number }>>();
    for (const row of rows) byCategory.set(row.categoryKey, [...(byCategory.get(row.categoryKey) ?? []), { ivaBps: row.ivaBps, samples: row.samples }]);
    return { items: [...byCategory.entries()].map(([categoryKey, rates]) => ({ categoryKey, ivaBps: rates[0]!.ivaBps, rates })) };
  }
}

/** Hasta cuántas muestras reparte la línea base en cada categoría: alcanza para sugerir, pero lo que se elige a mano después todavía pesa. */
const BASELINE_PER_CATEGORY = 30;

export type IvaBaselineRow = { categoryKey: string; ivaBps: number; samples: number };

/**
 * Línea base de la memoria a partir de un recorrido del catálogo de NODO: cuenta cada alícuota por categoría
 * y reparte las muestras en proporción (una categoría que es 95 % a 10,5 % queda sugiriendo 10,5 %).
 */
export function buildIvaBaseline(offers: ReadonlyArray<IvaObservation>): IvaBaselineRow[] {
  const byCategory = new Map<string, Map<number, number>>();
  for (const offer of offers) {
    if (!Number.isInteger(offer.ivaBps) || offer.ivaBps < 0 || offer.ivaBps > 10000) continue;
    const category = categoryFor(offer.name, offer.nodoCategory);
    if (!category) continue;
    const rates = byCategory.get(category.key) ?? new Map<number, number>();
    rates.set(offer.ivaBps, (rates.get(offer.ivaBps) ?? 0) + 1);
    byCategory.set(category.key, rates);
  }
  const rows: IvaBaselineRow[] = [];
  for (const [categoryKey, rates] of byCategory) {
    const total = [...rates.values()].reduce((a, b) => a + b, 0);
    for (const [ivaBps, count] of rates) {
      rows.push({ categoryKey, ivaBps, samples: Math.max(1, Math.round((count / total) * BASELINE_PER_CATEGORY)) });
    }
  }
  return rows.sort((a, b) => a.categoryKey.localeCompare(b.categoryKey) || b.samples - a.samples);
}

/** Guarda la línea base sin pisar lo aprendido: si la fila ya existe, queda con el mayor de los dos valores. */
export async function applyIvaBaseline(rows: IvaBaselineRow[]): Promise<number> {
  for (const row of rows) {
    const existing = await db.ivaCategoryStat.findUnique({ where: { categoryKey_ivaBps: { categoryKey: row.categoryKey, ivaBps: row.ivaBps } } });
    if (!existing) await db.ivaCategoryStat.create({ data: row });
    else if (existing.samples < row.samples) await db.ivaCategoryStat.update({ where: { categoryKey_ivaBps: { categoryKey: row.categoryKey, ivaBps: row.ivaBps } }, data: { samples: row.samples } });
  }
  return rows.length;
}
