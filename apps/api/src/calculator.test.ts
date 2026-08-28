import {beforeAll, beforeEach, describe, expect, it} from "vitest";
import {db} from "@tgs/database";
import {actorFrom, hasTestDatabase, resetDatabase, seedBaseline, type Baseline} from "@tgs/testing";
import {CalculatorController} from "./calculator.js";

const integration = hasTestDatabase() ? describe : describe.skip;

integration("calculadora de financiación", () => {
  const calculator = new CalculatorController();
  let baseline: Baseline;
  let actor: ReturnType<typeof actorFrom>;

  beforeAll(() => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await resetDatabase(db as never);
    baseline = await seedBaseline(db as never);
    actor = actorFrom(baseline);
    await db.companySettings.update({where: {id: "singleton"}, data: {listInterestBps: 1300}});
    await db.financingPlan.createMany({
      data: [
        {bank: "BBVA - Banco Francés", installments: 3, interestBps: 0, sortOrder: 1},
        {bank: "Otros bancos", installments: 3, interestBps: 1050, sortOrder: 2},
      ],
    });
  });

  it("siembra medios desde la financiación de presupuestos", async () => {
    const groups = await calculator.list();
    expect(groups.find((g) => g.key === "list")?.plans[0]?.interestBps).toBe(1300);
    expect(groups.find((g) => g.key === "bbva")?.plans[0]?.installments).toBe(3);
    expect(groups.find((g) => g.key === "mercadopago")?.plans[0]?.interestBps).toBe(1050);
    expect(groups.find((g) => g.key === "visa")?.label).toBe("Visa");
  });

  it("guarda un interés propio sin tocar los planes de presupuestos", async () => {
    const groups = await calculator.list();
    const mp = groups.find((g) => g.key === "mercadopago");
    expect(mp).toBeTruthy();
    await calculator.replace(
      {
        groups: groups.map((g) =>
          g.key === "mercadopago"
            ? {
                id: g.id,
                key: g.key,
                label: g.label,
                kind: g.kind,
                visible: true,
                plans: [{installments: 9, interestBps: 4200, visible: true}],
              }
            : {
                id: g.id,
                key: g.key,
                label: g.label,
                kind: g.kind,
                visible: g.visible,
                plans: g.plans.map((p) => ({
                  id: p.id,
                  installments: p.installments,
                  interestBps: p.interestBps,
                  visible: p.visible,
                })),
              },
        ),
      },
      actor,
    );
    const next = await calculator.list();
    expect(next.find((g) => g.key === "mercadopago")?.plans).toEqual([
      expect.objectContaining({installments: 9, interestBps: 4200}),
    ]);
    const plans = await db.financingPlan.findMany();
    expect(plans.some((p) => p.interestBps === 1050)).toBe(true);
  });
});
