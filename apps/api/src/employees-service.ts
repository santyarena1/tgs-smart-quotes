import {BadRequestException, NotFoundException} from '@nestjs/common';
import {db, type MovementDirection, type MovementKind, type ObligationKind} from '@tgs/database';

export const MOVEMENT_DIRECTIONS: Record<MovementKind, MovementDirection | null> = {
  SALARY_ACCRUAL:'COMPANY_OWES', REPAYMENT:'COMPANY_OWES', REIMBURSEMENT:'COMPANY_OWES',
  SALARY_PAYMENT:'EMPLOYEE_OWES', ADVANCE:'EMPLOYEE_OWES', MERCHANDISE:'EMPLOYEE_OWES',
  CARD_CONSUMPTION:'EMPLOYEE_OWES', DEBT:'EMPLOYEE_OWES', INSTALLMENT:'EMPLOYEE_OWES', ADJUSTMENT:null,
};

export function directionFor(kind: MovementKind, explicit?: MovementDirection) {
  const direction=explicit??MOVEMENT_DIRECTIONS[kind];
  if(!direction) throw new BadRequestException('Los ajustes requieren dirección');
  return direction;
}

export function movementKindForObligation(kind: ObligationKind, direction: MovementDirection): MovementKind {
  if(kind==='OTHER') return direction==='COMPANY_OWES'?'REIMBURSEMENT':'DEBT';
  return kind;
}

export function balanceFrom(movements: {amountCents:bigint;direction:MovementDirection}[]) {
  return movements.reduce((sum,m)=>sum+(m.direction==='COMPANY_OWES'?m.amountCents:-m.amountCents),0n);
}

export async function employeeBalance(employeeId:string, tx:any=db) {
  const rows=await tx.movement.findMany({where:{employeeId,status:'APPLIED'},select:{amountCents:true,direction:true}});
  return balanceFrom(rows);
}

const DEBT_KINDS:MovementKind[]=['ADVANCE','MERCHANDISE','CARD_CONSUMPTION','DEBT','INSTALLMENT'];
const CREDIT_KINDS:MovementKind[]=['REPAYMENT','REIMBURSEMENT'];

/**
 * Desglosa la cuenta corriente en sus partes (sueldo devengado, deudas, otros a favor, ya pagado,
 * ajustes) para que "cuánto le debo" se pueda explicar, no solo mostrar el número final.
 * accruedCents + creditsCents - debtsCents - paidCents + adjustmentsCents == balanceCents siempre.
 */
export async function balanceBreakdown(employeeId:string, tx:any=db) {
  const rows:{kind:MovementKind;direction:MovementDirection;amountCents:bigint}[]=await tx.movement.findMany({where:{employeeId,status:'APPLIED'},select:{kind:true,direction:true,amountCents:true}});
  let accruedCents=0n,creditsCents=0n,debtsCents=0n,paidCents=0n,adjustmentsCents=0n;
  for(const row of rows){
    if(row.kind==='SALARY_ACCRUAL')accruedCents+=row.amountCents;
    else if(CREDIT_KINDS.includes(row.kind) || (DEBT_KINDS.includes(row.kind) && row.direction==='COMPANY_OWES'))creditsCents+=row.amountCents;
    else if(DEBT_KINDS.includes(row.kind))debtsCents+=row.amountCents;
    else if(row.kind==='SALARY_PAYMENT')paidCents+=row.amountCents;
    else if(row.kind==='ADJUSTMENT')adjustmentsCents+=row.direction==='COMPANY_OWES'?row.amountCents:-row.amountCents;
  }
  const balanceCents=accruedCents+creditsCents-debtsCents-paidCents+adjustmentsCents;
  return {accruedCents,creditsCents,debtsCents,paidCents,adjustmentsCents,balanceCents};
}

export const isEmployeePortalEnabled=()=>process.env.EMPLOYEE_PORTAL_ENABLED==='true';

export async function requireEmployeeForUser(userId:string,tx:any=db){
  const employee=await tx.employee.findUnique({where:{userId}});
  if(!employee)throw new NotFoundException('No tenés una cuenta de empleado asociada');
  return employee;
}

// División entera redondeada half-up, válida también para ajustes negativos.
export function salaryWithBps(oldCents:bigint,bps:number,roundingStepPesos=0) {
  const numerator=oldCents*BigInt(10000+bps);
  let result=numerator>=0n?(numerator+5000n)/10000n:(numerator-5000n)/10000n;
  if(roundingStepPesos>0){const step=BigInt(roundingStepPesos)*100n;result=((result+step/2n)/step)*step;}
  return result;
}

