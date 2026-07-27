import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@tgs/database";
import { hasTestDatabase, resetDatabase, seedBaseline, type Baseline } from "@tgs/testing";
import {
  activityAt,
  processStaleQuotes,
  shouldAutoClose,
  shouldNotifyStale,
  staleCutoff,
  staleNoticeThreshold,
  type StaleVersionRef,
} from "./index.js";

const integration = hasTestDatabase() ? describe : describe.skip;

describe("worker — reglas de vencimiento", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");
  const base: StaleVersionRef = {
    id: "v1",
    familyId: "f1",
    version: 1,
    state: "ENVIADO",
    creatorId: "u1",
    lastActivityAt: new Date("2026-07-10T12:00:00.000Z"),
    sentAt: new Date("2026-07-10T12:00:00.000Z"),
    staleNotifiedAt: null,
    autoClosedAt: null,
  };

  it("calcula cutoff y aviso previo desde OperationsSettings", () => {
    expect(staleCutoff(now, 10).toISOString()).toBe("2026-07-16T12:00:00.000Z");
    expect(staleNoticeThreshold(now, 10, 2).toISOString()).toBe("2026-07-18T12:00:00.000Z");
  });

  it("usa lastActivityAt y cae a sentAt", () => {
    expect(activityAt({ lastActivityAt: new Date("2026-07-01T00:00:00.000Z"), sentAt: null })!.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(activityAt({ lastActivityAt: null, sentAt: new Date("2026-07-02T00:00:00.000Z") })!.toISOString()).toBe(
      "2026-07-02T00:00:00.000Z",
    );
  });

  it("cierra solo ENVIADO vencidos con autoStale habilitado", () => {
    const cutoff = staleCutoff(now, 10);
    expect(shouldAutoClose(base, cutoff, true)).toBe(true);
    expect(shouldAutoClose({ ...base, state: "NO_CONCRETADO" }, cutoff, true)).toBe(false);
    expect(shouldAutoClose({ ...base, autoClosedAt: now }, cutoff, true)).toBe(false);
    expect(shouldAutoClose(base, cutoff, false)).toBe(false);
    expect(
      shouldAutoClose(
        { ...base, lastActivityAt: new Date("2026-07-20T12:00:00.000Z") },
        cutoff,
        true,
      ),
    ).toBe(false);
  });

  it("avisa dentro de la ventana previa sin duplicar", () => {
    const cutoff = staleCutoff(now, 10);
    const notice = staleNoticeThreshold(now, 10, 2);
    const inWindow = { ...base, lastActivityAt: new Date("2026-07-17T12:00:00.000Z") };
    expect(shouldNotifyStale(inWindow, notice, cutoff)).toBe(true);
    expect(shouldNotifyStale({ ...inWindow, staleNotifiedAt: now }, notice, cutoff)).toBe(false);
    expect(shouldNotifyStale(base, notice, cutoff)).toBe(false);
  });
});

integration("worker — no concretado automático (integración)", () => {
  let baseline: Baseline;

  beforeAll(() => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await resetDatabase(db as never);
    baseline = await seedBaseline(db as never);
    await db.operationsSettings.update({
      where: { id: "singleton" },
      data: { staleDays: 10, staleNoticeDays: 2, autoStaleEnabled: true },
    });
  });

  const createSentVersion = async (activityAt: Date) => {
    const family = await db.quoteFamily.create({
      data: {
        visibleNumber: `TGS-20260726-${Math.random().toString(16).slice(2, 6)}`,
        internalName: "Worker test",
        activeVersion: 1,
      },
    });
    const version = await db.quoteVersion.create({
      data: {
        familyId: family.id,
        version: 1,
        state: "ENVIADO",
        creatorId: baseline.userId,
        totalCostCents: 10_000n,
        totalSaleCents: 13_000n,
        profitCents: 3_000n,
        effectiveMarkupBps: 3000,
        resolvedPdfConfig: {},
        sentAt: activityAt,
        lastActivityAt: activityAt,
      },
    });
    return version.id;
  };

  it("notifica dentro de la ventana previa sin cerrar aún", async () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const versionId = await createSentVersion(new Date("2026-07-17T12:00:00.000Z"));

    const result = await processStaleQuotes(now, { staleDays: 10, staleNoticeDays: 2, autoStaleEnabled: true });
    expect(result).toMatchObject({ noticed: 1, closed: 0 });

    const version = await db.quoteVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.staleNotifiedAt).not.toBeNull();
    expect(version.state).toBe("ENVIADO");

    const notices = await db.notification.findMany({ where: { entityId: versionId, type: "QUOTE_STALE_NOTICE" } });
    expect(notices).toHaveLength(1);
  });

  it("marca NO_CONCRETADO con trazabilidad e idempotencia", async () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const versionId = await createSentVersion(new Date("2026-07-10T12:00:00.000Z"));

    const firstPass = await processStaleQuotes(now, { staleDays: 10, staleNoticeDays: 2, autoStaleEnabled: true });
    expect(firstPass).toMatchObject({ noticed: 0, closed: 1 });

    const closed = await db.quoteVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(closed.state).toBe("NO_CONCRETADO");
    expect(closed.autoClosedAt).not.toBeNull();

    const audits = await db.auditLog.findMany({ where: { entityId: versionId, action: "AUTO_NO_CONCRETADO" } });
    const events = await db.quoteStatusEvent.findMany({ where: { versionId, type: "NO_CONCRETADO" } });
    const staleNotifications = await db.notification.findMany({ where: { entityId: versionId, type: "QUOTE_STALE" } });
    expect(audits).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(staleNotifications).toHaveLength(1);

    const secondPass = await processStaleQuotes(now, { staleDays: 10, staleNoticeDays: 2, autoStaleEnabled: true });
    expect(secondPass).toMatchObject({ noticed: 0, closed: 0 });
  });

  it("respeta autoStaleEnabled deshabilitado", async () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const versionId = await createSentVersion(new Date("2026-07-01T12:00:00.000Z"));

    const result = await processStaleQuotes(now, { staleDays: 10, staleNoticeDays: 2, autoStaleEnabled: false });
    expect(result.closed).toBe(0);

    const version = await db.quoteVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.state).toBe("ENVIADO");
    expect(version.autoClosedAt).toBeNull();
  });
});
