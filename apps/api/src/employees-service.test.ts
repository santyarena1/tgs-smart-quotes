import {beforeEach,describe,expect,it,vi} from 'vitest';

vi.mock('@tgs/database',()=>({db:{}}));

import {applyDueInstallments,applyDueSalaryAccruals,balanceBreakdown,balanceFrom,cancelEmployeeMovement,cancelEmployeeObligation,changeBpsBetween,currentPeriod,flattenListedMovement,ipcPeriodFor,movementKindForObligation,periodsUntil,pickIpcForPeriod,salaryWithIpc,splitInstallments,suggestedSalaryCents,upsertMonthlySalary} from './employees-service.js';

describe('cuenta corriente de empleados',()=>{
  it('mapea obligación de la empresa a un movimiento a favor del empleado',()=>{
    expect(movementKindForObligation('OTHER','COMPANY_OWES')).toBe('REIMBURSEMENT');
    expect(movementKindForObligation('OTHER','EMPLOYEE_OWES')).toBe('DEBT');
    expect(movementKindForObligation('ADVANCE','EMPLOYEE_OWES')).toBe('ADVANCE');
    expect(movementKindForObligation('MERCHANDISE','COMPANY_OWES')).toBe('MERCHANDISE');
  });

  it('reparte cuotas en centavos enteros que suman el total',()=>{
    expect(splitInstallments(10000n,3).reduce((a,b)=>a+b,0n)).toBe(10000n);
    expect(splitInstallments(10000n,3)).toEqual([3333n,3333n,3334n]);
  });

  it('el saldo suma lo que la empresa debe y resta lo que debe el empleado',()=>{
    expect(balanceFrom([
      {amountCents:100000n,direction:'COMPANY_OWES'},
      {amountCents:25000n,direction:'EMPLOYEE_OWES'},
    ])).toBe(75000n);
  });

  it('el saldo arrastra sueldo no pagado y deudas de meses anteriores',()=>{
    expect(balanceFrom([
      {amountCents:100000n,direction:'COMPANY_OWES'},
      {amountCents:100000n,direction:'COMPANY_OWES'},
      {amountCents:30000n,direction:'EMPLOYEE_OWES'},
      {amountCents:50000n,direction:'EMPLOYEE_OWES'},
    ])).toBe(120000n);
  });
});

