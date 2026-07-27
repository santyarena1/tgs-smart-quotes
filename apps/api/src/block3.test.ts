import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {db} from '@tgs/database';
import {actorFrom, hasTestDatabase, resetDatabase, seedBaseline, type Baseline} from '@tgs/testing';
import {ProductsController} from './products.js';
import {QuotesController} from './quotes.js';
import {PdfController} from './pdf.js';
import {QuoteSearchController} from './search.js';
import {NotificationsController} from './notifications.js';
import {SettingsController} from './settings.js';

const integration = hasTestDatabase() ? describe : describe.skip;

function mockRes() {
  const headers: Record<string, string> = {};
  let sent: Buffer | undefined;
  return {
    header: (name: string, value: string) => {
      headers[name] = value;
    },
    send: (body: Buffer) => {
      sent = body;
    },
    headers,
    get sent() {
      return sent;
    },
  };
}

integration('Block 3 — PDF, trazabilidad, precios, búsqueda, envíos y notificaciones', () => {
  const products = new ProductsController();
  const quotes = new QuotesController();
  const pdf = new PdfController();
  const search = new QuoteSearchController();
  const notifications = new NotificationsController();
  const settings = new SettingsController();
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

  const createQuote = async () => {
    const product: any = await products.create(
      {name: 'Ryzen 5 5600G', costCents: '100000', markupBps: 3000, usesGeneralMarkup: false} as never,
      actor,
    );
    const created: any = await quotes.create(
      {
        internalName: 'PC gamer trazabilidad',
        isBuiltPc: true,
        items: [
          {name: 'PC Armada Gamer', quantity: 1, costCents: '0', markupBps: 0, position: 0, isPcMainLine: true},
          {
            name: 'Ryzen 5 5600G',
            productId: product.id,
            quantity: 1,
            costCents: '100000',
            markupBps: 3000,
            position: 1,
          },
        ],
        resolvedPdfConfig: {},
      } as never,
      actor,
    );
    return {product, created};
  };

  it('genera un PDF, lo reutiliza sin cambios y permite descargarlo', async () => {
    const {created} = await createQuote();
    const familyId = created.family.id;

    const first: any = await pdf.generate(familyId, {kind: 'SIMPLE'} as never, actor);
    expect(first.reused).toBe(false);
    expect(first.kind).toBe('SIMPLE');
    expect(first.sha256).toHaveLength(64);

    const second: any = await pdf.generate(familyId, {kind: 'SIMPLE'} as never, actor);
    expect(second.reused).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.sha256).toBe(first.sha256);

    const events = await db.quoteStatusEvent.findMany({where: {type: 'PDF_GENERADO'}});
    expect(events).toHaveLength(1);

    const res = mockRes();
    await pdf.download(familyId, 'SIMPLE' as never, res);
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.sent).toBeInstanceOf(Buffer);
    expect(res.sent!.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 30000);

  it('no regenera el PDF histórico de una versión ya enviada', async () => {
    const {created} = await createQuote();
    const familyId = created.family.id;
    const generated: any = await pdf.generate(familyId, {kind: 'SIMPLE'} as never, actor);
    await quotes.changeState(familyId, {state: 'ENVIADO'} as never, actor);

    const reused: any = await pdf.generate(familyId, {kind: 'SIMPLE', force: true} as never, actor);
    expect(reused.reused).toBe(true);
    expect(reused.immutable).toBe(true);
    expect(reused.sha256).toBe(generated.sha256);
  }, 30000);

  it('arma el timeline con eventos, intentos y entregas', async () => {
    const {created} = await createQuote();
    const familyId = created.family.id;

    const attempt: any = await quotes.createSendAttempt(
      familyId,
      {chatPhone: '5491100000000', message: 'Te paso el presupuesto'} as never,
      actor,
    );
    await quotes.resolveSendAttempt(
      familyId,
      attempt.id,
      {status: 'CONFIRMADO_MANUAL', createDelivery: true} as never,
      actor,
    );

    const timeline: any = await quotes.timeline(familyId);
    expect(timeline.events.map((e: any) => e.type)).toContain('PRESUPUESTO_CREADO');
    expect(timeline.events.map((e: any) => e.type)).toContain('ENVIO_DETECTADO');
    expect(timeline.events.map((e: any) => e.type)).toContain('ENVIO_CONFIRMADO_MANUAL');
    expect(timeline.attempts).toHaveLength(1);
    expect(timeline.deliveries).toHaveLength(1);
  });

  it('sincroniza precios desde el catálogo maestro y registra COSTO_AJUSTADO', async () => {
    const {created, product} = await createQuote();
    const familyId = created.family.id;

    await products.update(
      product.id,
      {name: 'Ryzen 5 5600G', costCents: '150000', markupBps: 3000, usesGeneralMarkup: false} as never,
      actor,
    );

    const result: any = await quotes.updatePrices(familyId, {mode: 'all', updateMaster: true} as never, actor);
    const syncedItem = result.items.find((item: any) => item.productId === product.id);
    expect(syncedItem.frozenCostCents).toBe('150000');
    expect(syncedItem.frozenSalePriceCents).toBe('195000');
    expect(result.version.totalCostCents).toBe('150000');

    const costEvents = await db.quoteStatusEvent.findMany({where: {type: 'COSTO_AJUSTADO'}});
    expect(costEvents).toHaveLength(1);
    const priceEvents = await db.quoteStatusEvent.findMany({where: {type: 'PRECIOS_ACTUALIZADOS'}});
    expect(priceEvents).toHaveLength(1);
  });

  it('rechaza sincronizar precios sobre una versión que no es borrador', async () => {
    const {created} = await createQuote();
    await quotes.changeState(created.family.id, {state: 'ENVIADO'} as never, actor);
    await expect(
      quotes.updatePrices(created.family.id, {mode: 'all'} as never, actor),
    ).rejects.toMatchObject({message: expect.stringContaining('nueva versión')});
  });

  it('reactiva un presupuesto NO_CONCRETADO creando una nueva versión BORRADOR', async () => {
    const {created} = await createQuote();
    const familyId = created.family.id;
    await quotes.changeState(familyId, {state: 'ENVIADO'} as never, actor);
    await quotes.changeState(familyId, {state: 'NO_CONCRETADO'} as never, actor);

    const reactivated: any = await quotes.reactivate(familyId, {reason: 'Cliente volvió a consultar'} as never, actor);
    expect(reactivated.version.version).toBe(2);
    expect(reactivated.version.state).toBe('BORRADOR');
    expect(reactivated.family.activeVersion).toBe(2);

    const original = await db.quoteVersion.findUniqueOrThrow({where: {id: created.version.id}});
    expect(original.state).toBe('NO_CONCRETADO');
    expect(original.reactivatedAt).not.toBeNull();

    const events = await db.quoteStatusEvent.findMany({where: {type: 'REACTIVADO'}});
    expect(events).toHaveLength(1);
  });

  it('rechaza reactivar un presupuesto que no está NO_CONCRETADO ni RECHAZADO', async () => {
    const {created} = await createQuote();
    await expect(
      quotes.reactivate(created.family.id, {reason: 'Intento inválido'} as never, actor),
    ).rejects.toMatchObject({message: expect.stringContaining('NO_CONCRETADO')});
  });

  it('resuelve un intento de envío confirmado: crea entrega, marca ENVIADO y reemplaza el anterior', async () => {
    const {created} = await createQuote();
    const familyId = created.family.id;
    await quotes.changeState(familyId, {state: 'ENVIADO'} as never, actor);
    const secondVersion: any = await quotes.createVersion(familyId, {reason: 'Ajuste de precio'} as never, actor);

    const attempt: any = await quotes.createSendAttempt(
      familyId,
      {chatPhone: '5491100000001', chatName: 'Cliente', message: 'Presupuesto actualizado'} as never,
      actor,
    );
    const resolved: any = await quotes.resolveSendAttempt(
      familyId,
      attempt.id,
      {status: 'CONFIRMADO_MANUAL', createDelivery: true} as never,
      actor,
    );

    expect(resolved.version.state).toBe('ENVIADO');
    expect(resolved.delivery).not.toBeNull();
    expect(resolved.delivery.versionId).toBe(secondVersion.version.id);

    const firstSent = await db.quoteVersion.findUniqueOrThrow({where: {id: created.version.id}});
    expect(firstSent.state).toBe('REEMPLAZADO');

    const replacementEvents = await db.quoteStatusEvent.findMany({where: {type: 'REEMPLAZO'}});
    expect(replacementEvents).toHaveLength(1);
  });

  it('un intento AMBIGUO no crea entrega y genera una notificación de revisión', async () => {
    const {created} = await createQuote();
    const familyId = created.family.id;
    const attempt: any = await quotes.createSendAttempt(
      familyId,
      {chatPhone: '5491100000002', message: 'Mensaje ambiguo'} as never,
      actor,
    );
    const resolved: any = await quotes.resolveSendAttempt(
      familyId,
      attempt.id,
      {status: 'AMBIGUO'} as never,
      actor,
    );

    expect(resolved.delivery).toBeNull();
    expect(resolved.version.state).toBe('BORRADOR');

    const list: any = await notifications.list({limit: 50} as never, actor);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('ENVIO_AMBIGUO');

    const marked: any = await notifications.mark(list[0].id, {read: true} as never, actor);
    expect(marked.readAt).not.toBeNull();
  });

  it('registra una respuesta de cliente y aplica el estado explícitamente', async () => {
    const {created} = await createQuote();
    const familyId = created.family.id;
    await quotes.changeState(familyId, {state: 'ENVIADO'} as never, actor);

    const reply: any = await quotes.createReply(
      familyId,
      {text: 'Dale, acepto!', intent: 'ACEPTA', applyState: 'ACEPTADO'} as never,
      actor,
    );

    expect(reply.reply.appliedState).toBe('ACEPTADO');
    expect(reply.version.state).toBe('ACEPTADO');

    const events = await db.quoteStatusEvent.findMany({where: {type: 'ACEPTACION'}});
    expect(events).toHaveLength(1);
  });

  it('busca presupuestos por texto, estado y cliente', async () => {
    const {created} = await createQuote();
    await quotes.changeState(created.family.id, {state: 'ENVIADO'} as never, actor);

    const byText: any = await search.search({q: 'gamer trazabilidad', page: 1, pageSize: 25, sort: 'lastActivityAt', order: 'desc'} as never);
    expect(byText.total).toBe(1);
    expect(byText.items[0].id).toBe(created.family.id);

    const byState: any = await search.search({state: 'ENVIADO', page: 1, pageSize: 25, sort: 'lastActivityAt', order: 'desc'} as never);
    expect(byState.total).toBe(1);

    const byProduct: any = await search.search({productName: 'ryzen', page: 1, pageSize: 25, sort: 'lastActivityAt', order: 'desc'} as never);
    expect(byProduct.total).toBe(1);

    const noMatch: any = await search.search({q: 'inexistente-xyz', page: 1, pageSize: 25, sort: 'lastActivityAt', order: 'desc'} as never);
    expect(noMatch.total).toBe(0);
  });

  it('lee y actualiza la configuración operativa', async () => {
    // OperationsSettings es un singleton persistente (no se trunca entre tests), así que
    // dejamos su valor en un estado conocido antes de leerlo.
    await db.operationsSettings.update({where: {id: 'singleton'}, data: {staleDays: 10}});
    const current: any = await settings.operations();
    expect(current.id).toBe('singleton');
    expect(current.staleDays).toBe(10);

    const updated: any = await settings.putOperations(
      {
        staleDays: 15,
        staleNoticeDays: 3,
        autoStaleEnabled: true,
        similarityCpuBps: 3500,
        similarityMotherBps: 2000,
        similarityGpuBps: 3500,
        similarityOtherBps: 1000,
        similarityAmbiguousMin: 55,
        similarityAmbiguousMax: 75,
      } as never,
      actor,
    );
    expect(updated.staleDays).toBe(15);

    const audits = await db.auditLog.findMany({where: {entityType: 'OperationsSettings'}});
    expect(audits).toHaveLength(1);
  });
});
