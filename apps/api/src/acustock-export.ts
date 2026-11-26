/**
 * API de solo lectura para AcuStock: las colecciones con sus presupuestos completos.
 *
 * Acceso: header `Authorization: Bearer <ACUSTOCK_API_TOKEN>`. Sin esa variable configurada la API responde 503.
 * Incluye todas las versiones de cada presupuesto, con costos, markup y ganancia.
 * No incluye datos del cliente (nombre, teléfono, DNI, CUIT, email, dirección) ni el mensaje enviado,
 * que suele llevar el nombre del cliente.
 * Montos en centavos de peso como string (sin flotantes); porcentajes en puntos básicos (2000 = 20 %).
 */
import { Controller, Get, Headers, NotFoundException, Param, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { idSchema } from "@tgs/contracts";
import { db } from "@tgs/database";
import { Public, ZodPipe } from "./infrastructure.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Compara el header contra el token configurado sin filtrar por tiempo cuánto coinciden. */
export function checkAcustockToken(authorization: string | undefined, configured: string | undefined): "ok" | "not_configured" | "unauthorized" {
  const expected = configured?.trim();
  if (!expected) return "not_configured";
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  if (!match) return "unauthorized";
  return timingSafeEqual(sha256(match[1]!.trim()), sha256(expected)) ? "ok" : "unauthorized";
}

function requireToken(authorization: string | undefined) {
  const result = checkAcustockToken(authorization, process.env.ACUSTOCK_API_TOKEN);
  if (result === "not_configured") throw new ServiceUnavailableException("La API para AcuStock no está habilitada: falta ACUSTOCK_API_TOKEN en el servicio de la API.");
  if (result === "unauthorized") throw new UnauthorizedException("Token inválido: mandá Authorization: Bearer <token>.");
}

const cents = (value: bigint | null | undefined) => (value == null ? null : value.toString());
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

type ItemRow = {
  id: string;
  position: number;
  frozenName: string;
  quantity: number;
  frozenCostCents: bigint;
  frozenMarkupBps: number;
  frozenSalePriceCents: bigint;
  subtotalCents: bigint;
  ivaBps: number | null;
  observation: string | null;
  webDescription: string | null;
  webImageUrl: string | null;
  isPcMainLine: boolean;
  productId: string | null;
  line: { id: string; name: string } | null;
};

export function mapItem(item: ItemRow) {
  const costTotal = item.frozenCostCents * BigInt(item.quantity);
  return {
    id: item.id,
    position: item.position,
    name: item.frozenName,
    quantity: item.quantity,
    line: item.line ? { id: item.line.id, name: item.line.name } : null,
    productId: item.productId,
    isPcMainLine: item.isPcMainLine,
    unitCostCents: cents(item.frozenCostCents),
    markupBps: item.frozenMarkupBps,
    unitSalePriceCents: cents(item.frozenSalePriceCents),
    subtotalCents: cents(item.subtotalCents),
    totalCostCents: cents(costTotal),
    profitCents: cents(item.subtotalCents - costTotal),
    ivaBps: item.ivaBps,
    observation: item.observation,
    webDescription: item.webDescription,
    webImageUrl: item.webImageUrl,
  };
}

type VersionRow = {
  id: string;
  version: number;
  state: string;
  reason: string | null;
  totalCostCents: bigint;
  totalSaleCents: bigint;
  profitCents: bigint;
  effectiveMarkupBps: number;
  publicObservation: string | null;
  tradeIns: unknown;
  financingSnapshot: unknown;
  webMeta: unknown;
  alertsJson: unknown;
  sentAt: Date | null;
  expiresAt: Date | null;
  checkedAt: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  creator: { displayName: string } | null;
  items: ItemRow[];
  pdfs: Array<{ id: string; kind: string; sizeBytes: number; createdAt: Date }>;
};

export function mapVersion(version: VersionRow, activeVersion: number) {
  return {
    id: version.id,
    version: version.version,
    isActive: version.version === activeVersion,
    state: version.state,
    reason: version.reason,
    createdBy: version.creator?.displayName ?? null,
    totals: {
      costCents: cents(version.totalCostCents),
      saleCents: cents(version.totalSaleCents),
      profitCents: cents(version.profitCents),
      markupBps: version.effectiveMarkupBps,
    },
    publicObservation: version.publicObservation,
    tradeIns: version.tradeIns ?? null,
    financing: version.financingSnapshot ?? null,
    web: version.webMeta ? { meta: version.webMeta, expiresAt: iso(version.expiresAt), checkedAt: iso(version.checkedAt), alerts: version.alertsJson ?? [] } : null,
    sentAt: iso(version.sentAt),
    lastActivityAt: iso(version.lastActivityAt),
    createdAt: iso(version.createdAt),
    updatedAt: iso(version.updatedAt),
    pdfs: version.pdfs.map((pdf) => ({ id: pdf.id, kind: pdf.kind, sizeBytes: pdf.sizeBytes, createdAt: iso(pdf.createdAt) })),
    items: [...version.items].sort((a, b) => a.position - b.position).map(mapItem),
  };
}

const familyInclude = {
  branch: { select: { id: true, name: true } },
  webPublication: { select: { status: true, url: true, publishedAt: true } },
  versions: {
    orderBy: { version: "asc" as const },
    include: {
      creator: { select: { displayName: true } },
      items: { orderBy: { position: "asc" as const }, include: { line: { select: { id: true, name: true } } } },
      pdfs: { orderBy: { createdAt: "asc" as const }, select: { id: true, kind: true, sizeBytes: true, createdAt: true } },
    },
  },
};

function mapFamily(family: any) {
  return {
    id: family.id,
    number: family.visibleNumber,
    internalName: family.internalName,
    kind: family.kind,
    isBuiltPc: family.isBuiltPc,
    comboDiscountBps: family.comboDiscountBps,
    branch: family.branch ? { id: family.branch.id, name: family.branch.name } : null,
    activeVersion: family.activeVersion,
    store: {
      visible: family.storeVisible,
      title: family.webTitle,
      tagline: family.webTagline,
      thumbnailUrl: family.thumbnailUrl,
      heroImageUrl: family.heroImageUrl,
      publication: family.webPublication
        ? { status: family.webPublication.status, url: family.webPublication.url, publishedAt: iso(family.webPublication.publishedAt) }
        : null,
    },
    lastActivityAt: iso(family.lastActivityAt),
    createdAt: iso(family.createdAt),
    updatedAt: iso(family.updatedAt),
    versions: family.versions.map((v: VersionRow) => mapVersion(v, family.activeVersion)),
  };
}

function mapCollectionHeader(collection: any) {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    branch: collection.branch ? { id: collection.branch.id, name: collection.branch.name } : null,
    icon: collection.icon,
    archived: collection.archived,
    favorite: collection.favorite,
    sortOrder: collection.sortOrder,
    createdAt: iso(collection.createdAt),
    updatedAt: iso(collection.updatedAt),
  };
}

