import {BadRequestException,Body,Controller,Delete,Get,NotFoundException,Param,Post,Put,Query} from '@nestjs/common';
import {db} from '@tgs/database';
import {
  customerCreateSchema,
  customerQuickCreateSchema,
  idSchema,
  pcLineCreateSchema,
  productBulkDeleteSchema,
  productBulkMergeSchema,
  productCreateSchema,
  productDuplicateQuerySchema,
  productImportSchema,
  productMergeSchema,
  type CustomerCreateInput,
  type CustomerQuickCreateInput,
  type PcLineCreateInput,
  type ProductBulkDeleteInput,
  type ProductBulkMergeInput,
  type ProductCreateInput,
  type ProductImportInput,
  type ProductMergeInput,
} from '@tgs/contracts';
import {markupFromPrices,saleFromCost} from '@tgs/pricing';
import {extractNumbersModels,normalizePhone,normalizeText,productSimilarity} from '@tgs/validation';
import {CurrentUser,jsonSafe,type RequestUser,ZodPipe} from './infrastructure.js';

const audit=(
  tx:any,
  userId:string,
  entityType:string,
  entityId:string,
  action:string,
  previous:unknown,
  next:unknown,
)=>tx.auditLog.create({data:{
  userId,
  entityType,
  entityId,
  action,
  previous:previous==null?null:jsonSafe(previous),
  next:next==null?null:jsonSafe(next),
}});

/** Markup general configurable; nunca hardcodeado en el código. */
export async function generalMarkupBps(tx:any):Promise<number>{
  const settings=await tx.aiSettings.findUnique({where:{id:'singleton'}});
  return settings?.generalMarkupBps??3000;
}

/**
 * Reglas bidireccionales del README §6:
 * si llega venta se recalcula el markup; si no, la venta sale del costo y el markup efectivo.
 * Los productos que heredan el markup general lo toman de Configuración.
 */
export function productPrices(body:ProductCreateInput,generalBps:number){
  const costCents=BigInt(body.costCents);
  if(body.salePriceCents!==undefined){
    const salePriceCents=BigInt(body.salePriceCents);
    return {costCents,salePriceCents,markupBps:markupFromPrices(costCents,salePriceCents)};
  }
  const markupBps=body.usesGeneralMarkup?generalBps:body.markupBps;
  return {costCents,salePriceCents:saleFromCost(costCents,markupBps),markupBps};
}

function productData(body:ProductCreateInput,userId:string,generalBps:number){
  return {
    name:body.name.trim(),
    normalizedName:normalizeText(body.name),
    ...productPrices(body,generalBps),
    usesGeneralMarkup:body.usesGeneralMarkup,
    defaultLineId:body.defaultLineId??null,
    active:body.active??true,
    updatedById:userId,
  };
}

export function priceChanged(
  old:{costCents:bigint;salePriceCents:bigint;markupBps:number},
  next:{costCents:bigint;salePriceCents:bigint;markupBps:number},
){
  return old.costCents!==next.costCents||
    old.salePriceCents!==next.salePriceCents||
    old.markupBps!==next.markupBps;
}

async function addPriceHistory(
  tx:any,
  productId:string,
  values:{costCents:bigint;salePriceCents:bigint;markupBps:number},
  userId:string,
  reason:string,
){
  await tx.productPriceHistory.create({data:{
    productId,
    costCents:values.costCents,
    salePriceCents:values.salePriceCents,
    markupBps:values.markupBps,
    changedById:userId,
    reason,
  }});
}

async function createProduct(tx:any,body:ProductCreateInput,userId:string,reason='Creación manual'){
  const data=productData(body,userId,await generalMarkupBps(tx));
  const next=await tx.product.create({data});
  await addPriceHistory(tx,next.id,data,userId,body.reason??reason);
  await audit(tx,userId,'Product',next.id,'CREATE',null,next);
  return next;
}

async function updateProduct(tx:any,id:string,body:ProductCreateInput,userId:string,reason='Actualización manual'){
  const old=await tx.product.findUnique({where:{id}});
  if(!old)throw new NotFoundException('Producto inexistente');
  const data=productData(body,userId,await generalMarkupBps(tx));
  const next=await tx.product.update({where:{id},data});
  if(priceChanged(old,data))await addPriceHistory(tx,id,data,userId,body.reason??reason);
  await audit(tx,userId,'Product',id,'UPDATE',old,next);
  return next;
}

