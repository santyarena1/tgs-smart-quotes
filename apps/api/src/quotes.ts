import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {db,Prisma,type QuoteState,type StatusEventType} from '@tgs/database';
import {touchProductsLastUsed} from './products.js';
import {
  collectionCreateSchema,
  collectionUpdateSchema,
  idSchema,
  quoteCreateSchema,
  quoteCollectionsSchema,
  quotePricesUpdateSchema,
  quoteReactivateSchema,
  quoteReplyCreateSchema,
  quoteRetargetSchema,
  quoteStateSchema,
  quoteUpdateSchema,
  quoteVersionCreateSchema,
  requestAssociateQuoteSchema,
  requestCreateSchema,
  requestUpdateSchema,
  sendAttemptCreateSchema,
  sendAttemptResolveSchema,
  type CollectionCreateInput,
  type CollectionUpdateInput,
  type QuoteCollectionsInput,
  type QuoteCreateInput,
  type QuotePricesUpdateInput,
  type QuoteReactivateInput,
  type QuoteReplyCreateInput,
  type QuoteRetargetInput,
  type QuoteStateInput,
  type QuoteUpdateInput,
  type QuoteVersionCreateInput,
  type RequestAssociateQuoteInput,
  type RequestCreateInput,
  type RequestUpdateInput,
  type SendAttemptCreateInput,
  type SendAttemptResolveInput,
} from '@tgs/contracts';
import {markupFromPrices,PricingError,retarget as retargetPricing,saleFromCost,totals} from '@tgs/pricing';
import {normalizePhone,normalizeText,productSimilarity} from '@tgs/validation';
import {CurrentUser,jsonSafe,type RequestUser,ZodPipe} from './infrastructure.js';

type QuoteItemCreateInput=QuoteCreateInput['items'][number];

export function jsonField(value:Record<string,unknown>|null|undefined){
  if(value===undefined)return undefined;
  if(value===null)return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export const audit=(
  tx:any,
  userId:string,
  entityType:string,
  entityId:string,
  action:string,
  previous:unknown,
  next:unknown,
  metadata?:unknown,
)=>tx.auditLog.create({data:{
  userId,
  entityType,
  entityId,
  action,
  previous:previous==null?null:jsonSafe(previous),
  next:next==null?null:jsonSafe(next),
  metadata:metadata==null?undefined:jsonSafe(metadata),
}});

export const statusEvent=(
  tx:any,
  data:{
    type:StatusEventType;
    familyId?:string|null;
    versionId?:string|null;
    requestId?:string|null;
    customerId?:string|null;
    userId?:string|null;
    previous?:unknown;
    next?:unknown;
    metadata?:unknown;
  },
)=>tx.quoteStatusEvent.create({data:{
  type:data.type,
  familyId:data.familyId??null,
  versionId:data.versionId??null,
  requestId:data.requestId??null,
  customerId:data.customerId??null,
  userId:data.userId??null,
  previous:data.previous==null?null:jsonSafe(data.previous),
  next:data.next==null?null:jsonSafe(data.next),
  metadata:data.metadata==null?null:jsonSafe(data.metadata),
}});

export function formatVisibleNumber(ymd:string,sequence:number){
  return `TGS-${ymd}-${String(sequence).padStart(4,'0')}`;
}

export function assertDraftMutable(state:QuoteState|string){
  if(state!=='BORRADOR'){
    throw new BadRequestException(
      'La versión no es editable; cree una nueva versión con POST /quotes/:id/version',
    );
  }
}

export function eventTypeForState(state:QuoteState|string):StatusEventType{
  switch(state){
    case 'ENVIADO':return 'ENVIO_CONFIRMADO_MANUAL';
    case 'ACEPTADO':return 'ACEPTACION';
    case 'RECHAZADO':return 'RECHAZO';
    case 'REEMPLAZADO':return 'REEMPLAZO';
    case 'NO_CONCRETADO':return 'NO_CONCRETADO';
    default:return 'CAMBIO_ESTADO';
  }
}

function humanEventLabel(type:string){
  const labels:Record<string,string>={
    CREADO:'Presupuesto creado',VERSION_CREADA:'Nueva versión creada',PRECIOS_ACTUALIZADOS:'Precios actualizados',
    COSTO_AJUSTADO:'Costo actualizado',COLECCION_MODIFICADA:'Colección modificada',PDF_GENERADO:'PDF generado',
    ENVIO_DETECTADO:'Envío detectado',ENVIO_CONFIRMADO_MANUAL:'Presupuesto enviado',ACEPTACION:'Presupuesto aceptado',
    RECHAZO:'Presupuesto rechazado',REEMPLAZO:'Presupuesto reemplazado',NO_CONCRETADO:'Presupuesto no concretado',
    CAMBIO_ESTADO:'Estado actualizado',REACTIVADO:'Presupuesto reactivado',
  };
  return labels[type]??type.toLocaleLowerCase('es-AR').replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());
}

export function resolveItemPricing(input:{
  costCents:string;
  markupBps:number;
  salePriceCents?:string;
  quantity?:number;
}){
  const costCents=BigInt(input.costCents);
  const quantity=input.quantity??1;
  let salePriceCents:bigint;
  let markupBps:number;
  if(input.salePriceCents!==undefined){
    salePriceCents=BigInt(input.salePriceCents);
    markupBps=markupFromPrices(costCents,salePriceCents);
  }else{
    markupBps=input.markupBps;
    salePriceCents=saleFromCost(costCents,markupBps);
  }
  return {
    costCents,
    markupBps,
    salePriceCents,
    subtotalCents:salePriceCents*BigInt(quantity),
  };
}

export function buildItemRows(
  items:ReadonlyArray<QuoteItemCreateInput>,
  masterPriceByProduct:Map<string,Date>=new Map(),
){
  return items.map(item=>{
    const priced=resolveItemPricing(item);
    return {
      productId:item.productId??null,
      frozenName:item.name.trim(),
      lineId:item.lineId??null,
      quantity:item.quantity,
      frozenCostCents:priced.costCents,
      frozenMarkupBps:priced.markupBps,
      frozenSalePriceCents:priced.salePriceCents,
      subtotalCents:priced.subtotalCents,
      position:item.position,
      observation:item.observation??null,
      isPcMainLine:item.isPcMainLine??false,
      masterPriceAt:item.productId?masterPriceByProduct.get(item.productId)??null:null,
    };
  });
}

function copyItemSnapshot(item:any){
  return {
    productId:item.productId,
    frozenName:item.frozenName,
    lineId:item.lineId,
    quantity:item.quantity,
    frozenCostCents:item.frozenCostCents,
    frozenMarkupBps:item.frozenMarkupBps,
    frozenSalePriceCents:item.frozenSalePriceCents,
    subtotalCents:item.subtotalCents,
    masterPriceAt:item.masterPriceAt,
    masterCostCents:item.masterCostCents,
    masterSaleCents:item.masterSaleCents,
    position:item.position,
    observation:item.observation,
    isPcMainLine:item.isPcMainLine,
  };
}

function pricingTotals(rows:ReadonlyArray<{frozenCostCents:bigint;frozenSalePriceCents:bigint;quantity:number}>){
  return totals(rows.map(row=>({
    costCents:row.frozenCostCents,
    salePriceCents:row.frozenSalePriceCents,
    quantity:row.quantity,
  })));
}

function pricingError(error:unknown):never{
  if(error instanceof PricingError)throw new BadRequestException(error.message);
  throw error as Error;
}

async function masterPrices(tx:any,items:ReadonlyArray<{productId?:string|null}>):Promise<Map<string,Date>>{
  const ids=[...new Set(items.map(item=>item.productId).filter((id):id is string=>Boolean(id)))];
  if(!ids.length)return new Map<string,Date>();
  const products=await tx.product.findMany({where:{id:{in:ids}},select:{id:true,updatedAt:true}}) as Array<{id:string;updatedAt:Date}>;
  return new Map(products.map(product=>[product.id,product.updatedAt]));
}

async function nextVisibleNumber(tx:any){
  const ymd=new Date().toISOString().slice(0,10).replaceAll('-','');
  const prefix=`TGS-${ymd}-`;
  const count=await tx.quoteFamily.count({where:{visibleNumber:{startsWith:prefix}}});
  return formatVisibleNumber(ymd,count+1);
}

export const quoteInclude={
  customer:true,
  request:true,
  branch:{select:{id:true,name:true}},
  collections:{include:{collection:true},orderBy:{sortOrder:'asc' as const}},
  versions:{
    include:{
      items:{orderBy:{position:'asc' as const}},
      pdfs:{orderBy:{createdAt:'desc' as const}},
      creator:{select:{id:true,username:true,displayName:true}},
    },
    orderBy:{version:'desc' as const},
  },
};

export function activeBundle(family:any){
  const version=family.versions.find((item:any)=>item.version===family.activeVersion)??family.versions[0]??null;
  return jsonSafe({
    ...family,
    version,
    items:version?.items??[],
    versions:family.versions,
  });
}

