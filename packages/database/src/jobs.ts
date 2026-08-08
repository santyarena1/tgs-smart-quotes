import { Prisma } from "@prisma/client";
import { db } from "./client.js";

export type EnqueueJobOptions = { entityType?: string; entityId?: string; maxAttempts?: number; runAfter?: Date };

export function enqueueJob(type: string, payload: unknown, opts: EnqueueJobOptions = {}) {
  return db.processingJob.create({ data: {
    type,
    payload: payload as Prisma.InputJsonValue,
    entityType: opts.entityType,
    entityId: opts.entityId,
    maxAttempts: opts.maxAttempts,
    runAfter: opts.runAfter,
  }});
}