/** Marca productos como usados ahora (al incluirlos en un presupuesto). */
export async function touchProductsLastUsed(tx:any,productIds:Array<string|null|undefined>,at=new Date()){
  const unique=[...new Set(productIds.filter((id):id is string=>Boolean(id)))];
  if(!unique.length)return;
  await tx.product.updateMany({
    where:{id:{in:unique}},
    data:{lastUsedAt:at},
  });
}

/**
 * Si el costo que se cargó para un ítem de presupuesto (ligado a un producto del catálogo)
 * difiere del costo maestro actual, actualiza el producto: así la próxima vez que se use en un
 * presupuesto ya sale con el costo nuevo. Mantiene la política de markup del producto (general o
 * propio), solo cambia costo y precio de venta resultante. No toca productos inactivos.
 */
export async function syncProductCostsFromQuoteItems(
  tx:any,
  items:ReadonlyArray<{productId?:string|null;costCents:string}>,
  userId:string,
){
  const byProduct=new Map<string,bigint>();
  for(const item of items){
    if(!item.productId)continue;
    byProduct.set(item.productId,BigInt(item.costCents));
  }
  if(!byProduct.size)return;
  const products=await tx.product.findMany({where:{id:{in:[...byProduct.keys()]},active:true}});
  const generalBps=await generalMarkupBps(tx);
  for(const product of products){
    const newCostCents=byProduct.get(product.id)!;
    if(newCostCents===product.costCents)continue;
    const markupBps=product.usesGeneralMarkup?generalBps:product.markupBps;
    const salePriceCents=saleFromCost(newCostCents,markupBps);
    const next={costCents:newCostCents,salePriceCents,markupBps};
    await tx.product.update({where:{id:product.id},data:{...next,updatedById:userId}});
    await addPriceHistory(tx,product.id,next,userId,'Actualizado desde un presupuesto');
    await audit(tx,userId,'Product',product.id,'UPDATE',product,next);
  }
}

@Controller('products')
export class ProductsController{
  @Get()
  async list(){
    return jsonSafe(await db.product.findMany({
      include:{defaultLine:true},
      orderBy:[{active:'desc'},{normalizedName:'asc'},{id:'asc'}],
    }));
  }

  @Get(':id/quotes')
  async quotesWhereUsed(@Param('id',new ZodPipe(idSchema)) id:string){
    const product=await db.product.findUnique({
      where:{id},
      select:{id:true,name:true,lastUsedAt:true,active:true},
    });
    if(!product)throw new NotFoundException('Producto inexistente');

    const items=await db.quoteItem.findMany({
      where:{productId:id},
      select:{
        quantity:true,
        frozenName:true,
        version:{
          select:{
            version:true,
            state:true,
            lastActivityAt:true,
            createdAt:true,
            family:{
              select:{
                id:true,
                visibleNumber:true,
                internalName:true,
                lastActivityAt:true,
                customer:{select:{id:true,name:true}},
              },
            },
          },
        },
      },
    });

    const byFamily=new Map<string,{
      familyId:string;
      visibleNumber:string;
      internalName:string;
      customerName:string|null;
      version:number;
      state:string;
      quantity:number;
      usedAt:Date;
    }>();

    for(const item of items){
      const family=item.version.family;
      const usedAt=item.version.lastActivityAt
        ??family.lastActivityAt
        ??item.version.createdAt;
      const prev=byFamily.get(family.id);
      if(!prev||usedAt>prev.usedAt){
        byFamily.set(family.id,{
          familyId:family.id,
          visibleNumber:family.visibleNumber,
          internalName:family.internalName,
          customerName:family.customer?.name??null,
          version:item.version.version,
          state:item.version.state,
          quantity:item.quantity,
          usedAt,
        });
      }
    }

    const quotes=[...byFamily.values()].sort((a,b)=>b.usedAt.getTime()-a.usedAt.getTime());
    return jsonSafe({product,quotes,total:quotes.length});
  }

  @Post()
  async create(
    @Body(new ZodPipe(productCreateSchema)) body:ProductCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    const next=await db.$transaction(tx=>createProduct(tx,body,actor.id));
    return jsonSafe(next);
  }