export async function loadFamily(tx:any,id:string){
  const family=await tx.quoteFamily.findUnique({
    where:{id},
    include:{
      customer:true,
      versions:{
        include:{
          items:{orderBy:{position:'asc'}},
          pdfs:{orderBy:{createdAt:'desc'}},
          creator:{select:{id:true,username:true,displayName:true}},
        },
        orderBy:{version:'desc'},
      },
    },
  });
  if(!family)throw new NotFoundException('Presupuesto inexistente');
  return family;
}

export function activeVersion(family:any){
  const version=family.versions.find((item:any)=>item.version===family.activeVersion)??family.versions[0];
  if(!version)throw new NotFoundException('Versión activa inexistente');
  return version;
}

/**
 * Transición de estado reutilizable (usada por `POST :id/state`, la resolución de intentos de
 * envío y la aplicación explícita de estado desde una respuesta del cliente). Reemplaza cualquier
 * versión previamente ENVIADO de la misma familia cuando el nuevo estado es ENVIADO.
 */
export async function transitionVersionState(
  tx:any,
  family:any,
  version:any,
  actor:RequestUser,
  state:QuoteState,
  opts:{reason?:string|null;sentMessage?:string|null;sentAt?:Date}={},
){
  const previousState=version.state;
  const now=new Date();
  const replaced:any[]=[];

  if(state==='ENVIADO'){
    const previousSent=await tx.quoteVersion.findMany({
      where:{familyId:family.id,state:'ENVIADO',id:{not:version.id}},
    });
    for(const prior of previousSent){
      const nextPrior=await tx.quoteVersion.update({where:{id:prior.id},data:{state:'REEMPLAZADO'}});
      replaced.push(nextPrior);
      await statusEvent(tx,{
        type:'REEMPLAZO',
        familyId:family.id,
        versionId:prior.id,
        userId:actor.id,
        previous:{state:prior.state},
        next:{state:'REEMPLAZADO'},
        metadata:{replacedBy:version.id},
      });
      await audit(tx,actor.id,'QuoteVersion',prior.id,'STATE',prior,nextPrior);
    }
  }

  const nextVersion=await tx.quoteVersion.update({where:{id:version.id},data:{
    state,
    reason:opts.reason===undefined?version.reason:opts.reason,
    sentMessage:opts.sentMessage===undefined?version.sentMessage:opts.sentMessage,
    ...(state==='ENVIADO'?{sentAt:opts.sentAt??now,lastActivityAt:now}:{lastActivityAt:now}),
  }});

  await statusEvent(tx,{
    type:eventTypeForState(state),
    familyId:family.id,
    versionId:version.id,
    requestId:family.requestId,
    customerId:family.customerId,
    userId:actor.id,
    previous:{state:previousState},
    next:{state},
    metadata:{reason:opts.reason??null},
  });
  await audit(tx,actor.id,'QuoteVersion',version.id,'STATE',version,nextVersion,{replaced:replaced.map(item=>item.id)});
  return {nextVersion,replaced};
}

export async function associateConversationQuote(
  tx:any,chatKey:string,familyId:string|null,versionNumber:number|null,actor:RequestUser,
){
  const current=await tx.chatbotConversation.findUnique({where:{chatKey}});
  const changed=current?.lastQuoteFamilyId!==familyId
    ||(familyId!==null&&current?.lastQuoteVersion!==(versionNumber??null));
  if(changed&&current?.lastQuoteFamilyId){
    const previousFamily=await loadFamily(tx,current.lastQuoteFamilyId).catch(()=>null);
    const previousVersion=previousFamily
      ?previousFamily.versions.find((item:any)=>item.version===(current.lastQuoteVersion??previousFamily.activeVersion))
        ??previousFamily.versions.find((item:any)=>item.version===previousFamily.activeVersion)
      :null;
    if(previousFamily&&previousVersion?.state==='ACEPTADO'){
      await transitionVersionState(tx,previousFamily,previousVersion,actor,'ENVIADO',{reason:'Dejó de ser el presupuesto vigente del chat.'});
    }
  }
  return tx.chatbotConversation.upsert({
    where:{chatKey},
    create:{chatKey,lastQuoteFamilyId:familyId,lastQuoteVersion:versionNumber},
    update:{lastQuoteFamilyId:familyId,lastQuoteVersion:versionNumber},
  });
}

@Controller('quotes')
export class QuotesController{
  @Get('sent/latest')
  async latestSent(@Query('phone') phone:string){
    const normalized=normalizePhone(phone??'');
    if(!normalized)return null;
    const deliveries=await db.quoteDelivery.findMany({
      where:{chatPhone:{not:null}},
      include:{version:{include:{family:{include:{customer:true}}}}},
      orderBy:{deliveredAt:'desc'},
      take:100,
    });
    const delivery=deliveries.find((item:any)=>normalizePhone(item.chatPhone??'')===normalized);
    if(!delivery)return null;
    return jsonSafe({
      delivery,
      quote:activeBundle({...delivery.version.family,versions:[delivery.version]}),
    });
  }

  @Get()
  async list(){
    const rows=await db.quoteFamily.findMany({
      include:quoteInclude,
      orderBy:[{updatedAt:'desc'},{id:'asc'}],
    });
    return rows.map(activeBundle);
  }

  @Get(':id')
  async get(@Param('id',new ZodPipe(idSchema)) id:string){
    const family=await db.quoteFamily.findUnique({where:{id},include:quoteInclude});
    if(!family)throw new NotFoundException('Presupuesto inexistente');
    return activeBundle(family);
  }

  @Get(':id/versions/:version')
  async getVersion(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Param('version') versionParam:string,
  ){
    const version=Number(versionParam);
    if(!Number.isInteger(version)||version<1)throw new BadRequestException('Versión inválida');
    const row=await db.quoteVersion.findFirst({
      where:{familyId:id,version},
      include:{items:{orderBy:{position:'asc'}},pdfs:true,creator:{select:{id:true,username:true,displayName:true}}},
    });
    if(!row)throw new NotFoundException('Versión inexistente');
    return jsonSafe(row);
  }

