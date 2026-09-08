/**
 * Endpoints de WhatsApp Cloud API: credenciales, webhook, bandeja del CRM,
 * envío manual y plantillas.
 *
 * El webhook es público y su autenticación ES la firma HMAC de Meta: sin
 * `appSecret` configurado se rechaza todo, nunca se acepta un evento sin verificar.
 */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {decryptSecret, encryptSecret, maskSecret} from '@tgs/config';
import {
  whatsappAssignSchema,
  whatsappCloudSettingsInputSchema,
  whatsappConversationsQuerySchema,
  whatsappMessagesQuerySchema,
  whatsappSendSchema,
  whatsappTemplateInputSchema,
  type WhatsappAssignInput,
  type WhatsappCloudSettingsInput,
  type WhatsappConversationsQuery,
  type WhatsappMessagesQuery,
  type WhatsappSendInput,
  type WhatsappTemplateInput,
} from '@tgs/contracts';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {CurrentUser, jsonSafe, Public, type RequestUser, Roles, SkipRateLimit, ZodPipe} from './infrastructure.js';
import {
  countTemplateVariables,
  listTemplates,
  loadCredentials,
  markAsRead,
  verifyNumber,
} from './whatsapp-client.js';
import {handleInboundMessage, handleStatusUpdate, loadRecentMessages, type MetaValue} from './whatsapp-inbound.js';
import {runChatbotResponse} from './chatbot-engine.js';
import {enqueueOutbound} from './whatsapp-outbound.js';
import {describeWindow, windowState} from './whatsapp-window.js';

/** El operador puede editar la sugerencia antes de aprobarla. */
const suggestionSendSchema = z.object({
  text: z.string().trim().min(1).max(4096).optional(),
}).strict();

const sendQuoteSchema = z.object({
  familyId: z.string().trim().min(1).max(200),
  version: z.number().int().min(1),
  kind: z.enum(['SIMPLE', 'DETALLADO']).default('SIMPLE'),
  message: z.string().trim().min(1).max(4096),
}).strict();
type SendQuoteInput = z.infer<typeof sendQuoteSchema>;

const sendProductSchema = z.object({
  mpn: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(1024),
}).strict();
type SendProductInput = z.infer<typeof sendProductSchema>;

/** Notificaciones que genera el chatbot y que quedan huérfanas al borrar un chat. */
const CHATBOT_NOTIFICATION_TYPES = [
  'CHATBOT_ESCALATION',
  'CHATBOT_SUGGESTION',
  'CHATBOT_REQUEST_CREATED',
];

/** Frase exacta que hay que tipear para confirmar la limpieza masiva. */
const PURGE_PHRASE = 'BORRAR TODO';