  @Put(':id')
  async update(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(productCreateSchema)) body:ProductCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    const next=await db.$transaction(tx=>updateProduct(tx,id,body,actor.id));
    return jsonSafe(next);
  }

  @Delete(':id')
  async remove(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.product.findUnique({where:{id}});
      if(!old)throw new NotFoundException('Producto inexistente');
      const next=await tx.product.update({where:{id},data:{active:false,updatedById:actor.id}});
      await audit(tx,actor.id,'Product',id,'DELETE',old,next);
      return {ok:true};
    });
  }

  @Post('bulk-delete')
  async bulkDelete(
    @Body(new ZodPipe(productBulkDeleteSchema)) body:ProductBulkDeleteInput,
    @CurrentUser() actor:RequestUser,
  ){
    const unique=[...new Set(body.ids)];
    return db.$transaction(async tx=>{
      const found=await tx.product.findMany({where:{id:{in:unique}}});
      if(!found.length)throw new NotFoundException('No se encontraron productos');
      await tx.product.updateMany({
        where:{id:{in:found.map((p:any)=>p.id)}},
        data:{active:false,updatedById:actor.id},
      });
      await audit(tx,actor.id,'Product','bulk','BULK_DELETE',{ids:found.map((p:any)=>p.id)},{
        deactivated:found.length,
      });
      return {ok:true,deactivated:found.length};
    });
  }

  @Get('duplicate-groups')
  async duplicateGroups(@Query('threshold') thresholdRaw?: string){
    const startedAt=performance.now();
    const [settings,products]=await Promise.all([
      db.aiSettings.findUnique({where:{id:'singleton'}}),
      db.product.findMany({
        where:{active:true},
        select:{
          id:true,
          name:true,
          costCents:true,
          salePriceCents:true,
          markupBps:true,
          usesGeneralMarkup:true,
          updatedAt:true,
          lastUsedAt:true,
          _count:{select:{items:true}},
        },
        orderBy:[{normalizedName:'asc'},{id:'asc'}],
      }),
    ]);
    const parsed=thresholdRaw!==undefined&&thresholdRaw!==''?Number(thresholdRaw):NaN;
    const threshold=Number.isFinite(parsed)
      ?Math.max(0,Math.min(100,Math.round(parsed)))
      :(settings?.productSimilarityThreshold??70);

    const n=products.length;
    if(n<2)return {
      threshold,
      groups:[],
      comparedPairs:0,
      possiblePairs:0,
      productCount:n,
      durationMs:Math.round((performance.now()-startedAt)*10)/10,
    };

    const STOP=new Set([
      'de','la','el','los','las','del','y','o','para','con','sin','the','and','for','pc','kit',
      'gaming','gamer','nuevo','nueva','original',
    ]);

    const indexed=products.map((p)=>{
      const tokens=normalizeText(p.name).split(' ').filter((t)=>t.length>=3&&!STOP.has(t));
      const models=extractNumbersModels(p.name);
      return {product:p,tokens,models,norm:normalizeText(p.name)};
    });

    // Solo comparamos pares que comparten un token/modelo significativo (evita O(n²) puro).
    const tokenIndex=new Map<string,number[]>();
    for(let i=0;i<n;i++){
      const row=indexed[i]!;
      const keys=new Set<string>([
        ...row.tokens,
        ...row.models.map((m)=>`#${m}`),
      ]);
      if(!keys.size&&row.norm)keys.add(`=${row.norm}`);
      for(const key of keys){
        const list=tokenIndex.get(key)??[];
        list.push(i);
        tokenIndex.set(key,list);
      }
    }

    // Clave numérica: evita crear y luego parsear miles de strings "i:j".
    const candidatePairs=new Set<number>();
    for(const indices of tokenIndex.values()){
      // Tokens demasiado comunes generan demasiados pares inútiles.
      if(indices.length<2||indices.length>60)continue;
      for(let a=0;a<indices.length;a++){
        for(let b=a+1;b<indices.length;b++){
          const i=Math.min(indices[a]!,indices[b]!);
          const j=Math.max(indices[a]!,indices[b]!);
          candidatePairs.add(i*n+j);
        }
      }
    }

    // Nombres normalizados idénticos siempre son candidatos.
    const byNorm=new Map<string,number[]>();
    for(let i=0;i<n;i++){
      const norm=indexed[i]!.norm;
      if(!norm)continue;
      const list=byNorm.get(norm)??[];
      list.push(i);
      byNorm.set(norm,list);
    }
    for(const indices of byNorm.values()){
      if(indices.length<2)continue;
      for(let a=0;a<indices.length;a++){
        for(let b=a+1;b<indices.length;b++){
          candidatePairs.add(indices[a]!*n+indices[b]!);
        }
      }
    }

    const parent=Array.from({length:n},(_,i)=>i);
    const find=(i:number):number=>{
      while(parent[i]!==i){
        parent[i]=parent[parent[i]!]!;
        i=parent[i]!;
      }
      return i;
    };
    const unite=(a:number,b:number)=>{
      const ra=find(a);
      const rb=find(b);
      if(ra!==rb)parent[rb]=ra;
    };

    const pairScores=new Map<string,number>();
    for(const key of candidatePairs){
      const i=Math.floor(key/n);
      const j=key%n;
      const a=indexed[i]!;
      const b=indexed[j]!;
      const score=a.norm===b.norm?100:productSimilarity(a.product.name,b.product.name);
      if(score<threshold)continue;
      unite(i,j);
      pairScores.set(`${a.product.id}:${b.product.id}`,score);
      pairScores.set(`${b.product.id}:${a.product.id}`,score);
    }

    const buckets=new Map<number,typeof products>();
    for(let i=0;i<n;i++){
      const root=find(i);
      const list=buckets.get(root)??[];
      list.push(products[i]!);
      buckets.set(root,list);
    }

    const matchedIds=new Set<string>();
    for(const key of pairScores.keys())matchedIds.add(key.split(':')[0]!);

    const groups=[...buckets.values()]
      .filter((members)=>members.length>=2&&members.some((m)=>matchedIds.has(m.id)))
      .map((members)=>{
        const scores:number[]=[];
        for(let i=0;i<members.length;i++){
          for(let j=i+1;j<members.length;j++){
            const score=pairScores.get(`${members[i]!.id}:${members[j]!.id}`);
            if(score!==undefined)scores.push(score);
          }
        }
        if(!scores.length)return null;
        return {
          members:jsonSafe(members.map((member)=>({
            ...member,
            score:Math.max(...members
              .filter((other)=>other.id!==member.id)
              .map((other)=>pairScores.get(`${member.id}:${other.id}`)??0)),
          }))),
          maxScore:Math.max(...scores),
        };
      })
      .filter((g):g is {members:ReturnType<typeof jsonSafe>;maxScore:number}=>g!==null)
      .sort((a,b)=>b.maxScore-a.maxScore||(a.members as unknown[]).length-(b.members as unknown[]).length);

    return {
      threshold,
      productCount:n,
      comparedPairs:candidatePairs.size,
      possiblePairs:n*(n-1)/2,
      durationMs:Math.round((performance.now()-startedAt)*10)/10,
      groups,
    };
  }

  private async mergeProducts(tx:any,body:ProductMergeInput,actorId:string){
    const mergeIds=[...new Set(body.mergeIds.filter((id)=>id!==body.keepId))];
    if(!mergeIds.length)throw new BadRequestException('Indicá al menos un producto a unificar');
    const keep=await tx.product.findUnique({where:{id:body.keepId}});
    if(!keep)throw new NotFoundException('Producto a conservar inexistente');
    const merging=await tx.product.findMany({where:{id:{in:mergeIds}}});
    if(merging.length!==mergeIds.length){
      throw new BadRequestException('Uno o más productos a unificar no existen');
    }

    await tx.quoteItem.updateMany({
      where:{productId:{in:mergeIds}},
      data:{productId:body.keepId},
    });

    const comboItems=await tx.comboItem.findMany({where:{productId:{in:mergeIds}}});
    for(const item of comboItems){
      const existing=await tx.comboItem.findUnique({
        where:{comboId_productId:{comboId:item.comboId,productId:body.keepId}},
      });
      if(existing){
        await tx.comboItem.update({
          where:{id:existing.id},
          data:{quantity:existing.quantity+item.quantity},
        });
        await tx.comboItem.delete({where:{id:item.id}});
      }else{
        await tx.comboItem.update({where:{id:item.id},data:{productId:body.keepId}});
      }
    }

    await tx.product.updateMany({
      where:{id:{in:mergeIds}},
      data:{active:false,updatedById:actorId},
    });
    await audit(tx,actorId,'Product',body.keepId,'MERGE',{
      keepId:body.keepId,
      mergeIds,
      mergedNames:merging.map((p:any)=>p.name),
    },{keep});
    return jsonSafe({ok:true,keepId:body.keepId,merged:mergeIds.length,deactivated:mergeIds});
  }

  @Post('merge')
  async merge(
    @Body(new ZodPipe(productMergeSchema)) body:ProductMergeInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(tx=>this.mergeProducts(tx,body,actor.id),{timeout:60_000});
  }

  @Post('merge-bulk')
  async mergeBulk(
    @Body(new ZodPipe(productBulkMergeSchema)) body:ProductBulkMergeInput,
    @CurrentUser() actor:RequestUser,
  ){
    const results=[];
    for(let index=0;index<body.groups.length;index++){
      const group=body.groups[index]!;
      try{
        const result=await db.$transaction(
          tx=>this.mergeProducts(tx,group,actor.id),
          {timeout:60_000},
        );
        results.push({index,ok:true,...result});
      }catch(error){
        results.push({
          index,
          ok:false,
          error:error instanceof Error?error.message:'No se pudo unificar el grupo',
        });
      }
    }
    return {
      ok:results.every((result)=>result.ok),
      succeeded:results.filter((result)=>result.ok).length,
      failed:results.filter((result)=>!result.ok).length,
      results,
    };
  }

  @Post('import')
  async importProducts(
    @Body(new ZodPipe(productImportSchema)) body:ProductImportInput,
    @CurrentUser() actor:RequestUser,
  ){
    const summary:{total:number;created:number;updated:number;skipped:number;errors:string[]}={
      total:body.rows.length,
      created:0,
      updated:0,
      skipped:0,
      errors:[],
    };

    // Una sola transacción con ~1000 filas (create + history + audit) supera el timeout
    // default de Prisma (~5s). Procesamos por lotes con timeout amplio.
    const CHUNK=80;
    const existing=await db.product.findMany({
      select:{id:true,normalizedName:true},
    });
    const byName=new Map(existing.map((product)=>[product.normalizedName,product]));

    for(let offset=0;offset<body.rows.length;offset+=CHUNK){
      const chunk=body.rows.slice(offset,offset+CHUNK);
      try{
        const part=await db.$transaction(async tx=>{
          const local={created:0,updated:0,skipped:0};
          const localNames=new Map(byName);
          for(const row of chunk){
            const normalizedName=normalizeText(row.name);
            const current=localNames.get(normalizedName);
            if(current&&body.mode==='skip'){
              local.skipped++;
              continue;
            }
            if(current){
              const next=await updateProduct(tx,current.id,row,actor.id,'Importación');
              localNames.set(normalizedName,{id:next.id,normalizedName});
              local.updated++;
            }else{
              const next=await createProduct(tx,row,actor.id,'Importación');
              localNames.set(normalizedName,{id:next.id,normalizedName});
              local.created++;
            }
          }
          return {local,localNames};
        },{timeout:120_000,maxWait:20_000});
        summary.created+=part.local.created;
        summary.updated+=part.local.updated;
        summary.skipped+=part.local.skipped;
        for(const [name,product] of part.localNames)byName.set(name,product);
      }catch(err){
        const message=err instanceof Error?err.message:'Error desconocido';
        summary.errors.push(
          `Lote ${Math.floor(offset/CHUNK)+1} (filas ${offset+1}-${offset+chunk.length}): ${message}`,
        );
        const refreshed=await db.product.findMany({select:{id:true,normalizedName:true}});
        byName.clear();
        for(const product of refreshed)byName.set(product.normalizedName,product);
      }
    }

    return summary;
  }

  @Get('duplicates')
  async duplicates(@Query(new ZodPipe(productDuplicateQuerySchema)) query:{name:string}){
    const [settings,products]=await Promise.all([
      db.aiSettings.findUnique({where:{id:'singleton'}}),
      db.product.findMany({where:{active:true}}),
    ]);
    const threshold=settings?.productSimilarityThreshold??70;
    const matches=products
      .map(product=>({...product,score:productSimilarity(query.name,product.name)}))
      .filter(product=>product.score>=threshold)
      .sort((a,b)=>b.score-a.score||a.normalizedName.localeCompare(b.normalizedName)||a.id.localeCompare(b.id));
    return {threshold,matches:jsonSafe(matches)};
  }
}

