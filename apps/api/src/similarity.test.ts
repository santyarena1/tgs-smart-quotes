import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {db} from '@tgs/database';
import {actorFrom, hasTestDatabase, resetDatabase, seedBaseline, type Baseline} from '@tgs/testing';
import {QuotesController} from './quotes.js';
import {SimilarityController} from './similarity.js';

const integration = hasTestDatabase() ? describe : describe.skip;

integration('Similarity API (integración real)', () => {
  const quotes = new QuotesController();
  const similarity = new SimilarityController();
  let baseline: Baseline;
  let actor: ReturnType<typeof actorFrom>;

  beforeAll(() => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await resetDatabase(db as never);
    baseline = await seedBaseline(db as never);
    actor = actorFrom(baseline);
  });

  const createDraft = (internalName: string, items: unknown[]) =>
    quotes.create({internalName, items, resolvedPdfConfig: {}} as never, actor) as Promise<any>;

  const accept = async (familyId: string) => {
    await quotes.changeState(familyId, {state: 'ENVIADO'} as never, actor);
    await quotes.changeState(familyId, {state: 'ACEPTADO'} as never, actor);
  };

  it('rankea presupuestos por similitud ponderada por concepto y cachea el resultado', async () => {
    const source = await createDraft('Fuente', [
      {name: 'Ryzen 5 5600G', lineId: baseline.lineId, quantity: 1, costCents: '100000', markupBps: 3000, position: 0},
      {name: 'Fuente 600W', quantity: 1, costCents: '20000', markupBps: 2000, position: 1},
    ]);
    const identical = await createDraft('Idéntico', [
      {name: 'Ryzen 5 5600G', lineId: baseline.lineId, quantity: 1, costCents: '100000', markupBps: 3000, position: 0},
      {name: 'Fuente 600W', quantity: 1, costCents: '20000', markupBps: 2000, position: 1},
    ]);
    const different = await createDraft('Distinto', [
      {name: 'Intel Core i5 13400F', lineId: baseline.lineId, quantity: 1, costCents: '150000', markupBps: 3000, position: 0},
      {name: 'Gabinete NZXT H510', quantity: 1, costCents: '60000', markupBps: 2000, position: 1},
    ]);

    const first = (await similarity.similar(source.family.id, {limit: 10} as never)) as any;

    // Pesos por defecto (CPU 3500 + OTHER 1000 bps; MOTHERBOARD/GPU no aplican por falta de ítems
    // en esa categoría en ambos presupuestos): 35 (CPU idéntico) + 10 (OTHER idéntico) = 45.
    const identicalRow = first.items.find((item: any) => item.familyId === identical.family.id);
    expect(identicalRow).toMatchObject({
      familyId: identical.family.id,
      score: 45,
      breakdown: {CPU: 100, MOTHERBOARD: 0, GPU: 0, OTHER: 100},
    });

    const differentRow = first.items.find((item: any) => item.familyId === different.family.id);
    expect(differentRow.score).toBeLessThan(45);
    expect(first.items[0].familyId).toBe(identical.family.id);

    const cachedCountBefore = await db.similarityCache.count({where: {sourceId: source.family.id}});
    expect(cachedCountBefore).toBe(1);

    const second = (await similarity.similar(source.family.id, {limit: 10} as never)) as any;
    expect(second).toEqual(first);
    const cachedCountAfter = await db.similarityCache.count({where: {sourceId: source.family.id}});
    expect(cachedCountAfter).toBe(1);

    const limited = (await similarity.similar(source.family.id, {limit: 1} as never)) as any;
    expect(limited.items).toHaveLength(1);
    expect(limited.items[0].familyId).toBe(identical.family.id);
  });

  it('mina componentes habituales excluyendo los ya presentes y respetando el soporte mínimo', async () => {
    for (let i = 0; i < 3; i++) {
      const created = await createDraft(`Aceptado ${i}`, [
        {name: 'Ryzen 5 5600G', lineId: baseline.lineId, quantity: 1, costCents: '100000', markupBps: 3000, position: 0},
        {name: 'Motherboard B550', quantity: 1, costCents: '50000', markupBps: 2000, position: 1},
      ]);
      await accept(created.family.id);
    }

    const rareCompanion = await createDraft('Aceptado raro', [
      {name: 'Ryzen 5 5600G', lineId: baseline.lineId, quantity: 1, costCents: '100000', markupBps: 3000, position: 0},
      {name: 'Fuente 750W', quantity: 1, costCents: '30000', markupBps: 2000, position: 1},
    ]);
    await accept(rareCompanion.family.id);

    // Ya tiene "Ryzen 5 5600G" (ítem clave, línea CPU con keyLine=true): debe excluirse de la minería.
    const current = await createDraft('Presupuesto actual', [
      {name: 'Ryzen 5 5600G', lineId: baseline.lineId, quantity: 1, costCents: '100000', markupBps: 3000, position: 0},
    ]);

    const result = (await similarity.habitualComponents(current.family.id, {limit: 10} as never)) as any;

    expect(result.sampleSize).toBe(4);
    expect(result.threshold).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({name: 'Motherboard B550', support: 3, sampleSize: 4});
    expect(result.items.some((item: any) => item.name === 'Fuente 750W')).toBe(false);
    expect(result.items.some((item: any) => item.name === 'Ryzen 5 5600G')).toBe(false);
  });
});
