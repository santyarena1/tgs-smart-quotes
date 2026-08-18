import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {argon2id, hash} from 'argon2';
import {db} from '@tgs/database';
import {
  branchCreateSchema,
  branchUpdateSchema,
  idSchema,
  userCreateSchema,
  userUpdateSchema,
  type BranchCreateInput,
  type BranchUpdateInput,
  type UserCreateInput,
  type UserUpdateInput,
} from '@tgs/contracts';
import {CurrentUser, jsonSafe, Roles, type RequestUser, ZodPipe} from './infrastructure.js';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  branchId: true,
  branch: {select: {id: true, name: true}},
  active: true,
  lastAccessAt: true,
  createdAt: true,
} as const;

async function ensureBranch(branchId: string | null | undefined) {
  if (!branchId) return;
  if (!await db.branch.findUnique({where: {id: branchId}, select: {id: true}})) {
    throw new BadRequestException('La sucursal seleccionada no existe');
  }
}

@Roles('ADMIN')
@Controller('users')
export class UsersController {
  @Get()
  async list() {
    return jsonSafe({
      items: await db.user.findMany({
        select: userSelect,
        orderBy: [{active: 'desc'}, {displayName: 'asc'}, {username: 'asc'}],
      }),
    });
  }

  @Post()
  async create(
    @Body(new ZodPipe(userCreateSchema)) body: UserCreateInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await ensureBranch(body.branchId);
    const passwordHash = await hash(body.password, {type: argon2id});
    try {
      const user = await db.user.create({
        data: {
          username: body.username,
          displayName: body.displayName ?? null,
          passwordHash,
          role: body.role,
          branchId: body.branchId ?? null,
        },
        select: userSelect,
      });
      await db.auditLog.create({data: {userId: actor.id, entityType: 'User', entityId: user.id, action: 'CREATE'}});
      return jsonSafe(user);
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ese nombre de usuario ya existe');
      throw error;
    }
  }

  @Patch(':id')
  async update(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(userUpdateSchema)) body: UserUpdateInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const current = await db.user.findUnique({where: {id}, select: {id: true, role: true, active: true}});
    if (!current) throw new NotFoundException('Usuario inexistente');
    await ensureBranch(body.branchId);
    if (id === actor.id && body.active === false) {
      throw new BadRequestException('No podés desactivar tu propio usuario');
    }
    const removesActiveAdmin =
      current.active && current.role === 'ADMIN' &&
      (body.active === false || body.role === 'VENDEDOR');
    if (removesActiveAdmin && await db.user.count({where: {active: true, role: 'ADMIN'}}) <= 1) {
      throw new BadRequestException('Debe quedar al menos un administrador activo');
    }
    const {password, ...fields} = body;
    try {
      const user = await db.user.update({
        where: {id},
        data: {
          ...fields,
          ...(password ? {passwordHash: await hash(password, {type: argon2id})} : {}),
          ...(body.active === false ? {sessions: {deleteMany: {}}} : {}),
        },
        select: userSelect,
      });
      await db.auditLog.create({
        data: {userId: actor.id, entityType: 'User', entityId: id, action: 'UPDATE', metadata: {fields: Object.keys(body)}},
      });
      return jsonSafe(user);
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ese nombre de usuario ya existe');
      throw error;
    }
  }

  @Delete(':id')
  async deactivate(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.update(id, {active: false}, actor);
  }
}

@Controller('branches')
export class BranchesController {
  /** Sin @Roles: cualquier usuario logueado necesita esto para filtrar por local (quotes, dashboard). */
  @Get()
  async list() {
    return jsonSafe({
      items: await db.branch.findMany({
        include: {_count: {select: {users: true}}},
        orderBy: {name: 'asc'},
      }),
    });
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body(new ZodPipe(branchCreateSchema)) body: BranchCreateInput) {
    try {
      return jsonSafe(await db.branch.create({data: body}));
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ya existe una sucursal con ese nombre');
      throw error;
    }
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(branchUpdateSchema)) body: BranchUpdateInput,
  ) {
    try {
      return jsonSafe(await db.branch.update({where: {id}, data: body}));
    } catch (error: any) {
      if (error?.code === 'P2025') throw new NotFoundException('Sucursal inexistente');
      if (error?.code === 'P2002') throw new ConflictException('Ya existe una sucursal con ese nombre');
      throw error;
    }
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id', new ZodPipe(idSchema)) id: string) {
    const branch = await db.branch.findUnique({where: {id}, include: {_count: {select: {users: true}}}});
    if (!branch) throw new NotFoundException('Sucursal inexistente');
    if (branch._count.users) {
      throw new BadRequestException('No se puede eliminar una sucursal con usuarios asignados');
    }
    await db.branch.delete({where: {id}});
    return {ok: true};
  }
}
