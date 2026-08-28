import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Logger,
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
  whatsappCloudSettingsInputSchema,
  type WhatsappCloudSettingsInput,
} from '@tgs/contracts';
import {db} from '@tgs/database';
import {normalizePhone} from '@tgs/validation';
import {z} from 'zod';
import {CurrentUser, jsonSafe, Public, type RequestUser, ZodPipe} from './infrastructure.js';

const sendTestSchema = z.object({
  to: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(4096),
}).strict();
type SendTestInput = z.infer<typeof sendTestSchema>;

type MetaMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: {body?: string};
};
type MetaValue = {
  contacts?: Array<{wa_id?: string; profile?: {name?: string}}>;
  messages?: MetaMessage[];
};

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  private async settings() {
    return db.whatsappCloudSettings.findUnique({where: {id: 'singleton'}});
  }

  private settingsView(row: Awaited<ReturnType<WhatsappController['settings']>>) {
    let accessTokenMasked = '';
    let appSecretMasked = '';
    if (row?.accessTokenEncrypted) {
      try { accessTokenMasked = maskSecret(decryptSecret(row.accessTokenEncrypted)); } catch { accessTokenMasked = '••••'; }
    }
    if (row?.appSecretEncrypted) {
      try { appSecretMasked = maskSecret(decryptSecret(row.appSecretEncrypted)); } catch { appSecretMasked = '••••'; }
    }
    const apiBase = (process.env.API_PUBLIC_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
    return {
      id: 'singleton' as const,
      enabled: row?.enabled ?? false,
      phoneNumberId: row?.phoneNumberId ?? null,
      businessAccountId: row?.businessAccountId ?? null,
      apiVersion: row?.apiVersion ?? 'v21.0',
      webhookVerifyToken: row?.webhookVerifyToken ?? null,
      webhookUrl: `${apiBase}/whatsapp/webhook`,
      accessTokenMasked,
      appSecretMasked,
      hasAccessToken: Boolean(row?.accessTokenEncrypted),
      hasAppSecret: Boolean(row?.appSecretEncrypted),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  @Get('settings')
  async getSettings(@CurrentUser() _user: RequestUser) {
    return this.settingsView(await this.settings());
  }

  @Put('settings')
  async putSettings(
    @Body(new ZodPipe(whatsappCloudSettingsInputSchema)) body: WhatsappCloudSettingsInput,
    @CurrentUser() _user: RequestUser,
  ) {
    const existing = await this.settings();
    const webhookVerifyToken = body.webhookVerifyToken?.trim()
      || existing?.webhookVerifyToken
      || randomBytes(24).toString('hex');
    const common = {
      enabled: body.enabled,
      phoneNumberId: body.phoneNumberId?.trim() || null,
      businessAccountId: body.businessAccountId?.trim() || null,
      apiVersion: body.apiVersion,
      webhookVerifyToken,
    };
    const accessTokenEncrypted = body.accessToken?.trim()
      ? encryptSecret(body.accessToken.trim())
      : undefined;
    const appSecretEncrypted = body.appSecret?.trim()
      ? encryptSecret(body.appSecret.trim())
      : undefined;
    const row = await db.whatsappCloudSettings.upsert({
      where: {id: 'singleton'},
      create: {...common, accessTokenEncrypted, appSecretEncrypted},
      update: {...common, accessTokenEncrypted, appSecretEncrypted},
    });
    return this.settingsView(row);
  }

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

  @Public()
  @Post('webhook')
  async receiveWebhook(
    @Req() req: any,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    const row = await this.settings();
    if (!row?.appSecretEncrypted || !this.validSignature(req.rawBody, signature, row.appSecretEncrypted)) {
      throw new UnauthorizedException('Firma de Meta inválida');
    }

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value as MetaValue | undefined;
        if (!value) continue;
        for (const message of value?.messages ?? []) {
          try {
            await this.persistInboundMessage(value, message);
          } catch (error) {
            this.logger.error(JSON.stringify({
              event: 'whatsapp_inbound_message_failed',
              waMessageId: message.id,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        }
      }
    }
    return {ok: true};
  }

  @Post('send-test')
  async sendTest(
    @Body(new ZodPipe(sendTestSchema)) body: SendTestInput,
    @CurrentUser() _user: RequestUser,
  ) {
    const chatKey = normalizePhone(body.to);
    if (!chatKey) throw new BadRequestException('El teléfono no tiene un formato argentino válido');
    const row = await this.settings();
    if (!row?.enabled || !row.phoneNumberId || !row.accessTokenEncrypted) {
      throw new BadRequestException('WhatsApp Cloud API no está habilitada o le faltan credenciales');
    }

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${encodeURIComponent(row.apiVersion)}/${encodeURIComponent(row.phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${decryptSecret(row.accessTokenEncrypted)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: chatKey,
            type: 'text',
            text: {body: body.text},
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch (error) {
      throw new BadGatewayException(`No se pudo conectar con Meta: ${error instanceof Error ? error.message : String(error)}`);
    }
    const payload = await response.json().catch(() => null) as {
      messages?: Array<{id?: string}>;
      error?: {message?: string};
    } | null;
    if (!response.ok) {
      throw new BadGatewayException(payload?.error?.message || `Meta respondió HTTP ${response.status}`);
    }

    const now = new Date();
    const waMessageId = payload?.messages?.[0]?.id ?? null;
    const log = await db.$transaction(async tx => {
      await tx.chatbotConversation.upsert({
        where: {chatKey},
        create: {chatKey, lastOutboundText: body.text, lastOutboundAt: now},
        update: {lastOutboundText: body.text, lastOutboundAt: now},
      });
      return tx.chatbotMessageLog.create({data: {
        conversationKey: chatKey,
        direction: 'OUTBOUND',
        actor: 'HUMAN',
        status: 'SENT',
        channel: 'CLOUD_API',
        text: body.text,
        waMessageId,
        sentAt: now,
      }});
    });
    return jsonSafe(log);
  }

  private validSignature(rawBody: Buffer | undefined, signature: string | undefined, encryptedSecret: string) {
    if (!rawBody || !signature?.startsWith('sha256=')) return false;
    try {
      const received = Buffer.from(signature.slice(7), 'hex');
      const expected = createHmac('sha256', decryptSecret(encryptedSecret)).update(rawBody).digest();
      return received.length === expected.length && timingSafeEqual(received, expected);
    } catch {
      return false;
    }
  }

  private async persistInboundMessage(value: MetaValue, message: MetaMessage) {
    const chatKey = normalizePhone(message.from);
    if (!chatKey) {
      this.logger.warn(JSON.stringify({event: 'whatsapp_invalid_phone', from: message.from, waMessageId: message.id}));
      return;
    }
    if (!message.id) {
      this.logger.warn(JSON.stringify({event: 'whatsapp_missing_message_id', from: message.from}));
      return;
    }
    const type = message.type || 'unknown';
    const text = type === 'text' && typeof message.text?.body === 'string'
      ? message.text.body
      : `[tipo_no_soportado: ${type}]`;
    const displayName = value.contacts?.find(contact => contact.wa_id === message.from)?.profile?.name?.trim() || null;
    const existing = await db.chatbotConversation.findUnique({where: {chatKey}, select: {displayName: true}});
    const now = new Date();
    await db.chatbotConversation.upsert({
      where: {chatKey},
      create: {chatKey, displayName, lastInboundText: text, lastInboundAt: now},
      update: {
        lastInboundText: text,
        lastInboundAt: now,
        ...(!existing?.displayName && displayName ? {displayName} : {}),
      },
    });
    try {
      await db.chatbotMessageLog.create({data: {
        conversationKey: chatKey,
        direction: 'INBOUND',
        actor: 'CUSTOMER',
        status: 'OBSERVED',
        channel: 'CLOUD_API',
        text,
        waMessageId: message.id,
        inboundFingerprint: message.id,
      }});
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return;
      throw error;
    }
  }
}
