import {Body, Controller, Get, NotFoundException, Param, Post, Query} from '@nestjs/common';
import {z} from 'zod';
import {db} from '@tgs/database';
import {idSchema, notificationMarkSchema, type NotificationMarkInput} from '@tgs/contracts';
import {audit} from './quotes.js';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';

// Sin contrato compartido específico para el listado (solo query de conveniencia); se valida acá.
const notificationListQuerySchema = z
  .object({
    unread: z.coerce.boolean().optional(),
    chatPhone: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  })
  .strict();
type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

@Controller('notifications')
export class NotificationsController {
  /** Notificaciones del usuario actual más las globales (`userId=null`, ej. alertas de chat). */
  @Get()
  async list(
    @Query(new ZodPipe(notificationListQuerySchema)) query: NotificationListQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    const rows = await db.notification.findMany({
      where: {
        OR: [{userId: actor.id}, {userId: null}],
        ...(query.unread ? {readAt: null} : {}),
        ...(query.chatPhone ? {chatPhone: query.chatPhone} : {}),
      },
      orderBy: [{createdAt: 'desc'}, {id: 'asc'}],
      take: query.limit,
    });
    return jsonSafe(rows);
  }

  @Post(':id/mark')
  async mark(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(notificationMarkSchema)) body: NotificationMarkInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.notification.findUnique({where: {id}});
      if (!old || (old.userId && old.userId !== actor.id)) {
        throw new NotFoundException('Notificación inexistente');
      }
      const now = new Date();
      const next = await tx.notification.update({
        where: {id},
        data: {
          readAt: body.read === undefined ? old.readAt : body.read ? now : null,
          actedAt: body.acted === undefined ? old.actedAt : body.acted ? now : null,
        },
      });
      await audit(tx, actor.id, 'Notification', id, 'MARK', old, next, {read: body.read, acted: body.acted});
      return jsonSafe(next);
    });
  }
}