  @Delete(':id')
  async removeQuote(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const family=await tx.quoteFamily.findUnique({
        where:{id},
        include:{versions:{select:{id:true,version:true,state:true}}},
      });
      if(!family)throw new NotFoundException('Presupuesto inexistente');
      await audit(tx,actor.id,'QuoteFamily',id,'DELETE',family,null);
      await tx.quoteFamily.delete({where:{id}});
      return {ok:true};
    });
  }

  @Post()
  async create(
    @Body(new ZodPipe(quoteCreateSchema)) body:QuoteCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    try{
      return await db.$transaction(async tx=>{
        const visibleNumber=await nextVisibleNumber(tx);
        const masters=await masterPrices(tx,body.items);
        const itemRows=buildItemRows(body.items,masters);
        const totalsRow=pricingTotals(itemRows);
        const family=await tx.quoteFamily.create({data:{
          visibleNumber,
          internalName:body.internalName,
          requestId:body.requestId??null,
          customerId:body.customerId??null,
          isBuiltPc:body.isBuiltPc??false,
          activeVersion:1,
          branchId:actor.branchId??null,
        }});
        const version=await tx.quoteVersion.create({data:{
          familyId:family.id,
          version:1,
          state:'BORRADOR',
          creatorId:actor.id,
          totalCostCents:totalsRow.costCents,
          totalSaleCents:totalsRow.saleCents,
          profitCents:totalsRow.profitCents,
          effectiveMarkupBps:totalsRow.effectiveMarkupBps,
          publicObservation:body.publicObservation??null,
          pdfOverrides:(body.pdfOverrides??{}) as Prisma.InputJsonValue,
          resolvedPdfConfig:(body.resolvedPdfConfig??{}) as Prisma.InputJsonValue,
          financingSnapshot:body.financingSnapshot===undefined
            ?undefined
            :body.financingSnapshot===null
              ?Prisma.JsonNull
              :body.financingSnapshot as Prisma.InputJsonValue,
        }});
        await tx.quoteItem.createMany({data:itemRows.map(item=>({...item,versionId:version.id}))});
        await touchProductsLastUsed(tx,itemRows.map((item)=>item.productId));
        const items=await tx.quoteItem.findMany({where:{versionId:version.id},orderBy:{position:'asc'}});
        if(body.collectionIds?.length){
          await syncFamilyCollections(tx,family.id,body.collectionIds);
        }
        if(family.requestId){
          await markRequestListaIfPreparing(tx,family.requestId,actor.id);
          const conversations=await tx.chatbotConversation.findMany({where:{activeRequestId:family.requestId},select:{chatKey:true}});
          for(const conversation of conversations)await associateConversationQuote(tx,conversation.chatKey,family.id,version.version,actor);
        }
        await statusEvent(tx,{
          type:'PRESUPUESTO_CREADO',
          familyId:family.id,
          versionId:version.id,
          requestId:family.requestId,
          customerId:family.customerId,
          userId:actor.id,
          next:{family,version},
          metadata:body.collectionIds?.length?{collectionIds:body.collectionIds}:undefined,
        });
        await audit(tx,actor.id,'QuoteFamily',family.id,'CREATE',null,{family,version,items,collectionIds:body.collectionIds??[]});
        const loaded=await tx.quoteFamily.findUnique({where:{id:family.id},include:quoteInclude});
        return activeBundle(loaded);
      });
    }catch(error){
      pricingError(error);
    }
  }

  @Post(':id/duplicate')
  async duplicate(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    try{
      return await db.$transaction(async tx=>{
        const sourceFamily=await loadFamily(tx,id);
        const sourceVersion=activeVersion(sourceFamily);
        const visibleNumber=await nextVisibleNumber(tx);
        const itemRows=sourceVersion.items.map((item:any)=>copyItemSnapshot(item));
        const totalsRow=pricingTotals(itemRows);
        const family=await tx.quoteFamily.create({data:{
          visibleNumber,
          internalName:`${sourceFamily.internalName} (copia)`,
          requestId:null,
          customerId:sourceFamily.customerId,
          isBuiltPc:sourceFamily.isBuiltPc,
          activeVersion:1,
        }});
        const version=await tx.quoteVersion.create({data:{
          familyId:family.id,
          version:1,
          state:'BORRADOR',
          creatorId:actor.id,
          totalCostCents:totalsRow.costCents,
          totalSaleCents:totalsRow.saleCents,
          profitCents:totalsRow.profitCents,
          effectiveMarkupBps:totalsRow.effectiveMarkupBps,
          publicObservation:sourceVersion.publicObservation,
          pdfOverrides:sourceVersion.pdfOverrides,
          resolvedPdfConfig:sourceVersion.resolvedPdfConfig,
          financingSnapshot:sourceVersion.financingSnapshot,
        }});
        await tx.quoteItem.createMany({data:itemRows.map((item:any)=>({...item,versionId:version.id}))});
        await touchProductsLastUsed(tx,itemRows.map((item:any)=>item.productId));
        const items=await tx.quoteItem.findMany({where:{versionId:version.id},orderBy:{position:'asc'}});
        await statusEvent(tx,{
          type:'PRESUPUESTO_CREADO',
          familyId:family.id,
          versionId:version.id,
          customerId:family.customerId,
          userId:actor.id,
          next:{family,version},
          metadata:{duplicatedFrom:id},
        });
        await audit(tx,actor.id,'QuoteFamily',family.id,'CREATE',null,{family,version,items},{duplicatedFrom:id});
        const loaded=await tx.quoteFamily.findUnique({where:{id:family.id},include:quoteInclude});
        return activeBundle(loaded);
      });
    }catch(error){
      if(error instanceof NotFoundException)throw error;
      pricingError(error);
    }
  }

  @Put(':id')
  async update(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quoteUpdateSchema)) body:QuoteUpdateInput,
    @CurrentUser() actor:RequestUser,
  ){
    try{
      return await db.$transaction(async tx=>{
        const family=await loadFamily(tx,id);
        const version=activeVersion(family);
        const familyData:{
          internalName?:string;
          requestId?:string|null;
          customerId?:string|null;
          isBuiltPc?:boolean;
        }={};
        if(body.internalName!==undefined)familyData.internalName=body.internalName;
        if(body.requestId!==undefined)familyData.requestId=body.requestId;
        if(body.customerId!==undefined)familyData.customerId=body.customerId;
        if(body.isBuiltPc!==undefined)familyData.isBuiltPc=body.isBuiltPc;
        const nextFamily=Object.keys(familyData).length
          ?await tx.quoteFamily.update({where:{id},data:familyData})
          :family;

        let nextVersion=version;
        let items=version.items;
        const changesContent=body.items!==undefined||
          body.publicObservation!==undefined||
          body.pdfOverrides!==undefined||
          body.resolvedPdfConfig!==undefined||
          body.financingSnapshot!==undefined;
        const itemRows=changesContent
          ?(body.items
            ?buildItemRows(body.items,await masterPrices(tx,body.items))
            :version.items.map((item:any)=>copyItemSnapshot(item)))
          :[];
        // Solo versiona si el contenido REALMENTE cambió (una edición manual: componente, cantidad,
        // línea, observación o precio de venta). Un guardado que reenvía los mismos ítems —p. ej. el
        // auto-guardado antes de generar el PDF— no crea versión nueva. La comparación es por
        // contenido (multiset ordenado), no por posición: reordenar ítems sin cambiarlos no debe
        // disparar una versión nueva.
        const itemSignature=(row:any)=>[
          String(row.productId??''),
          String(row.frozenName),
          String(row.quantity),
          String(row.frozenSalePriceCents),
          String(row.lineId??''),
          String(row.observation??''),
        ].join(' ');
        const itemsChanged=body.items!==undefined&&(
          itemRows.length!==version.items.length||
          (()=>{
            const next=itemRows.map(itemSignature).sort();
            const prev=version.items.map(itemSignature).sort();
            return next.some((sig:string,index:number)=>sig!==prev[index]);
          })()
        );
        const jsonEq=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
        const actuallyChanged=itemsChanged
          ||(body.publicObservation!==undefined&&(body.publicObservation??null)!==(version.publicObservation??null))
          ||(body.pdfOverrides!==undefined&&!jsonEq(body.pdfOverrides,version.pdfOverrides))
          ||(body.resolvedPdfConfig!==undefined&&!jsonEq(body.resolvedPdfConfig,version.resolvedPdfConfig))
          ||(body.financingSnapshot!==undefined&&!jsonEq(body.financingSnapshot,version.financingSnapshot));
        if(actuallyChanged){
          const totalsRow=pricingTotals(itemRows);
          const nextNumber=Math.max(...family.versions.map((item:any)=>item.version))+1;
          nextVersion=await tx.quoteVersion.create({data:{
            familyId:id,
            version:nextNumber,
            state:'BORRADOR',
            creatorId:actor.id,
            reason:body.reason,
            totalCostCents:totalsRow.costCents,
            totalSaleCents:totalsRow.saleCents,
            profitCents:totalsRow.profitCents,
            effectiveMarkupBps:totalsRow.effectiveMarkupBps,
            publicObservation:body.publicObservation===undefined?version.publicObservation:body.publicObservation,
            pdfOverrides:body.pdfOverrides!==undefined?jsonField(body.pdfOverrides):version.pdfOverrides,
            resolvedPdfConfig:body.resolvedPdfConfig!==undefined?jsonField(body.resolvedPdfConfig):version.resolvedPdfConfig,
            financingSnapshot:body.financingSnapshot!==undefined?jsonField(body.financingSnapshot):version.financingSnapshot,
          }});
          await tx.quoteItem.createMany({data:itemRows.map((item:any)=>({...item,versionId:nextVersion.id}))});
          await touchProductsLastUsed(tx,itemRows.map((item:any)=>item.productId));
          items=await tx.quoteItem.findMany({where:{versionId:nextVersion.id},orderBy:{position:'asc'}});
          await tx.quoteFamily.update({where:{id},data:{activeVersion:nextNumber}});
          await statusEvent(tx,{
            type:'VERSION_CREADA',
            familyId:id,
            versionId:nextVersion.id,
            requestId:nextFamily.requestId,
            customerId:nextFamily.customerId,
            userId:actor.id,
            previous:{version:version.version,state:version.state},
            next:{version:nextNumber,state:'BORRADOR'},
            metadata:{reason:body.reason??null,source:'guardado'},
          });
        }

        await audit(tx,actor.id,'QuoteFamily',id,'UPDATE',{family,version},{family:nextFamily,version:nextVersion,items});
        if(body.collectionIds!==undefined){
          await syncFamilyCollections(tx,id,body.collectionIds);
          await statusEvent(tx,{
            type:'COLECCION_MODIFICADA',
            familyId:id,
            versionId:nextVersion.id,
            userId:actor.id,
            metadata:{collectionIds:body.collectionIds},
          });
        }
        const linkedRequestId=
          body.requestId!==undefined?body.requestId:nextFamily.requestId;
        if(linkedRequestId){
          await markRequestListaIfPreparing(tx,linkedRequestId,actor.id);
        }
        const loaded=await tx.quoteFamily.findUnique({where:{id},include:quoteInclude});
        return activeBundle(loaded);
      });
    }catch(error){
      if(error instanceof BadRequestException||error instanceof NotFoundException)throw error;
      pricingError(error);
    }
  }

  /**
   * Asigna el presupuesto a colecciones existentes. Independiente del estado de la versión
   * (la membresía vive en la familia).
   */
  @Put(':id/collections')
  async setCollections(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quoteCollectionsSchema)) body:QuoteCollectionsInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const family=await tx.quoteFamily.findUnique({where:{id}});
      if(!family)throw new NotFoundException('Presupuesto inexistente');
      const previous=await tx.collectionQuote.findMany({where:{familyId:id},select:{collectionId:true}});
      await syncFamilyCollections(tx,id,body.collectionIds);
      await statusEvent(tx,{
        type:'COLECCION_MODIFICADA',
        familyId:id,
        userId:actor.id,
        previous:{collectionIds:previous.map((row:any)=>row.collectionId)},
        next:{collectionIds:body.collectionIds},
      });
      await audit(tx,actor.id,'QuoteFamily',id,'COLLECTIONS',previous,body.collectionIds);
      const memberships=await tx.collectionQuote.findMany({
        where:{familyId:id},
        include:{collection:true},
        orderBy:{sortOrder:'asc'},
      });
      return jsonSafe({familyId:id,collections:memberships.map((m:any)=>m.collection),collectionIds:body.collectionIds});
    });
  }

  @Post(':id/version')
  async createVersion(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quoteVersionCreateSchema)) body:QuoteVersionCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    try{
      return await db.$transaction(async tx=>{
        const family=await loadFamily(tx,id);
        const current=activeVersion(family);
        const source=body.sourceVersion===undefined
          ?current
          :family.versions.find((item:any)=>item.version===body.sourceVersion);
        if(!source)throw new NotFoundException(`La versión ${body.sourceVersion} no existe`);
        const sourceItems=body.items
          ?buildItemRows(body.items,await masterPrices(tx,body.items))
          :source.items.map((item:any)=>copyItemSnapshot(item));
        const totalsRow=pricingTotals(sourceItems);
        const nextNumber=Math.max(...family.versions.map((item:any)=>item.version))+1;
        const reason=body.reason===undefined&&body.sourceVersion!==undefined
          ?`Restaurada desde V${body.sourceVersion}`
          :body.reason;
        const version=await tx.quoteVersion.create({data:{
          familyId:id,
          version:nextNumber,
          state:'BORRADOR',
          creatorId:actor.id,
          reason,
          totalCostCents:totalsRow.costCents,
          totalSaleCents:totalsRow.saleCents,
          profitCents:totalsRow.profitCents,
          effectiveMarkupBps:totalsRow.effectiveMarkupBps,
          publicObservation:body.publicObservation===undefined?source.publicObservation:body.publicObservation,
          pdfOverrides:body.pdfOverrides!==undefined?jsonField(body.pdfOverrides):source.pdfOverrides,
          resolvedPdfConfig:body.resolvedPdfConfig!==undefined?jsonField(body.resolvedPdfConfig):source.resolvedPdfConfig,
          financingSnapshot:body.financingSnapshot!==undefined?jsonField(body.financingSnapshot):source.financingSnapshot,
        }});
        await tx.quoteItem.createMany({data:sourceItems.map((item:any)=>({...item,versionId:version.id}))});
        await touchProductsLastUsed(tx,sourceItems.map((item:any)=>item.productId));
        const items=await tx.quoteItem.findMany({where:{versionId:version.id},orderBy:{position:'asc'}});
        const nextFamily=await tx.quoteFamily.update({where:{id},data:{activeVersion:nextNumber}});
        await statusEvent(tx,{
          type:'VERSION_CREADA',
          familyId:id,
          versionId:version.id,
          requestId:nextFamily.requestId,
          customerId:nextFamily.customerId,
          userId:actor.id,
          previous:{version:current.version,state:current.state},
          next:{version:nextNumber,state:'BORRADOR'},
          metadata:{reason,sourceVersion:body.sourceVersion??current.version},
        });
        await audit(tx,actor.id,'QuoteVersion',version.id,body.sourceVersion===undefined?'CREATE':'RESTORE',source,version,{reason,sourceVersion:body.sourceVersion});
        const loaded=await tx.quoteFamily.findUnique({where:{id},include:quoteInclude});
        return activeBundle(loaded);
      });
    }catch(error){
      if(error instanceof BadRequestException||error instanceof NotFoundException)throw error;
      pricingError(error);
    }
  }

  /**
   * Restaura una versión anterior como la versión ACTIVA de la familia. A diferencia de
   * `POST :id/version` (que copia el contenido en una fila NUEVA para poder editarlo), esto es
   * un restaurado real: no crea ninguna versión ni ítem nuevo, solo mueve `activeVersion` para
   * que la familia vuelva a apuntar a esa versión ya existente. El contenido de esa versión no
   * cambia (sigue siendo la misma fila inmutable de siempre).
   */
  @Post(':id/version/:version/restore')
  async restoreVersion(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Param('version') versionParam:string,
    @CurrentUser() actor:RequestUser,
  ){
    const versionNumber=Number(versionParam);
    if(!Number.isInteger(versionNumber)||versionNumber<1)throw new BadRequestException('Versión inválida');
    return db.$transaction(async tx=>{
      const family=await loadFamily(tx,id);
      const target=family.versions.find((item:any)=>item.version===versionNumber);
      if(!target)throw new NotFoundException('Versión inexistente');
      if(family.activeVersion===versionNumber)throw new BadRequestException('Esa versión ya es la activa');
      const previous=activeVersion(family);
      const nextFamily=await tx.quoteFamily.update({where:{id},data:{activeVersion:versionNumber}});
      await statusEvent(tx,{
        type:'VERSION_RESTAURADA',
        familyId:id,
        versionId:target.id,
        requestId:nextFamily.requestId,
        customerId:nextFamily.customerId,
        userId:actor.id,
        previous:{version:previous.version,state:previous.state},
        next:{version:versionNumber,state:target.state},
      });
      await audit(tx,actor.id,'QuoteFamily',id,'RESTORE',{activeVersion:previous.version},{activeVersion:versionNumber});
      const loaded=await tx.quoteFamily.findUnique({where:{id},include:quoteInclude});
      return activeBundle(loaded);
    });
  }

  /**
   * Borra una versión BORRADOR que quedó como basura (p. ej. de cuando el versionado creaba una
   * fila por cada guardado silencioso). Solo se permite borrar versiones en BORRADOR que no sean
   * la versión activa de la familia, para no dejar el presupuesto sin una versión vigente.
   */
  @Delete(':id/version/:version')
  async deleteVersion(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Param('version') versionParam:string,
    @CurrentUser() actor:RequestUser,
  ){
    const versionNumber=Number(versionParam);
    if(!Number.isInteger(versionNumber)||versionNumber<1)throw new BadRequestException('Versión inválida');
    return db.$transaction(async tx=>{
      const family=await tx.quoteFamily.findUnique({where:{id}});
      if(!family)throw new NotFoundException('Presupuesto inexistente');
      const version=await tx.quoteVersion.findUnique({where:{familyId_version:{familyId:id,version:versionNumber}}});
      if(!version)throw new NotFoundException('Versión inexistente');
      if(version.state!=='BORRADOR')throw new BadRequestException('Solo se pueden borrar versiones en borrador');
      if(family.activeVersion===versionNumber)throw new BadRequestException('No se puede borrar la versión activa');
      await audit(tx,actor.id,'QuoteVersion',version.id,'DELETE',version,null);
      await tx.quoteVersion.delete({where:{id:version.id}});
      return {ok:true};
    });
  }

  @Post(':id/retarget')
  async retarget(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quoteRetargetSchema)) body:QuoteRetargetInput,
    @CurrentUser() actor:RequestUser,
  ){
    try{
      return await db.$transaction(async tx=>{
        const family=await loadFamily(tx,id);
        const version=activeVersion(family);
        if(!version.items.length)throw new BadRequestException('El presupuesto no tiene ítems para ajustar');
        const result=retargetPricing(
          version.items.map((item:any)=>({
            id:item.id,
            costCents:item.frozenCostCents,
            salePriceCents:item.frozenSalePriceCents,
            markupBps:item.frozenMarkupBps,
            quantity:item.quantity,
            position:item.position,
          })),
          BigInt(body.targetTotalCents),
        );
        if(body.previewOnly)return jsonSafe({family,version,items:result.items,preview:result.preview});
        const adjustedById=new Map(result.items.map(item=>[item.id,item]));
        // Ajustar el total es una actualización EN EL LUGAR: no crea versión nueva (sin importar el estado).
        for(const item of version.items as any[]){
          const adjusted=adjustedById.get(item.id);
          if(!adjusted)continue;
          await tx.quoteItem.update({where:{id:item.id},data:{
            frozenMarkupBps:adjusted.markupBps,
            frozenSalePriceCents:adjusted.salePriceCents,
            subtotalCents:adjusted.subtotalCents,
          }});
        }
        const nextVersion=await tx.quoteVersion.update({where:{id:version.id},data:{
          totalCostCents:result.preview.costCents,
          totalSaleCents:result.preview.saleCents,
          profitCents:result.preview.profitCents,
          effectiveMarkupBps:result.preview.effectiveMarkupBps,
          lastActivityAt:new Date(),
        }});
        await statusEvent(tx,{
          type:'TOTAL_AJUSTADO',
          familyId:id,
          versionId:version.id,
          userId:actor.id,
          previous:{totalSaleCents:version.totalSaleCents},
          next:{totalSaleCents:nextVersion.totalSaleCents,targetTotalCents:body.targetTotalCents},
        });
        await audit(tx,actor.id,'QuoteVersion',version.id,'RETARGET',version,nextVersion,{targetTotalCents:body.targetTotalCents});
        const loaded=await tx.quoteFamily.findUnique({where:{id},include:quoteInclude});
        return activeBundle(loaded);
      });
    }catch(error){
      if(error instanceof BadRequestException||error instanceof NotFoundException)throw error;
      pricingError(error);
    }
  }

  @Post(':id/state')
  async changeState(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quoteStateSchema)) body:QuoteStateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const family=await loadFamily(tx,id);
      const version=activeVersion(family);
      const {nextVersion,replaced}=await transitionVersionState(tx,family,version,actor,body.state,{
        reason:body.reason,
        sentMessage:body.sentMessage,
      });
      return jsonSafe({family,version:nextVersion,replaced});
    });
  }

  @Get(':id/timeline')
  async timeline(@Param('id',new ZodPipe(idSchema)) id:string){
    const family=await db.quoteFamily.findUnique({where:{id}});
    if(!family)throw new NotFoundException('Presupuesto inexistente');
    const [events,attempts,deliveries,pdfs,versions]=await Promise.all([
      db.quoteStatusEvent.findMany({where:{familyId:id},include:{user:{select:{id:true,displayName:true,username:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}]}),
      db.quoteSendAttempt.findMany({where:{version:{familyId:id}},orderBy:[{createdAt:'asc'},{id:'asc'}]}),
      db.quoteDelivery.findMany({where:{version:{familyId:id}},orderBy:[{deliveredAt:'asc'},{id:'asc'}]}),
      db.quotePdf.findMany({
        where:{version:{familyId:id}},
        include:{version:{select:{id:true,version:true,state:true}}},
        orderBy:[{createdAt:'desc'},{id:'asc'}],
      }),
      db.quoteVersion.findMany({where:{familyId:id},include:{items:{orderBy:{position:'asc'}}},orderBy:{version:'asc'}}),
    ]);
    const money=(value:unknown)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(BigInt(String(value??0)))/100);
    const descriptions=new Map<string,string[]>();
    for(let index=1;index<versions.length;index+=1){
      const previous=versions[index-1] as any;
      const next=versions[index] as any;
      const before=new Map(previous.items.map((item:any)=>[item.productId||item.frozenName,item]));
      const after=new Map(next.items.map((item:any)=>[item.productId||item.frozenName,item]));
      const changes:string[]=[];
      for(const [key,item] of after){
        const old=before.get(key) as any;
        if(!old)changes.push(`Agregado: ${(item as any).frozenName} (x${(item as any).quantity})`);
        else{
          if(old.quantity!==(item as any).quantity)changes.push(`Cantidad de ${(item as any).frozenName}: ${old.quantity} → ${(item as any).quantity}`);
          if(String(old.frozenSalePriceCents)!==String((item as any).frozenSalePriceCents))changes.push(`Precio de ${(item as any).frozenName}: ${money(old.frozenSalePriceCents)} → ${money((item as any).frozenSalePriceCents)}`);
        }
      }
      for(const [key,item] of before)if(!after.has(key))changes.push(`Quitado: ${(item as any).frozenName}`);
      descriptions.set(next.id,changes);
    }
    // El diff de ítems es a nivel VERSIÓN: se adjunta a un solo evento por versión (no a cada uno,
    // que hacía que el mismo cambio se repitiera). Cada evento muestra su propia acción; los cambios
    // de la versión van como sub-líneas una sola vez. Además se colapsan duplicados exactos.
    const seenVersionDiff=new Set<string>();
    const enriched:any[]=[];
    for(const event of events as any[]){
      const prev=enriched[enriched.length-1];
      if(prev&&prev.type===event.type&&prev.versionId===event.versionId
         &&(prev.userId??null)===(event.userId??null)
         &&Math.abs(new Date(prev.createdAt).getTime()-new Date(event.createdAt).getTime())<1000){
        continue;
      }
      const diff=descriptions.get(event.versionId)??[];
      const carry=diff.length>0&&Boolean(event.versionId)&&!seenVersionDiff.has(event.versionId);
      if(carry)seenVersionDiff.add(event.versionId);
      let label=humanEventLabel(event.type);
      if(event.type==='PDF_GENERADO'){
        const kind=(event.next as any)?.kind;
        if(kind)label=`PDF generado (${kind==='SIMPLE'?'Simple':'Detallado'})`;
      }
      enriched.push({
        ...event,
        versionNumber:versions.find((version:any)=>version.id===event.versionId)?.version??null,
        descriptions:carry?diff:[],
        description:label,
        creator:event.user??null,
      });
    }
    return jsonSafe({family,events:enriched,attempts,deliveries,pdfs});
  }

  /**
   * Sincroniza ítem(s) desde el catálogo maestro (README §15: "actualizar solamente este ítem" /
   * "actualizar todos los ítems"). `updateMaster` (default true) controla si además se refresca el
   * "sello" de sincronización del ítem (masterPriceAt/masterCostCents/masterSaleCents); en false solo
   * se actualizan los valores congelados sin marcar el ítem como al día. Solo aplica sobre BORRADOR
   * (versiones enviadas son inmutables: README §15 exige crear una versión nueva antes de resincronizar).
   * Emite PRECIOS_ACTUALIZADOS siempre y, por cada ítem cuyo costo congelado cambió, además COSTO_AJUSTADO.
   */
  @Post(':id/prices')
  async updatePrices(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quotePricesUpdateSchema)) body:QuotePricesUpdateInput,
    @CurrentUser() actor:RequestUser,
  ){
    try{
      return await db.$transaction(async tx=>{
        const family=await loadFamily(tx,id);
        let version=activeVersion(family);
        const requestedSourceItem=body.itemId
          ?version.items.find((item:any)=>item.id===body.itemId)
          :null;
        if(body.mode==='one'&&!requestedSourceItem){
          throw new BadRequestException('El ítem indicado no pertenece a esta versión');
        }
        // Sincronizar precios con el catálogo es una actualización EN EL LUGAR: no crea versión nueva
        // (sin importar el estado). Solo la edición manual de componentes/precios crea versión.
        const targets=body.mode==='one'
          ?version.items.filter((item:any)=>item.id===requestedSourceItem?.id)
          :version.items;
        if(body.mode==='one'&&targets.length===0){
          throw new BadRequestException('El ítem indicado no pertenece a esta versión');
        }
        const withMaster=targets.filter((item:any)=>item.productId);
        if(body.mode==='one'&&withMaster.length===0){
          throw new BadRequestException('El ítem no está vinculado a un producto del catálogo');
        }
        const productIds:string[]=Array.from(new Set<string>(withMaster.map((item:any):string=>item.productId)));
        const products=productIds.length
          ?await tx.product.findMany({where:{id:{in:productIds}}})
          :[];
        const productById=new Map(products.map((product:any)=>[product.id,product]));
        const costEvents:Array<{itemId:string;previous:bigint;next:bigint}>=[];
        for(const item of withMaster){
          const product=productById.get(item.productId) as any;
          if(!product)continue;
          const previousCost=item.frozenCostCents;
          await tx.quoteItem.update({where:{id:item.id},data:{
            frozenCostCents:product.costCents,
            frozenMarkupBps:product.markupBps,
            frozenSalePriceCents:product.salePriceCents,
            subtotalCents:product.salePriceCents*BigInt(item.quantity),
            ...(body.updateMaster?{
              masterPriceAt:product.updatedAt,
              masterCostCents:product.costCents,
              masterSaleCents:product.salePriceCents,
            }:{}),
          }});
          if(previousCost!==product.costCents){
            costEvents.push({itemId:item.id,previous:previousCost,next:product.costCents});
          }
        }
        const items=await tx.quoteItem.findMany({where:{versionId:version.id},orderBy:{position:'asc'}});
        const totalsRow=pricingTotals(items as any);
        const nextVersion=await tx.quoteVersion.update({where:{id:version.id},data:{
          totalCostCents:totalsRow.costCents,
          totalSaleCents:totalsRow.saleCents,
          profitCents:totalsRow.profitCents,
          effectiveMarkupBps:totalsRow.effectiveMarkupBps,
        }});
        await statusEvent(tx,{
          type:'PRECIOS_ACTUALIZADOS',
          familyId:id,
          versionId:version.id,
          userId:actor.id,
          metadata:{mode:body.mode,itemId:body.itemId??null,updateMaster:body.updateMaster,reason:body.reason??null,updated:withMaster.map((item:any)=>item.id)},
        });
        for(const change of costEvents){
          await statusEvent(tx,{
            type:'COSTO_AJUSTADO',
            familyId:id,
            versionId:version.id,
            userId:actor.id,
            previous:{costCents:change.previous.toString()},
            next:{costCents:change.next.toString()},
            metadata:{itemId:change.itemId},
          });
        }
        await audit(tx,actor.id,'QuoteVersion',version.id,'PRICES_UPDATE',version,nextVersion,{mode:body.mode,itemId:body.itemId??null});
        return jsonSafe({family,version:nextVersion,items});
      });
    }catch(error){
      if(error instanceof BadRequestException||error instanceof NotFoundException)throw error;
      pricingError(error);
    }
  }

  /**
   * Reactiva un presupuesto NO_CONCRETADO o RECHAZADO (README §34: "permitir reactivación").
   * Nunca muta la versión histórica: solo la marca con `reactivatedAt` y crea una nueva versión
   * BORRADOR (copiando los ítems congelados) para que pueda volver a editarse y enviarse.
   */
  @Post(':id/reactivate')
  async reactivate(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quoteReactivateSchema)) body:QuoteReactivateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const family=await loadFamily(tx,id);
      const current=activeVersion(family);
      if(current.state!=='NO_CONCRETADO'&&current.state!=='RECHAZADO'){
        throw new BadRequestException('Solo se puede reactivar un presupuesto NO_CONCRETADO o RECHAZADO');
      }
      const reactivated=await tx.quoteVersion.update({where:{id:current.id},data:{reactivatedAt:new Date()}});
      const sourceItems=current.items.map((item:any)=>({
        productId:item.productId,
        frozenName:item.frozenName,
        lineId:item.lineId,
        quantity:item.quantity,
        frozenCostCents:item.frozenCostCents,
        frozenMarkupBps:item.frozenMarkupBps,
        frozenSalePriceCents:item.frozenSalePriceCents,
        subtotalCents:item.subtotalCents,
        position:item.position,
        observation:item.observation,
        masterPriceAt:item.masterPriceAt,
        masterCostCents:item.masterCostCents,
        masterSaleCents:item.masterSaleCents,
        isPcMainLine:item.isPcMainLine,
      }));
      const totalsRow=pricingTotals(sourceItems);
      const nextNumber=current.version+1;
      const version=await tx.quoteVersion.create({data:{
        familyId:id,
        version:nextNumber,
        state:'BORRADOR',
        creatorId:actor.id,
        reason:body.reason,
        totalCostCents:totalsRow.costCents,
        totalSaleCents:totalsRow.saleCents,
        profitCents:totalsRow.profitCents,
        effectiveMarkupBps:totalsRow.effectiveMarkupBps,
        publicObservation:current.publicObservation,
        resolvedPdfConfig:current.resolvedPdfConfig,
        financingSnapshot:current.financingSnapshot,
      }});
      await tx.quoteItem.createMany({data:sourceItems.map((item:any)=>({...item,versionId:version.id}))});
      await touchProductsLastUsed(tx,sourceItems.map((item:any)=>item.productId));
      const items=await tx.quoteItem.findMany({where:{versionId:version.id},orderBy:{position:'asc'}});
      const nextFamily=await tx.quoteFamily.update({where:{id},data:{activeVersion:nextNumber,lastActivityAt:new Date()}});
      await statusEvent(tx,{
        type:'REACTIVADO',
        familyId:id,
        versionId:version.id,
        requestId:nextFamily.requestId,
        customerId:nextFamily.customerId,
        userId:actor.id,
        previous:{version:current.version,state:current.state},
        next:{version:nextNumber,state:'BORRADOR'},
        metadata:{reason:body.reason},
      });
      await audit(tx,actor.id,'QuoteVersion',version.id,'REACTIVATE',reactivated,version,{reason:body.reason});
      return jsonSafe({family:nextFamily,version,items});
    });
  }

  /**
   * Registra un intento de envío por WhatsApp (README §29: nunca autoenvía, solo asiste). Se crea
   * sobre la versión activa; el estado default (PENDIENTE) exige una resolución explícita posterior.
   */
  @Post(':id/send-attempts')
  async createSendAttempt(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(sendAttemptCreateSchema)) body:SendAttemptCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const family=await loadFamily(tx,id);
      const version=body.version
        ?family.versions.find((item:any)=>item.version===body.version)
        :activeVersion(family);
      if(!version)throw new NotFoundException('Versión inexistente');
      const attempt=await tx.quoteSendAttempt.create({data:{
        versionId:version.id,
        chatPhone:body.chatPhone??null,
        chatName:body.chatName??null,
        message:body.message,
        pdfKind:body.pdfKind??null,
        pdfName:body.pdfName??null,
        confidence:body.confidence??null,
        detectionLog:body.detectionLog===undefined?undefined:jsonField(body.detectionLog),
        internalNote:body.internalNote??null,
        userId:actor.id,
      }});
      if(body.chatKey){
        await associateConversationQuote(tx,body.chatKey,id,version.version,actor);
      }
      await statusEvent(tx,{
        type:'ENVIO_DETECTADO',
        familyId:id,
        versionId:version.id,
        requestId:family.requestId,
        customerId:family.customerId,
        userId:actor.id,
        next:attempt,
        metadata:{confidence:body.confidence??null},
      });
      await audit(tx,actor.id,'QuoteSendAttempt',attempt.id,'CREATE',null,attempt);
      return jsonSafe(attempt);
    });
  }

  /**
   * Resuelve un intento de envío. Si el estado resuelto es CONFIRMADO_AUTO/CONFIRMADO_MANUAL y
   * `createDelivery` es true (default), crea el `QuoteDelivery` correspondiente y transiciona la
   * versión a ENVIADO (reemplazando cualquier versión previamente ENVIADO de la familia). Un intento
   * resuelto como AMBIGUO genera una notificación para revisión manual (README §29-30).
   */
  @Post(':id/send-attempts/:attemptId/resolve')
  async resolveSendAttempt(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Param('attemptId',new ZodPipe(idSchema)) attemptId:string,
    @Body(new ZodPipe(sendAttemptResolveSchema)) body:SendAttemptResolveInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const family=await loadFamily(tx,id);
      const attempt=await tx.quoteSendAttempt.findUnique({where:{id:attemptId}});
      if(!attempt)throw new NotFoundException('Intento de envío inexistente');
      const version=family.versions.find((item:any)=>item.id===attempt.versionId);
      if(!version)throw new NotFoundException('Intento de envío inexistente');
      const now=new Date();
      const nextAttempt=await tx.quoteSendAttempt.update({where:{id:attemptId},data:{
        status:body.status,
        internalNote:body.internalNote===undefined?attempt.internalNote:body.internalNote,
        confidence:body.confidence===undefined?attempt.confidence:body.confidence,
        resolvedAt:now,
      }});

      let delivery:any=null;
      let nextVersion=version;
      const confirmed=body.status==='CONFIRMADO_AUTO'||body.status==='CONFIRMADO_MANUAL';
      if(confirmed&&body.createDelivery){
        const pdf=attempt.pdfKind
          ?await tx.quotePdf.findUnique({where:{versionId_kind:{versionId:version.id,kind:attempt.pdfKind}}})
          :null;
        delivery=await tx.quoteDelivery.create({data:{
          versionId:version.id,
          attemptId:attempt.id,
          customerId:family.customerId,
          chatPhone:attempt.chatPhone,
          chatName:attempt.chatName,
          message:attempt.message,
          pdfKind:attempt.pdfKind,
          pdfId:pdf?.id??null,
          confirmedBy:body.status,
          deliveredAt:body.deliveredAt??now,
          userId:actor.id,
        }});
        const normalizedChat=normalizePhone(attempt.chatPhone??'');
        if(normalizedChat){
          const earlier=await tx.quoteDelivery.findMany({
            where:{id:{not:delivery.id},chatPhone:{not:null}},
            include:{version:{include:{family:true}}},
            orderBy:{deliveredAt:'desc'},
            take:100,
          });
          const priorDelivery=earlier.find((item:any)=>
            item.version.familyId!==family.id&&
            normalizePhone(item.chatPhone??'')===normalizedChat&&
            item.version.state==='ENVIADO',
          );
          if(priorDelivery){
            const prior=priorDelivery.version;
            const nextPrior=await tx.quoteVersion.update({where:{id:prior.id},data:{state:'REEMPLAZADO',lastActivityAt:now}});
            await statusEvent(tx,{
              type:'REEMPLAZO',familyId:prior.familyId,versionId:prior.id,
              requestId:priorDelivery.version.family.requestId,customerId:priorDelivery.version.family.customerId,
              userId:actor.id,previous:{state:prior.state},next:{state:'REEMPLAZADO'},
              metadata:{replacedByFamilyId:family.id,replacedByVersionId:version.id,chatPhone:attempt.chatPhone},
            });
            await audit(tx,actor.id,'QuoteVersion',prior.id,'STATE',prior,nextPrior,{replacedByFamilyId:family.id});
          }
        }
        const transitioned=await transitionVersionState(tx,family,version,actor,'ENVIADO',{
          sentMessage:attempt.message,
          sentAt:body.deliveredAt??now,
        });
        nextVersion=transitioned.nextVersion;
      }else{
        await statusEvent(tx,{
          type:body.status==='AMBIGUO'?'REVISION_REQUERIDA':'ENVIO_DESCARTADO',
          familyId:id,
          versionId:version.id,
          requestId:family.requestId,
          customerId:family.customerId,
          userId:actor.id,
          previous:{status:attempt.status},
          next:{status:body.status},
        });
        if(body.status==='AMBIGUO'){
          await tx.notification.create({data:{
            userId:actor.id,
            chatPhone:attempt.chatPhone,
            type:'ENVIO_AMBIGUO',
            title:'Envío ambiguo requiere revisión',
            body:`El intento de envío del presupuesto ${family.visibleNumber} quedó ambiguo y necesita confirmación manual.`,
            entityType:'QuoteSendAttempt',
            entityId:attempt.id,
            metadata:{familyId:id,versionId:version.id},
          }});
        }
      }

      await audit(tx,actor.id,'QuoteSendAttempt',attemptId,'RESOLVE',attempt,nextAttempt,{deliveryId:delivery?.id??null});
      return jsonSafe({attempt:nextAttempt,delivery,version:nextVersion});
    });
  }

  /**
   * Registra la respuesta de un cliente (WhatsApp) y su intención. La transición de estado solo
   * ocurre si el operador la pide explícitamente vía `applyState` (README: nunca automático).
   */
  @Post(':id/replies')
  async createReply(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(quoteReplyCreateSchema)) body:QuoteReplyCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const family=await loadFamily(tx,id);
      const version=activeVersion(family);
      const reply=await tx.quoteReply.create({data:{
        versionId:version.id,
        chatPhone:body.chatPhone??null,
        text:body.text,
        intent:body.intent,
        confidence:body.confidence??null,
        source:body.source,
      }});
      await statusEvent(tx,{
        type:'INTENCION_DETECTADA',
        familyId:id,
        versionId:version.id,
        requestId:family.requestId,
        customerId:family.customerId,
        userId:actor.id,
        next:reply,
        metadata:{intent:body.intent,confidence:body.confidence??null},
      });

      let nextVersion=version;
      let appliedReply=reply;
      if(body.applyState){
        const {nextVersion:transitionedVersion}=await transitionVersionState(tx,family,version,actor,body.applyState,{
          reason:`Respuesta del cliente: ${body.intent}`,
        });
        nextVersion=transitionedVersion;
        appliedReply=await tx.quoteReply.update({where:{id:reply.id},data:{appliedState:body.applyState,appliedAt:new Date()}});
      }

      await audit(tx,actor.id,'QuoteReply',reply.id,'CREATE',null,appliedReply);
      return jsonSafe({reply:appliedReply,version:nextVersion});
    });
  }
}

