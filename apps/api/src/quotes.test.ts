import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {db} from '@tgs/database';
import {actorFrom, hasTestDatabase, resetDatabase, seedBaseline, type Baseline} from '@tgs/testing';
import {CollectionsController, QuotesController, RequestsController} from './quotes.js';

const integration = hasTestDatabase() ? describe : describe.skip;

const itemsFixture = (lineId: string) => [
  {name: 'Ryzen 5 5600G', lineId, quantity: 1, costCents: '100000', markupBps: 3000, position: 0},
  {name: 'Motherboard B550', quantity: 2, costCents: '50000', markupBps: 2000, position: 1},
];

integration('Block 2 — presupuestos core (integración real)', () => {
  const quotes = new QuotesController();
  const collections = new CollectionsController();
  const requests = new RequestsController();
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

  const createQuote = () =>
    quotes.create(
      {
        internalName: 'PC gamer julio',
        isBuiltPc: true,
        items: itemsFixture(baseline.lineId),
        resolvedPdfConfig: {},
      } as never,
      actor,
    ) as Promise<any>;

  it('crea familia, versión 1 y totales calculados con pricing', async () => {
    const created = await createQuote();

    expect(created.family.visibleNumber).toMatch(/^TGS-\d{8}-0001$/);
    expect(created.family.activeVersion).toBe(1);
    expect(created.version.state).toBe('BORRADOR');
    expect(created.items).toHaveLength(2);

    // 130000 + 2 x 60000 = 250000 de venta sobre 200000 de costo
    expect(created.version.totalCostCents).toBe('200000');
    expect(created.version.totalSaleCents).toBe('250000');
    expect(created.version.profitCents).toBe('50000');
    expect(created.version.effectiveMarkupBps).toBe(2500);

    const events = await db.quoteStatusEvent.findMany({where: {familyId: created.family.id}});
    expect(events.map((event) => event.type)).toContain('PRESUPUESTO_CREADO');
  });

  it('congela nombre, costo, markup y venta en cada ítem', async () => {
    const created = await createQuote();
    const item = await db.quoteItem.findFirstOrThrow({
      where: {versionId: created.version.id},
      orderBy: {position: 'asc'},
    });

    expect(item.frozenName).toBe('Ryzen 5 5600G');
    expect(item.frozenCostCents).toBe(100000n);
    expect(item.frozenMarkupBps).toBe(3000);
    expect(item.frozenSalePriceCents).toBe(130000n);
    expect(item.subtotalCents).toBe(130000n);
  });

  it('mantiene inmutable la versión enviada y exige una nueva versión', async () => {
    const created = await createQuote();
    await quotes.changeState(created.family.id, {state: 'ENVIADO'} as never, actor);

    await expect(
      quotes.update(created.family.id, {internalName: 'Intento de edición'} as never, actor),
    ).rejects.toMatchObject({
      message: 'La versión no es editable; cree una nueva versión con POST /quotes/:id/version',
    });

    const next: any = await quotes.createVersion(
      created.family.id,
      {reason: 'Cambio de precios'} as never,
      actor,
    );

    expect(next.version.version).toBe(2);
    expect(next.version.state).toBe('BORRADOR');
    expect(next.items).toHaveLength(2);

    const sent = await db.quoteVersion.findUniqueOrThrow({where: {id: created.version.id}});
    expect(sent.state).toBe('ENVIADO');
    expect(sent.sentAt).not.toBeNull();
  });

  it('al enviar una versión nueva reemplaza solo la anterior enviada', async () => {
    const created = await createQuote();
    await quotes.changeState(created.family.id, {state: 'ENVIADO'} as never, actor);
    await quotes.createVersion(created.family.id, {reason: 'Ajuste'} as never, actor);
    const result: any = await quotes.changeState(
      created.family.id,
      {state: 'ENVIADO'} as never,
      actor,
    );

    expect(result.replaced).toHaveLength(1);
    const previous = await db.quoteVersion.findUniqueOrThrow({where: {id: created.version.id}});
    expect(previous.state).toBe('REEMPLAZADO');
    expect(result.version.state).toBe('ENVIADO');

    const replacementEvents = await db.quoteStatusEvent.findMany({where: {type: 'REEMPLAZO'}});
    expect(replacementEvents).toHaveLength(1);
  });

  it('ajusta el total objetivo distribuyendo el residuo y auditando', async () => {
    const created = await createQuote();

    const result: any = await quotes.retarget(
      created.family.id,
      {targetTotalCents: '260000'} as never,
      actor,
    );

    expect(result.version.totalSaleCents).toBe('260000');
    expect(result.version.totalCostCents).toBe('200000');
    expect(result.version.profitCents).toBe('60000');

    const stored = await db.quoteItem.findMany({where: {versionId: created.version.id}});
    const sum = stored.reduce((acc, item) => acc + item.subtotalCents, 0n);
    expect(sum).toBe(260000n);

    const events = await db.quoteStatusEvent.findMany({where: {type: 'TOTAL_AJUSTADO'}});
    expect(events).toHaveLength(1);
  });

  it('rechaza un total objetivo por debajo del costo', async () => {
    const created = await createQuote();

    await expect(
      quotes.retarget(created.family.id, {targetTotalCents: '100000'} as never, actor),
    ).rejects.toMatchObject({message: 'El total objetivo no puede ser menor al costo total'});
  });

  it('registra aceptación con trazabilidad y actividad', async () => {
    const created = await createQuote();
    await quotes.changeState(created.family.id, {state: 'ENVIADO'} as never, actor);
    const accepted: any = await quotes.changeState(
      created.family.id,
      {state: 'ACEPTADO', reason: 'Cliente confirmó'} as never,
      actor,
    );

    expect(accepted.version.state).toBe('ACEPTADO');
    expect(accepted.version.lastActivityAt).not.toBeNull();
    const events = await db.quoteStatusEvent.findMany({where: {type: 'ACEPTACION'}});
    expect(events).toHaveLength(1);
    expect(events[0]!.userId).toBe(baseline.userId);
  });

  it('vincula presupuestos a colecciones sin duplicar membresías', async () => {
    const created = await createQuote();
    const collection: any = await collections.create(
      {name: 'PC GAMER', familyIds: [created.family.id], favorite: true} as never,
      actor,
    );

    expect(await db.collectionQuote.count({where: {collectionId: collection.id}})).toBe(1);

    await collections.update(collection.id, {familyIds: [created.family.id]} as never, actor);
    expect(await db.collectionQuote.count({where: {collectionId: collection.id}})).toBe(1);

    await collections.update(collection.id, {familyIds: []} as never, actor);
    expect(await db.collectionQuote.count({where: {collectionId: collection.id}})).toBe(0);
  });

  it('crea solicitudes con presupuesto máximo en centavos y trazabilidad', async () => {
    const created: any = await requests.create(
      {
        title: 'PC para arquitectura',
        originalText: 'Necesito una PC para AutoCAD',
        requiredComponents: ['GPU'],
        maximumBudgetCents: '150000000',
      } as never,
      actor,
    );

    expect(created.maximumBudgetCents).toBe('150000000');
    expect(created.state).toBe('PENDIENTE');
    expect(created.creatorId).toBe(baseline.userId);

    const updated: any = await requests.update(created.id, {state: 'LISTA'} as never, actor);
    expect(updated.state).toBe('LISTA');

    const events = await db.quoteStatusEvent.findMany({where: {requestId: created.id}});
    expect(events.map((event) => event.type)).toEqual(['SOLICITUD_CREADA', 'CAMBIO_ESTADO']);
  });

  it('devuelve 404 en español si el presupuesto no existe', async () => {
    await expect(quotes.get('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      message: 'Presupuesto inexistente',
    });
  });
});
