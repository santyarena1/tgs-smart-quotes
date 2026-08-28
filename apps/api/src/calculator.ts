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
  Req,
} from '@nestjs/common';
import {
  calculatorConfigInputSchema,
  idSchema,
  type CalculatorConfigInput,
} from '@tgs/contracts';
import {db, type CalculatorGroupKind} from '@tgs/database';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';
import {noteForKey, seedCalculatorGroups} from './calculator-seed.js';
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

function iconList(group: {iconUrl?: string | null; iconUrls?: string[] | null}): string[] {
  if (Array.isArray(group.iconUrls) && group.iconUrls.length) {
    return group.iconUrls.map((url) => normalizeCalculatorIconUrl(url) || '');
  }
  const one = normalizeCalculatorIconUrl(group.iconUrl);
  return one ? [one] : [];
}

function viewOf(group: {
  id: string;
  key: string;
  label: string;
  iconUrl: string | null;
  iconUrls?: string[];
  kind: CalculatorGroupKind;
  sortOrder: number;
  visible: boolean;
  note: string | null;
  plans: Array<{
    id: string;
    installments: number;
    interestBps: number;
    sortOrder: number;
    visible: boolean;
  }>;
}) {
  const iconUrls = iconList(group);
  return {
    id: group.id,
    key: group.key,
    label: group.label,
    iconUrl: iconUrls.find(Boolean) ?? null,
    iconUrls,
    kind: group.kind,
    sortOrder: group.sortOrder,
    visible: group.visible,
    note: group.note,
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
  keepIcons: Map<string, string[]>,
) {
  const company = await tx.companySettings.findUnique({where: {id: 'singleton'}});
  const financing = await tx.financingPlan.findMany({
    where: {active: true},
    orderBy: [{sortOrder: 'asc'}, {createdAt: 'asc'}],
  });
  const pdf = await tx.pdfSettings.findUnique({where: {id: 'singleton'}});
  const seeded = seedCalculatorGroups(company?.listInterestBps ?? 0, financing, {
    bbvaNote: pdf?.financingBbvaNote,
  });
  const created: Array<{
    id: string;
    key: string;
    label: string;
    iconUrl: string | null;
    iconUrls?: string[];
    kind: CalculatorGroupKind;
    sortOrder: number;
    visible: boolean;
    note: string | null;
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
        note: group.note,
        iconUrl: (keepIcons.get(group.key) ?? [])[0] ?? null,
        iconUrls: keepIcons.get(group.key) ?? [],
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

async function mergeCardBrandGroups() {
  const groups = await loadGroups();
  const extras = groups.filter((group) => group.key === 'visa' || group.key === 'mastercard');
  if (!extras.length) return groups;
  await db.$transaction(async (tx) => {
    let otros = groups.find((group) => group.key === 'otros-bancos');
    if (!otros) {
      const source = extras.find((group) => group.plans.length)?.plans ?? [];
      otros = await tx.calculatorGroup.create({
        data: {
          key: 'otros-bancos',
          label: 'Otros bancos',
          kind: 'PLAN',
          sortOrder: extras[0]!.sortOrder,
          visible: extras.some((group) => group.visible),
          note: extras.find((group) => group.note)?.note ?? noteForKey('otros-bancos'),
          plans: {
            create: source.map((plan, sortOrder) => ({
              installments: plan.installments,
              interestBps: plan.interestBps,
              sortOrder: plan.sortOrder ?? sortOrder,
              visible: plan.visible,
            })),
          },
        },
        include: {plans: true},
      });
    }
    const visa = extras.find((group) => group.key === 'visa');
    const master = extras.find((group) => group.key === 'mastercard');
    const current = iconList(otros);
    const iconUrls = [
      visa?.iconUrl || current[0] || '',
      master?.iconUrl || current[1] || '',
    ].filter(Boolean);
    await tx.calculatorGroup.update({
      where: {id: otros.id},
      data: {
        label: 'Otros bancos',
        iconUrl: iconUrls[0] ?? null,
        iconUrls,
      },
    });
    for (const extra of extras) {
      await tx.calculatorGroup.delete({where: {id: extra.id}});
    }
  });
  return loadGroups();
}

async function ensureSeeded() {
  const count = await db.calculatorGroup.count();
  if (count === 0) {
    return db.$transaction((tx) => persistSeeded(tx, new Map()));
  }
  let groups = await mergeCardBrandGroups();
  const missing = groups.filter((group) => group.note == null && noteForKey(group.key));
  if (!missing.length) return groups;
  const pdf = await db.pdfSettings.findUnique({where: {id: 'singleton'}});
  await db.$transaction(
    missing.map((group) =>
      db.calculatorGroup.update({
        where: {id: group.id},
        data: {note: noteForKey(group.key, pdf?.financingBbvaNote)},
      }),
    ),
  );
  return loadGroups();
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
              note: group.note === undefined ? old.note : (group.note?.trim() || ''),
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
              note: group.note?.trim() || null,
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
      const pdf = await tx.pdfSettings.findUnique({where: {id: 'singleton'}});
      const seeded = seedCalculatorGroups(company?.listInterestBps ?? 0, financing, {
        bbvaNote: pdf?.financingBbvaNote,
      });
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
                note: old.note ?? group.note,
                iconUrl: old.iconUrl,
                iconUrls: old.iconUrls ?? iconList(old),
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
                note: group.note,
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
    @Query('slot') slotRaw: string | undefined,
    @Req() req: {file?: () => Promise<{toBuffer: () => Promise<Buffer>; mimetype?: string} | null>},
    @CurrentUser() user: RequestUser,
  ) {
    if (typeof req.file !== 'function') {
      throw new BadRequestException('Upload multipart no disponible en el servidor');
    }
    const part = await req.file();
    if (!part) throw new BadRequestException('Seleccioná un icono');
    const saved = await saveCalculatorIcon(await part.toBuffer(), String(part.mimetype ?? ''));
    const slot = Number.parseInt(String(slotRaw ?? '0'), 10);
    const index = Number.isInteger(slot) && slot >= 0 && slot <= 5 ? slot : 0;
    return db.$transaction(async (tx) => {
      const old = await tx.calculatorGroup.findUnique({where: {id}, include: {plans: true}});
      if (!old) throw new NotFoundException('Medio de la calculadora inexistente');
      const iconUrls = iconList(old);
      while (iconUrls.length <= index) iconUrls.push('');
      const previous = iconUrls[index];
      if (previous && previous !== saved.url) await removeManagedCalculatorIcon(previous);
      iconUrls[index] = saved.url;
      const next = await tx.calculatorGroup.update({
        where: {id},
        data: {iconUrl: iconUrls.find(Boolean) ?? saved.url, iconUrls},
        include: {plans: true},
      });
      await audit(tx, user.id, id, 'ICON_UPLOAD', old, next);
      return viewOf(next);
    });
  }

  @Delete('groups/:id/icon')
  async clearIcon(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Query('slot') slotRaw: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.calculatorGroup.findUnique({where: {id}, include: {plans: true}});
      if (!old) throw new NotFoundException('Medio de la calculadora inexistente');
      const iconUrls = iconList(old);
      if (slotRaw === undefined) {
        for (const url of iconUrls) await removeManagedCalculatorIcon(url);
        const next = await tx.calculatorGroup.update({
          where: {id},
          data: {iconUrl: null, iconUrls: []},
          include: {plans: true},
        });
        await audit(tx, user.id, id, 'ICON_CLEAR', old, next);
        return viewOf(next);
      }
      const slot = Number.parseInt(String(slotRaw), 10);
      const index = Number.isInteger(slot) && slot >= 0 ? slot : 0;
      const previous = iconUrls[index];
      if (previous) await removeManagedCalculatorIcon(previous);
      if (old.key === 'otros-bancos') iconUrls[index] = '';
      else iconUrls.splice(index, 1);
      const nextUrls = old.key === 'otros-bancos' ? iconUrls : iconUrls.filter(Boolean);
      const next = await tx.calculatorGroup.update({
        where: {id},
        data: {iconUrl: nextUrls.find(Boolean) ?? null, iconUrls: nextUrls},
        include: {plans: true},
      });
      await audit(tx, user.id, id, 'ICON_CLEAR', old, next);
      return viewOf(next);
    });
  }
}