async function syncCollectionFamilies(tx:any,collectionId:string,familyIds:string[]){
  await tx.collectionQuote.deleteMany({
    where:{collectionId,familyId:{notIn:familyIds}},
  });
  if(familyIds.length){
    await tx.collectionQuote.createMany({
      data:familyIds.map((familyId,sortOrder)=>({collectionId,familyId,sortOrder})),
      skipDuplicates:true,
    });
  }
}

/** Sincroniza las membresías de un presupuesto (familia) hacia las colecciones indicadas. */
async function syncFamilyCollections(tx:any,familyId:string,collectionIds:string[]){
  const unique=[...new Set(collectionIds)];
  if(unique.length){
    const found=await tx.collection.findMany({where:{id:{in:unique}},select:{id:true}});
    if(found.length!==unique.length){
      throw new BadRequestException('Una o más colecciones no existen');
    }
  }
  await tx.collectionQuote.deleteMany({
    where:{familyId,collectionId:{notIn:unique}},
  });
  if(unique.length){
    await tx.collectionQuote.createMany({
      data:unique.map((collectionId,sortOrder)=>({collectionId,familyId,sortOrder})),
      skipDuplicates:true,
    });
  }
}

/**
 * Al guardar un presupuesto asociado, la solicitud pasa a LISTA si estaba pendiente o en preparación.
 */
