import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@tgs/database";
import { actorFrom, hasTestDatabase, resetDatabase, seedBaseline, type Baseline } from "@tgs/testing";
import { DashboardController } from "./dashboard.js";
import { ProductsController } from "./products.js";
import { QuotesController } from "./quotes.js";

const integration = hasTestDatabase() ? describe : describe.skip;

integration("Dashboard API", () => {
  const dashboard = new DashboardController();
  const quotes = new QuotesController();
  const products = new ProductsController();
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

  it("resume métricas solo sobre la versión activa de cada familia", async () => {
    const product = (await products.create(
      {
        name: "Ryzen 7",
        costCents: "100000",
        markupBps: 3000,
        lineId: baseline.lineId,
      } as never,
      actor,
    )) as any;

    const accepted = (await quotes.create(
      {
        internalName: "Aceptado",
        items: [
          {
            name: "Ryzen 7",
            productId: product.id,
            quantity: 1,
            costCents: "100000",
            markupBps: 3000,
            position: 0,
          },
        ],
        resolvedPdfConfig: {},
      } as never,
      actor,
    )) as any;
    await quotes.changeState(accepted.family.id, { state: "ENVIADO" } as never, actor);
    await quotes.changeState(accepted.family.id, { state: "ACEPTADO" } as never, actor);

    const rejected = (await quotes.create(
      {
        internalName: "Rechazado",
        items: [
          {
            name: "Ryzen 7",
            productId: product.id,
            quantity: 1,
            costCents: "100000",
            markupBps: 3000,
            position: 0,
          },
        ],
        resolvedPdfConfig: {},
      } as never,
      actor,
    )) as any;
    await quotes.changeState(rejected.family.id, { state: "ENVIADO" } as never, actor);
    await quotes.changeState(rejected.family.id, { state: "RECHAZADO" } as never, actor);

    await quotes.create(
      {
        internalName: "Pendiente revision",
        items: [{ name: "Otro", quantity: 1, costCents: "50000", markupBps: 2000, position: 0 }],
        resolvedPdfConfig: {},
      } as never,
      actor,
    );
    const pending = (await quotes.create(
      {
        internalName: "Enviado review",
        items: [{ name: "Otro", quantity: 1, costCents: "50000", markupBps: 2000, position: 0 }],
        resolvedPdfConfig: {},
      } as never,
      actor,
    )) as any;
    await quotes.changeState(pending.family.id, { state: "ENVIADO" } as never, actor);
    await db.quoteVersion.update({
      where: { id: pending.version.id },
      data: { reviewPending: true },
    });

    const summary = (await dashboard.summary()) as any;
    expect(summary.families).toBe(4);
    expect(summary.countsByState.ACEPTADO).toBe(1);
    expect(summary.countsByState.RECHAZADO).toBe(1);
    expect(summary.countsByState.ENVIADO).toBe(1);
    expect(summary.countsByState.BORRADOR).toBe(1);
    expect(summary.avgTicketCents.ACEPTADO).toBe("130000");
    expect(summary.avgTicketCents.RECHAZADO).toBe("130000");
    expect(summary.unresolved).toBe(1);
    expect(typeof summary.avgSentToAcceptanceMs).toBe("number");
  });

  it("rankea productos en aceptados vs rechazados con tamaño de muestra", async () => {
    const product = (await products.create(
      {
        name: "GPU RTX",
        costCents: "200000",
        markupBps: 2500,
        lineId: baseline.lineId,
      } as never,
      actor,
    )) as any;

    for (const label of ["A1", "A2"]) {
      const created = (await quotes.create(
        {
          internalName: label,
          items: [
            {
              name: "GPU RTX",
              productId: product.id,
              quantity: 1,
              costCents: "200000",
              markupBps: 2500,
              position: 0,
            },
          ],
          resolvedPdfConfig: {},
        } as never,
        actor,
      )) as any;
      await quotes.changeState(created.family.id, { state: "ENVIADO" } as never, actor);
      await quotes.changeState(created.family.id, { state: "ACEPTADO" } as never, actor);
    }

    const createdRejected = (await quotes.create(
      {
        internalName: "R1",
        items: [
          {
            name: "GPU RTX",
            productId: product.id,
            quantity: 1,
            costCents: "200000",
            markupBps: 2500,
            position: 0,
          },
        ],
        resolvedPdfConfig: {},
      } as never,
      actor,
    )) as any;
    await quotes.changeState(createdRejected.family.id, { state: "ENVIADO" } as never, actor);
    await quotes.changeState(createdRejected.family.id, { state: "RECHAZADO" } as never, actor);

    const rankings = (await dashboard.products("2")) as any;
    expect(rankings.limit).toBe(2);
    expect(rankings.accepted.sampleSize).toBe(2);
    expect(rankings.accepted.items[0]).toMatchObject({ productId: product.id, count: 2, sampleSize: 2 });
    expect(rankings.rejected.sampleSize).toBe(1);
    expect(rankings.rejected.items[0]).toMatchObject({ productId: product.id, count: 1, sampleSize: 1 });
  });
});
