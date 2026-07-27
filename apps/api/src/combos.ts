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
} from '@nestjs/common';
import {db} from '@tgs/database';
import {
  comboCreateSchema,
  comboUpdateSchema,
  idSchema,
  type ComboCreateInput,
  type ComboItemInput,
  type ComboUpdateInput,
} from '@tgs/contracts';
import {normalizeText} from '@tgs/validation';
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

const comboInclude={
  items:{
    include:{
      product:{
        select:{
          id:true,
          name:true,
          active:true,
          costCents:true,
          salePriceCents:true,
          markupBps:true,
          defaultLineId:true,
        },
      },
    },
    orderBy:[{position:'asc' as const},{id:'asc' as const}],
  },
};

function dedupeItems(items:ComboItemInput[]){
  const seen=new Set<string>();
  const out:ComboItemInput[]=[];
  for(const [index,item] of items.entries()){
    if(seen.has(item.productId))continue;
    seen.add(item.productId);
    out.push({
      productId:item.productId,
      quantity:item.quantity??1,
      position:item.position??index,
    });
  }
  return out;
}

async function assertProductsExist(tx:any,productIds:string[]){
  if(!productIds.length)throw new BadRequestException('El combo necesita al menos un producto');
  const found=await tx.product.findMany({
    where:{id:{in:productIds}},
    select:{id:true},
  });
  if(found.length!==productIds.length){
    throw new BadRequestException('Uno o más productos del combo no existen');
  }
}

async function syncComboItems(tx:any,comboId:string,items:ComboItemInput[]){
  const unique=dedupeItems(items);
  await assertProductsExist(tx,unique.map((i)=>i.productId));
  await tx.comboItem.deleteMany({where:{comboId}});
  if(unique.length){
    await tx.comboItem.createMany({
      data:unique.map((item,index)=>({
        comboId,
        productId:item.productId,
        quantity:item.quantity??1,
        position:item.position??index,
      })),
    });
  }
}

@Controller('combos')
export class CombosController{
  @Get()
  async list(){
    return jsonSafe(await db.combo.findMany({
      include:comboInclude,
      orderBy:[{active:'desc'},{sortOrder:'asc'},{normalizedName:'asc'},{id:'asc'}],
    }));
  }

  @Post()
  async create(
    @Body(new ZodPipe(comboCreateSchema)) body:ComboCreateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const items=dedupeItems(body.items);
      await assertProductsExist(tx,items.map((i)=>i.productId));
      const next=await tx.combo.create({
        data:{
          name:body.name.trim(),
          normalizedName:normalizeText(body.name),
          description:body.description??null,
          active:body.active??true,
          sortOrder:body.sortOrder??0,
          updatedById:actor.id,
        },
      });
      await syncComboItems(tx,next.id,items);
      const full=await tx.combo.findUniqueOrThrow({where:{id:next.id},include:comboInclude});
      await audit(tx,actor.id,'Combo',next.id,'CREATE',null,full);
      return jsonSafe(full);
    });
  }

  @Put(':id')
  async update(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @Body(new ZodPipe(comboUpdateSchema)) body:ComboUpdateInput,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.combo.findUnique({where:{id},include:comboInclude});
      if(!old)throw new NotFoundException('Combo inexistente');

      const data:Record<string,unknown>={updatedById:actor.id};
      if(body.name!==undefined){
        data.name=body.name.trim();
        data.normalizedName=normalizeText(body.name);
      }
      if(body.description!==undefined)data.description=body.description;
      if(body.active!==undefined)data.active=body.active;
      if(body.sortOrder!==undefined)data.sortOrder=body.sortOrder;

      if(Object.keys(data).length>1){
        await tx.combo.update({where:{id},data});
      }
      if(body.items)await syncComboItems(tx,id,body.items);

      const full=await tx.combo.findUniqueOrThrow({where:{id},include:comboInclude});
      await audit(tx,actor.id,'Combo',id,'UPDATE',old,full);
      return jsonSafe(full);
    });
  }

  @Delete(':id')
  async remove(
    @Param('id',new ZodPipe(idSchema)) id:string,
    @CurrentUser() actor:RequestUser,
  ){
    return db.$transaction(async tx=>{
      const old=await tx.combo.findUnique({where:{id},include:comboInclude});
      if(!old)throw new NotFoundException('Combo inexistente');
      const next=await tx.combo.update({
        where:{id},
        data:{active:false,updatedById:actor.id},
        include:comboInclude,
      });
      await audit(tx,actor.id,'Combo',id,'DELETE',old,next);
      return jsonSafe(next);
    });
  }
}
