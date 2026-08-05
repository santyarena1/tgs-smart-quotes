import { BadGatewayException, Controller, Get, NotFoundException, Param, Post, Query, StreamableFile } from "@nestjs/common";
import { catalogQuerySchema, type CatalogQuery } from "@tgs/contracts";
import { db, Prisma, syncAcustockCatalog } from "@tgs/database";
import { jsonSafe, ZodPipe } from "./infrastructure.js";

function pesosToCents(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(Math.round(value * 100));
}

@Controller("catalog")
export class CatalogController {
  @Get(":mpn/image")
  async image(@Param("mpn") mpn:string){
    const product=await db.acustockProduct.findUnique({where:{mpn},select:{imageUrl:true}});
    if(!product?.imageUrl)throw new NotFoundException("El producto no tiene imagen disponible");
    let response:Response;
    try{response=await fetch(product.imageUrl,{signal:AbortSignal.timeout(10_000)})}
    catch{throw new BadGatewayException("No se pudo descargar la imagen de AcuStock")}
    if(!response.ok)throw new BadGatewayException(`AcuStock respondió HTTP ${response.status} al descargar la imagen`);
    const contentType=response.headers.get("content-type")??"image/jpeg";
    if(!contentType.toLowerCase().startsWith("image/"))throw new BadGatewayException("AcuStock devolvió un archivo que no es una imagen");
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length||bytes.length>12*1024*1024)throw new BadGatewayException("La imagen de AcuStock está vacía o supera 12 MB");
    return new StreamableFile(bytes,{type:contentType,disposition:`inline; filename="${mpn.replace(/[^\w.-]+/g,"-")}.jpg"`});
  }

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
              { brand: { contains: query.q, mode: "insensitive" } },
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
      items:items.map(item=>({
        ...item,
        id:item.mpn,
        name:item.title,
        salePriceCents:item.salePriceCents??item.priceCents,
      })),
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