async function markRequestListaIfPreparing(tx:any,requestId:string,actorId:string){
  const request=await tx.quoteRequest.findUnique({where:{id:requestId}});
  if(!request)return;
  if(request.state!=='PENDIENTE'&&request.state!=='EN_PREPARACION')return;
  const next=await tx.quoteRequest.update({
    where:{id:requestId},
    data:{state:'LISTA'},
  });
  await statusEvent(tx,{
    type:'SOLICITUD_LISTA',
    requestId,
    customerId:next.customerId,
    userId:actorId,
    previous:{state:request.state},
    next:{state:'LISTA'},
    metadata:{reason:'Presupuesto asociado guardado'},
  });
}

@Controller('collections')
export class CollectionsController{
  @Get()
  async list(){
    const rows=await db.collection.findMany({
      include:{quotes:{include:{family:true},orderBy:{sortOrder:'asc'}}},
      orderBy:[{sortOrder:'asc'},{name:'asc'},{id:'asc'}],
    });
    return jsonSafe(rows.map((row:any)=>({
      ...row,
      familyIds:row.quotes.map((q:any)=>q.familyId),
    })));
  }

  @Post()
  async create(
    @Body(new ZodPipe(collectionCreateSchema)) body:CollectionCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const {familyIds,...values}=body;
      const next=await tx.collection.create({data:values});
      await syncCollectionFamilies(tx,next.id,familyIds??[]);
      await statusEvent(tx,{
        type:'COLECCION_MODIFICADA',
        userId:actor.id,
        next,
        metadata:{action:'CREATE',familyIds:familyIds??[]},
      });
      await audit(tx,actor.id,'Collection',next.id,'CREATE',null,{...next,familyIds:familyIds??[]});
      return jsonSafe(next);
    });
  }

  @Put(':id')
  async update(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(collectionUpdateSchema)) body:CollectionUpdateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.collection.findUnique({
        where:{id},
        include:{quotes:true},
      });
      if(!old)throw new NotFoundException('Colección inexistente');
      const {familyIds,...values}=body;
      const next=Object.keys(values).length
        ?await tx.collection.update({where:{id},data:values})
        :old;
      if(familyIds)await syncCollectionFamilies(tx,id,familyIds);
      await statusEvent(tx,{
        type:'COLECCION_MODIFICADA',
        userId:actor.id,
        previous:old,
        next,
        metadata:{action:'UPDATE',familyIds:familyIds??null},
      });
      await audit(tx,actor.id,'Collection',id,'UPDATE',old,{...next,familyIds:familyIds??old.quotes.map((q:any)=>q.familyId)});
      return jsonSafe(next);
    });
  }

  @Delete(':id')
  async remove(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.collection.findUnique({where:{id}});
      if(!old)throw new NotFoundException('Colección inexistente');
      await tx.collection.delete({where:{id}});
      await statusEvent(tx,{
        type:'COLECCION_MODIFICADA',
        userId:actor.id,
        previous:old,
        metadata:{action:'DELETE'},
      });
      await audit(tx,actor.id,'Collection',id,'DELETE',old,null);
      return {ok:true};
    });
  }
}

