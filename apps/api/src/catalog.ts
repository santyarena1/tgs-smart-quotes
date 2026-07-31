import { Controller, Get, Post, Query } from "@nestjs/common";
import { catalogQuerySchema, type CatalogQuery } from "@tgs/contracts";
import { db, Prisma, syncAcustockCatalog } from "@tgs/database";
import { jsonSafe, ZodPipe } from "./infrastructure.js";

function pesosToCents(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(Math.round(value * 100));
}

@Controller("catalog")
export class CatalogController {
  @Get()
  async list(@Query(new ZodPipe(catalogQuerySchema)) query: CatalogQuery) {
    const priceFilter: Prisma.BigIntFilter | undefined =
      query.minPrice !== undefined || query.maxPrice !== undefined
        ? { gte: pesosToCents(query.minPrice), lte: pesosToCents(query.maxPrice) }
        : undefined;
    const where: Prisma.AcustockProductWhereInput = {
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
              { mpn: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.productType ? { productType: query.productType } : {}),
      ...(query.brand ? { brand: query.brand } : {}),
      ...(query.availability ? { availability: query.availability } : {}),
      ...(query.inStock ? { stockQuantity: { gt: 0 } } : {}),
      ...(priceFilter ? { priceCents: priceFilter } : {}),
    };
    const orderBy: Prisma.AcustockProductOrderByWithRelationInput[] =
      query.sort === "price_asc"
        ? [{ priceCents: "asc" }, { title: "asc" }]
        : query.sort === "price_desc"
          ? [{ priceCents: "desc" }, { title: "asc" }]
          : query.sort === "name_desc"
            ? [{ title: "desc" }]
            : query.sort === "stock_desc"
              ? [{ stockQuantity: "desc" }, { title: "asc" }]
              : [{ title: "asc" }];
    const skip = (query.page - 1) * query.pageSize;

    const [items, total, productTypes, brands, availabilities, latest] = await Promise.all([
      db.acustockProduct.findMany({ where, orderBy, skip, take: query.pageSize }),
      db.acustockProduct.count({ where }),
      db.acustockProduct.findMany({
        where: { productType: { not: null } },
        distinct: ["productType"],
        select: { productType: true },
        orderBy: { productType: "asc" },
      }),
      db.acustockProduct.findMany({
        where: { brand: { not: null } },
        distinct: ["brand"],
        select: { brand: true },
        orderBy: { brand: "asc" },
      }),
      db.acustockProduct.findMany({
        distinct: ["availability"],
        select: { availability: true },
        orderBy: { availability: "asc" },
      }),
      db.acustockProduct.aggregate({ _max: { lastSyncedAt: true } }),
    ]);

    return jsonSafe({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      facets: {
        productTypes: productTypes.flatMap((row) => (row.productType ? [row.productType] : [])),
        brands: brands.flatMap((row) => (row.brand ? [row.brand] : [])),
        availabilities: availabilities.map((row) => row.availability),
      },
      lastSyncedAt: latest._max.lastSyncedAt,
    });
  }

  @Post("sync")
  async sync() {
    return syncAcustockCatalog();
  }
}
