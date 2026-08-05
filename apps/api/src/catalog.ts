import { BadGatewayException, Controller, Get, NotFoundException, Param, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { catalogQuerySchema, type CatalogQuery } from "@tgs/contracts";
import { db, Prisma, syncAcustockCatalog } from "@tgs/database";
import { jsonSafe, SkipRateLimit, ZodPipe } from "./infrastructure.js";
import {z} from "zod";

const TGS_STORE_URL="https://thegamershop.com.ar";
const IMAGE_CACHE_MAX_BYTES=64*1024*1024;
const IMAGE_CACHE_MAX_ITEMS=256;
const imageCache=new Map<string,{bytes:Buffer;contentType:string}>();
let imageCacheBytes=0;

function cachedImage(mpn:string){const entry=imageCache.get(mpn);if(!entry)return null;imageCache.delete(mpn);imageCache.set(mpn,entry);return entry}
function cacheImage(mpn:string,entry:{bytes:Buffer;contentType:string}){
  const previous=imageCache.get(mpn);if(previous)imageCacheBytes-=previous.bytes.byteLength;
  imageCache.delete(mpn);imageCache.set(mpn,entry);imageCacheBytes+=entry.bytes.byteLength;
  while(imageCache.size>IMAGE_CACHE_MAX_ITEMS||imageCacheBytes>IMAGE_CACHE_MAX_BYTES){const oldest=imageCache.entries().next().value as [string,{bytes:Buffer}]|undefined;if(!oldest)break;imageCache.delete(oldest[0]);imageCacheBytes-=oldest[1].bytes.byteLength}
}

function wordpressProductSlug(title:string):string{
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-AR")
    .replace(/[^a-z0-9 _-]/g,"").replace(/[ _]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
}

function fallbackProductUrl(title:string):string{return`${TGS_STORE_URL}/producto/${wordpressProductSlug(title)}/`}

function pesosToCents(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(Math.round(value * 100));
}

@Controller("catalog")
export class CatalogController {
  @Get("web-search")
  webSearch(@Query(new ZodPipe(z.object({q:z.string().trim().min(1).max(300)}).strict())) query:{q:string}){
    return{url:`${TGS_STORE_URL}/?s=${encodeURIComponent(query.q).replace(/%20/g,"+")}&post_type=product&dgwt_wcas=1`};
  }

  @Get(":mpn/image")
  @SkipRateLimit()
  async image(@Param("mpn") mpn:string,@Res({passthrough:true}) res:any){
    res.header("Cache-Control","public, max-age=86400, immutable");
    const cached=cachedImage(mpn);
    if(cached)return new StreamableFile(cached.bytes,{type:cached.contentType,disposition:`inline; filename="${mpn.replace(/[^\w.-]+/g,"-")}.jpg"`});
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
    cacheImage(mpn,{bytes,contentType});
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
        productUrl:item.productUrl??fallbackProductUrl(item.title),
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
