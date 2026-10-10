import { Controller, Get, Query } from "@nestjs/common";
import { db, Prisma } from "@tgs/database";
import { CurrentUser, jsonSafe, type RequestUser } from "./infrastructure.js";

function avgMs(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}

@Controller("dashboard")
export class DashboardController {
  @Get("summary")
  async summary(
    @Query("branchId") branchId: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    const effectiveBranchId = branchId !== undefined ? branchId : actor?.branchId;
    const branchSql = effectiveBranchId
      ? Prisma.sql`f."branchId" = ${effectiveBranchId}`
      : Prisma.sql`TRUE`;
    const grouped = await db.$queryRaw<Array<{
      state: string;
      count: number;
      sale: string;
      review: number;
    }>>`
      SELECT v.state::text AS state,
             count(*)::int AS count,
             coalesce(sum(v."totalSaleCents"), 0)::text AS sale,
             count(*) FILTER (WHERE v."reviewPending")::int AS review
      FROM "QuoteFamily" f
      JOIN "QuoteVersion" v ON v."familyId" = f.id AND v.version = f."activeVersion"
      WHERE ${branchSql}
      GROUP BY v.state
    `;
    const countsByState: Record<string, number> = {};
    let families = 0;
    const saleOf = (state: string) => {
      const row = grouped.find((item) => item.state === state);
      if (!row?.count) return null;
      const sale = typeof row.sale === "bigint" ? row.sale : BigInt(row.sale);
      return (sale / BigInt(row.count)).toString();
    };
    for (const row of grouped) {
      const count = Number(row.count);
      countsByState[row.state] = count;
      families += count;
    }
    const unresolved = Number(grouped.find((row) => row.state === "ENVIADO")?.review ?? 0);

    const readyRows = await db.$queryRaw<Array<{ readyAt: Date; requestCreatedAt: Date }>>`
      SELECT COALESCE(r."readyAt", f."createdAt") AS "readyAt",
             r."createdAt" AS "requestCreatedAt"
      FROM "QuoteFamily" f
      JOIN "QuoteVersion" v ON v."familyId" = f.id AND v.version = f."activeVersion"
      JOIN "QuoteRequest" r ON r.id = f."requestId"
      WHERE ${branchSql}
    `;
    const requestToReadyMs = readyRows.map((row) => new Date(row.readyAt).getTime() - new Date(row.requestCreatedAt).getTime());

    const acceptRows = await db.$queryRaw<Array<{ sentAt: Date; acceptedAt: Date }>>`
      SELECT v."sentAt" AS "sentAt", e."createdAt" AS "acceptedAt"
      FROM "QuoteFamily" f
      JOIN "QuoteVersion" v ON v."familyId" = f.id AND v.version = f."activeVersion"
      JOIN LATERAL (
        SELECT "createdAt"
        FROM "QuoteStatusEvent"
        WHERE "versionId" = v.id AND type::text = 'ACEPTACION'
        ORDER BY "createdAt" ASC, id ASC
        LIMIT 1
      ) e ON true
      WHERE ${branchSql}
        AND v.state::text = 'ACEPTADO'
        AND v."sentAt" IS NOT NULL
    `;
    const sentToAcceptanceMs = acceptRows.map((row) => new Date(row.acceptedAt).getTime() - new Date(row.sentAt).getTime());

    return jsonSafe({
      families,
      countsByState,
      avgTicketCents: {
        ACEPTADO: saleOf("ACEPTADO"),
        RECHAZADO: saleOf("RECHAZADO"),
        NO_CONCRETADO: saleOf("NO_CONCRETADO"),
      },
      unresolved,
      avgRequestToReadyMs: avgMs(requestToReadyMs),
      requestToReadySampleSize: requestToReadyMs.length,
      avgSentToAcceptanceMs: avgMs(sentToAcceptanceMs),
      sentToAcceptanceSampleSize: sentToAcceptanceMs.length,
    });
  }

  @Get("products")
  async products(@Query("limit") limitRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw ?? 10) || 10, 1), 50);
    const [accepted, rejected] = await Promise.all([
      rankActiveProducts("ACEPTADO", limit),
      rankActiveProducts("RECHAZADO", limit),
    ]);
    return jsonSafe({ limit, accepted, rejected });
  }
}

async function rankActiveProducts(state: string, limit: number) {
  const [sample] = await db.$queryRaw<Array<{ sampleSize: number }>>`
    SELECT count(*)::int AS "sampleSize"
    FROM "QuoteFamily" f
    JOIN "QuoteVersion" v ON v."familyId" = f.id AND v.version = f."activeVersion"
    WHERE v.state::text = ${state}
  `;
  const sampleSize = Number(sample?.sampleSize ?? 0);
  const rows = await db.$queryRaw<Array<{ productId: string | null; name: string; count: number }>>`
    SELECT max(i."productId") AS "productId",
           min(i."frozenName") AS name,
           count(DISTINCT v.id)::int AS count
    FROM "QuoteFamily" f
    JOIN "QuoteVersion" v ON v."familyId" = f.id AND v.version = f."activeVersion"
    JOIN "QuoteItem" i ON i."versionId" = v.id
    WHERE v.state::text = ${state}
    GROUP BY coalesce(i."productId", i."frozenName")
    ORDER BY count DESC, name ASC
    LIMIT ${limit}
  `;
  return {
    sampleSize,
    items: rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      count: Number(row.count),
      sampleSize,
    })),
  };
}
