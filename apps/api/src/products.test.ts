import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {db} from '@tgs/database';
import {
  actorFrom,
  hasTestDatabase,
  resetDatabase,
  seedBaseline,
  type Baseline,
} from '../../../packages/testing/src/index.js';
import {CustomerController, PcLineController, ProductsController} from './products.js';

const integration = hasTestDatabase() ? describe : describe.skip;

integration('Block 1 — productos, clientes y líneas (integración real)', () => {
  const products = new ProductsController();
  const customers = new CustomerController();
  const lines = new PcLineController();
  let baseline: Baseline;
  let actor: ReturnType<typeof actorFrom>;

  beforeAll(() => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await resetDatabase(db as never);
    baseline = await seedBaseline(db as never, {generalMarkupBps: 3000});
    actor = actorFrom(baseline);
  });

  it('crea el producto con markup general y guarda historial', async () => {
    const created: any = await products.create(
      {
        name: '  Ryzen 5 5600G ',
        costCents: '100000',
        markupBps: 0,
        usesGeneralMarkup: true,
        active: true,
      } as never,
      actor,
    );

    expect(created.name).toBe('Ryzen 5 5600G');
    expect(created.normalizedName).toBe('ryzen 5 5600g');
    expect(created.markupBps).toBe(3000);
    expect(created.salePriceCents).toBe('130000');

    const history = await db.productPriceHistory.findMany({where: {productId: created.id}});
    expect(history).toHaveLength(1);
    expect(history[0]!.changedById).toBe(baseline.userId);

    const audits = await db.auditLog.findMany({where: {entityType: 'Product', action: 'CREATE'}});
    expect(audits).toHaveLength(1);
    expect(audits[0]!.userId).toBe(baseline.userId);
  });

  it('respeta las tres reglas bidireccionales de precio', async () => {
    const created: any = await products.create(
      {
        name: 'Placa de video',
        costCents: '100000',
        markupBps: 2000,
        usesGeneralMarkup: false,
      } as never,
      actor,
    );
    expect(created.salePriceCents).toBe('120000');

    const costChanged: any = await products.update(
      created.id,
      {
        name: 'Placa de video',
        costCents: '200000',
        markupBps: 2000,
        usesGeneralMarkup: false,
      } as never,
      actor,
    );
    expect(costChanged.markupBps).toBe(2000);
    expect(costChanged.salePriceCents).toBe('240000');

    const markupChanged: any = await products.update(
      created.id,
      {
        name: 'Placa de video',
        costCents: '200000',
        markupBps: 5000,
        usesGeneralMarkup: false,
      } as never,
      actor,
    );
    expect(markupChanged.salePriceCents).toBe('300000');

    const saleChanged: any = await products.update(
      created.id,
      {
        name: 'Placa de video',
        costCents: '200000',
        markupBps: 5000,
        salePriceCents: '250000',
        usesGeneralMarkup: false,
      } as never,
      actor,
    );
    expect(saleChanged.markupBps).toBe(2500);

    const history = await db.productPriceHistory.findMany({where: {productId: created.id}});
    expect(history).toHaveLength(4);
  });

  it('desactiva sin destruir historial', async () => {
    const created: any = await products.create(
      {name: 'Gabinete', costCents: '50000', markupBps: 3000, usesGeneralMarkup: false} as never,
      actor,
    );

    expect(await products.remove(created.id, actor)).toEqual({ok: true});

    const stored = await db.product.findUniqueOrThrow({where: {id: created.id}});
    expect(stored.active).toBe(false);
    expect(await db.productPriceHistory.count({where: {productId: created.id}})).toBe(1);
  });

  it('detecta duplicados determinísticamente usando el umbral configurado', async () => {
    await products.create(
      {name: 'Ryzen 5 5600G', costCents: '100000', markupBps: 3000, usesGeneralMarkup: false} as never,
      actor,
    );
    await products.create(
      {name: 'Mouse Logitech', costCents: '20000', markupBps: 3000, usesGeneralMarkup: false} as never,
      actor,
    );

    const result: any = await products.duplicates({name: 'ryzen 5 5600g'});

    expect(result.threshold).toBe(70);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].name).toBe('Ryzen 5 5600G');
    expect(result.matches[0].score).toBeGreaterThanOrEqual(70);
  });

  it('importa aplicando el markup general y respeta el modo elegido', async () => {
    const first: any = await products.importProducts(
      {
        mode: 'skip',
        rows: [
          {name: 'CPU', costCents: '100000', markupBps: 0, usesGeneralMarkup: true},
          {name: 'GPU', costCents: '300000', markupBps: 0, usesGeneralMarkup: true},
        ],
      } as never,
      actor,
    );
    expect(first).toEqual({total: 2, created: 2, updated: 0, skipped: 0, errors: []});

    const skipped: any = await products.importProducts(
      {
        mode: 'skip',
        rows: [{name: 'cpu', costCents: '999999', markupBps: 0, usesGeneralMarkup: true}],
      } as never,
      actor,
    );
    expect(skipped.skipped).toBe(1);

    const updated: any = await products.importProducts(
      {
        mode: 'update',
        rows: [{name: 'cpu', costCents: '200000', markupBps: 0, usesGeneralMarkup: true}],
      } as never,
      actor,
    );
    expect(updated.updated).toBe(1);

    const stored = await db.product.findFirstOrThrow({where: {normalizedName: 'cpu'}});
    expect(stored.costCents).toBe(200000n);
    expect(stored.salePriceCents).toBe(260000n);
  });

  it('normaliza clientes y audita con el actor de la sesión', async () => {
    const created: any = await customers.create(
      {name: '  José Pérez ', phone: '011 15-1234-5678', dni: '30111222'} as never,
      actor,
    );

    expect(created.name).toBe('José Pérez');
    expect(created.normalizedName).toBe('jose perez');
    expect(created.normalizedPhone).toBeTruthy();
    expect(created.normalizedPhone).not.toContain(' ');

    const audits = await db.auditLog.findMany({where: {entityType: 'Customer'}});
    expect(audits[0]!.userId).toBe(baseline.userId);
  });

  it('administra líneas de PC ordenables con concepto', async () => {
    const created: any = await lines.create(
      {
        name: 'Placa de video',
        sortOrder: 4,
        aliases: ['GPU', 'video'],
        keyLine: true,
        concept: 'GPU',
        active: true,
      } as never,
      actor,
    );

    expect(created.concept).toBe('GPU');
    expect(created.keyLine).toBe(true);

    const listed: any = await lines.list();
    expect(listed.map((line: any) => line.name)).toEqual(['Procesador', 'Placa de video']);

    await lines.remove(created.id, actor);
    expect(await db.pcLine.count()).toBe(1);
  });

  it('devuelve 404 en español para entidades inexistentes', async () => {
    await expect(
      products.update(
        '11111111-1111-4111-8111-111111111111',
        {name: 'X', costCents: '1', markupBps: 0, usesGeneralMarkup: false} as never,
        actor,
      ),
    ).rejects.toMatchObject({message: 'Producto inexistente'});
    await expect(
      customers.remove('11111111-1111-4111-8111-111111111111', actor),
    ).rejects.toMatchObject({message: 'Cliente inexistente'});
  });
});