describe('cuotas mes a mes',()=>{
  it('arma el período YYYYMM en hora de Argentina',()=>{
    expect(currentPeriod(new Date('2026-08-27T15:00:00-03:00'))).toBe('202608');
  });

  it('el IPC del sueldo es el de hace 2 meses',()=>{
    expect(ipcPeriodFor(new Date('2026-08-28T15:00:00-03:00'))).toBe('202606');
    expect(ipcPeriodFor(new Date('2026-09-01T00:30:00-03:00'))).toBe('202607');
    expect(ipcPeriodFor(new Date('2026-01-15T12:00:00-03:00'))).toBe('202511');
  });

  it('elige el IPC de ese mes aunque ya esté publicado el siguiente',()=>{
    expect(pickIpcForPeriod([
      {fecha:'2026-06-30',valor:1.9},
      {fecha:'2026-07-31',valor:2.1},
    ],'202606')).toEqual({period:'2026-06',pct:1.9});
  });

  it('solo mueve al saldo la cuota cuyo mes ya llegó',async()=>{
    const create=vi.fn(async({data}:{data:unknown})=>data);
    const findMany=vi.fn(async()=>[{
      id:'ob-1',
      employeeId:'emp-1',
      direction:'COMPANY_OWES',
      description:'horas extra',
      installments:[
        {id:'i1',number:1,amountCents:2500000n,period:'202608',status:'PENDING'},
        {id:'i2',number:2,amountCents:2500000n,period:'202609',status:'PENDING'},
        {id:'i3',number:3,amountCents:2500000n,period:'202610',status:'PENDING'},
        {id:'i4',number:4,amountCents:2500000n,period:'202611',status:'PENDING'},
      ],
      movements:[],
    }]);
    const created=await applyDueInstallments({obligation:{findMany},movement:{create}},{userId:'u1',now:new Date('2026-08-27T15:00:00-03:00')});
    expect(created).toHaveLength(1);
    expect(create).toHaveBeenCalledOnce();
    const data=create.mock.calls[0][0].data as {amountCents:bigint;installmentId:string;kind:string;direction:string;description:string};
    expect(data.amountCents).toBe(2500000n);
    expect(data.installmentId).toBe('i1');
    expect(data.kind).toBe('INSTALLMENT');
    expect(data.direction).toBe('COMPANY_OWES');
    expect(data.description).toBe('Cuota 1/4 — horas extra');
  });

  it('no vuelve a cargar deudas viejas que ya entraron de una al saldo',async()=>{
    const create=vi.fn();
    const findMany=vi.fn(async()=>[{
      id:'ob-old',
      employeeId:'emp-1',
      direction:'EMPLOYEE_OWES',
      description:null,
      installments:[{id:'i1',number:1,amountCents:10000n,period:'202608',status:'PENDING'}],
      movements:[{id:'m-bulk',installmentId:null}],
    }]);
    const created=await applyDueInstallments({obligation:{findMany},movement:{create}},{userId:'u1',now:new Date('2026-08-27T15:00:00-03:00')});
    expect(created).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('no recrea una cuota si ya hubo un movimiento, aunque esté cancelado',async()=>{
    const create=vi.fn();
    const findMany=vi.fn(async()=>[{
      id:'ob-1',
      employeeId:'emp-1',
      direction:'EMPLOYEE_OWES',
      description:'Debe 30 a lucas',
      installments:[
        {id:'i1',number:1,amountCents:2500000n,period:'202608',status:'PENDING'},
        {id:'i2',number:2,amountCents:2500000n,period:'202609',status:'PENDING'},
      ],
      movements:[{id:'m-cancelled',installmentId:'i1'}],
    }]);
    const created=await applyDueInstallments({obligation:{findMany},movement:{create}},{userId:'u1',now:new Date('2026-08-27T15:00:00-03:00')});
    expect(created).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('no recrea una cuota marcada como cancelada',async()=>{
    const create=vi.fn();
    const findMany=vi.fn(async()=>[{
      id:'ob-1',
      employeeId:'emp-1',
      direction:'EMPLOYEE_OWES',
      description:null,
      installments:[{id:'i1',number:1,amountCents:2500000n,period:'202608',status:'CANCELLED'}],
      movements:[],
    }]);
    const created=await applyDueInstallments({obligation:{findMany},movement:{create}},{userId:'u1',now:new Date('2026-08-27T15:00:00-03:00')});
    expect(created).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('si hay carrera y el unique ya existe, no explota',async()=>{
    const create=vi.fn(async()=>{const error=new Error('Unique constraint');(error as Error&{code:string}).code='P2002';throw error;});
    const findMany=vi.fn(async()=>[{
      id:'ob-1',
      employeeId:'emp-1',
      direction:'EMPLOYEE_OWES',
      description:null,
      installments:[{id:'i1',number:1,amountCents:2500000n,period:'202608',status:'PENDING'}],
      movements:[],
    }]);
    const created=await applyDueInstallments({obligation:{findMany},movement:{create}},{userId:'u1',now:new Date('2026-08-27T15:00:00-03:00')});
    expect(created).toHaveLength(0);
  });
});

describe('desglose de saldo',()=>{
  const findMany=vi.fn();

  beforeEach(()=>{
    findMany.mockReset();
  });

  it('cuenta una deuda de TGS al empleado como crédito, no como deuda',async()=>{
    findMany.mockResolvedValue([
      {kind:'SALARY_ACCRUAL',direction:'COMPANY_OWES',amountCents:200000n},
      {kind:'DEBT',direction:'EMPLOYEE_OWES',amountCents:40000n},
      {kind:'REIMBURSEMENT',direction:'COMPANY_OWES',amountCents:15000n},
      {kind:'ADVANCE',direction:'COMPANY_OWES',amountCents:5000n},
      {kind:'SALARY_PAYMENT',direction:'EMPLOYEE_OWES',amountCents:50000n},
    ]);
    const result=await balanceBreakdown('emp-1',{movement:{findMany}});
    expect(result).toEqual({
      accruedCents:200000n,
      creditsCents:20000n,
      debtsCents:40000n,
      paidCents:50000n,
      adjustmentsCents:0n,
      balanceCents:130000n,
    });
    expect(result.accruedCents+result.creditsCents-result.debtsCents-result.paidCents+result.adjustmentsCents).toBe(result.balanceCents);
  });
});

describe('eliminar movimientos y cuotas',()=>{
  it('expone cuántas cuotas tiene la deuda para que la UI pregunte',()=>{
    expect(flattenListedMovement({
      id:'m1',
      kind:'INSTALLMENT',
      installment:{number:1,obligation:{plan:{count:2}}},
    })).toEqual({id:'m1',kind:'INSTALLMENT',totalInstallments:2,installmentNumber:1});
  });

  it('al borrar solo este mes cancela el movimiento y la cuota para que no se reaplique',async()=>{
    const movement={id:'m1',status:'APPLIED',installmentId:'i1',obligationId:'ob1'};
    const tx={
      movement:{
        findUnique:vi.fn(async()=>movement),
        update:vi.fn(async({data}:{data:object})=>({...movement,...data})),
      },
      installment:{updateMany:vi.fn(async()=>({count:1}))},
      auditLog:{create:vi.fn()},
    };
    await cancelEmployeeMovement(tx,{id:'m1',userId:'u1',scope:'this_month'});
    expect(tx.movement.update).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({status:'CANCELLED',cancelledById:'u1'}),
    }));
    expect(tx.installment.updateMany).toHaveBeenCalledWith({
      where:{id:'i1',status:{not:'PAID'}},
      data:{status:'CANCELLED'},
    });
  });

  it('al borrar toda la deuda cancela obligación, cuotas y movimientos',async()=>{
    const tx={
      movement:{
        findUnique:vi.fn(async()=>({id:'m1',status:'APPLIED',installmentId:'i1',obligationId:'ob1'})),
        updateMany:vi.fn(async()=>({count:1})),
      },
      obligation:{
        findUnique:vi.fn(async()=>({id:'ob1',status:'OPEN'})),
        update:vi.fn(async()=>({id:'ob1',status:'CANCELLED'})),
      },
      installment:{updateMany:vi.fn(async()=>({count:2}))},
      auditLog:{create:vi.fn()},
    };
    const result=await cancelEmployeeMovement(tx,{id:'m1',userId:'u1',scope:'full_obligation'});
    expect(result).toEqual({id:'ob1',status:'CANCELLED'});
    expect(tx.installment.updateMany).toHaveBeenCalledWith({
      where:{obligationId:'ob1',status:{not:'PAID'}},
      data:{status:'CANCELLED'},
    });
    expect(tx.movement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{obligationId:'ob1',status:{not:'CANCELLED'}},
      data:expect.objectContaining({status:'CANCELLED',cancelledById:'u1'}),
    }));
    expect(tx.obligation.update).toHaveBeenCalledWith({where:{id:'ob1'},data:{status:'CANCELLED'}});
  });

  it('no cancela una obligación ya saldada',async()=>{
    const tx={obligation:{findUnique:vi.fn(async()=>({id:'ob1',status:'SETTLED'}))}};
    await expect(cancelEmployeeObligation(tx,{id:'ob1',userId:'u1'})).rejects.toThrow('No se puede cancelar una obligación saldada');
  });
});

describe('sueldo mensual con IPC',()=>{
  const august=new Date('2026-08-28T15:00:00-03:00');
  const ipcForSalaryPeriod=vi.fn(async(period:string)=>{
    if(period==='202608')return{period:'2026-06',pct:1.9};
    if(period==='202607')return{period:'2026-05',pct:2};
    return{period:null,pct:null};
  });

  it('aplica el IPC en centavos enteros y redondea al peso',()=>{
    expect(salaryWithIpc(10000000n,1.9)).toBe(10190000n);
    expect(salaryWithIpc(10000000n,null)).toBe(10000000n);
    expect(changeBpsBetween(10000000n,10190000n)).toBe(190);
  });

  it('recorre los meses desde el último sueldo hasta el actual',()=>{
    expect(periodsUntil('202606','202608')).toEqual(['202607','202608']);
    expect(periodsUntil('202607','202608')).toEqual(['202608']);
  });

  it('no vuelve a aplicar IPC si el sueldo vigente ya es de este mes',()=>{
    expect(suggestedSalaryCents({previousAmountCents:10190000n,previousPeriod:'202608',nowPeriod:'202608',ipcPct:1.9})).toEqual({
      suggestedAmountCents:10190000n,
      ipcAlreadyApplied:true,
    });
    expect(suggestedSalaryCents({previousAmountCents:10000000n,previousPeriod:'202607',nowPeriod:'202608',ipcPct:1.9})).toEqual({
      suggestedAmountCents:10190000n,
      ipcAlreadyApplied:false,
    });
  });

  function salaryTx(opts:{employees:unknown[];accrual?:unknown;recordInPeriod?:unknown}) {
    return {
      employee:{findMany:vi.fn(async()=>opts.employees)},
      salaryRecord:{
        findFirst:vi.fn(async()=>opts.recordInPeriod??null),
        create:vi.fn(async({data}:{data:Record<string,unknown>})=>({id:'sr-new',...data})),
        update:vi.fn(async({data}:{data:Record<string,unknown>})=>({id:'sr1',...data})),
      },
      movement:{
        findFirst:vi.fn(async()=>opts.accrual??null),
        create:vi.fn(async({data}:{data:unknown})=>data),
        update:vi.fn(async({data}:{data:Record<string,unknown>})=>({id:'m1',...data})),
      },
      auditLog:{create:vi.fn()},
    };
  }

  it('al cambiar de mes devenga el sueldo anterior más el IPC para todos',async()=>{
    const tx=salaryTx({employees:[{
      id:'emp-1',
      salaryRecords:[{id:'sr-july',amountCents:10000000n,effectiveFrom:new Date('2026-07-01T12:00:00-03:00')}],
    }]});
    const created=await applyDueSalaryAccruals(tx,{userId:'u1',now:august,ipcForSalaryPeriod});
    expect(created).toHaveLength(1);
    expect(tx.salaryRecord.create).toHaveBeenCalledOnce();
    const record=tx.salaryRecord.create.mock.calls[0][0].data as {amountCents:bigint;changeBps:number;reason:string};
    expect(record.amountCents).toBe(10190000n);
    expect(record.changeBps).toBe(190);
    expect(record.reason).toBe('IPC 06/2026');
    const movement=tx.movement.create.mock.calls[0][0].data as {kind:string;amountCents:bigint;status:string};
    expect(movement.kind).toBe('SALARY_ACCRUAL');
    expect(movement.amountCents).toBe(10190000n);
    expect(movement.status).toBe('APPLIED');
  });

  it('es idempotente: si ya hay sueldo devengado este mes, no crea otro',async()=>{
    const tx=salaryTx({
      employees:[{
        id:'emp-1',
        salaryRecords:[{id:'sr-aug',amountCents:10190000n,effectiveFrom:new Date('2026-08-01T12:00:00-03:00')}],
      }],
      accrual:{id:'m-aug',status:'APPLIED',amountCents:10190000n},
    });
    const created=await applyDueSalaryAccruals(tx,{userId:'u1',now:august,ipcForSalaryPeriod});
    expect(created).toHaveLength(0);
    expect(tx.salaryRecord.create).not.toHaveBeenCalled();
    expect(tx.movement.create).not.toHaveBeenCalled();
  });

  it('sin sueldo previo no inventa un sueldo',async()=>{
    const tx=salaryTx({employees:[{id:'emp-1',salaryRecords:[]}]});
    const created=await applyDueSalaryAccruals(tx,{userId:'u1',now:august,ipcForSalaryPeriod});
    expect(created).toHaveLength(0);
    expect(tx.salaryRecord.create).not.toHaveBeenCalled();
  });

  it('si no se abrió la app un mes, atrasa sueldo+IPC mes a mes',async()=>{
    const tx=salaryTx({employees:[{
      id:'emp-1',
      salaryRecords:[{id:'sr-june',amountCents:10000000n,effectiveFrom:new Date('2026-06-01T12:00:00-03:00')}],
    }]});
    const created=await applyDueSalaryAccruals(tx,{userId:'u1',now:august,ipcForSalaryPeriod});
    expect(created).toHaveLength(2);
    const amounts=(tx.salaryRecord.create.mock.calls as Array<[{data:{amountCents:bigint}}]>).map(call=>call[0].data.amountCents);
    expect(amounts).toEqual([10200000n,10393800n]);
  });

  it('no recrea un sueldo del mes si el movimiento está cancelado',async()=>{
    const tx=salaryTx({
      employees:[{
        id:'emp-1',
        salaryRecords:[{id:'sr-july',amountCents:10000000n,effectiveFrom:new Date('2026-07-01T12:00:00-03:00')}],
      }],
      accrual:{id:'m-cancelled',status:'CANCELLED',amountCents:10190000n},
    });
    const created=await applyDueSalaryAccruals(tx,{userId:'u1',now:august,ipcForSalaryPeriod});
    expect(created).toHaveLength(0);
    expect(tx.movement.create).not.toHaveBeenCalled();
  });

  it('al actualizar el sueldo del mes cambia el devengo, no crea otro',async()=>{
    const existingRecord={id:'sr1',previousAmountCents:10000000n,amountCents:10190000n};
    const tx=salaryTx({employees:[],accrual:{id:'m1',status:'APPLIED'}});
    tx.salaryRecord.findFirst=vi.fn(async()=>existingRecord);
    await upsertMonthlySalary(tx,{
      employeeId:'emp-1',
      userId:'u1',
      amountCents:11000000n,
      now:august,
      effectiveFrom:august,
    });
    expect(tx.movement.create).not.toHaveBeenCalled();
    expect(tx.salaryRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:'sr1'},
      data:expect.objectContaining({amountCents:11000000n}),
    }));
    expect(tx.movement.update).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:'m1'},
      data:expect.objectContaining({amountCents:11000000n}),
    }));
  });
});
