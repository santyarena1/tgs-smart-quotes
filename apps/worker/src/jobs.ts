import { db, Prisma, type ProcessingJob } from "@tgs/database";

export type JobHandler = (job: ProcessingJob) => Promise<unknown>;
export const handlers: Record<string, JobHandler> = {};

const BATCH_SIZE = 10;
const BASE_BACKOFF_MS = 30_000;

async function claimNextJob(now: Date): Promise<ProcessingJob | null> {
  return db.$transaction(async (tx) => {
    const candidate = await tx.processingJob.findFirst({
      where: { status: "PENDING", OR: [{ runAfter: null }, { runAfter: { lte: now } }] },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return null;
    const claimed = await tx.processingJob.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: now, finishedAt: null, error: null, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return null;
    return tx.processingJob.findUnique({ where: { id: candidate.id } });
  });
}

function jsonResult(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function processJob(job: ProcessingJob, now: Date): Promise<"done" | "failed" | "retried"> {
  const handler = handlers[job.type];
  if (!handler) {
    await db.processingJob.update({ where: { id: job.id }, data: { status: "FAILED", error: `No hay handler registrado para el job ${job.type}`, finishedAt: now } });
    return "failed";
  }
  try {
    const result = await handler(job);
    await db.processingJob.update({ where: { id: job.id }, data: { status: "DONE", result: jsonResult(result), error: null, finishedAt: new Date(), runAfter: null } });
    return "done";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.attempts < job.maxAttempts) {
      const runAfter = new Date(new Date().getTime() + BASE_BACKOFF_MS * 2 ** (job.attempts - 1));
      await db.processingJob.update({ where: { id: job.id }, data: { status: "PENDING", error: message, runAfter, finishedAt: null } });
      return "retried";
    }
    await db.processingJob.update({ where: { id: job.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
    return "failed";
  }
}

export async function processPendingJobs(now = new Date()) {
  const result = { claimed: 0, done: 0, failed: 0, retried: 0 };
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const job = await claimNextJob(now);
    if (!job) break;
    result.claimed += 1;
    result[await processJob(job, now)] += 1;
  }
  return result;
}