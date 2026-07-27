import {Controller, Get, Query} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {quoteSearchSchema, type QuoteSearchInput} from '@tgs/contracts';
import {normalizePhone, normalizeText} from '@tgs/validation';
import {activeBundle, quoteInclude} from './quotes.js';
import {jsonSafe, ZodPipe} from './infrastructure.js';

/**
 * `GET /quotes/search`. Registrado como controller separado (`quotes/search`) para que Nest nunca
 * lo confunda con `GET /quotes/:id` sin depender del orden de declaración de rutas.
 *
 * Implementación mínima: filtra a nivel de base de datos lo que es directo (cliente, colección,
 * fechas, PC armada) y resuelve `q`/`state`/`phone`/`productName` en memoria sobre la versión activa
 * de cada familia, usando `normalizeText` (sin acentos/case) para las comparaciones de texto. La
 * búsqueda trigram/FTS completa (pg_trgm) queda para BLOCK-5 según `docs/BUILD_PLAN.md`.
 */
@Controller('quotes/search')
export class QuoteSearchController {
  @Get()
  async search(@Query(new ZodPipe(quoteSearchSchema)) query: QuoteSearchInput) {
    const where: Prisma.QuoteFamilyWhereInput = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.isBuiltPc !== undefined) where.isBuiltPc = query.isBuiltPc;
    if (query.collectionId) where.collections = {some: {collectionId: query.collectionId}};
    if (query.visibleNumber) where.visibleNumber = {contains: query.visibleNumber, mode: 'insensitive'};
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? {gte: query.from} : {}),
        ...(query.to ? {lte: query.to} : {}),
      };
    }

    const rows = await db.quoteFamily.findMany({
      where,
      include: quoteInclude,
      orderBy: [{updatedAt: 'desc'}, {id: 'asc'}],
    });

    let bundles = rows.map(activeBundle) as any[];

    if (query.state) {
      bundles = bundles.filter((bundle) => bundle.version?.state === query.state);
    }
    if (query.q) {
      const needle = normalizeText(query.q);
      bundles = bundles.filter((bundle) => {
        const haystacks = [
          bundle.visibleNumber,
          bundle.internalName,
          bundle.customer?.name,
        ].filter(Boolean) as string[];
        if (haystacks.some((value) => normalizeText(value).includes(needle))) return true;
        return (bundle.items ?? []).some((item: any) => normalizeText(item.frozenName).includes(needle));
      });
    }
    if (query.productName) {
      const needle = normalizeText(query.productName);
      bundles = bundles.filter((bundle) =>
        (bundle.items ?? []).some((item: any) => normalizeText(item.frozenName).includes(needle)),
      );
    }
    if (query.phone) {
      const normalized = normalizePhone(query.phone);
      bundles = bundles.filter((bundle) => {
        const phone = bundle.customer?.phone as string | null | undefined;
        if (!phone) return false;
        if (normalized && bundle.customer?.normalizedPhone === normalized) return true;
        return phone.includes(query.phone as string);
      });
    }

    const sortValue = (bundle: any): string | number | bigint => {
      switch (query.sort) {
        case 'createdAt':
          return new Date(bundle.createdAt).getTime();
        case 'visibleNumber':
          return bundle.visibleNumber;
        case 'totalSaleCents':
          return BigInt(bundle.version?.totalSaleCents ?? '0');
        case 'state':
          return bundle.version?.state ?? '';
        case 'lastActivityAt':
        default:
          return new Date(bundle.lastActivityAt ?? bundle.updatedAt).getTime();
      }
    };
    const direction = query.order === 'asc' ? 1 : -1;
    bundles.sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      if (va < vb) return -1 * direction;
      if (va > vb) return 1 * direction;
      return 0;
    });

    const total = bundles.length;
    const start = (query.page - 1) * query.pageSize;
    const page = bundles.slice(start, start + query.pageSize);

    return jsonSafe({total, page: query.page, pageSize: query.pageSize, items: page});
  }
}
