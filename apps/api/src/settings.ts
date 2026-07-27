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
import OpenAI from 'openai';
import {db} from '@tgs/database';
import {
  aiSettingsInputSchema,
  aiTestConnectionSchema,
  companySettingsInputSchema,
  financingInputSchema,
  financingUpdateSchema,
  idSchema,
  operationsSettingsInputSchema,
  pdfSettingsInputSchema,
  type AiSettingsInput,
  type CompanySettingsInput,
  type FinancingInput,
  type OperationsSettingsInput,
  type PdfSettingsInput,
} from '@tgs/contracts';
import {decryptSecret, encryptSecret, maskSecret} from '@tgs/config';
import {CurrentUser, jsonSafe, Public, type RequestUser, ZodPipe} from './infrastructure.js';
import {removeManagedLogoFile, saveBrandingLogo} from './branding-storage.js';

const audit = (
  tx: any,
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
  previous: unknown,
  next: unknown,
) =>
  tx.auditLog.create({
    data: {
      userId,
      entityType,
      entityId,
      action,
      previous: jsonSafe(previous),
      next: jsonSafe(next),
    },
  });

@Controller('settings')
export class SettingsController {
  /** Branding público para login / shell (sin datos fiscales). */
  @Public()
  @Get('branding')
  async branding() {
    const row = await db.companySettings.findUniqueOrThrow({where: {id: 'singleton'}});
    return {
      name: row.name,
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor,
      accentColor: row.accentColor,
    };
  }

  @Get('company')
  company() {
    return db.companySettings.findUniqueOrThrow({where: {id: 'singleton'}});
  }

