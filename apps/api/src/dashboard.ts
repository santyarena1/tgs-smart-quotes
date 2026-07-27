import { Controller, Get, Query } from "@nestjs/common";
import { db } from "@tgs/database";
import { activeBundle, quoteInclude } from "./quotes.js";
import { jsonSafe } from "./infrastructure.js";

function avgBigInt(values: bigint[]): string | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0n);
  return (sum / BigInt(values.length)).toString();
}

function avgMs(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}

type ProductRank = {
  productId: string | null;
  name: string;
  count: number;
  sampleSize: number;
};

function rankProducts(versions: ReadonlyArray<{ items?: ReadonlyArray<{ productId?: string | null; frozenName: string }> }>, limit: number): {
  sampleSize: number;
  items: ProductRank[];
} {
  const counts = new Map<string, ProductRank>();
  for (const bundle of versions) {
    const seen = new Set<string>();
    for (const item of bundle.items ?? []) {
      const key = item.productId ?? item.frozenName;
      if (seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key) ?? {
        productId: item.productId ?? null,
        name: item.frozenName,
        count: 0,
        sampleSize: versions.length,
      };
      current.count += 1;
      counts.set(key, current);
    }
  }
  const items = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((row) => ({ ...row, sampleSize: versions.length }));
  return { sampleSize: versions.length, items };
}

@Controller("dashboard")
export class DashboardController {
  @Get("summary")
  async summary() {
    const families = await db.quoteFamily.findMany({
      include: quoteInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    const bundles = families.map((family) => activeBundle(family)) as Array<{
      id: string;
      requestId: string | null;
      createdAt: string;
      version: {
        id: string;
        state: string;
        totalSaleCents: string;
        sentAt: string | null;
        reviewPending: boolean;
      } | null;
    }>;

    const countsByState: Record<string, number> = {};
    for (const bundle of bundles) {
      const state = bundle.version?.state ?? "SIN_VERSION";
      countsByState[state] = (countsByState[state] ?? 0) + 1;
    }

    const salesFor = (state: string) =>
      bundles
        .filter((bundle) => bundle.version?.state === state && bundle.version.totalSaleCents)
        .map((bundle) => BigInt(bundle.version!.totalSaleCents));

    const unresolved = bundles.filter(
      (bundle) => bundle.version?.state === "ENVIADO" && bundle.version.reviewPending,
    ).length;

    const requestIds = [...new Set(bundles.map((bundle) => bundle.requestId).filter(Boolean))] as string[];
    const requests = requestIds.length
      ? await db.quoteRequest.findMany({ where: { id: { in: requestIds } } })
      : [];
    const requestById = new Map(requests.map((request) => [request.id, request]));

    const requestToReadyMs: number[] = [];
    for (const bundle of bundles) {
      if (!bundle.requestId) continue;
      const request = requestById.get(bundle.requestId);
      if (!request) continue;
      const readyAt = request.readyAt ?? new Date(bundle.createdAt);
      requestToReadyMs.push(readyAt.getTime() - request.createdAt.getTime());
    }

    const acceptedVersionIds = bundles
      .filter((bundle) => bundle.version?.state === "ACEPTADO")
      .map((bundle) => bundle.version!.id);
    const acceptanceEvents = acceptedVersionIds.length
      ? await db.quoteStatusEvent.findMany({
          where: { versionId: { in: acceptedVersionIds }, type: "ACEPTACION" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : [];
    const acceptanceAtByVersion = new Map<string, Date>();
    for (const event of acceptanceEvents) {
      if (event.versionId && !acceptanceAtByVersion.has(event.versionId)) {
        acceptanceAtByVersion.set(event.versionId, event.createdAt);
      }
    }

    const sentToAcceptanceMs: number[] = [];
    for (const bundle of bundles) {
      if (bundle.version?.state !== "ACEPTADO") continue;
      const sentAt = bundle.version.sentAt ? new Date(bundle.version.sentAt) : null;
      const acceptedAt = acceptanceAtByVersion.get(bundle.version.id);
      if (sentAt && acceptedAt) sentToAcceptanceMs.push(acceptedAt.getTime() - sentAt.getTime());
    }

    return jsonSafe({
      families: bundles.length,
      countsByState,
      avgTicketCents: {
        ACEPTADO: avgBigInt(salesFor("ACEPTADO")),
        RECHAZADO: avgBigInt(salesFor("RECHAZADO")),
        NO_CONCRETADO: avgBigInt(salesFor("NO_CONCRETADO")),
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
    const families = await db.quoteFamily.findMany({ include: quoteInclude });
    const bundles = families.map((family) => activeBundle(family)) as Array<{
      version: { state: string } | null;
      items: Array<{ productId?: string | null; frozenName: string }>;
    }>;

    const accepted = bundles.filter((bundle) => bundle.version?.state === "ACEPTADO");
    const rejected = bundles.filter((bundle) => bundle.version?.state === "RECHAZADO");

    return jsonSafe({
      limit,
      accepted: rankProducts(accepted, limit),
      rejected: rankProducts(rejected, limit),
    });
  }
}
