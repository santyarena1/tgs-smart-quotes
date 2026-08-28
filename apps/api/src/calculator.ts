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
  Req,
} from '@nestjs/common';
import {
  calculatorConfigInputSchema,
  idSchema,
  type CalculatorConfigInput,
} from '@tgs/contracts';
import {db, type CalculatorGroupKind} from '@tgs/database';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';
import {seedCalculatorGroups} from './calculator-seed.js';
import {
  normalizeCalculatorIconUrl,
  removeManagedCalculatorIcon,
  saveCalculatorIcon,
} from './calculator-storage.js';

const audit = (
  tx: any,
  userId: string,
  entityId: string,
  action: string,
  previous: unknown,
  next: unknown,
) =>
  tx.auditLog.create({
    data: {
      userId,
      entityType: 'CalculatorGroup',
      entityId,
      action,
      previous: jsonSafe(previous),
      next: jsonSafe(next),
    },
  });

function viewOf(group: {
  id: string;
  key: string;
  label: string;
  iconUrl: string | null;
  kind: CalculatorGroupKind;
  sortOrder: number;
  visible: boolean;
  plans: Array<{
    id: string;
    installments: number;
    interestBps: number;
    sortOrder: number;
    visible: boolean;
  }>;
}) {
  return {
    id: group.id,
    key: group.key,
    label: group.label,
    iconUrl: normalizeCalculatorIconUrl(group.iconUrl),
    kind: group.kind,
    sortOrder: group.sortOrder,
    visible: group.visible,
    plans: [...group.plans]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.installments - b.installments)
      .map((plan) => ({
        id: plan.id,
        installments: plan.installments,
        interestBps: plan.interestBps,
        sortOrder: plan.sortOrder,
        visible: plan.visible,
      })),
  };
}

async function loadGroups() {
  return db.calculatorGroup.findMany({
    include: {plans: true},
    orderBy: [{sortOrder: 'asc'}, {createdAt: 'asc'}],
  });
}

async function persistSeeded(
  tx: any,
  keepIcons: Map<string, string | null>,
) {
  const company = await tx.companySettings.findUnique({where: {id: 'singleton'}});
  const financing = await tx.financingPlan.findMany({
    where: {active: true},
    orderBy: [{sortOrder: 'asc'}, {createdAt: 'asc'}],
  });
  const seeded = seedCalculatorGroups(company?.listInterestBps ?? 0, financing);
  const created: Array<{
    id: string;
    key: string;
    label: string;
    iconUrl: string | null;
    kind: CalculatorGroupKind;
    sortOrder: number;
    visible: boolean;
    plans: Array<{
      id: string;
      installments: number;
      interestBps: number;
      sortOrder: number;
      visible: boolean;
    }>;
  }> = [];
  for (const group of seeded) {
    const row = await tx.calculatorGroup.create({
      data: {
        key: group.key,
        label: group.label,
        kind: group.kind,
        sortOrder: group.sortOrder,
        visible: true,
        iconUrl: keepIcons.get(group.key) ?? null,
        plans: {
          create: group.plans.map((plan) => ({
            installments: plan.installments,
            interestBps: plan.interestBps,
            sortOrder: plan.sortOrder,
            visible: true,
          })),
        },
      },
      include: {plans: true},
    });
    created.push(row);
  }
  return created;
}

async function ensureSeeded() {
  const count = await db.calculatorGroup.count();
  if (count > 0) return loadGroups();
  return db.$transaction((tx) => persistSeeded(tx, new Map()));
}

@Controller('calculator')
export class CalculatorController {
  @Get()
  async list() {
    const groups = await ensureSeeded();
    return groups.map(viewOf);
  }

  @Put()
  async replace(
    @Body(new ZodPipe(calculatorConfigInputSchema)) body: CalculatorConfigInput,
    @CurrentUser() user: RequestUser,
  ) {
    await ensureSeeded();
    const keys = body.groups.map((group) => group.key);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Hay medios con la misma clave');
    }

