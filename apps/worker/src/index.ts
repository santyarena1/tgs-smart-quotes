import {generateCaseModelWithTripo} from './handlers/case-model.js';
import { db } from "@tgs/database";
import { runAcustockSyncLoop } from "./catalog-sync.js";
import { processPendingJobs, handlers } from "./jobs.js";
import {removeProductAssetBackground} from "./handlers/product-asset.js";
import {resyncStalePublications} from "./publications.js";

handlers["product-asset:remove-bg"] = removeProductAssetBackground;

handlers['case-model:tripo'] = generateCaseModelWithTripo;

const MS_DAY = 86_400_000;

export type StaleSettings = {
  staleDays: number;
  staleNoticeDays: number;
  autoStaleEnabled: boolean;
};

export type StaleVersionRef = {
  id: string;
  familyId: string;
  version: number;
  state: string;
  creatorId: string;
  lastActivityAt: Date | null;
  sentAt: Date | null;
  staleNotifiedAt: Date | null;
  autoClosedAt: Date | null;
};

export const jsonSafe = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_key, current) => (typeof current === "bigint" ? current.toString() : current)));

export function activityAt(version: Pick<StaleVersionRef, "lastActivityAt" | "sentAt">): Date | null {
  return version.lastActivityAt ?? version.sentAt;
}

export function staleCutoff(now: Date, staleDays: number): Date {
  return new Date(now.getTime() - staleDays * MS_DAY);
}

export function staleNoticeThreshold(now: Date, staleDays: number, staleNoticeDays: number): Date {
  return new Date(now.getTime() - (staleDays - staleNoticeDays) * MS_DAY);
}

export function shouldAutoClose(
  version: StaleVersionRef,
  cutoff: Date,
  autoStaleEnabled: boolean,
): boolean {
  if (!autoStaleEnabled) return false;
  if (version.state !== "ENVIADO") return false;
  if (version.autoClosedAt) return false;
  const activity = activityAt(version);
  return Boolean(activity && activity <= cutoff);
}

export function shouldNotifyStale(
  version: StaleVersionRef,
  noticeThreshold: Date,
  cutoff: Date,
): boolean {
  if (version.state !== "ENVIADO") return false;
  if (version.staleNotifiedAt) return false;
  if (version.autoClosedAt) return false;
  const activity = activityAt(version);
  return Boolean(activity && activity <= noticeThreshold && activity > cutoff);
}

async function loadSettings(): Promise<StaleSettings> {
  const row = await db.operationsSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  return {
    staleDays: row.staleDays,
    staleNoticeDays: row.staleNoticeDays,
    autoStaleEnabled: row.autoStaleEnabled,
  };
}

async function notifyStaleApproaching(version: StaleVersionRef, now: Date, settings: StaleSettings) {
  await db.$transaction(async (tx) => {
    const current = await tx.quoteVersion.findUnique({ where: { id: version.id } });
    if (!current || current.state !== "ENVIADO" || current.staleNotifiedAt || current.autoClosedAt) return;

    await tx.quoteVersion.update({
      where: { id: version.id },
      data: { staleNotifiedAt: now },
    });

    await tx.notification.create({
      data: {
        type: "QUOTE_STALE_NOTICE",
        title: "Presupuesto por vencer",
        body: `Quedan ${settings.staleNoticeDays} días para el cierre automático por inactividad (versión ${current.version}).`,
        entityType: "QuoteVersion",
        entityId: current.id,
        userId: current.creatorId,
      },
    });
  });
}