const purgeSchema = z.object({
  confirm: z.string().max(50),
}).strict();
type PurgeInput = z.infer<typeof purgeSchema>;

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  private settings() {
    return db.whatsappCloudSettings.findUnique({where: {id: 'singleton'}});
  }

  private settingsView(row: Awaited<ReturnType<WhatsappController['settings']>>) {
    const mask = (encrypted: string | null | undefined) => {
      if (!encrypted) return '';
      try {
        return maskSecret(decryptSecret(encrypted));
      } catch {
        // Un secreto que no descifra suele significar que cambió SETTINGS_ENC_KEY.
        return '••••';
      }
    };
    const apiBase = (process.env.API_PUBLIC_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
    return {
      id: 'singleton' as const,
      enabled: row?.enabled ?? false,
      phoneNumberId: row?.phoneNumberId ?? null,
      businessAccountId: row?.businessAccountId ?? null,
      apiVersion: row?.apiVersion ?? 'v21.0',
      webhookVerifyToken: row?.webhookVerifyToken ?? null,
      webhookUrl: `${apiBase}/whatsapp/webhook`,
      displayPhoneNumber: row?.displayPhoneNumber ?? null,
      verifiedName: row?.verifiedName ?? null,
      lastVerifiedAt: row?.lastVerifiedAt ?? null,
      accessTokenMasked: mask(row?.accessTokenEncrypted),
      appSecretMasked: mask(row?.appSecretEncrypted),
      hasAccessToken: Boolean(row?.accessTokenEncrypted),
      hasAppSecret: Boolean(row?.appSecretEncrypted),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  // ---------------------------------------------------------------- configuración

  @Get('settings')
  async getSettings(@CurrentUser() _user: RequestUser) {
    return jsonSafe(this.settingsView(await this.settings()));
  }

  @Put('settings')
  async putSettings(
    @Body(new ZodPipe(whatsappCloudSettingsInputSchema)) body: WhatsappCloudSettingsInput,
    @CurrentUser() _user: RequestUser,
  ) {
    const existing = await this.settings();
    const common = {
      enabled: body.enabled,
      phoneNumberId: body.phoneNumberId?.trim() || null,
      businessAccountId: body.businessAccountId?.trim() || null,
      apiVersion: body.apiVersion,
      // El token de verificación se autogenera una sola vez y después se conserva:
      // cambiarlo obligaría a reconfigurar el webhook en Meta.
      webhookVerifyToken: body.webhookVerifyToken?.trim()
        || existing?.webhookVerifyToken
        || randomBytes(24).toString('hex'),
    };
    const row = await db.whatsappCloudSettings.upsert({
      where: {id: 'singleton'},
      create: {
        ...common,
        accessTokenEncrypted: body.accessToken?.trim() ? encryptSecret(body.accessToken.trim()) : null,
        appSecretEncrypted: body.appSecret?.trim() ? encryptSecret(body.appSecret.trim()) : null,
      },
      update: {
        ...common,
        // Campo vacío = "no lo cambies". Así se puede editar la config sin reescribir secretos.
        ...(body.accessToken?.trim() ? {accessTokenEncrypted: encryptSecret(body.accessToken.trim())} : {}),
        ...(body.appSecret?.trim() ? {appSecretEncrypted: encryptSecret(body.appSecret.trim())} : {}),
      },
    });
    return jsonSafe(this.settingsView(row));
  }

  @Post('settings/verify')
  async verify(@CurrentUser() _user: RequestUser) {
    const credentials = await loadCredentials();
    const info = await verifyNumber(credentials);
    const row = await db.whatsappCloudSettings.update({
      where: {id: 'singleton'},
      data: {
        displayPhoneNumber: info.displayPhoneNumber,
        verifiedName: info.verifiedName,
        lastVerifiedAt: new Date(),
      },
    });
    return jsonSafe({...this.settingsView(row), qualityRating: info.qualityRating});
  }

  // ---------------------------------------------------------------------- webhook

  // Meta manda todos los webhooks desde pocas IPs y en ráfagas: el rate limit por IP
  // los rechazaría con 429 y se perderían mensajes. La autenticación acá es la firma HMAC.
  @SkipRateLimit()
  @Public()
  @Get('webhook')
  async verifyWebhook(@Query() query: Record<string, string | undefined>, @Res() reply: any) {
    const row = await this.settings();
    if (
      query['hub.mode'] === 'subscribe'
      && Boolean(row?.webhookVerifyToken)
      && query['hub.verify_token'] === row?.webhookVerifyToken
    ) {
      return reply.status(200).type('text/plain').send(query['hub.challenge'] ?? '');
    }
    return reply.status(403).type('text/plain').send('Forbidden');
  }

  /**
   * Recepción de eventos.
   *
   * Se responde 200 de inmediato y el procesamiento sigue en segundo plano:
   * si tardamos, Meta reintenta y llegan duplicados. La idempotencia por
   * `message.id` cubre igual el caso, pero conviene no provocarlo.
   */
  @SkipRateLimit()
  @Public()
  @Post('webhook')
  async receiveWebhook(
    @Req() req: any,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Res() reply: any,
  ) {
    const row = await this.settings();
    if (!row?.appSecretEncrypted || !this.validSignature(req.rawBody, signature, row.appSecretEncrypted)) {
      throw new UnauthorizedException('Firma de Meta inválida');
    }
    reply.status(200).send({ok: true});
    void this.processWebhookBody(req.body).catch((error: unknown) => {
      this.logger.error(JSON.stringify({
        event: 'whatsapp_webhook_processing_failed',
        error: error instanceof Error ? error.message : String(error),
      }));
    });
  }

  private async processWebhookBody(body: any): Promise<void> {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value as MetaValue | undefined;
        if (!value) continue;
        for (const message of value.messages ?? []) {
          try {
            await handleInboundMessage(value, message);
          } catch (error) {
            this.logger.error(JSON.stringify({
              event: 'whatsapp_inbound_message_failed',
              waMessageId: message.id,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        }
        for (const status of value.statuses ?? []) {
          try {
            await handleStatusUpdate(status);
          } catch (error) {
            this.logger.error(JSON.stringify({
              event: 'whatsapp_status_update_failed',
              waMessageId: status.id,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        }
      }
    }
  }

  private validSignature(rawBody: Buffer | undefined, signature: string | undefined, encryptedSecret: string) {
    if (!rawBody || !signature?.startsWith('sha256=')) return false;
    try {
      const received = Buffer.from(signature.slice(7), 'hex');
      const expected = createHmac('sha256', decryptSecret(encryptedSecret)).update(rawBody).digest();
      // Comparación en tiempo constante: una comparación normal filtra la firma byte a byte.
      return received.length === expected.length && timingSafeEqual(received, expected);
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ bandeja CRM

  @Get('conversations')
  async conversations(
    @Query(new ZodPipe(whatsappConversationsQuerySchema)) query: WhatsappConversationsQuery,
    @CurrentUser() user: RequestUser,
  ) {
    const now = new Date();
    const where: Prisma.ChatbotConversationWhereInput = {};
    if (query.filter === 'NO_LEIDAS') where.unreadCount = {gt: 0};
    if (query.filter === 'ESCALADAS') where.escalatedAt = {not: null};
    if (query.filter === 'MIAS') where.assignedUserId = user.id;
    if (query.filter === 'VENTANA_ABIERTA') where.windowExpiresAt = {gt: now};
    if (query.q) {
      where.OR = [
        {displayName: {contains: query.q, mode: 'insensitive'}},
        {waContactName: {contains: query.q, mode: 'insensitive'}},
        {chatKey: {contains: query.q}},
        {lastInboundText: {contains: query.q, mode: 'insensitive'}},
      ];
    }

    const rows = await db.chatbotConversation.findMany({
      where,
      orderBy: {updatedAt: 'desc'},
      take: query.limit + 1,
      ...(query.cursor ? {skip: 1, cursor: {chatKey: query.cursor}} : {}),
      include: {
        assignedUser: {select: {id: true, username: true, displayName: true}},
        activeRequest: {select: {id: true, title: true, state: true}},
      },
    });
    const items = rows.slice(0, query.limit);
    return jsonSafe({
      items: items.map((row) => this.conversationView(row, now)),
      nextCursor: rows.length > query.limit ? items[items.length - 1]?.chatKey ?? null : null,
    });
  }

  private conversationView(row: any, now: Date) {
    const state = windowState(row.windowExpiresAt, now);
    return {
      chatKey: row.chatKey,
      displayName: row.displayName,
      waContactName: row.waContactName,
      waId: row.waId,
      lastInboundText: row.lastInboundText,
      lastInboundAt: row.lastInboundAt,
      lastOutboundText: row.lastOutboundText,
      lastOutboundAt: row.lastOutboundAt,
      unreadCount: row.unreadCount,
      escalatedAt: row.escalatedAt,
      escalationReason: row.escalationReason,
      modeOverride: row.modeOverride,
      assignedUser: row.assignedUser ?? null,
      activeRequest: row.activeRequest ?? null,
      updatedAt: row.updatedAt,
      window: {
        open: state.open,
        expiresAt: state.expiresAt,
        remainingMs: state.remainingMs,
        description: describeWindow(state),
      },
    };
  }

  @Get('conversations/:chatKey')
  async conversation(@Param('chatKey') chatKey: string, @CurrentUser() _user: RequestUser) {
    const row = await db.chatbotConversation.findUnique({
      where: {chatKey},
      include: {
        assignedUser: {select: {id: true, username: true, displayName: true}},
        activeRequest: {select: {id: true, title: true, state: true}},
      },
    });
    if (!row) throw new NotFoundException('La conversación no existe');
    return jsonSafe(this.conversationView(row, new Date()));
  }

  @Get('conversations/:chatKey/messages')
  async messages(
    @Param('chatKey') chatKey: string,
    @Query(new ZodPipe(whatsappMessagesQuerySchema)) query: WhatsappMessagesQuery,
    @CurrentUser() _user: RequestUser,
  ) {
    const rows = await db.chatbotMessageLog.findMany({
      where: {conversationKey: chatKey},
      orderBy: {createdAt: 'desc'},
      take: query.limit + 1,
      ...(query.before ? {skip: 1, cursor: {id: query.before}} : {}),
    });
    const items = rows.slice(0, query.limit);
    return jsonSafe({
      // Se devuelven en orden cronológico, que es como los lee la conversación.
      items: items.slice().reverse(),
      nextCursor: rows.length > query.limit ? items[items.length - 1]?.id ?? null : null,
    });
  }

  @Post('conversations/:chatKey/read')
  async markRead(@Param('chatKey') chatKey: string, @CurrentUser() _user: RequestUser) {
    const before = await db.chatbotConversation.findUnique({
      where: {chatKey},
      select: {unreadCount: true},
    });
    if (!before) throw new NotFoundException('La conversación no existe');
    const conversation = await db.chatbotConversation.update({
      where: {chatKey},
      data: {unreadCount: 0, lastReadAt: new Date()},
    });
    // Solo se le avisa a Meta si de verdad había algo sin leer: abrir un chat ya
    // leído no debería gastar una llamada a la API en cada clic.
    if (before.unreadCount === 0) {
      return jsonSafe({chatKey: conversation.chatKey, unreadCount: 0});
    }
    // Además del contador interno, se le avisa a Meta para que el cliente vea el tilde azul.
    const lastInbound = await db.chatbotMessageLog.findFirst({
      where: {conversationKey: chatKey, direction: 'INBOUND', waMessageId: {not: null}},
      orderBy: {createdAt: 'desc'},
      select: {waMessageId: true},
    });
    if (lastInbound?.waMessageId) {
      try {
        await markAsRead(await loadCredentials(), lastInbound.waMessageId);
      } catch (error) {
        // No poder avisarle a Meta no debe romper la acción del operador.
        this.logger.warn(JSON.stringify({
          event: 'whatsapp_mark_read_failed',
          chatKey,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    return jsonSafe({chatKey: conversation.chatKey, unreadCount: conversation.unreadCount});
  }

  @Post('conversations/:chatKey/assign')
  async assign(
    @Param('chatKey') chatKey: string,
    @Body(new ZodPipe(whatsappAssignSchema)) body: WhatsappAssignInput,
    @CurrentUser() _user: RequestUser,
  ) {
    const row = await db.chatbotConversation.update({
      where: {chatKey},
      data: {assignedUserId: body.assignedUserId},
      include: {assignedUser: {select: {id: true, username: true, displayName: true}}},
    });
    return jsonSafe({chatKey: row.chatKey, assignedUser: row.assignedUser});
  }

  // ------------------------------------------------------------------- borrado CRM

  /**
   * Borra una conversación con todo su historial.
   *
   * Los mensajes y la cola de salida caen por cascada; las notificaciones del chat
   * se borran a mano porque no tienen clave foránea. Las solicitudes y presupuestos
   * que hayan salido de la conversación NO se tocan: son datos comerciales.
   *
   * Es irreversible, así que queda registrado en AuditLog con lo que se borró.
   */
  @Delete('conversations/:chatKey')
  async deleteConversation(@Param('chatKey') chatKey: string, @CurrentUser() actor: RequestUser) {
    const conversation = await db.chatbotConversation.findUnique({where: {chatKey}});
    if (!conversation) throw new NotFoundException('La conversación no existe');

    const result = await db.$transaction(async (tx) => {
      const messages = await tx.chatbotMessageLog.count({where: {conversationKey: chatKey}});
      const notifications = await tx.notification.deleteMany({
        where: {chatPhone: chatKey, type: {in: CHATBOT_NOTIFICATION_TYPES}},
      });
      await tx.chatbotConversation.delete({where: {chatKey}});
      await tx.auditLog.create({data: {
        userId: actor.id,
        entityType: 'ChatbotConversation',
        entityId: chatKey,
        action: 'DELETE',
        previous: jsonSafe(conversation),
        next: Prisma.JsonNull,
      }});
      return {messages, notifications: notifications.count};
    });
    return jsonSafe({chatKey, deleted: result});
  }

  /**
   * Limpieza masiva: borra TODAS las conversaciones y las notificaciones del chatbot.
   *
   * Pensada para dejar el CRM en cero antes de conectar Cloud API, sacando lo que
   * quedó de la etapa de la extensión. Exige rol ADMIN y confirmación escrita para
   * que no pueda dispararse por accidente ni desde una llamada suelta.
   */
  @Roles('ADMIN')
  @Post('conversations/purge')
  async purgeConversations(
    @Body(new ZodPipe(purgeSchema)) body: PurgeInput,
    @CurrentUser() actor: RequestUser,
  ) {
    if (body.confirm !== PURGE_PHRASE) {
      throw new BadRequestException(`Para confirmar hay que escribir exactamente "${PURGE_PHRASE}".`);
    }
    const result = await db.$transaction(async (tx) => {
      const conversations = await tx.chatbotConversation.count();
      const messages = await tx.chatbotMessageLog.count();
      const notifications = await tx.notification.deleteMany({
        where: {type: {in: CHATBOT_NOTIFICATION_TYPES}},
      });
      // Los mensajes y la cola caen por cascada desde la conversación.
      await tx.chatbotConversation.deleteMany({});
      await tx.auditLog.create({data: {
        userId: actor.id,
        entityType: 'ChatbotConversation',
        entityId: 'purge',
        action: 'PURGE',
        previous: jsonSafe({conversations, messages, notifications: notifications.count}),
        next: Prisma.JsonNull,
      }});
      return {conversations, messages, notifications: notifications.count};
    });
    this.logger.warn(JSON.stringify({event: 'whatsapp_conversations_purged', by: actor.id, ...result}));
    return jsonSafe({deleted: result});
  }

  // -------------------------------------------------------------------- envío CRM

  @Post('conversations/:chatKey/send')
  async send(
    @Param('chatKey') chatKey: string,
    @Body(new ZodPipe(whatsappSendSchema)) body: WhatsappSendInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const conversation = await db.chatbotConversation.findUnique({where: {chatKey}});
    if (!conversation) throw new NotFoundException('La conversación no existe');

    const state = windowState(conversation.windowExpiresAt);
    // Se bloquea ANTES de intentar: no mandamos a Meta algo que sabemos que va a fallar.
    if (!state.open && !body.templateId) {
      throw new ConflictException(
        'La ventana de 24 h está cerrada. Solo se puede enviar una plantilla aprobada por Meta.',
      );
    }

    const text = body.text?.trim();
    const log = await db.chatbotMessageLog.create({data: {
      conversationKey: chatKey,
      direction: 'OUTBOUND',
      actor: 'HUMAN',
      status: 'SEND_PENDING',
      channel: 'CLOUD_API',
      text: text ?? (body.templateId ? '[plantilla]' : '[presupuesto]'),
      decisionMetadata: {manual: true, sentByUserId: actor.id},
    }});

    const items = [] as Parameters<typeof enqueueOutbound>[2];
    if (text) items.push({kind: 'TEXT', payload: {text}});
    if (body.templateId) {
      items.push({kind: 'TEMPLATE', payload: {templateId: body.templateId, variables: body.templateVariables ?? []}});
    }
    if (body.quote) {
      items.push({
        kind: 'DOCUMENT',
        payload: {quote: {familyId: body.quote.familyId, version: body.quote.version}, label: 'presupuesto'},
        delaySeconds: 1,
      });
    }
    await enqueueOutbound(chatKey, log.id, items);
    return jsonSafe({logId: log.id, queued: items.length});
  }

  /**
   * Aprueba una sugerencia del bot y la envía.
   *
   * Es el modo `SUGGEST`: el bot redacta, una persona revisa y decide. Antes esto
   * pasaba insertando el texto en el composer de WhatsApp Web y esperando a que el
   * vendedor tocara Enviar; ahora el CRM lo manda directo y lo registra sin ambigüedad.
   * El texto se puede editar antes de enviar.
   */
  @Post('suggestions/:logId/send')
  async sendSuggestion(
    @Param('logId') logId: string,
    @Body(new ZodPipe(suggestionSendSchema)) body: {text?: string},
    @CurrentUser() actor: RequestUser,
  ) {
    const log = await db.chatbotMessageLog.findUnique({where: {id: logId}});
    if (!log) throw new NotFoundException('La sugerencia no existe');
    if (log.direction !== 'OUTBOUND' || log.status !== 'SUGGESTED') {
      throw new ConflictException('Esa sugerencia ya fue enviada o descartada.');
    }

    const conversation = await db.chatbotConversation.findUnique({where: {chatKey: log.conversationKey}});
    if (!conversation) throw new NotFoundException('La conversación no existe');
    if (!windowState(conversation.windowExpiresAt).open) {
      throw new ConflictException(
        'La ventana de 24 h está cerrada: esta sugerencia ya no se puede enviar como texto libre.',
      );
    }

    const text = body.text?.trim() || log.text;
    if (!text) throw new BadRequestException('La sugerencia no tiene texto para enviar.');

    const updated = await db.chatbotMessageLog.update({
      where: {id: logId},
      data: {
        text,
        status: 'SEND_PENDING',
        // Se registra como humana: la decisión de enviar la tomó una persona.
        actor: 'HUMAN',
        decisionMetadata: {
          ...((log.decisionMetadata ?? {}) as Record<string, unknown>),
          approvedByUserId: actor.id,
          editedBeforeSending: text !== log.text,
        } as Prisma.InputJsonValue,
      },
    });
    await enqueueOutbound(log.conversationKey, updated.id, [{kind: 'TEXT', payload: {text}}]);
    return jsonSafe({logId: updated.id, text});
  }

  @Post('suggestions/:logId/dismiss')
  async dismissSuggestion(@Param('logId') logId: string, @CurrentUser() actor: RequestUser) {
    const log = await db.chatbotMessageLog.findUnique({where: {id: logId}});
    if (!log) throw new NotFoundException('La sugerencia no existe');
    if (log.status !== 'SUGGESTED') throw new ConflictException('Esa sugerencia ya fue resuelta.');
    const updated = await db.chatbotMessageLog.update({
      where: {id: logId},
      data: {
        status: 'DISMISSED',
        decisionMetadata: {
          ...((log.decisionMetadata ?? {}) as Record<string, unknown>),
          dismissedByUserId: actor.id,
        } as Prisma.InputJsonValue,
      },
    });
    return jsonSafe({logId: updated.id, status: updated.status});
  }

  /**
   * Recontacto por plantilla.
   *
   * Los recontactos buscan conversaciones de hace `recontactDays` (30 por defecto),
   * así que caen siempre fuera de la ventana de 24 h: el texto libre generado por IA
   * que usaba la extensión ya no puede salir. Se reemplaza por una plantilla aprobada
   * con variables, conservando los topes y el opt-out que ya existían.
   */
  @Post('conversations/:chatKey/recontact')
  async recontact(
    @Param('chatKey') chatKey: string,
    @Body(new ZodPipe(whatsappSendSchema)) body: WhatsappSendInput,
    @CurrentUser() actor: RequestUser,
  ) {
    if (!body.templateId) {
      throw new BadRequestException('Un recontacto requiere una plantilla aprobada por Meta.');
    }
    const settings = await db.chatbotSettings.findUniqueOrThrow({
      where: {id: 'singleton'},
      select: {recontactEnabled: true, recontactMaxAttempts: true},
    });
    if (!settings.recontactEnabled) throw new ConflictException('Los recontactos están desactivados.');

    const conversation = await db.chatbotConversation.findUnique({where: {chatKey}});
    if (!conversation) throw new NotFoundException('La conversación no existe');
    if (conversation.recontactOptOut) throw new ConflictException('La conversación rechazó recontactos.');
    if (conversation.recontactCount >= settings.recontactMaxAttempts) {
      throw new ConflictException(
        `Se alcanzó el máximo de ${settings.recontactMaxAttempts} recontactos para esta conversación.`,
      );
    }

    const template = await db.whatsappTemplate.findUnique({where: {id: body.templateId}});
    if (!template) throw new NotFoundException('La plantilla no existe');
    if (template.status !== 'APPROVED') {
      throw new ConflictException(`La plantilla "${template.name}" todavía no está aprobada por Meta.`);
    }
    const variables = body.templateVariables ?? [];
    if (variables.length !== template.variableCount) {
      throw new BadRequestException(
        `La plantilla espera ${template.variableCount} variables y llegaron ${variables.length}.`,
      );
    }

    // El contador se incrementa condicionalmente para que dos pedidos simultáneos
    // no puedan pasarse del máximo configurado.
    const claimed = await db.chatbotConversation.updateMany({
      where: {chatKey, recontactOptOut: false, recontactCount: {lt: settings.recontactMaxAttempts}},
      data: {recontactCount: {increment: 1}, lastRecontactAt: new Date()},
    });
    if (claimed.count === 0) throw new ConflictException('El recontacto no pudo registrarse: cambió el estado de la conversación.');

    const preview = template.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index) => variables[Number(index) - 1] ?? '');
    const log = await db.chatbotMessageLog.create({data: {
      conversationKey: chatKey,
      direction: 'OUTBOUND',
      actor: 'HUMAN',
      status: 'SEND_PENDING',
      channel: 'CLOUD_API',
      text: preview,
      decisionMetadata: {
        recontact: true,
        recontactAttempt: conversation.recontactCount + 1,
        templateName: template.name,
        sentByUserId: actor.id,
      },
    }});
    await enqueueOutbound(chatKey, log.id, [
      {kind: 'TEMPLATE', payload: {templateId: template.id, variables}},
    ]);
    return jsonSafe({logId: log.id, template: template.name, preview});
  }

  /**
   * Envía un presupuesto: mensaje de presentación + PDF adjunto.
   *
   * El PDF tiene que estar generado. No se genera acá porque su encabezado depende
   * del local desde el que se imprime, y adivinarlo cambiaría el documento; el CRM
   * lo genera antes con los endpoints de siempre.
   */
  @Post('conversations/:chatKey/send-quote')
  async sendQuote(
    @Param('chatKey') chatKey: string,
    @Body(new ZodPipe(sendQuoteSchema)) body: SendQuoteInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const conversation = await db.chatbotConversation.findUnique({where: {chatKey}});
    if (!conversation) throw new NotFoundException('La conversación no existe');
    if (!windowState(conversation.windowExpiresAt).open) {
      throw new ConflictException('La ventana de 24 h está cerrada: no se puede adjuntar un presupuesto.');
    }
    const family = await db.quoteFamily.findUnique({
      where: {id: body.familyId},
      select: {id: true, visibleNumber: true},
    });
    if (!family) throw new NotFoundException('El presupuesto no existe');

    const log = await db.chatbotMessageLog.create({data: {
      conversationKey: chatKey,
      direction: 'OUTBOUND',
      actor: 'HUMAN',
      status: 'SEND_PENDING',
      channel: 'CLOUD_API',
      text: body.message,
      decisionMetadata: {
        manual: true,
        sentByUserId: actor.id,
        quote: {familyId: family.id, version: body.version, kind: body.kind},
      } as Prisma.InputJsonValue,
    }});

    await enqueueOutbound(chatKey, log.id, [
      {kind: 'TEXT', payload: {text: body.message}},
      {
        kind: 'DOCUMENT',
        payload: {
          quote: {familyId: family.id, version: body.version, kind: body.kind},
          filename: `${family.visibleNumber}-V${body.version}-${body.kind}.pdf`,
          label: `presupuesto ${family.visibleNumber} V${body.version}`,
        },
        delaySeconds: 1,
      },
    ]);

    // Queda asociado al chat para que la barra del CRM lo muestre al volver.
    await db.chatbotConversation.update({
      where: {chatKey},
      data: {lastQuoteFamilyId: family.id, lastQuoteVersion: body.version},
    });
    return jsonSafe({logId: log.id, visibleNumber: family.visibleNumber});
  }

  /** Envía un producto del catálogo: foto + texto con nombre y precio. */
  @Post('conversations/:chatKey/send-product')
  async sendProduct(
    @Param('chatKey') chatKey: string,
    @Body(new ZodPipe(sendProductSchema)) body: SendProductInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const conversation = await db.chatbotConversation.findUnique({where: {chatKey}});
    if (!conversation) throw new NotFoundException('La conversación no existe');
    if (!windowState(conversation.windowExpiresAt).open) {
      throw new ConflictException('La ventana de 24 h está cerrada: no se puede enviar un producto.');
    }
    const product = await db.acustockProduct.findUnique({
      where: {mpn: body.mpn},
      select: {mpn: true, title: true, imageUrl: true},
    });
    if (!product) throw new NotFoundException('El producto no existe en el catálogo');

    const log = await db.chatbotMessageLog.create({data: {
      conversationKey: chatKey,
      direction: 'OUTBOUND',
      actor: 'HUMAN',
      status: 'SEND_PENDING',
      channel: 'CLOUD_API',
      text: body.text,
      decisionMetadata: {manual: true, sentByUserId: actor.id, productMpn: product.mpn} as Prisma.InputJsonValue,
    }});

    // Con imagen va en una sola burbuja con pie de foto; sin imagen, solo texto.
    await enqueueOutbound(chatKey, log.id, product.imageUrl
      ? [{kind: 'IMAGE', payload: {productMpn: product.mpn, caption: body.text, label: `producto ${product.title}`}}]
      : [{kind: 'TEXT', payload: {text: body.text}}]);
    return jsonSafe({logId: log.id, product: product.title});
  }

  /**
   * Genera una sugerencia a pedido sobre el último mensaje del cliente.
   *
   * Es el botón "Sugerir" de la barra de la extensión. El loop nunca sugiere solo
   * en modo SUGGEST: siempre es una acción deliberada de una persona.
   */
  @Post('conversations/:chatKey/suggest')
  async suggest(@Param('chatKey') chatKey: string, @CurrentUser() actor: RequestUser) {
    const lastInbound = await db.chatbotMessageLog.findFirst({
      where: {conversationKey: chatKey, direction: 'INBOUND'},
      orderBy: {createdAt: 'desc'},
      select: {text: true, decisionMetadata: true},
    });
    if (!lastInbound) throw new ConflictException('La conversación no tiene mensajes del cliente para responder.');

    const conversation = await db.chatbotConversation.findUnique({where: {chatKey}, select: {displayName: true}});
    const metadata = (lastInbound.decisionMetadata ?? {}) as Record<string, unknown>;
    const messageType = metadata.messageType === 'AUDIO' ? 'AUDIO' as const : 'TEXT' as const;
    const settings = await db.chatbotSettings.findUniqueOrThrow({
      where: {id: 'singleton'},
      select: {maxRecentSnippets: true},
    });

    const result = await runChatbotResponse({
      chatKey,
      displayName: conversation?.displayName ?? undefined,
      message: lastInbound.text,
      messageType,
      // Sufijo único: regenerar a pedido no debe chocar con el índice de deduplicación.
      messageFingerprint: `manual:${chatKey}:${Date.now()}`,
      manualSuggestion: true,
      simulation: false,
      recentMessages: await loadRecentMessages(chatKey, settings.maxRecentSnippets),
    }, actor.id);
    return jsonSafe(result);
  }

  // ------------------------------------------------------------------- plantillas

  @Get('templates')
  async templates(@CurrentUser() _user: RequestUser) {
    return jsonSafe(await db.whatsappTemplate.findMany({orderBy: [{status: 'asc'}, {name: 'asc'}]}));
  }

  @Post('templates')
  async createTemplate(
    @Body(new ZodPipe(whatsappTemplateInputSchema)) body: WhatsappTemplateInput,
    @CurrentUser() _user: RequestUser,
  ) {
    const row = await db.whatsappTemplate.upsert({
      where: {name_language: {name: body.name, language: body.language}},
      create: {...body, variableCount: countTemplateVariables(body.body)},
      update: {...body, variableCount: countTemplateVariables(body.body)},
    });
    return jsonSafe(row);
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string, @CurrentUser() _user: RequestUser) {
    await db.whatsappTemplate.delete({where: {id}}).catch(() => {
      throw new NotFoundException('La plantilla no existe');
    });
    return {ok: true};
  }

  /**
   * Trae de Meta el estado real de las plantillas.
   *
   * El cuerpo y el estado los manda Meta: acá solo se conservan los campos internos
   * (`usageHint`, `useForRecontact`) que no existen del otro lado.
   */
  @Post('templates/sync')
  async syncTemplates(@CurrentUser() _user: RequestUser) {
    const settings = await this.settings();
    if (!settings?.businessAccountId) {
      throw new BadRequestException('Falta configurar el Business Account ID para sincronizar plantillas.');
    }
    const credentials = await loadCredentials();
    const remote = await listTemplates(credentials, settings.businessAccountId);
    let updated = 0;
    for (const template of remote) {
      await db.whatsappTemplate.upsert({
        where: {name_language: {name: template.name, language: template.language}},
        create: {...template, lastSyncedAt: new Date()},
        update: {
          status: template.status,
          category: template.category,
          body: template.body,
          variableCount: template.variableCount,
          lastSyncedAt: new Date(),
        },
      });
      updated += 1;
    }
    return jsonSafe({synced: updated});
  }
}