function requestData(body:RequestCreateInput|RequestUpdateInput,actorId?:string){
  const data:Record<string,unknown>={};
  if('title' in body&&body.title!==undefined)data.title=body.title;
  if('originalText' in body&&body.originalText!==undefined)data.originalText=body.originalText;
  if('internalNotes' in body&&body.internalNotes!==undefined)data.internalNotes=body.internalNotes;
  if('customerId' in body&&body.customerId!==undefined)data.customerId=body.customerId;
  if('detectedPhone' in body&&body.detectedPhone!==undefined)data.detectedPhone=body.detectedPhone;
  if('maximumBudgetCents' in body&&body.maximumBudgetCents!==undefined){
    data.maximumBudgetCents=body.maximumBudgetCents==null?null:BigInt(body.maximumBudgetCents);
  }
  if('expectedUse' in body&&body.expectedUse!==undefined)data.expectedUse=body.expectedUse;
  if('requiredComponents' in body&&body.requiredComponents!==undefined)data.requiredComponents=body.requiredComponents;
  if('assigneeId' in body&&body.assigneeId!==undefined)data.assigneeId=body.assigneeId;
  if('state' in body&&body.state!==undefined)data.state=body.state;
  if(actorId)data.creatorId=actorId;
  return data;
}

/** Fuente única para crear solicitudes, usada tanto por operadores como por automatizaciones autenticadas. */
export async function createQuoteRequest(
  tx:any,
  body:RequestCreateInput,
  actorId:string,
  metadata?:Record<string,unknown>,
){
  const next=await tx.quoteRequest.create({data:requestData(body,actorId) as any});
  await statusEvent(tx,{
    type:'SOLICITUD_CREADA',
    requestId:next.id,
    customerId:next.customerId,
    userId:actorId,
    next,
    metadata,
  });
  await audit(tx,actorId,'QuoteRequest',next.id,'CREATE',null,next,metadata);
  return next;
}