    const saved = await db.$transaction(async (tx) => {
      const existing = await tx.calculatorGroup.findMany({include: {plans: true}});
      const incomingIds = new Set(body.groups.map((group) => group.id).filter(Boolean) as string[]);
      for (const old of existing) {
        if (incomingIds.has(old.id)) continue;
        await removeManagedCalculatorIcon(old.iconUrl);
        await tx.calculatorGroup.delete({where: {id: old.id}});
      }

      const nextGroups = [];
      for (const [index, group] of body.groups.entries()) {
        const sortOrder = group.sortOrder ?? index;
        if (group.id) {
          const old = existing.find((row) => row.id === group.id);
          if (!old) throw new NotFoundException('Medio de la calculadora inexistente');
          await tx.calculatorPlan.deleteMany({where: {groupId: old.id}});
          const next = await tx.calculatorGroup.update({
            where: {id: old.id},
            data: {
              key: group.key,
              label: group.label,
              kind: group.kind,
              sortOrder,
              visible: group.visible ?? true,
              plans: {
                create: group.plans.map((plan, planIndex) => ({
                  installments: plan.installments,
                  interestBps: plan.interestBps,
                  sortOrder: plan.sortOrder ?? planIndex,
                  visible: plan.visible ?? true,
                })),
              },
            },
            include: {plans: true},
          });
          await audit(tx, user.id, next.id, 'UPDATE', old, next);
          nextGroups.push(next);
        } else {
          const next = await tx.calculatorGroup.create({
            data: {
              key: group.key,
              label: group.label,
              kind: group.kind,
              sortOrder,
              visible: group.visible ?? true,
              plans: {
                create: group.plans.map((plan, planIndex) => ({
                  installments: plan.installments,
                  interestBps: plan.interestBps,
                  sortOrder: plan.sortOrder ?? planIndex,
                  visible: plan.visible ?? true,
                })),
              },
            },
            include: {plans: true},
          });
          await audit(tx, user.id, next.id, 'CREATE', null, next);
          nextGroups.push(next);
        }
      }
      return nextGroups.sort((a, b) => a.sortOrder - b.sortOrder);
    });

    return saved.map(viewOf);
  }

  @Post('reset')
  async resetFromFinancing(@CurrentUser() user: RequestUser) {
    const saved = await db.$transaction(async (tx) => {
      const company = await tx.companySettings.findUnique({where: {id: 'singleton'}});
      const financing = await tx.financingPlan.findMany({
        where: {active: true},
        orderBy: [{sortOrder: 'asc'}, {createdAt: 'asc'}],
      });
      const seeded = seedCalculatorGroups(company?.listInterestBps ?? 0, financing);
      const existing = await tx.calculatorGroup.findMany({include: {plans: true}});
      const byKey = new Map(existing.map((row) => [row.key, row]));
      const next: typeof existing = [];
      for (const group of seeded) {
        const old = byKey.get(group.key);
        const plans = {
          create: group.plans.map((plan) => ({
            installments: plan.installments,
            interestBps: plan.interestBps,
            sortOrder: plan.sortOrder,
            visible: true,
          })),
        };
        if (old) {
          await tx.calculatorPlan.deleteMany({where: {groupId: old.id}});
          next.push(
            await tx.calculatorGroup.update({
              where: {id: old.id},
              data: {
                label: group.label,
                kind: group.kind,
                sortOrder: group.sortOrder,
                plans,
              },
              include: {plans: true},
            }),
          );
        } else {
          next.push(
            await tx.calculatorGroup.create({
              data: {
                key: group.key,
                label: group.label,
                kind: group.kind,
                sortOrder: group.sortOrder,
                visible: true,
                plans,
              },
              include: {plans: true},
            }),
          );
        }
      }
      await audit(tx, user.id, 'all', 'RESET', existing, next);
      return next.sort((a, b) => a.sortOrder - b.sortOrder);
    });
    return saved.map(viewOf);
  }

  @Post('groups/:id/icon')
  async uploadIcon(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Req() req: {file?: () => Promise<{toBuffer: () => Promise<Buffer>; mimetype?: string} | null>},
    @CurrentUser() user: RequestUser,
  ) {
    if (typeof req.file !== 'function') {
      throw new BadRequestException('Upload multipart no disponible en el servidor');
    }
    const part = await req.file();
    if (!part) throw new BadRequestException('Seleccioná un icono');
    const saved = await saveCalculatorIcon(await part.toBuffer(), String(part.mimetype ?? ''));
    return db.$transaction(async (tx) => {
      const old = await tx.calculatorGroup.findUnique({where: {id}, include: {plans: true}});
      if (!old) throw new NotFoundException('Medio de la calculadora inexistente');
      if (old.iconUrl && old.iconUrl !== saved.url) {
        await removeManagedCalculatorIcon(old.iconUrl);
      }
      const next = await tx.calculatorGroup.update({
        where: {id},
        data: {iconUrl: saved.url},
        include: {plans: true},
      });
      await audit(tx, user.id, id, 'ICON_UPLOAD', old, next);
      return viewOf(next);
    });
  }

  @Delete('groups/:id/icon')
  async clearIcon(@Param('id', new ZodPipe(idSchema)) id: string, @CurrentUser() user: RequestUser) {
    return db.$transaction(async (tx) => {
      const old = await tx.calculatorGroup.findUnique({where: {id}, include: {plans: true}});
      if (!old) throw new NotFoundException('Medio de la calculadora inexistente');
      await removeManagedCalculatorIcon(old.iconUrl);
      const next = await tx.calculatorGroup.update({
        where: {id},
        data: {iconUrl: null},
        include: {plans: true},
      });
      await audit(tx, user.id, id, 'ICON_CLEAR', old, next);
      return viewOf(next);
    });
  }
}
