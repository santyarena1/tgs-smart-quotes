import {
  BadRequestException,
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import {createHmac, randomUUID} from 'node:crypto';
import {db} from '@tgs/database';
import {
  aiSettingsInputSchema,
  aiTestConnectionSchema,
  companySettingsInputSchema,
  financingInputSchema,
  financingUpdateSchema,
  idSchema,
  externalModuleToggleSchema,
  externalModuleConfigInputSchema,
  operationsSettingsInputSchema,
  pdfLayoutConfigSchema,
  pdfLayoutPreviewInputSchema,
  pdfSettingsInputSchema,
  type AiSettingsInput,
  type CompanySettingsInput,
  type FinancingInput,
  type ExternalModuleToggleInput,
  type ExternalModuleConfigInput,
  type ExternalModuleConfigView,
  type OperationsSettingsInput,
  type PdfLayoutConfig,
  type PdfLayoutPreviewInput,
  type PdfSettingsInput,
} from '@tgs/contracts';
import {renderPdfHtml, type PdfRenderInput, type PdfResolvedConfig, type PdfTemplate} from '@tgs/pdf';
import {decryptSecret, encryptSecret, maskSecret} from '@tgs/config';
import {CurrentUser, jsonSafe, Public, type RequestUser, ZodPipe} from './infrastructure.js';
import {filenameFromFaviconUrl, filenameFromLogoUrl, normalizeFaviconUrl, normalizeLogoUrl, removeManagedFaviconFile, removeManagedLogoFile, saveBrandingLogo, saveFavicon} from './branding-storage.js';
import {describeOpenAiError} from '@tgs/ai';

const NON_CHAT_MODEL_FAMILIES =
  /(embedding|whisper|tts|dall-e|image|moderation|audio|realtime|transcribe|search|computer-use)/i;
function isChatCompletionModel(id:string){
  return /^(gpt-|chatgpt-|o\d|o-)/i.test(id)&&!NON_CHAT_MODEL_FAMILIES.test(id);
}

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
      logoUrl: normalizeLogoUrl(row.logoUrl),
      faviconUrl: normalizeFaviconUrl(row.faviconUrl),
      primaryColor: row.primaryColor,
      accentColor: row.accentColor,
    };
  }

  @Get('company')
  async company() {
    const row = await db.companySettings.findUniqueOrThrow({where: {id: 'singleton'}});
    return {...row, logoUrl: normalizeLogoUrl(row.logoUrl), faviconUrl: normalizeFaviconUrl(row.faviconUrl)};
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
      return {...next,logoUrl:normalizeLogoUrl(next.logoUrl),faviconUrl:normalizeFaviconUrl(next.faviconUrl)};
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
      if (old.logoUrl && filenameFromLogoUrl(old.logoUrl) !== saved.filename) {
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

  /** Sube un favicon ICO/PNG/SVG de hasta 1 MB. */
  @Post('company/favicon')
  async uploadFavicon(@Req() req:any,@CurrentUser() u:RequestUser){
    if(typeof req.file!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');
    const part=await req.file();
    if(!part)throw new BadRequestException('Seleccioná un archivo de favicon');
    const saved=await saveFavicon(await part.toBuffer(),String(part.mimetype??''));
    return db.$transaction(async tx=>{
      const old=await tx.companySettings.findUniqueOrThrow({where:{id:'singleton'}});
      if(old.faviconUrl&&filenameFromFaviconUrl(old.faviconUrl)!==saved.filename)await removeManagedFaviconFile(old.faviconUrl);
      const next=await tx.companySettings.update({where:{id:'singleton'},data:{faviconUrl:saved.url}});
      await audit(tx,u.id,'CompanySettings','singleton','FAVICON_UPLOAD',old,next);
      return{...next,logoUrl:normalizeLogoUrl(next.logoUrl),faviconUrl:normalizeFaviconUrl(next.faviconUrl)};
    });
  }

  @Delete('company/favicon')
  async clearFavicon(@CurrentUser() u:RequestUser){
    return db.$transaction(async tx=>{
      const old=await tx.companySettings.findUniqueOrThrow({where:{id:'singleton'}});
      await removeManagedFaviconFile(old.faviconUrl);
      const next=await tx.companySettings.update({where:{id:'singleton'},data:{faviconUrl:null}});
      await audit(tx,u.id,'CompanySettings','singleton','FAVICON_CLEAR',old,next);
      return{...next,logoUrl:normalizeLogoUrl(next.logoUrl),faviconUrl:null};
    });
  }

  @Get('pdf')
  pdf() {
    return db.pdfSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  }

  private normalizePdfLayout(value: unknown): PdfLayoutConfig {
    const candidate =
      value && typeof value === 'object' && 'version' in value
        ? value
        : {version: 1, blocks: value ?? {}};
    return pdfLayoutConfigSchema.parse(candidate);
  }

  @Get('pdf-layout')
  async pdfLayout() {
    const row = await db.pdfSettings.findUniqueOrThrow({where: {id: 'singleton'}});
    return {id: row.id, layout: this.normalizePdfLayout(row.layoutJson), updatedAt: row.updatedAt};
  }

  @Put('pdf-layout')
  async putPdfLayout(
    @Body(new ZodPipe(pdfLayoutConfigSchema)) body: PdfLayoutConfig,
    @CurrentUser() u: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.pdfSettings.findUniqueOrThrow({where: {id: 'singleton'}});
      const next = await tx.pdfSettings.update({
        where: {id: 'singleton'},
        data: {layoutJson: body},
      });
      await audit(tx, u.id, 'PdfLayoutSettings', 'singleton', 'UPDATE', old.layoutJson, body);
      return {id: next.id, layout: body, updatedAt: next.updatedAt};
    });
  }

  @Post('pdf-layout/preview')
  async previewPdfLayout(
    @Body(new ZodPipe(pdfLayoutPreviewInputSchema)) body: PdfLayoutPreviewInput,
  ) {
    const [company, pdfSettings, financing] = await Promise.all([
      db.companySettings.findUniqueOrThrow({where: {id: 'singleton'}}),
      db.pdfSettings.findUniqueOrThrow({where: {id: 'singleton'}}),
      db.financingPlan.findMany({where: {active: true}, orderBy: {sortOrder: 'asc'}, take: 3}),
    ]);
    const previewCompany = {...company, ...(body.companyText ?? {})};
    const previewPdf = {...pdfSettings, ...(body.pdfText ?? {})};
    const config: PdfResolvedConfig = {
      showListPrice: pdfSettings.showListPrice,
      showCashTransfer: pdfSettings.showCashTransfer,
      showFinancing: pdfSettings.showFinancing,
      showBbva: pdfSettings.showBbva,
      showOtherBanks: pdfSettings.showOtherBanks,
      showFinancingNote: pdfSettings.showFinancingNote,
      showTaxData: pdfSettings.showTaxData,
      showServicesBlock: pdfSettings.showServicesBlock,
      showWindows: pdfSettings.showWindows,
      showDrivers: pdfSettings.showDrivers,
      showDelay: pdfSettings.showDelay,
      showRma: pdfSettings.showRma,
      showExtraObservation: true,
      showIndividualPrices: pdfSettings.showIndividualPrices,
      showComponentDetail: pdfSettings.showComponentDetail,
      builtPcTitle: previewPdf.builtPcTitle,
      builtPcDescription: previewPdf.builtPcDescription,
      assemblyText: previewPdf.assemblyText,
      installText: previewPdf.installText,
      windowsText: previewPdf.windowsText,
      driversText: previewPdf.driversText,
      estimatedDelay: previewPdf.estimatedDelay,
      rmaText: previewPdf.rmaText,
    };
    const input: PdfRenderInput = {
      kind: 'DETALLADO',
      template: (previewPdf.template ?? 'CLASICO') as PdfTemplate,
      financingBbvaNote: previewPdf.financingBbvaNote ?? null,
      number: 'TGS-000123',
      date: new Date('2026-07-28T12:00:00-03:00'),
      isBuiltPc: true,
      observation: 'Entrega coordinada con el cliente. Presupuesto de muestra.',
      cashTotalCents: 169990000n,
      listTotalCents:
        (169990000n * BigInt(10000 + company.listInterestBps) + 5000n) / 10000n,
      company: previewCompany,
      config,
      layout: body.layout,
      items: [
        {code: '001', name: [previewPdf.builtPcTitle, previewPdf.builtPcDescription].filter(Boolean).join(' — '), quantity: 1, unitCents: 169990000n, subtotalCents: 169990000n, isMainLine: true},
        {code: '002', name: 'Procesador AMD Ryzen 7 7800X3D', quantity: 1, unitCents: 64990000n, subtotalCents: 64990000n, isComponent: true},
        {code: '003', name: 'Memoria RAM DDR5 32 GB 6000 MHz', quantity: 2, unitCents: 18990000n, subtotalCents: 37980000n, isComponent: true},
        {code: '004', name: 'Disco SSD NVMe 1 TB PCIe 4.0', quantity: 1, unitCents: 25990000n, subtotalCents: 25990000n, isComponent: true},
      ],
      financing,
    };
    return {html: renderPdfHtml(input, true)};
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
      await client.chat.completions.create({
        model,
        messages:[{role:'user',content:'Respondé únicamente OK'}],
        max_completion_tokens:8,
      });
      return {ok: true, model};
    } catch(error) {
      const detail=describeOpenAiError(error);
      return {ok: false, model, error: detail.message, errorKind: detail.kind, status: detail.status};
    }
  }

  @Get('ai/models')
  async aiModels(){
    const settings=await db.aiSettings.findUniqueOrThrow({where:{id:'singleton'}});
    const key=settings.apiKeyEncrypted
      ?decryptSecret(settings.apiKeyEncrypted)
      :process.env.OPENAI_API_KEY;
    if(!key?.trim()){
      throw new ServiceUnavailableException('Configurá y guardá una API key de OpenAI primero.');
    }
    try{
      const client=new OpenAI({apiKey:key.trim(),timeout:15000,maxRetries:1});
      const page=await client.models.list();
      const models=page.data
        .filter(model=>isChatCompletionModel(model.id))
        .map(model=>({id:model.id,created:model.created,ownedBy:model.owned_by}))
        .sort((a,b)=>a.id.localeCompare(b.id));
      if(!models.length){
        throw new BadGatewayException('OpenAI no devolvió modelos de conversación disponibles para esta cuenta.');
      }
      return {models,pricingIncluded:false,loadedAt:new Date().toISOString()};
    }catch(error){
      if(error instanceof BadGatewayException)throw error;
      const detail=describeOpenAiError(error);
      throw new BadGatewayException(detail.message);
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

  @Get('external-module')
  async externalModule() {
    const row = await db.externalModuleSettings.findUnique({where: {id: 'singleton'}});
    return row ?? {id: 'singleton', enabled: false, updatedAt: new Date()};
  }

  private externalConfigView(row: Awaited<ReturnType<typeof db.externalModuleConfig.upsert>>): ExternalModuleConfigView {
    return {
      id: 'singleton',
      tripoKeySet: Boolean(row.tripoKeyEnc),
      higgsfieldKeySet: Boolean(row.higgsfieldKeyEnc), higgsfieldSecretSet: Boolean(row.higgsfieldSecretEnc),
      serperKeySet: Boolean(row.serperKeyEnc),
      wpHmacSecretSet: Boolean(row.wpHmacSecretEnc),
      wpBaseUrl: row.wpBaseUrl, autoRepublish: row.autoRepublish, updatedAt: row.updatedAt,
    };
  }

  private externalConfig() {
    return db.externalModuleConfig.upsert({where:{id:'singleton'},update:{},create:{id:'singleton'}});
  }

  @Get('external-module/config')
  async getExternalModuleConfig() {
    return this.externalConfigView(await this.externalConfig());
  }

  @Put('external-module/config')
  async putExternalModuleConfig(
    @Body(new ZodPipe(externalModuleConfigInputSchema)) body: ExternalModuleConfigInput,
    @CurrentUser() u: RequestUser,
  ) {
    await db.$transaction(async tx=>{
      const old=await tx.externalModuleConfig.findUnique({where:{id:'singleton'}});
      const secret=(clear:boolean|undefined,value:string|undefined)=>clear?null:value?.trim()?encryptSecret(value.trim()):undefined;
      const next=await tx.externalModuleConfig.upsert({where:{id:'singleton'},create:{
        id:'singleton',wpBaseUrl:body.wpBaseUrl,autoRepublish:body.autoRepublish,
        tripoKeyEnc:secret(body.clearTripoKey,body.tripoKey),
        higgsfieldKeyEnc:secret(body.clearHiggsfieldKey,body.higgsfieldKey),higgsfieldSecretEnc:secret(body.clearHiggsfieldSecret,body.higgsfieldSecret),
        serperKeyEnc:secret(body.clearSerperKey,body.serperKey),
        wpHmacSecretEnc:secret(body.clearWpHmacSecret,body.wpHmacSecret),
      },update:{
        wpBaseUrl:body.wpBaseUrl,autoRepublish:body.autoRepublish,
        tripoKeyEnc:secret(body.clearTripoKey,body.tripoKey),
        higgsfieldKeyEnc:secret(body.clearHiggsfieldKey,body.higgsfieldKey),higgsfieldSecretEnc:secret(body.clearHiggsfieldSecret,body.higgsfieldSecret),
        serperKeyEnc:secret(body.clearSerperKey,body.serperKey),
        wpHmacSecretEnc:secret(body.clearWpHmacSecret,body.wpHmacSecret),
      }});
      const redact=(v:typeof next|null)=>v&&({...v,tripoKeyEnc:v.tripoKeyEnc?'[CIFRADA]':null,higgsfieldKeyEnc:v.higgsfieldKeyEnc?'[CIFRADA]':null,higgsfieldSecretEnc:v.higgsfieldSecretEnc?'[CIFRADA]':null,serperKeyEnc:v.serperKeyEnc?'[CIFRADA]':null,wpHmacSecretEnc:v.wpHmacSecretEnc?'[CIFRADA]':null});
      await audit(tx,u.id,'ExternalModuleConfig','singleton','UPDATE',redact(old),redact(next));
    });
    return this.externalConfigView(await this.externalConfig());
  }

  @Post('external-module/config/test/:provider')
  async testExternalModuleConfig(@Param('provider') provider:string) {
    if(!['tripo','higgsfield','serper','wordpress'].includes(provider))throw new BadRequestException('Proveedor inválido');
    if(['tripo','higgsfield'].includes(provider))return {ok:false,detail:'Test no implementado aún'};
    const row=await this.externalConfig();
    const request=async(url:string,init?:RequestInit)=>{
      try{
        const response=await fetch(url,{...init,signal:AbortSignal.timeout(10000)});
        if(response.ok)return {ok:true};
        let bodyDetail='';
        try{const text=await response.text();if(text)bodyDetail=`: ${text.slice(0,300)}`;}catch{/* sin body legible */}
        return {ok:false,detail:`HTTP ${response.status}${bodyDetail}`};
      }
      catch(error){return {ok:false,detail:error instanceof Error?error.message:'Error de conexión'};}
    };
    if(provider==='serper'){
      if(!row.serperKeyEnc)return {ok:false,detail:'No hay una credencial guardada'};
      return request('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':decryptSecret(row.serperKeyEnc),'Content-Type':'application/json'},body:JSON.stringify({q:'The Gamer Shop',num:1})});
    }
    // Diagnostico de WordPress en dos pasos, para poder decir exactamente que
    // falla en vez de un generico "no se pudo conectar":
    //   1. GET /tgs/v1/ping  -> el plugin esta instalado y activo (y su version).
    //   2. POST /tgs/v1/unpublish con un externalId inexistente -> valida que la
    //      firma HMAC coincida. Es inocuo: el plugin no encuentra el producto y
    //      no toca nada en la tienda.
    const base=row.wpBaseUrl.replace(/\/$/,'');
    let version:string|null=null;
    try{
      const response=await fetch(`${base}/wp-json/tgs/v1/ping`,{signal:AbortSignal.timeout(10000)});
      if(!response.ok){
        if(response.status===404)return {ok:false,detail:'El sitio responde, pero no encontramos el plugin TGS Smart Quotes. Revisá que esté instalado y activado en WordPress.'};
        let bodyDetail='';
        try{const text=await response.text();if(text)bodyDetail=`: ${text.slice(0,200)}`;}catch{/* sin body legible */}
        return {ok:false,detail:`El sitio respondió HTTP ${response.status}${bodyDetail}`};
      }
      const data=await response.json() as {version?:unknown};
      version=typeof data?.version==='string'?data.version:null;
    }catch(error){
      return {ok:false,detail:`No se pudo conectar con ${base}. ${error instanceof Error?error.message:'Error de conexión'}`};
    }
    const pluginLabel=version?`v${version}`:'versión desconocida';
    if(!row.wpHmacSecretEnc)return {ok:false,version,detail:`El plugin responde (${pluginLabel}), pero todavía no cargaste el secreto HMAC acá.`};
    const probeBody=JSON.stringify({externalId:`prueba-de-conexion-${randomUUID()}`});
    const probeSignature=createHmac('sha256',decryptSecret(row.wpHmacSecretEnc)).update(probeBody).digest('hex');
    try{
      const response=await fetch(`${base}/wp-json/tgs/v1/unpublish`,{method:'POST',headers:{'content-type':'application/json','X-TGS-Signature':probeSignature},body:probeBody,signal:AbortSignal.timeout(10000)});
      if(401===response.status)return {ok:false,version,detail:`El plugin responde (${pluginLabel}), pero rechaza la firma: el secreto HMAC de acá no coincide con el configurado en WordPress.`};
      if(!response.ok){
        let bodyDetail='';
        try{const text=await response.text();if(text)bodyDetail=`: ${text.slice(0,200)}`;}catch{/* sin body legible */}
        return {ok:false,version,detail:`El plugin respondió HTTP ${response.status}${bodyDetail}`};
      }
      return {ok:true,version,detail:`Conectado al plugin ${pluginLabel}.`};
    }catch(error){
      return {ok:false,version,detail:error instanceof Error?error.message:'Error de conexión'};
    }
  }

  @Put('external-module')
  async putExternalModule(
    @Body(new ZodPipe(externalModuleToggleSchema)) body: ExternalModuleToggleInput,
    @CurrentUser() u: RequestUser,
  ) {
    const expected = process.env.EXTERNAL_MODULE_KEY?.trim() || 'santy123';
    if (body.key !== expected) {
      throw new BadRequestException('Clave incorrecta');
    }
    return db.$transaction(async (tx) => {
      const old = await tx.externalModuleSettings.findUnique({where: {id: 'singleton'}});
      const next = await tx.externalModuleSettings.upsert({
        where: {id: 'singleton'},
        update: {enabled: body.enabled},
        create: {id: 'singleton', enabled: body.enabled},
      });
      await audit(tx, u.id, 'ExternalModuleSettings', 'singleton', 'UPDATE', old, next);
      return {id: next.id, enabled: next.enabled, updatedAt: next.updatedAt};
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
