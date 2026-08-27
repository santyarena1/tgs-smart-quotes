import {Body,CanActivate,Controller,ExecutionContext,ForbiddenException,Get,Injectable,Post,Query,UseGuards} from '@nestjs/common';
import {db} from '@tgs/database';
import {employeePortalRequestCreateSchema,movementsQuerySchema,type EmployeePortalRequestCreateInput,type MovementsQuery} from '@tgs/contracts';
import {CurrentUser,jsonSafe,type RequestUser,ZodPipe} from './infrastructure.js';
import {applyDueInstallments,audit,employeeBalance,isEmployeePortalEnabled,requireEmployeeForUser,serializeObligation} from './employees-service.js';

const currentSalary=(employeeId:string)=>db.salaryRecord.findFirst({where:{employeeId},orderBy:[{effectiveFrom:'desc'},{createdAt:'desc'}]});
const periodDates=(period:string)=>{const y=Number(period.slice(0,4)),m=Number(period.slice(4)),next=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;return{gte:new Date(`${y}-${String(m).padStart(2,'0')}-01T00:00:00-03:00`),lt:new Date(`${next}-01T00:00:00-03:00`)}};

@Injectable()
class EmployeePortalEnabledGuard implements CanActivate {
  canActivate(context:ExecutionContext){if(context.getHandler().name==='access')return true;if(!isEmployeePortalEnabled())throw new ForbiddenException('El portal de empleados no está habilitado');return true;}
}

@UseGuards(EmployeePortalEnabledGuard)
@Controller('me/employee')
export class EmployeePortalController {
  private ensureEnabled(){if(!isEmployeePortalEnabled())throw new ForbiddenException('El portal de empleados no está habilitado');}
  private async employee(userId:string){this.ensureEnabled();return requireEmployeeForUser(userId);}

  @Get('access') async access(@CurrentUser()u:RequestUser){return{enabled:isEmployeePortalEnabled(),hasEmployee:Boolean(await db.employee.findUnique({where:{userId:u.id},select:{id:true}}))};}

  @Get() async profile(@CurrentUser()u:RequestUser){const employee=await this.employee(u.id);await applyDueInstallments(db,{userId:u.id,employeeId:employee.id});const [balance,salary,pendingMovements,openObligations,pendingRequests]=await Promise.all([employeeBalance(employee.id),currentSalary(employee.id),db.movement.count({where:{employeeId:employee.id,status:'PENDING'}}),db.obligation.count({where:{employeeId:employee.id,status:'OPEN'}}),db.employeeRequest.count({where:{employeeId:employee.id,status:'PENDING_APPROVAL'}})]);const basic=await db.employee.findUnique({where:{id:employee.id},select:{id:true,fullName:true,docId:true,position:true,active:true,branch:{select:{id:true,name:true}}}});return jsonSafe({...basic,balanceCents:balance,currentSalary:salary,summary:{pendingMovements,openObligations,pendingRequests}});}

  @Get('movements') async movements(@CurrentUser()u:RequestUser,@Query(new ZodPipe(movementsQuerySchema))q:MovementsQuery){const employee=await this.employee(u.id);await applyDueInstallments(db,{userId:u.id,employeeId:employee.id});return jsonSafe({items:await db.movement.findMany({where:{employeeId:employee.id,status:q.status,kind:q.kind,direction:q.direction,occurredAt:q.period?periodDates(q.period):undefined},orderBy:[{occurredAt:'desc'},{createdAt:'desc'}]})});}

  @Get('obligations') async obligations(@CurrentUser()u:RequestUser){const employee=await this.employee(u.id);await applyDueInstallments(db,{userId:u.id,employeeId:employee.id});const items=await db.obligation.findMany({where:{employeeId:employee.id},select:{id:true,kind:true,direction:true,originalAmountCents:true,description:true,status:true,createdAt:true,installments:{select:{id:true,number:true,amountCents:true,period:true,status:true,paidCents:true},orderBy:{number:'asc'}},movements:{where:{status:{not:'CANCELLED'}},select:{installmentId:true}}},orderBy:{createdAt:'desc'}});return jsonSafe({items:await Promise.all(items.map(item=>serializeObligation(db,item)))});}

  @Get('payments') async payments(@CurrentUser()u:RequestUser){const employee=await this.employee(u.id);return jsonSafe({items:await db.payment.findMany({where:{employeeId:employee.id},include:{allocations:true},orderBy:[{paidAt:'desc'},{createdAt:'desc'}]})});}

  @Get('salary') async salary(@CurrentUser()u:RequestUser){const employee=await this.employee(u.id);const history=await db.salaryRecord.findMany({where:{employeeId:employee.id},orderBy:[{effectiveFrom:'desc'},{createdAt:'desc'}]});return jsonSafe({current:history[0]??null,history});}

  @Get('requests') async requests(@CurrentUser()u:RequestUser){const employee=await this.employee(u.id);return jsonSafe({items:await db.employeeRequest.findMany({where:{employeeId:employee.id},orderBy:{createdAt:'desc'}})});}

  @Post('requests') async createRequest(@CurrentUser()u:RequestUser,@Body(new ZodPipe(employeePortalRequestCreateSchema))body:EmployeePortalRequestCreateInput){const employee=await this.employee(u.id);return jsonSafe(await db.$transaction(async tx=>{const request=await tx.employeeRequest.create({data:{employeeId:employee.id,kind:body.kind,amountCents:BigInt(body.amountCents),description:body.description??null,status:'PENDING_APPROVAL',createdByUserId:u.id}});await audit(tx,u.id,'EmployeeRequest',request.id,'CREATE');return request;}));}
}