@Public()
@Controller("integrations/acustock")
export class AcustockExportController {
  /** Todas las colecciones (también las archivadas) con la cantidad de presupuestos de cada una. */
  @Get("collections")
  async collections(@Headers("authorization") authorization?: string) {
    requireToken(authorization);
    const rows = await db.collection.findMany({
      orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { branch: { select: { id: true, name: true } }, _count: { select: { quotes: true } } },
    });
    return { items: rows.map((c: any) => ({ ...mapCollectionHeader(c), quoteCount: c._count.quotes })) };
  }

  /** Una colección con todos sus presupuestos, todas las versiones y todos los ítems. */
  @Get("collections/:id")
  async collection(@Param("id", new ZodPipe(idSchema)) id: string, @Headers("authorization") authorization?: string) {
    requireToken(authorization);
    const collection = await db.collection.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        quotes: { orderBy: [{ sortOrder: "asc" }, { addedAt: "asc" }], include: { family: { include: familyInclude } } },
      },
    });
    if (!collection) throw new NotFoundException("Colección inexistente");
    return {
      ...mapCollectionHeader(collection),
      quotes: collection.quotes.map((row: any) => ({ sortOrder: row.sortOrder, addedAt: iso(row.addedAt), quote: mapFamily(row.family) })),
    };
  }
}