function customerData(body:CustomerCreateInput){
  const phone=body.phone?.trim()||null;
  return {
    name:body.name.trim(),
    normalizedName:normalizeText(body.name),
    phone,
    normalizedPhone:normalizePhone(phone),
    dni:body.dni?.trim()||null,
    notes:body.notes?.trim()||null,
  };
}

async function createCustomerRecord(tx:any,body:CustomerCreateInput,userId:string){
  const next=await tx.customer.create({data:customerData(body)});
  await audit(tx,userId,'Customer',next.id,'CREATE',null,next);
  return next;
}

@Controller('customers')
export class CustomerController{
  @Get()
  async list(){
    return db.customer.findMany({orderBy:[{normalizedName:'asc'},{id:'asc'}]});
  }

  @Post()
  async create(
    @Body(new ZodPipe(customerCreateSchema)) body:CustomerCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(tx=>createCustomerRecord(tx,body,actor.id));
  }

  @Post('quick')
  async quick(
    @Body(new ZodPipe(customerQuickCreateSchema)) body:CustomerQuickCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    const normalized=normalizePhone(body.phone);
    if(!normalized)throw new BadRequestException('El teléfono detectado no es válido');
    return db.$transaction(async tx=>{
      const existing=await tx.customer.findFirst({where:{normalizedPhone:normalized}});
      if(existing)return {...existing,created:false};
      const customer=await createCustomerRecord(tx,{
        name:`WhatsApp ${body.phone}`,
        phone:body.phone,
        dni:null,
        notes:'Alta rápida desde el panel de WhatsApp.',
      },actor.id);
      return {...customer,created:true};
    });
  }