@Controller('requests')
export class RequestsController{
  @Get()
  async list(){
    return jsonSafe(await db.quoteRequest.findMany({
      include:{customer:true,families:true},
      orderBy:[{createdAt:'desc'},{id:'asc'}],
    }));
  }

  @Post()
  async create(
    @Body(new ZodPipe(requestCreateSchema)) body:RequestCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      return jsonSafe(await createQuoteRequest(tx,body,actor.id));
    });
  }

  /**
   * Prepara una solicitud para armar presupuesto:
   * - pasa a EN_PREPARACION
   * - asegura un cliente a partir del teléfono/nombre detectado en WhatsApp
   */
  @Post(':id/prepare-quote')
  async prepareQuote(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const request=await tx.quoteRequest.findUnique({where:{id},include:{customer:true}});
      if(!request)throw new NotFoundException('Solicitud inexistente');
      const customer=await ensureCustomerFromWhatsApp(tx,request,actor.id);
      const next=await tx.quoteRequest.update({
        where:{id},
        data:{
          customerId:customer.id,
          state:request.state==='PENDIENTE'||request.state==='EN_PREPARACION'
            ?'EN_PREPARACION'
            :request.state,
        },
        include:{customer:true},
      });
      if(request.state!==next.state||request.customerId!==next.customerId){
        await statusEvent(tx,{
          type:'CAMBIO_ESTADO',
          requestId:id,
          customerId:next.customerId,
          userId:actor.id,
          previous:{state:request.state,customerId:request.customerId},
          next:{state:next.state,customerId:next.customerId},
          metadata:{action:'PREPARE_QUOTE',customerName:customer.name,customerPhone:customer.phone},
        });
      }
      await audit(tx,actor.id,'QuoteRequest',id,'PREPARE_QUOTE',request,next);
      return jsonSafe({
        request:next,
        customer,
        seed:{
          requestId:next.id,
          customerId:customer.id,
          internalName:next.title.trim()||`Solicitud ${next.id.slice(0,8)}`,
        },
      });
    });
  }

  /** Sugiere presupuestos existentes según el texto/componentes de la solicitud. */
  @Get(':id/suggest-quotes')
  async suggestQuotes(
    @Param('id',new ZodPipe(idSchema)) id:string,
  ){
    const request=await db.quoteRequest.findUnique({where:{id}});
    if(!request)throw new NotFoundException('Solicitud inexistente');

    const requestBlob=[
      request.title,
      request.originalText,
      request.expectedUse??'',
      ...(request.requiredComponents??[]),
    ].join(' ').trim();
    const components=(request.requiredComponents??[]).filter(Boolean);

    const families=await db.quoteFamily.findMany({
      take:250,
      orderBy:[{lastActivityAt:'desc'},{updatedAt:'desc'}],
      include:{
        customer:true,
        versions:{
          orderBy:{version:'desc'},
          take:3,
          include:{
            items:{select:{frozenName:true},orderBy:{position:'asc'},take:40},
          },
        },
      },
    });

    const scored=families.map((family)=>{
      const version=
        family.versions.find((v)=>v.version===family.activeVersion)??
        family.versions[0]??
        null;
      const itemNames=(version?.items??[]).map((i)=>i.frozenName);
      const blob=[family.internalName,family.visibleNumber,...itemNames].join(' ');
      let score=requestBlob?productSimilarity(requestBlob.slice(0,240),blob.slice(0,240)):0;
      for(const component of components){
        for(const name of itemNames){
          score=Math.max(score,productSimilarity(component,name));
        }
        score=Math.max(score,productSimilarity(component,family.internalName));
      }
      if(request.customerId&&family.customerId===request.customerId)score=Math.min(100,score+12);
      if(family.requestId===id)score=Math.min(100,score+20);
      return {
        id:family.id,
        visibleNumber:family.visibleNumber,
        internalName:family.internalName,
        requestId:family.requestId,
        customerId:family.customerId,
        customerName:family.customer?.name??null,
        state:version?.state??null,
        totalSaleCents:version?.totalSaleCents??null,
        score,
        preview:itemNames.slice(0,4),
      };
    })
      .filter((row)=>row.score>=35)
      .sort((a,b)=>b.score-a.score||a.visibleNumber.localeCompare(b.visibleNumber))
      .slice(0,3);

    return jsonSafe({requestId:id,suggestions:scored});
  }

  /** Asocia un presupuesto existente a la solicitud. */
  @Post(':id/associate-quote')
  async associateQuote(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(requestAssociateQuoteSchema)) body:RequestAssociateQuoteInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const request=await tx.quoteRequest.findUnique({where:{id}});
      if(!request)throw new NotFoundException('Solicitud inexistente');
      const family=await tx.quoteFamily.findUnique({where:{id:body.familyId}});
      if(!family)throw new NotFoundException('Presupuesto inexistente');

      const nextFamily=await tx.quoteFamily.update({
        where:{id:body.familyId},
        data:{
          requestId:id,
          customerId:family.customerId??request.customerId,
        },
      });
      const nextState=
        request.state==='PENDIENTE'||request.state==='EN_PREPARACION'
          ?'EN_PREPARACION'
          :request.state;
      const nextRequest=await tx.quoteRequest.update({
        where:{id},
        data:{
          state:nextState,
          customerId:request.customerId??family.customerId,
        },
        include:{customer:true},
      });
      await statusEvent(tx,{
        type:'CAMBIO_ESTADO',
        requestId:id,
        familyId:body.familyId,
        customerId:nextRequest.customerId,
        userId:actor.id,
        previous:{state:request.state,requestId:family.requestId},
        next:{state:nextRequest.state,familyId:body.familyId},
        metadata:{action:'ASSOCIATE_QUOTE',visibleNumber:family.visibleNumber},
      });
      await audit(tx,actor.id,'QuoteRequest',id,'ASSOCIATE_QUOTE',request,{
        request:nextRequest,
        family:nextFamily,
      });
      return jsonSafe({request:nextRequest,family:nextFamily});
    });
  }

  @Put(':id')
  async update(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(requestUpdateSchema)) body:RequestUpdateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.quoteRequest.findUnique({where:{id}});
      if(!old)throw new NotFoundException('Solicitud inexistente');
      const next=await tx.quoteRequest.update({where:{id},data:requestData(body) as any});
      await statusEvent(tx,{
        type:'CAMBIO_ESTADO',
        requestId:id,
        customerId:next.customerId,
        userId:actor.id,
        previous:old,
        next,
      });
      await audit(tx,actor.id,'QuoteRequest',id,'UPDATE',old,next);
      return jsonSafe(next);
    });
  }
}

