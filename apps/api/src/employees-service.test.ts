import {beforeEach,describe,expect,it,vi} from 'vitest';

vi.mock('@tgs/database',()=>({db:{}}));

import {balanceBreakdown,balanceFrom,movementKindForObligation,splitInstallments} from './employees-service.js';

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