  @Put(':id')
  async update(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(customerCreateSchema)) body:CustomerCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.customer.findUnique({where:{id}});
      if(!old)throw new NotFoundException('Cliente inexistente');
      const next=await tx.customer.update({where:{id},data:customerData(body)});
      await audit(tx,actor.id,'Customer',id,'UPDATE',old,next);
      return next;
    });
  }

  @Delete(':id')
  async remove(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.customer.findUnique({where:{id}});
      if(!old)throw new NotFoundException('Cliente inexistente');
      await tx.customer.delete({where:{id}});
      await audit(tx,actor.id,'Customer',id,'DELETE',old,null);
      return {ok:true};
    });
  }
}

function pcLineData(body:PcLineCreateInput){
  return {
    name:body.name.trim(),
    sortOrder:body.sortOrder,
    active:body.active??true,
    aliases:(body.aliases??[]).map(alias=>alias.trim()),
    keyLine:body.keyLine??false,
    concept:body.concept??'OTHER',
  };
}

@Controller('pc-lines')
export class PcLineController{
  @Get()
  async list(){
    return db.pcLine.findMany({orderBy:[{sortOrder:'asc'},{name:'asc'},{id:'asc'}]});
  }

  @Post()
  async create(
    @Body(new ZodPipe(pcLineCreateSchema)) body:PcLineCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const next=await tx.pcLine.create({data:pcLineData(body)});
      await audit(tx,actor.id,'PcLine',next.id,'CREATE',null,next);
      return next;
    });
  }

  @Put(':id')
  async update(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(pcLineCreateSchema)) body:PcLineCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.pcLine.findUnique({where:{id}});
      if(!old)throw new NotFoundException('Línea de PC inexistente');
      const next=await tx.pcLine.update({where:{id},data:pcLineData(body)});
      await audit(tx,actor.id,'PcLine',id,'UPDATE',old,next);
      return next;
    });
  }

  @Delete(':id')
  async remove(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.pcLine.findUnique({where:{id}});
      if(!old)throw new NotFoundException('Línea de PC inexistente');
      await tx.pcLine.delete({where:{id}});
      await audit(tx,actor.id,'PcLine',id,'DELETE',old,null);
      return {ok:true};
    });
  }
}