/** Nombre de contacto WhatsApp embebido en títulos tipo "Consulta de THIAGO". */
export function whatsappNameFromRequest(request:{title:string;detectedPhone?:string|null}){
  const fromTitle=request.title.match(/^Consulta de\s+(.+)$/i)?.[1]?.trim();
  if(fromTitle)return fromTitle;
  const trimmed=request.title.trim();
  if(trimmed&&!/^solicitud\b/i.test(trimmed))return trimmed;
  if(request.detectedPhone?.trim())return request.detectedPhone.trim();
  return 'Cliente WhatsApp';
}

async function ensureCustomerFromWhatsApp(tx:any,request:any,actorId:string){
  if(request.customerId){
    const linked=await tx.customer.findUnique({where:{id:request.customerId}});
    if(linked)return linked;
  }
  const phone=request.detectedPhone?.trim()||null;
  const normalized=normalizePhone(phone);
  if(normalized){
    const byPhone=await tx.customer.findFirst({where:{normalizedPhone:normalized}});
    if(byPhone){
      // Si el nombre de WhatsApp es mejor que un placeholder, actualizamos.
      const waName=whatsappNameFromRequest(request);
      if(
        waName&&
        waName!==byPhone.name&&
        (/^cliente whatsapp$/i.test(byPhone.name)||byPhone.name===byPhone.phone)
      ){
        const updated=await tx.customer.update({
          where:{id:byPhone.id},
          data:{name:waName,normalizedName:normalizeText(waName)},
        });
        await audit(tx,actorId,'Customer',updated.id,'UPDATE',byPhone,updated);
        return updated;
      }
      return byPhone;
    }
  }
  const name=whatsappNameFromRequest(request);
  const created=await tx.customer.create({
    data:{
      name,
      normalizedName:normalizeText(name),
      phone,
      normalizedPhone:normalized,
      dni:null,
    },
  });
  await audit(tx,actorId,'Customer',created.id,'CREATE',null,created);
  return created;
}