async function closeAsNoConcretado(version: StaleVersionRef, now: Date, cutoff: Date) {
  await db.$transaction(async (tx) => {
    const current = await tx.quoteVersion.findUnique({ where: { id: version.id } });
    if (!current || current.state !== "ENVIADO" || current.autoClosedAt) return;

    const next = await tx.quoteVersion.update({
      where: { id: version.id },
      data: {
        state: "NO_CONCRETADO",
        autoClosedAt: now,
        lastActivityAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "QuoteVersion",
        entityId: current.id,
        action: "AUTO_NO_CONCRETADO",
        previous: jsonSafe({ state: current.state }),
        next: jsonSafe({ state: next.state, autoClosedAt: now }),
        metadata: jsonSafe({ cutoff: cutoff.toISOString(), automated: true }),
      },
    });

    await tx.quoteStatusEvent.create({
      data: {
        type: "NO_CONCRETADO",
        familyId: current.familyId,
        versionId: current.id,
        previous: jsonSafe({ state: current.state }),
        next: jsonSafe({ state: "NO_CONCRETADO" }),
        metadata: jsonSafe({ automated: true, cutoff: cutoff.toISOString() }),
      },
    });

    await tx.notification.create({
      data: {
        type: "QUOTE_STALE",
        title: "Presupuesto no concretado",
        body: `La versión ${current.version} fue marcada automáticamente como no concretada por inactividad.`,
        entityType: "QuoteVersion",
        entityId: current.id,
        userId: current.creatorId,
      },
    });

    await tx.quoteFamily.update({
      where: { id: current.familyId },
      data: { lastActivityAt: now },
    });
  });
}

export async function processStaleQuotes(now = new Date(), settingsOverride?: StaleSettings) {
  const settings = settingsOverride ?? (await loadSettings());
  const cutoff = staleCutoff(now, settings.staleDays);
  const noticeThreshold = staleNoticeThreshold(now, settings.staleDays, settings.staleNoticeDays);

  const candidates = await db.quoteVersion.findMany({
    where: {
      state: "ENVIADO",
      autoClosedAt: null,
    },
    select: {
      id: true,
      familyId: true,
      version: true,
      state: true,
      creatorId: true,
      lastActivityAt: true,
      sentAt: true,
      staleNotifiedAt: true,
      autoClosedAt: true,
    },
  });

  let noticed = 0;
  let closed = 0;

  if (settings.staleNoticeDays > 0) {
    for (const version of candidates) {
      if (!shouldNotifyStale(version, noticeThreshold, cutoff)) continue;
      await notifyStaleApproaching(version, now, settings);
      noticed += 1;
    }
  }

  if (settings.autoStaleEnabled) {
    for (const version of candidates) {
      if (!shouldAutoClose(version, cutoff, settings.autoStaleEnabled)) continue;
      await closeAsNoConcretado(version, now, cutoff);
      closed += 1;
    }
  }

  return { noticed, closed, staleDays: settings.staleDays, autoStaleEnabled: settings.autoStaleEnabled };
}

/** @deprecated Usar `processStaleQuotes`. */
export async function markStale(now = new Date()) {
  const result = await processStaleQuotes(now);
  return result.closed;
}

async function runLoop() {
  const once = process.argv.includes("--once");
  do {
    try {
      const result = await processStaleQuotes();
      console.log(JSON.stringify({ level: "info", task: "stale-quotes", ...result }));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", task: "stale-quotes", error: String(error) }));
    }
    try {
      const result = await resyncStalePublications();
      console.log(JSON.stringify({ level: "info", task: "resync-publications", ...result }));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", task: "resync-publications", error: String(error) }));
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, 3_600_000));
  } while (true);
}

/** Loop dedicado a los jobs del pipeline: poll corto para respuesta casi inmediata. */
async function runJobsLoop() {
  const once = process.argv.includes("--once");
  const POLL_MS = 3_000;
  do {
    try {
      const result = await processPendingJobs();
      if (result.claimed > 0) {
        console.log(JSON.stringify({ level: "info", task: "processing-jobs", ...result }));
      }
    } catch (error) {
      console.error(JSON.stringify({ level: "error", task: "processing-jobs", error: String(error) }));
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  } while (true);
}

if (process.env.NODE_ENV !== "test") void Promise.all([runLoop(), runJobsLoop(), runAcustockSyncLoop()]);

