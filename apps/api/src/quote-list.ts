import {db, Prisma} from '@tgs/database';
import type {QuoteSearchInput} from '@tgs/contracts';
import {normalizePhone, normalizeText} from '@tgs/validation';
import {jsonSafe} from './infrastructure.js';

/**
 * Listados de presupuestos sin traer el árbol completo (todas las versiones,
 * ítems, PDFs y config). La búsqueda pagina en la base: antes se cargaba
 * cada familia con `quoteInclude` y recién después se recortaba la página.
 */

const FOLD_FROM = 'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙäëïöÄËÏÖ';
const FOLD_TO = 'aeiouunAEIOUUNaeiouAEIOUaeioAEIO';
if (FOLD_FROM.length !== FOLD_TO.length) {
  throw new Error('El mapa de acentos del listado de presupuestos no coincide');
}

const PAGE_CHUNK = 200;

function fold(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`trim(regexp_replace(lower(translate(${expr}, ${FOLD_FROM}, ${FOLD_TO})), '[^a-z0-9]+', ' ', 'g'))`;
}

const FROM = Prisma.sql`
  FROM "QuoteFamily" f
  JOIN "QuoteVersion" v ON v."familyId" = f.id AND v.version = f."activeVersion"
  LEFT JOIN "Customer" c ON c.id = f."customerId"
`;

function sortExpr(sort: QuoteSearchInput['sort']): Prisma.Sql {
  switch (sort) {
    case 'createdAt':
      return Prisma.sql`f."createdAt"`;
    case 'visibleNumber':
      return Prisma.sql`f."visibleNumber"`;
    case 'totalSaleCents':
      return Prisma.sql`v."totalSaleCents"`;
    case 'state':
      return Prisma.sql`v.state`;
    case 'lastActivityAt':
    default:
      return Prisma.sql`COALESCE(f."lastActivityAt", f."updatedAt")`;
  }
}

function textMatch(needle: string, digits: string, normalizedPhone: string | null): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (needle) {
    parts.push(
      Prisma.sql`strpos(${fold(Prisma.sql`f."visibleNumber"`)}, ${needle}) > 0`,
      Prisma.sql`strpos(${fold(Prisma.sql`f."internalName"`)}, ${needle}) > 0`,
      Prisma.sql`strpos(${fold(Prisma.sql`coalesce(c.name, '')`)}, ${needle}) > 0`,
      Prisma.sql`strpos(${fold(Prisma.sql`coalesce(c.phone, '')`)}, ${needle}) > 0`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM "QuoteItem" i
        WHERE i."versionId" = v.id
          AND strpos(${fold(Prisma.sql`i."frozenName"`)}, ${needle}) > 0
      )`,
    );
  }
  if (digits.length >= 6) {
    parts.push(Prisma.sql`strpos(regexp_replace(coalesce(c.phone, '') || coalesce(c."normalizedPhone", ''), '[^0-9]', '', 'g'), ${digits}) > 0`);
  }
  if (normalizedPhone) {
    parts.push(Prisma.sql`c."normalizedPhone" = ${normalizedPhone}`);
  }
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

function whereSql(query: QuoteSearchInput): Prisma.Sql {
  const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.customerId) filters.push(Prisma.sql`f."customerId" = ${query.customerId}`);
  if (query.isBuiltPc !== undefined) filters.push(Prisma.sql`f."isBuiltPc" = ${query.isBuiltPc}`);
  if (query.branchId) filters.push(Prisma.sql`f."branchId" = ${query.branchId}`);
  if (query.visibleNumber) {
    filters.push(Prisma.sql`strpos(lower(f."visibleNumber"), lower(${query.visibleNumber})) > 0`);
  }
  if (query.from) filters.push(Prisma.sql`f."createdAt" >= ${query.from}`);
  if (query.to) filters.push(Prisma.sql`f."createdAt" <= ${query.to}`);
  if (query.collectionId) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "CollectionQuote" cq
      WHERE cq."familyId" = f.id AND cq."collectionId" = ${query.collectionId}
    )`);
  }
  if (query.state) filters.push(Prisma.sql`v.state::text = ${query.state}`);
  if (query.pdfKind) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "QuotePdf" p
      WHERE p."versionId" = v.id AND p.kind::text = ${query.pdfKind}
    )`);
  }
  if (query.productName) {
    const needle = normalizeText(query.productName);
    if (needle) {
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "QuoteItem" i
        WHERE i."versionId" = v.id
          AND strpos(${fold(Prisma.sql`i."frozenName"`)}, ${needle}) > 0
      )`);
    }
  }
  if (query.q) {
    const needle = normalizeText(query.q);
    const digits = query.q.replace(/\D/g, '');
    const normalized = normalizePhone(query.q);
    if (needle || digits.length >= 6 || normalized) {
      filters.push(textMatch(needle, digits, normalized));
    }
  }
  if (query.phone) {
    const normalized = normalizePhone(query.phone);
    const parts: Prisma.Sql[] = [
      Prisma.sql`strpos(coalesce(c.phone, ''), ${query.phone}) > 0`,
    ];
    if (normalized) parts.push(Prisma.sql`c."normalizedPhone" = ${normalized}`);
    filters.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }
  return Prisma.join(filters, ' AND ');
}

