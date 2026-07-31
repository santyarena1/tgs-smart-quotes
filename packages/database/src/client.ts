import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as unknown as { db?: PrismaClient };

export const db = globalDatabase.db ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalDatabase.db = db;
