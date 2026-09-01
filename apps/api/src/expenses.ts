import {BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, UnauthorizedException} from '@nestjs/common';
import {db} from '@tgs/database';
import {expenseCreateSchema, expensePaymentSchema, expensesQuerySchema, expensesUnlockSchema, expenseUpdateSchema, idSchema, periodParamSchema, type ExpenseCreateInput, type ExpensePaymentInput, type ExpensesQuery, type ExpensesUnlockInput, type ExpenseUpdateInput} from '@tgs/contracts';
import {CurrentUser, jsonSafe, Roles, type RequestUser, ZodPipe} from './infrastructure.js';

/**
 * Gastos mensuales recurrentes.
 *
 * Un gasto es solo el concepto ("Alquiler", "Internet"): no tiene monto propio
 * ni se ajusta por IPC ni por nada. Cada mes se carga aparte lo que realmente
 * se pagó, y el módulo suma el total del período.
 *
 * Es solo para ADMIN, igual que Empleados, y además la pantalla pide una clave
 * antes de mostrarse (ver `unlock`).
 */

/** Período actual en formato YYYYMM. */
function periodoActual(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

const auditar = (tx: any, userId: string, entityId: string, action: string, previous: unknown, next: unknown, entityType = 'RecurringExpense') =>
  tx.auditLog.create({data: {userId, entityType, entityId, action, previous: previous == null ? null : jsonSafe(previous), next: next == null ? null : jsonSafe(next)}});

async function requerirGasto(id: string) {
  const gasto = await db.recurringExpense.findUnique({where: {id}});
  if (!gasto) throw new NotFoundException('Gasto inexistente');
  return gasto;
}

@Roles('ADMIN')
@Controller('expenses')
export class ExpensesController {
  /**
   * Clave de acceso al módulo. Es un candado liviano sobre una pantalla que ya
   * es solo de administradores: no reemplaza al login, solo evita que quede a
   * la vista de cualquiera que pase por al lado de la computadora.
   */
  @Post('unlock') async unlock(@Body(new ZodPipe(expensesUnlockSchema)) body: ExpensesUnlockInput) {
    const esperada = process.env.EXPENSES_KEY?.trim() || '123456';
    if (body.key !== esperada) throw new UnauthorizedException('Clave incorrecta');
    return {ok: true};
  }

  /**
   * Gastos con lo cargado en el período pedido (por defecto, el mes actual) y
   * el total del mes.
   */
  @Get() async list(@Query(new ZodPipe(expensesQuerySchema)) query: ExpensesQuery) {
    const period = query.period ?? periodoActual();
    const gastos = await db.recurringExpense.findMany({
      where: query.includeArchived === '1' ? {} : {active: true},
      orderBy: [{active: 'desc'}, {position: 'asc'}, {createdAt: 'asc'}],
      include: {payments: {where: {period}}},
    });
    const items = gastos.map(({payments, ...gasto}) => ({
      ...gasto,
      // `null` significa "todavía no lo cargué", que no es lo mismo que $0.
      amountCents: payments[0] ? payments[0].amountCents.toString() : null,
      paymentNote: payments[0]?.note ?? null,
    }));
    const totalCents = items.reduce((suma, item) => suma + BigInt(item.amountCents ?? '0'), 0n);
    const cargados = items.filter((item) => item.amountCents !== null).length;
    return jsonSafe({period, items, totalCents, cargados, pendientes: items.filter((i) => i.active).length - cargados});
  }

  /** Totales por mes, para ver la evolución del gasto fijo. */
  @Get('summary') async summary() {
    const pagos = await db.recurringExpensePayment.findMany({orderBy: {period: 'desc'}, select: {period: true, amountCents: true}});
    const porPeriodo = new Map<string, bigint>();
    for (const pago of pagos) porPeriodo.set(pago.period, (porPeriodo.get(pago.period) ?? 0n) + pago.amountCents);
    return jsonSafe({items: [...porPeriodo.entries()].map(([period, totalCents]) => ({period, totalCents})).slice(0, 24)});
  }

  @Post() async create(@Body(new ZodPipe(expenseCreateSchema)) body: ExpenseCreateInput, @CurrentUser() u: RequestUser) {
    const ultimo = await db.recurringExpense.findFirst({orderBy: {position: 'desc'}, select: {position: true}});
    return jsonSafe(await db.$transaction(async (tx) => {
      const gasto = await tx.recurringExpense.create({data: {name: body.name, note: body.note ?? null, position: (ultimo?.position ?? 0) + 1, createdById: u.id}});
      await auditar(tx, u.id, gasto.id, 'CREATE', null, gasto);
      return gasto;
    }));
  }

  @Put(':id') async update(@Param('id', new ZodPipe(idSchema)) id: string, @Body(new ZodPipe(expenseUpdateSchema)) body: ExpenseUpdateInput, @CurrentUser() u: RequestUser) {
    const old = await requerirGasto(id);
    return jsonSafe(await db.$transaction(async (tx) => {
      const gasto = await tx.recurringExpense.update({where: {id}, data: body});
      await auditar(tx, u.id, id, 'UPDATE', old, gasto);
      return gasto;
    }));
  }

  /**
   * Borra el gasto y todo su historial. La baja habitual es archivarlo
   * (`active: false`), que conserva lo ya pagado.
   */
  @Delete(':id') async remove(@Param('id', new ZodPipe(idSchema)) id: string, @CurrentUser() u: RequestUser) {
    const gasto = await requerirGasto(id);
    await db.$transaction(async (tx) => {
      await tx.recurringExpense.delete({where: {id}});
      await auditar(tx, u.id, id, 'DELETE', gasto, null);
    });
    return {ok: true};
  }

  /** Carga (o borra) lo pagado de un gasto en un mes. */
  @Put(':id/payments/:period') async setPayment(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Param('period', new ZodPipe(periodParamSchema)) period: string,
    @Body(new ZodPipe(expensePaymentSchema)) body: ExpensePaymentInput,
    @CurrentUser() u: RequestUser,
  ) {
    await requerirGasto(id);
    const anterior = await db.recurringExpensePayment.findUnique({where: {expenseId_period: {expenseId: id, period}}});

    // Sin importe se borra el registro: el mes queda "sin cargar" en vez de
    // quedar en $0, que significaría que ese mes no se pagó nada.
    if (body.amountCents === null) {
      if (anterior) {
        await db.$transaction(async (tx) => {
          await tx.recurringExpensePayment.delete({where: {id: anterior.id}});
          await auditar(tx, u.id, anterior.id, 'DELETE', anterior, null, 'RecurringExpensePayment');
        });
      }
      return jsonSafe({expenseId: id, period, amountCents: null});
    }

    const amountCents = BigInt(body.amountCents);
    if (amountCents < 0n) throw new BadRequestException('El importe no puede ser negativo');
    const pago = await db.$transaction(async (tx) => {
      const guardado = await tx.recurringExpensePayment.upsert({
        where: {expenseId_period: {expenseId: id, period}},
        create: {expenseId: id, period, amountCents, note: body.note ?? null},
        update: {amountCents, note: body.note ?? null},
      });
      await auditar(tx, u.id, guardado.id, anterior ? 'UPDATE' : 'CREATE', anterior, guardado, 'RecurringExpensePayment');
      return guardado;
    });
    return jsonSafe(pago);
  }
}