const cardSelect = {
  id: true,
  visibleNumber: true,
  internalName: true,
  requestId: true,
  customerId: true,
  isBuiltPc: true,
  kind: true,
  comboDiscountBps: true,
  storeVisible: true,
  activeVersion: true,
  referenceImageUrl: true,
  referenceImageKey: true,
  thumbnailUrl: true,
  webTitle: true,
  webTagline: true,
  autoRepublish: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
  customer: {select: {id: true, name: true, phone: true, normalizedPhone: true}},
  branch: {select: {id: true, name: true}},
  _count: {select: {versions: true}},
} as const;

const versionSelect = {
  id: true,
  familyId: true,
  version: true,
  state: true,
  totalCostCents: true,
  totalSaleCents: true,
  profitCents: true,
  effectiveMarkupBps: true,
  createdAt: true,
  sentAt: true,
  creator: {select: {id: true, username: true, displayName: true}},
  items: {
    orderBy: {position: 'asc' as const},
    select: {
      id: true,
      productId: true,
      frozenName: true,
      lineId: true,
      quantity: true,
      frozenCostCents: true,
      frozenMarkupBps: true,
      frozenSalePriceCents: true,
      ivaBps: true,
      subtotalCents: true,
      position: true,
      observation: true,
      isPcMainLine: true,
    },
  },
  pdfs: {
    orderBy: {createdAt: 'desc' as const},
    select: {id: true, kind: true, createdAt: true, versionId: true, sizeBytes: true},
  },
} as const;

/** Arma la ficha de listado (versión activa + ítems + tipos de PDF) en el orden pedido. */
export async function hydrateQuoteCards(ids: string[]) {
  if (!ids.length) return [];
  const cards = [];
  for (let start = 0; start < ids.length; start += PAGE_CHUNK) {
    const chunk = ids.slice(start, start + PAGE_CHUNK);
    const families = await db.quoteFamily.findMany({
      where: {id: {in: chunk}},
      select: cardSelect,
    });
    const versionIds = families.length
      ? await db.$queryRaw<Array<{id: string}>>`
          SELECT v.id
          FROM "QuoteVersion" v
          JOIN "QuoteFamily" f ON f.id = v."familyId" AND f."activeVersion" = v.version
          WHERE f.id IN (${Prisma.join(chunk)})
        `
      : [];
    const versions = versionIds.length
      ? await db.quoteVersion.findMany({
          where: {id: {in: versionIds.map((row) => row.id)}},
          select: versionSelect,
        })
      : [];
    const versionByFamily = new Map(versions.map((version) => [version.familyId, version]));
    for (const family of families) {
      const {_count, ...rest} = family;
      const version = versionByFamily.get(family.id) ?? null;
      cards.push({
        ...rest,
        versionCount: _count.versions,
        version,
        items: version?.items ?? [],
        versions: version ? [version] : [],
      });
    }
  }
  const byId = new Map(cards.map((card) => [card.id, card]));
  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

export async function listQuoteCards() {
  const rows = await db.$queryRaw<Array<{id: string}>>`
    SELECT id FROM "QuoteFamily" ORDER BY "updatedAt" DESC, id ASC
  `;
  return jsonSafe(await hydrateQuoteCards(rows.map((row) => row.id)));
}

export type QuoteSearchSummary = {
  sent: number;
  accepted: number;
  acceptedSaleCents: string;
};

/** Búsqueda paginada. `summary` cuenta sobre el filtro completo, no sobre la página. */
export async function searchQuotePage(query: QuoteSearchInput) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const sort = query.sort ?? 'lastActivityAt';
  const order = query.order ?? 'desc';
  const where = whereSql(query);
  const direction = order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const [totals] = await db.$queryRaw<Array<{
    total: number;
    sent: number;
    accepted: number;
    acceptedSaleCents: string;
  }>>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE v.state::text = 'ENVIADO')::int AS sent,
      count(*) FILTER (WHERE v.state::text = 'ACEPTADO')::int AS accepted,
      coalesce(sum(v."totalSaleCents") FILTER (WHERE v.state::text = 'ACEPTADO'), 0)::text AS "acceptedSaleCents"
    ${FROM}
    WHERE ${where}
  `;
  const total = Number(totals?.total ?? 0);
  const idRows = total
    ? await db.$queryRaw<Array<{id: string}>>`
        SELECT f.id
        ${FROM}
        WHERE ${where}
        ORDER BY ${sortExpr(sort)} ${direction}, f.id ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `
    : [];
  const items = await hydrateQuoteCards(idRows.map((row) => row.id));
  return jsonSafe({
    total,
    page,
    pageSize,
    summary: {
      sent: Number(totals?.sent ?? 0),
      accepted: Number(totals?.accepted ?? 0),
      acceptedSaleCents: String(totals?.acceptedSaleCents ?? '0'),
    } satisfies QuoteSearchSummary,
    items,
  });
}
