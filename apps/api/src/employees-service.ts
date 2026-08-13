import {BadRequestException, NotFoundException} from '@nestjs/common';
import {db, type MovementDirection, type MovementKind} from '@tgs/database';

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

export function balanceFrom(movements: {amountCents:bigint;direction:MovementDirection}[]) {
  return movements.reduce((sum,m)=>sum+(m.direction==='COMPANY_OWES'?m.amountCents:-m.amountCents),0n);
}

export async function employeeBalance(employeeId:string, tx:any=db) {
  const rows=await tx.movement.findMany({where:{employeeId,status:'APPLIED'},select:{amountCents:true,direction:true}});
  return balanceFrom(rows);
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

export function splitInstallments(total:bigint,count:number,provided?:string[]) {
  if(provided){const values=provided.map(BigInt);if(values.reduce((a,b)=>a+b,0n)!==total)throw new BadRequestException('Las cuotas deben sumar exactamente el importe original');return values;}
  const base=total/BigInt(count), values=Array.from({length:count},()=>base);
  values[count-1]=(values[count-1]??0n)+total-values.reduce((a,b)=>a+b,0n);return values;
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
    const obligation=await tx.obligation.findUnique({where:{id:targetId}});
    if(!obligation||obligation.employeeId!==employeeId)throw new BadRequestException('La obligación no pertenece al empleado');
    const paid=await tx.paymentAllocation.aggregate({_sum:{amountCents:true},where:{targetType:'OBLIGATION',targetId}});
    if((paid._sum.amountCents??0n)>obligation.originalAmountCents)throw new BadRequestException('La asignación supera el pendiente de la obligación');
    await reconcileObligation(tx,targetId);
  }
}

export async function reconcileObligation(tx:any,id:string){
  const obligation=await tx.obligation.findUnique({where:{id},include:{installments:true}});if(!obligation)return;
  let paid:bigint;
  if(obligation.installments.length)paid=obligation.installments.reduce((s:any,i:any)=>s+i.paidCents,0n);
  else {const aggregate=await tx.paymentAllocation.aggregate({_sum:{amountCents:true},where:{targetType:'OBLIGATION',targetId:id}});paid=aggregate._sum.amountCents??0n;}
  await tx.obligation.update({where:{id},data:{status:paid>=obligation.originalAmountCents?'SETTLED':'OPEN'}});
}