  @Put('company')
  async putCompany(
    @Body(new ZodPipe(companySettingsInputSchema)) body: CompanySettingsInput,
    @CurrentUser() u: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.companySettings.findUniqueOrThrow({where: {id: 'singleton'}});
      const next = await tx.companySettings.update({where: {id: 'singleton'}, data: body});
      await audit(tx, u.id, 'CompanySettings', 'singleton', 'UPDATE', old, next);
      return next;
    });
  }

  /**
   * Sube un logo (PNG/JPG/WEBP/GIF ≤ 2 MB), lo guarda en disco y actualiza `logoUrl`
   * con la URL pública servida por `/api/uploads/branding/...`.
   */
  @Post('company/logo')
  async uploadLogo(@Req() req: any, @CurrentUser() u: RequestUser) {
    if (typeof req.file !== 'function') {
      throw new BadRequestException('Upload multipart no disponible en el servidor');
    }
    const part = await req.file();
    if (!part) throw new BadRequestException('Seleccioná una imagen de logo');
    const buffer = await part.toBuffer();
    const saved = await saveBrandingLogo(buffer, String(part.mimetype ?? ''));

    return db.$transaction(async (tx) => {
      const old = await tx.companySettings.findUniqueOrThrow({where: {id: 'singleton'}});
      if (old.logoUrl && old.logoUrl !== saved.url) {
        await removeManagedLogoFile(old.logoUrl);
      }
      const next = await tx.companySettings.update({
        where: {id: 'singleton'},
        data: {logoUrl: saved.url},
      });
      await audit(tx, u.id, 'CompanySettings', 'singleton', 'LOGO_UPLOAD', old, next);
      return next;
    });
  }

  @Delete('company/logo')
  async clearLogo(@CurrentUser() u: RequestUser) {
    return db.$transaction(async (tx) => {
      const old = await tx.companySettings.findUniqueOrThrow({where: {id: 'singleton'}});
      await removeManagedLogoFile(old.logoUrl);
      const next = await tx.companySettings.update({
        where: {id: 'singleton'},
        data: {logoUrl: null},
      });
      await audit(tx, u.id, 'CompanySettings', 'singleton', 'LOGO_CLEAR', old, next);
      return next;
    });
  }

  @Get('pdf')
  pdf() {
    return db.pdfSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  }

  @Put('pdf')
  async putPdf(
    @Body(new ZodPipe(pdfSettingsInputSchema)) body: PdfSettingsInput,
    @CurrentUser() u: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.pdfSettings.findUniqueOrThrow({where: {id: 'singleton'}});
      const next = await tx.pdfSettings.update({
        where: {id: 'singleton'},
        data: {...body, lineOrder: body.lineOrder},
      });
      await audit(tx, u.id, 'PdfSettings', 'singleton', 'UPDATE', old, next);
      return next;
    });
  }

  private async safeAi() {
    const row = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
    let masked: null | string = null;
    if (row.apiKeyEncrypted) {
      try {
        masked = maskSecret(decryptSecret(row.apiKeyEncrypted));
      } catch {
        masked = '••••';
      }
    }
    const {apiKeyEncrypted, ...safe} = row;
    return {...jsonSafe(safe), apiKeyMasked: masked, hasKey: Boolean(apiKeyEncrypted)};
  }

  @Get('ai')
  ai() {
    return this.safeAi();
  }

  @Put('ai')
  async putAi(
    @Body(new ZodPipe(aiSettingsInputSchema)) body: AiSettingsInput,
    @CurrentUser() u: RequestUser,
  ) {
    await db.$transaction(async (tx) => {
      const old = await tx.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
      const {apiKey, clearApiKey, ...values} = body;
      const next = await tx.aiSettings.update({
        where: {id: 'singleton'},
        data: {
          ...values,
          monthlyBudgetUsdCents: values.monthlyBudgetUsdCents,
          apiKeyEncrypted: clearApiKey ? null : apiKey ? encryptSecret(apiKey) : undefined,
        },
      });
      await audit(
        tx,
        u.id,
        'AiSettings',
        'singleton',
        'UPDATE',
        {...old, apiKeyEncrypted: old.apiKeyEncrypted ? '[CIFRADA]' : null},
        {...next, apiKeyEncrypted: next.apiKeyEncrypted ? '[CIFRADA]' : null},
      );
    });
    return this.safeAi();
  }

  @Post('ai/test-connection')
  async test(@Body(new ZodPipe(aiTestConnectionSchema)) body: {apiKey?: string; model?: string}) {
    const settings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
    const model = body.model ?? settings.model;
    const key =
      body.apiKey ??
      (settings.apiKeyEncrypted
        ? decryptSecret(settings.apiKeyEncrypted)
        : process.env.OPENAI_API_KEY);
    if (!key) return {ok: false, model, error: 'No hay una API key configurada'};
    try {
      const client = new OpenAI({apiKey: key, timeout: 10000, maxRetries: 0});
      await client.responses.create({model, input: 'Respondé únicamente OK', max_output_tokens: 8});
      return {ok: true, model};
    } catch {
      return {ok: false, model, error: 'No se pudo conectar con el modelo configurado'};
    }
  }

  @Get('operations')
  operations() {
    return db.operationsSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  }

  @Put('operations')
  async putOperations(
    @Body(new ZodPipe(operationsSettingsInputSchema)) body: OperationsSettingsInput,
    @CurrentUser() u: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.operationsSettings.findUniqueOrThrow({where: {id: 'singleton'}});
      const next = await tx.operationsSettings.update({where: {id: 'singleton'}, data: body});
      await audit(tx, u.id, 'OperationsSettings', 'singleton', 'UPDATE', old, next);
      return next;
    });
  }
}

@Controller('financing')
export class FinancingController {
  @Get()
  list() {
    return db.financingPlan.findMany({orderBy: [{sortOrder: 'asc'}, {createdAt: 'asc'}]});
  }

  @Post()
  async create(
    @Body(new ZodPipe(financingInputSchema)) body: FinancingInput,
    @CurrentUser() u: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const next = await tx.financingPlan.create({data: body});
      await audit(tx, u.id, 'FinancingPlan', next.id, 'CREATE', null, next);
      return next;
    });
  }

  @Put(':id')
  async update(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(financingUpdateSchema)) body: Partial<FinancingInput>,
    @CurrentUser() u: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.financingPlan.findUnique({where: {id}});
      if (!old) throw new NotFoundException('Plan de financiación inexistente');
      const next = await tx.financingPlan.update({where: {id}, data: body});
      await audit(tx, u.id, 'FinancingPlan', id, 'UPDATE', old, next);
      return next;
    });
  }

  @Delete(':id')
  async remove(@Param('id', new ZodPipe(idSchema)) id: string, @CurrentUser() u: RequestUser) {
    return db.$transaction(async (tx) => {
      const old = await tx.financingPlan.findUnique({where: {id}});
      if (!old) throw new NotFoundException('Plan de financiación inexistente');
      await tx.financingPlan.delete({where: {id}});
      await audit(tx, u.id, 'FinancingPlan', id, 'DELETE', old, null);
      return {ok: true};
    });
  }
}
