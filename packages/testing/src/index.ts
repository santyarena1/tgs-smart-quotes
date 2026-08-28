import { PrismaClient } from "@prisma/client";
import { argon2id, hash } from "argon2";

export const fixtureUser = { username: "admin", displayName: "Administrador" } as const;

/**
 * URL de la base de datos usada por los tests de integración.
 * Nunca cae en `DATABASE_URL` para evitar destruir datos de desarrollo.
 */
export const testDatabaseUrl = (): string | null => process.env.TEST_DATABASE_URL ?? null;

export const hasTestDatabase = (): boolean => Boolean(testDatabaseUrl());

export const createTestDb = (): PrismaClient => {
  const url = testDatabaseUrl();
  if (!url) throw new Error("TEST_DATABASE_URL es obligatoria para los tests de integración");
  return new PrismaClient({ datasources: { db: { url } } });
};

/** Orden de borrado respetando dependencias. */
const TABLES = [
  "AuditLog",
  "Notification",
  "SimilarityCache",
  "AiSuggestion",
  "AiRequest",
  "QuoteReply",
  "QuoteStatusEvent",
  "QuoteDelivery",
  "QuoteSendAttempt",
  "QuotePdf",
  "QuoteItem",
  "CollectionQuote",
  "QuoteVersion",
  "QuoteFamily",
  "QuoteRequest",
  "Collection",
  "CalculatorPlan",
  "CalculatorGroup",
  "FinancingPlan",
  "ProductPriceHistory",
  "Product",
  "PcLine",
  "Customer",
  "LoginAttempt",
  "Session",
  "User",
] as const;

export const resetDatabase = async (db: PrismaClient): Promise<void> => {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
};

export type BaselineOptions = {
  username?: string;
  password?: string;
  generalMarkupBps?: number;
  productSimilarityThreshold?: number;
};

export type Baseline = {
  userId: string;
  username: string;
  password: string;
  lineId: string;
};

/** Crea el mínimo necesario para ejercitar la API: usuario real, singletons y una línea de PC. */
export const seedBaseline = async (
  db: PrismaClient,
  options: BaselineOptions = {},
): Promise<Baseline> => {
  const username = options.username ?? fixtureUser.username;
  const password = options.password ?? "Prueba-Integracion-123";
  const passwordHash = await hash(password, { type: argon2id });

  const user = await db.user.upsert({
    where: { username },
    update: { passwordHash, active: true },
    create: { username, passwordHash, displayName: fixtureUser.displayName },
  });

  const line = await db.pcLine.upsert({
    where: { name: "Procesador" },
    update: { sortOrder: 1, keyLine: true, concept: "CPU", active: true },
    create: { name: "Procesador", sortOrder: 1, keyLine: true, concept: "CPU", aliases: ["CPU"] },
  });

  await db.aiSettings.upsert({
    where: { id: "singleton" },
    update: {
      generalMarkupBps: options.generalMarkupBps ?? 3000,
      productSimilarityThreshold: options.productSimilarityThreshold ?? 70,
    },
    create: {
      id: "singleton",
      enabled: false,
      model: "gpt-5.2",
      generalMarkupBps: options.generalMarkupBps ?? 3000,
      productSimilarityThreshold: options.productSimilarityThreshold ?? 70,
      frequentSupportThreshold: 3,
    },
  });

  await db.pdfSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      builtPcTitle: "PC armada",
      builtPcDescription: "Equipo armado y probado.",
      assemblyText: "Armado incluido.",
      installText: "Instalación inicial.",
      windowsText: "Windows instalado.",
      driversText: "Drivers actualizados.",
      estimatedDelay: "Plazo estimado",
      lineOrder: ["Procesador"],
    },
  });

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name: "The Gamer Shop",
      taxCondition: "EDITAR",
      cuit: "EDITAR",
      grossIncome: "EDITAR",
      activityStart: "EDITAR",
      address: "EDITAR",
      phones: "EDITAR",
      footerText: "EDITAR",
      rmaUrl: "https://example.com/rma",
      primaryColor: "#111111",
      accentColor: "#E31B23",
    },
  });

  await db.operationsSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return { userId: user.id, username, password, lineId: line.id };
};

/** Actor mínimo compatible con `@CurrentUser()`. */
export const actorFrom = (baseline: Baseline) => ({
  id: baseline.userId,
  username: baseline.username,
  displayName: fixtureUser.displayName as string | null,
});