export function addMonths(period:string, offset:number) {
  const year=Number(period.slice(0,4)),month=Number(period.slice(4));
  const date=new Date(Date.UTC(year,month-1+offset,1));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,'0')}`;
}

export function currentPeriod(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).formatToParts(now);
  const year=parts.find(part=>part.type==='year')?.value??'0000';
  const month=parts.find(part=>part.type==='month')?.value??'01';
  return `${year}${month}`;
}

export function periodStartDate(period:string) {
  return new Date(`${period.slice(0,4)}-${period.slice(4)}-01T12:00:00-03:00`);
}

export function installmentMovementDescription(number:number,count:number,description:string|null) {
  const base=`Cuota ${number}/${count}`;
  return description?`${base} — ${description}`:base;
}

export function splitInstallments(total:bigint,count:number,provided?:string[]) {
  if(provided){const values=provided.map(BigInt);if(values.reduce((a,b)=>a+b,0n)!==total)throw new BadRequestException('Las cuotas deben sumar exactamente el importe original');return values;}
  const base=total/BigInt(count), values=Array.from({length:count},()=>base);
  values[count-1]=(values[count-1]??0n)+total-values.reduce((a,b)=>a+b,0n);return values;
}

/**
 * En deudas financiadas, el saldo solo se mueve por las cuotas cuyo período ya llegó
 * (mes actual o atrasadas). Las cuotas futuras no entran hasta su mes.
 * Las obligaciones viejas que se cargaron de una (movimiento sin installmentId) no se tocan.
 */
export async function applyDueInstallments(tx:any,opts:{userId:string;employeeId?:string;now?:Date}) {
  const period=currentPeriod(opts.now);
  const where:Record<string,unknown>={status:'OPEN',installments:{some:{}}};
  if(opts.employeeId)where.employeeId=opts.employeeId;
  const obligations=await tx.obligation.findMany({
    where,
    include:{
      installments:{orderBy:{number:'asc'}},
      // Incluye CANCELLED: si ya hubo un movimiento de esa cuota (aunque se haya
      // eliminado), no hay que volver a crearlo. El unique de installmentId cubre la carrera.
      movements:{select:{id:true,installmentId:true}},
    },
  });
  const created:unknown[]=[];
  const now=opts.now??new Date();
  for(const obligation of obligations){
    if(obligation.movements.some((movement: {installmentId:string|null})=>movement.installmentId==null))continue;
    const accrued=new Set(obligation.movements.map((movement: {installmentId:string|null})=>movement.installmentId).filter(Boolean));
    const count=obligation.installments.length;
    for(const installment of obligation.installments){
      if(installment.status==='CANCELLED')continue;
      if(installment.period>period)continue;
      if(accrued.has(installment.id))continue;
      try{
        created.push(await tx.movement.create({data:{
          employeeId:obligation.employeeId,
          kind:'INSTALLMENT',
          direction:obligation.direction,
          amountCents:installment.amountCents,
          status:'APPLIED',
          occurredAt:periodStartDate(installment.period),
          description:installmentMovementDescription(installment.number,count,obligation.description),
          obligationId:obligation.id,
          installmentId:installment.id,
          createdById:opts.userId,
          appliedById:opts.userId,
          appliedAt:now,
        }}));
      }catch(error:any){
        if(error?.code==='P2002')continue;
        throw error;
      }
    }
  }
  return created;
}

export function flattenListedMovement(movement:any){
  const totalInstallments=movement.installment?.obligation?.plan?.count??null;
  const installmentNumber=movement.installment?.number??null;
  const {installment:_ignored,...rest}=movement;
  return {...rest,totalInstallments,installmentNumber};
}

export async function listEmployeeMovements(tx:any,employeeId:string,q:{status?:string;kind?:string;direction?:string;occurredAt?:{gte:Date;lt:Date}}){
  const items=await tx.movement.findMany({
    where:{employeeId,status:q.status??{not:'CANCELLED'},kind:q.kind,direction:q.direction,occurredAt:q.occurredAt},
    include:{installment:{select:{number:true,obligation:{select:{plan:{select:{count:true}}}}}}},
    orderBy:[{occurredAt:'desc'},{createdAt:'desc'}],
  });
  return items.map(flattenListedMovement);
}

export async function cancelEmployeeObligation(tx:any,opts:{id:string;userId:string}){
  const old=await tx.obligation.findUnique({where:{id:opts.id}});
  if(!old)throw new NotFoundException('Obligación inexistente');
  if(old.status==='SETTLED')throw new BadRequestException('No se puede cancelar una obligación saldada');
  const now=new Date();
  await tx.installment.updateMany({where:{obligationId:opts.id,status:{not:'PAID'}},data:{status:'CANCELLED'}});
  await tx.movement.updateMany({where:{obligationId:opts.id,status:{not:'CANCELLED'}},data:{status:'CANCELLED',cancelledById:opts.userId,cancelledAt:now}});
  const next=await tx.obligation.update({where:{id:opts.id},data:{status:'CANCELLED'}});
  await audit(tx,opts.userId,'Obligation',opts.id,'CANCEL');
  return next;
}

export async function cancelEmployeeMovement(tx:any,opts:{id:string;userId:string;scope?:'this_month'|'full_obligation'}){
  const old=await tx.movement.findUnique({where:{id:opts.id}});
  if(!old)throw new NotFoundException('Movimiento inexistente');
  if(old.status==='CANCELLED')throw new BadRequestException('El movimiento ya está cancelado');
  if(opts.scope==='full_obligation'){
    if(!old.obligationId)throw new BadRequestException('Este movimiento no pertenece a una deuda');
    return cancelEmployeeObligation(tx,{id:old.obligationId,userId:opts.userId});
  }
  const now=new Date();
  const movement=await tx.movement.update({where:{id:opts.id},data:{status:'CANCELLED',cancelledById:opts.userId,cancelledAt:now}});
  if(old.installmentId){
    await tx.installment.updateMany({where:{id:old.installmentId,status:{not:'PAID'}},data:{status:'CANCELLED'}});
  }
  await audit(tx,opts.userId,'Movement',opts.id,'CANCEL',{scope:'this_month',installmentId:old.installmentId??null});
  return movement;
}

export async function serializeObligation(tx:any,obligation:any) {
  const pendingCents=await obligationPendingCents(tx,obligation);
  const movements=obligation.movements??[];
  const hasBulk=movements.some((movement:{installmentId:string|null})=>movement.installmentId==null);
  const accrued=new Set(movements.map((movement:{installmentId:string|null})=>movement.installmentId).filter(Boolean));
  const {movements:_ignored,...rest}=obligation;
  return {
    ...rest,
    pendingCents,
    installments:obligation.installments.map((item:{id:string})=>({...item,accrued:hasBulk||accrued.has(item.id)})),
  };
}

export async function requireEmployee(id:string,tx:any=db){const employee=await tx.employee.findUnique({where:{id}});if(!employee)throw new NotFoundException('Empleado inexistente');return employee;}

export async function audit(tx:any,userId:string,entityType:string,entityId:string,action:string,metadata?:unknown){
  await tx.auditLog.create({data:{userId,entityType,entityId,action,metadata:metadata as any}});
}

export async function reconcileAllocation(tx:any,targetType:string,targetId:string|undefined,amount:bigint,employeeId:string){
  if(targetType==='GENERAL'||targetType==='PERIOD')return;
  if(!targetId)throw new BadRequestException('La asignación requiere targetId');
  if(targetType==='INSTALLMENT'){
    const item=await tx.installment.findUnique({where:{id:targetId},include:{obligation:true}});
    if(!item||item.obligation.employeeId!==employeeId)throw new BadRequestException('La cuota no pertenece al empleado');
    const next=item.paidCents+amount;if(next>item.amountCents)throw new BadRequestException('La asignación supera el pendiente de la cuota');
    await tx.installment.update({where:{id:item.id},data:{paidCents:next,status:next===item.amountCents?'PAID':'PARTIAL'}});
    await reconcileObligation(tx,item.obligationId);
  }else{
    const obligation=await tx.obligation.findUnique({where:{id:targetId},include:{installments:true}});
    if(!obligation||obligation.employeeId!==employeeId)throw new BadRequestException('La obligación no pertenece al empleado');
    const paid=await tx.paymentAllocation.aggregate({_sum:{amountCents:true},where:{targetType:'OBLIGATION',targetId}});
    const installmentPaid=obligation.installments.reduce((sum:bigint,item:any)=>sum+item.paidCents,0n);
    if((paid._sum.amountCents??0n)+installmentPaid>obligation.originalAmountCents)throw new BadRequestException('La asignación supera el pendiente de la obligación');
    await reconcileObligation(tx,targetId);
  }
}

export async function obligationPendingCents(tx:any,obligation:{id:string;originalAmountCents:bigint;installments:{paidCents:bigint}[]}){
  const direct=await tx.paymentAllocation.aggregate({_sum:{amountCents:true},where:{targetType:'OBLIGATION',targetId:obligation.id}});
  const installmentPaid=obligation.installments.reduce((sum,item)=>sum+item.paidCents,0n);
  return obligation.originalAmountCents-(direct._sum.amountCents??0n)-installmentPaid;
}

export async function reconcileObligation(tx:any,id:string){
  const obligation=await tx.obligation.findUnique({where:{id},include:{installments:true}});if(!obligation)return;
  const pending=await obligationPendingCents(tx,obligation);
  await tx.obligation.update({where:{id},data:{status:pending<=0n?'SETTLED':'OPEN'}});
}
