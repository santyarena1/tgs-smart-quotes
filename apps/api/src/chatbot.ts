/**
 * Controller HTTP del chatbot.
 *
 * La lógica de decisión vive en `chatbot-engine.ts` y los helpers compartidos en
 * `chatbot-core.ts`: acá quedan solo la capa HTTP, la configuración y las acciones
 * manuales del operador. El webhook de WhatsApp Cloud API llama al motor directamente,
 * sin pasar por estos endpoints.
 */
import {
  BadRequestException,
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import {ChatbotResponseService, createAiClient, DEFAULT_AI_MODEL} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {
  chatbotConversationUpdateSchema,
  chatbotLogActionSchema,
  chatbotLogsQuerySchema,
  chatbotRecontactSchema,
  chatbotRespondSchema,
  chatbotSettingsInputSchema,
  quoteSendMessageSchema,
  type ChatbotConversationUpdate,
  type ChatbotLogActionInput,
  type ChatbotRecontactInput,
  type ChatbotRespondInput,
  type ChatbotSettingsInput,
} from '@tgs/contracts';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {normalizePhone} from '@tgs/validation';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';
import {activeBundle, associateConversationQuote, quoteInclude} from './quotes.js';
import {saveChatbotRuleImage} from './chatbot-storage.js';
import {
  CHAT_KEY_MAX,
  createEscalationNotification,
  ensureChatbotRequest,
  settingsDto,
} from './chatbot-core.js';
import {runChatbotResponse} from './chatbot-engine.js';

@Controller('chatbot')
export class ChatbotController {
  @Post('settings/rule-image')
  async uploadRuleImage(@Req() req:any) {
    if(typeof req.file!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');
    const part=await req.file();
    if(!part)throw new BadRequestException('Seleccioná una imagen');
    return saveChatbotRuleImage(await part.toBuffer(),String(part.mimetype??''));
  }

  @Get('settings')
  async settings() {
    return jsonSafe(settingsDto(await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}})));
  }

  @Put('settings')
  async putSettings(
    @Body(new ZodPipe(chatbotSettingsInputSchema)) body: ChatbotSettingsInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const old = await tx.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}});
      // `responses` no es columna (se mapea a knowledgeEntries); nunca debe entrar al spread de Prisma.
      const {responses: _responses, ...columns} = body;
      const next = await tx.chatbotSettings.update({
        where: {id: 'singleton'},
        data: {
          ...columns,
          openingMessages: body.openingMessages,
          closingMessages: body.closingMessages,
          knowledgeEntries: body.responses,
          escalationKeywords: body.escalationKeywords,
          businessHours: body.businessHours,
          outsideHoursBehavior: body.outsideHoursBehavior,
          responseStyle: body.responseStyle,
          ignoredAutoMessages: body.ignoredAutoMessages,
          customRules: [],
        },
      });
      await tx.auditLog.create({data: {
        userId: actor.id,
        entityType: 'ChatbotSettings',
        entityId: 'singleton',
        action: body.enabled === old.enabled ? 'UPDATE' : body.enabled ? 'ENABLE' : 'KILL_SWITCH',
        previous: jsonSafe(old),
        next: jsonSafe(next),
      }});
      return jsonSafe(settingsDto(next));
    });
  }

  @Post('quotes/:id/send-message')
  async quoteSendMessage(
    @Param('id') id:string,
    @Body(new ZodPipe(quoteSendMessageSchema)) body:z.infer<typeof quoteSendMessageSchema>,
  ){
    const [settings,aiSettings,quote]=await Promise.all([
      db.chatbotSettings.findUniqueOrThrow({where:{id:'singleton'}}).then(settingsDto),
      db.aiSettings.findUniqueOrThrow({where:{id:'singleton'}}),
      db.quoteFamily.findUnique({where:{id},include:{customer:true,versions:{include:{items:{orderBy:{position:'asc'}}},orderBy:{version:'desc'}}}}),
    ]);
    if(!quote)throw new NotFoundException('Presupuesto inexistente');
    const version=body.version
      ?quote.versions.find(item=>item.version===body.version)
      :quote.versions.find(item=>item.version===quote.activeVersion)??quote.versions[0];
    if(!version)throw new NotFoundException('Versión inexistente');
    if(!aiSettings.enabled||!aiSettings.responsesEnabled)throw new ServiceUnavailableException('Las respuestas con IA están deshabilitadas en Configuración.');
    const key=aiSettings.apiKeyEncrypted?decryptSecret(aiSettings.apiKeyEncrypted):process.env.OPENAI_API_KEY;
    if(!key?.trim())throw new ServiceUnavailableException('No hay una API key de OpenAI configurada.');
    const recentMessages=body.recentMessages.slice(-5);
    const latestIncoming=[...recentMessages].reverse().find(message=>message.direction==='INBOUND')?.text
      ??'Presentá el presupuesto adjunto de forma breve y pertinente.';
    const quoteContext={
      numero:quote.visibleNumber,
      version:version.version,
      cliente:quote.customer?.name??null,
      totalSaleCents:version.totalSaleCents.toString(),
      items:version.items.map(item=>({nombre:item.frozenName,cantidad:item.quantity,subtotalCents:item.subtotalCents.toString()})),
    };
    const service=new ChatbotResponseService({client:createAiClient({apiKey:key}),model:settings.model??aiSettings.model??DEFAULT_AI_MODEL});
    const generated=await service.respond({
      chatKey:body.chatKey,
      latestMessage:latestIncoming,
      recentMessages,
      config:{
        persona:`${settings.persona}\n\nINSTRUCCIÓN PARA PRESENTAR PRESUPUESTOS\n${settings.quoteSendPrompt}`,
        openingMessages:[],closingMessages:[],
        responses:[{id:'quote-send',enabled:true,activators:[],similarityThreshold:0,answer:`Presentá este presupuesto sin alterar ni inventar datos: ${JSON.stringify(quoteContext)}`,context:'El archivo PDF quedará adjunto al mismo envío.',attachments:{imageUrl:null,url:null,quote:null}}],
        escalationInstructions:'Generá un mensaje editable y no escales.',modelCanEscalate:false,
        businessContext:`Mensaje para presentar un PDF de presupuesto. Datos autoritativos: ${JSON.stringify(quoteContext)}`,
        responseStyle:{...settings.responseStyle,length:'SHORT',maxCharacters:500},
        multiMessage:{maxBubbles:1,splitMode:'FIXED_ONLY'},
      },
    });
    const text=(generated.result.messages[0]??generated.result.reply).trim();
    if(!text)throw new BadGatewayException('La IA no devolvió un mensaje para presentar el presupuesto.');
    return{text,usedAi:generated.metadata.usedAi};
  }

  @Put('settings/enabled')
  async toggle(
    @Body(new ZodPipe(z.object({enabled: z.boolean()}).strict())) body: {enabled: boolean},
    @CurrentUser() actor: RequestUser,
  ) {
    const next = await db.chatbotSettings.update({
      where: {id: 'singleton'},
      data: {enabled: body.enabled},
    });
    await db.auditLog.create({data: {
      userId: actor.id,
      entityType: 'ChatbotSettings',
      entityId: 'singleton',
      action: body.enabled ? 'ENABLE' : 'KILL_SWITCH',
      next: {enabled: body.enabled},
    }});
    return jsonSafe(settingsDto(next));
  }

  @Get('conversations')
  async conversations() {
    const settings = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'},select:{defaultMode:true}});
    const [rows,pendingSuggestions]=await Promise.all([
      db.chatbotConversation.findMany({
        orderBy: {updatedAt: 'desc'},
        take: 300,
        select: {
          chatKey:true,displayName:true,modeOverride:true,escalatedAt:true,escalationReason:true,
          activeRequestId:true,recontactCount:true,lastRecontactAt:true,recontactOptOut:true,updatedAt:true,
          _count: {select: {messages: true}},
          activeRequest:{select:{id:true,title:true,state:true}},
          messages:{
            orderBy:{createdAt:'desc'},
            take:5,
            select:{direction:true,status:true,createdAt:true},
          },
        },
      }),
      db.notification.findMany({
        where:{type:'CHATBOT_SUGGESTION',actedAt:null},
        select:{chatPhone:true},
      }),
    ]);
    const suggestionChats=new Set(pendingSuggestions.map(item=>item.chatPhone).filter(Boolean));
    return jsonSafe(rows.map((row) => {
      const latestOutbound=row.messages.find(message=>message.direction==='OUTBOUND');
      const nativeStatus=row.escalatedAt
        ? {status:'ESCALATED',label:'Necesita supervisión'}
        : latestOutbound?.status==='SEND_FAILED'
          ? {status:'UNRESOLVED',label:'No resuelto'}
          : row.activeRequest&&row.activeRequest.state!=='CERRADA'
            ? {status:'PENDING_REQUEST',label:'Presupuesto'}
            : suggestionChats.has(row.chatKey)
              ? {status:'SUGGESTION',label:'Sugerido'}
              : latestOutbound?.status==='SENT'
                ? {status:'RESPONDED',label:'Respondido'}
                : null;
      return {
        ...row,
        effectiveMode:row.modeOverride??settings.defaultMode,
        nativeStatus,
      };
    }));
  }

  @Get('context/:chatKey')
  async chatContext(
    @Param('chatKey') rawChatKey:string,
    @Query('phone') phoneQuery?:string,
  ){
    const chatKey=decodeURIComponent(rawChatKey).slice(0,CHAT_KEY_MAX);
    const phone=phoneQuery||(chatKey.startsWith('tel:')?chatKey.slice(4):null);
    const normalized=normalizePhone(phone);
    const conversation=await db.chatbotConversation.findUnique({
      where:{chatKey},
      include:{activeRequest:true},
    });
    const customer=normalized
      ?await db.customer.findFirst({where:{normalizedPhone:normalized}})
      :null;
    const requestCandidates=normalized
      ?await db.quoteRequest.findMany({
          where:{detectedPhone:{not:null}},
          orderBy:{createdAt:'desc'},
          take:100,
          include:{customer:true},
        })
      :[];
    const requests=requestCandidates.filter(request=>normalizePhone(request.detectedPhone)===normalized);
    if(conversation?.activeRequest&&!requests.some(request=>request.id===conversation.activeRequest?.id)){
      requests.unshift(conversation.activeRequest as any);
    }
    return jsonSafe({chatKey,phone,customer,requests,activeRequestId:conversation?.activeRequestId??null});
  }

  @Get('conversations/:chatKey')
  async conversation(@Param('chatKey') rawChatKey: string) {
    const chatKey = decodeURIComponent(rawChatKey).slice(0, CHAT_KEY_MAX);
    const [settings, row] = await Promise.all([
      db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}}),
      db.chatbotConversation.findUnique({where: {chatKey}}),
    ]);
    return jsonSafe({
      ...(row ?? {chatKey, modeOverride: null, escalatedAt: null}),
      effectiveMode: row?.modeOverride ?? settings.defaultMode,
    });
  }

  @Get('conversations/:chatKey/quote')
  async conversationQuote(@Param('chatKey') rawChatKey:string){
    const chatKey=decodeURIComponent(rawChatKey).slice(0,CHAT_KEY_MAX);
    const conversation=await db.chatbotConversation.findUnique({where:{chatKey},select:{lastQuoteFamilyId:true,lastQuoteVersion:true}});
    if(!conversation?.lastQuoteFamilyId)return null;
    const family=await db.quoteFamily.findUnique({where:{id:conversation.lastQuoteFamilyId},include:quoteInclude});
    if(!family)return null;
    const bundle=activeBundle(family) as any;
    const selected=conversation.lastQuoteVersion
      ?bundle.versions.find((version:any)=>version.version===conversation.lastQuoteVersion)
      :bundle.version;
    return jsonSafe(selected?{...bundle,version:selected,items:selected.items}:bundle);
  }

  @Put('conversations/:chatKey')
  async putConversation(
    @Param('chatKey') rawChatKey: string,
    @Body(new ZodPipe(chatbotConversationUpdateSchema)) body: ChatbotConversationUpdate,
    @CurrentUser() actor: RequestUser,
  ) {
    const chatKey = decodeURIComponent(rawChatKey).slice(0, CHAT_KEY_MAX);
    const next = await db.$transaction(async tx=>{
      if(body.lastQuoteFamilyId!==undefined){
        await associateConversationQuote(tx,chatKey,body.lastQuoteFamilyId,body.lastQuoteFamilyId?body.lastQuoteVersion??null:null,actor);
      }
      return tx.chatbotConversation.upsert({
      where: {chatKey},
      create: {
        chatKey,
        displayName: body.displayName,
        modeOverride: body.modeOverride,
        recontactOptOut: body.recontactOptOut,
        ...(body.lastQuoteFamilyId===undefined?{}:{lastQuoteFamilyId:body.lastQuoteFamilyId,lastQuoteVersion:body.lastQuoteVersion}),
      },
      update: {
        displayName: body.displayName,
        modeOverride: body.modeOverride,
        recontactOptOut: body.recontactOptOut,
        ...(body.lastQuoteFamilyId===undefined?{}:{lastQuoteFamilyId:body.lastQuoteFamilyId,lastQuoteVersion:body.lastQuoteVersion}),
        ...(body.clearEscalation ? {escalatedAt: null, escalationReason: null} : {}),
      },
      });
    });
    await db.auditLog.create({data: {
      userId: actor.id,
      entityType: 'ChatbotConversation',
      entityId: chatKey,
      action: body.clearEscalation ? 'CLEAR_ESCALATION' : 'UPDATE',
      next: jsonSafe(next),
    }});
    return jsonSafe(next);
  }

  @Post('conversations/:chatKey/queue-recontact')
  async queueConversationRecontact(
    @Param('chatKey') rawChatKey:string,
    @Body(new ZodPipe(z.object({requestId:z.string().trim().min(1),displayName:z.string().trim().max(200).optional()}).strict())) body:{requestId:string;displayName?:string},
  ){
    const chatKey=decodeURIComponent(rawChatKey).slice(0,CHAT_KEY_MAX);
    const request=await db.quoteRequest.findUnique({where:{id:body.requestId},select:{id:true}});
    if(!request)throw new NotFoundException('Solicitud inexistente');
    const queuedAt=new Date();
    const conversation=await db.chatbotConversation.upsert({
      where:{chatKey},
      create:{chatKey,displayName:body.displayName,activeRequestId:request.id,lastOutboundAt:queuedAt},
      update:{displayName:body.displayName,activeRequestId:request.id,lastOutboundAt:queuedAt,recontactCount:0,recontactOptOut:false},
    });
    return jsonSafe({action:'QUEUED',chatKey,requestId:request.id,queuedAt:conversation.lastOutboundAt});
  }

  @Get('logs')
  async logs(@Query(new ZodPipe(chatbotLogsQuerySchema)) query: {chatKey?: string; limit: number}) {
    return jsonSafe(await db.chatbotMessageLog.findMany({
      where: query.chatKey ? {conversationKey: query.chatKey} : undefined,
      orderBy: {createdAt: 'desc'},
      take: query.limit,
    }));
  }

  @Get('recontacts/candidates')
  async recontactCandidates() {
    const settings=await db.chatbotSettings.findUniqueOrThrow({
      where:{id:'singleton'},
      select:{recontactEnabled:true,recontactDays:true,recontactMaxAttempts:true},
    });
    if(!settings.recontactEnabled)return [];

    const now=new Date();
    const cutoff=new Date(now.getTime()-settings.recontactDays*86_400_000);
    const conversations=await db.chatbotConversation.findMany({
      where:{
        escalatedAt:null,
        recontactOptOut:false,
        recontactCount:{lt:settings.recontactMaxAttempts},
        OR:[
          {activeRequestId:null},
          {activeRequest:{is:{state:{not:'CERRADA'}}}},
        ],
        lastOutboundAt:{lte:cutoff},
      },
      select:{
        chatKey:true,
        displayName:true,
        recontactCount:true,
        lastOutboundAt:true,
      },
    });

    return jsonSafe(conversations
      .flatMap(conversation=>{
        if(!conversation.lastOutboundAt||conversation.lastOutboundAt>cutoff)return [];
        return [{
          chatKey:conversation.chatKey,
          displayName:conversation.displayName,
          lastOutboundAt:conversation.lastOutboundAt,
          recontactCount:conversation.recontactCount,
          daysSince:Math.floor((now.getTime()-conversation.lastOutboundAt.getTime())/86_400_000),
        }];
      })
      .sort((left,right)=>left.lastOutboundAt.getTime()-right.lastOutboundAt.getTime()));
  }

  @Get('recontacts/history')
  async recontactHistory() {
    const rows=await db.$queryRaw<Array<{
      chatKey:string;
      displayName:string|null;
      recontactCount:number;
      lastRecontactAt:Date;
      lastRecontactText:string|null;
      repliedAfter:boolean;
    }>>(Prisma.sql`
      SELECT
        conversation."chatKey",
        conversation."displayName",
        conversation."recontactCount",
        conversation."lastRecontactAt",
        latest_recontact.text AS "lastRecontactText",
        EXISTS (
          SELECT 1
          FROM "ChatbotMessageLog" inbound
          WHERE inbound."conversationKey" = conversation."chatKey"
            AND inbound.direction = 'INBOUND'
            AND inbound."createdAt" > conversation."lastRecontactAt"
        ) AS "repliedAfter"
      FROM "ChatbotConversation" conversation
      LEFT JOIN LATERAL (
        SELECT outbound.text
        FROM "ChatbotMessageLog" outbound
        WHERE outbound."conversationKey" = conversation."chatKey"
          AND outbound.direction = 'OUTBOUND'
          AND outbound."decisionMetadata" ->> 'recontact' = 'true'
        ORDER BY outbound."createdAt" DESC
        LIMIT 1
      ) latest_recontact ON TRUE
      WHERE conversation."recontactCount" > 0
        AND conversation."lastRecontactAt" IS NOT NULL
      ORDER BY conversation."lastRecontactAt" DESC
    `);
    return jsonSafe(rows);
  }

  @Post('recontact')
  async recontact(
    @Body(new ZodPipe(chatbotRecontactSchema)) body: ChatbotRecontactInput,
    @CurrentUser() _actor: RequestUser,
  ) {
    const settings=settingsDto(await db.chatbotSettings.findUniqueOrThrow({where:{id:'singleton'}}));
    if(!settings.enabled)return {action:'DISABLED',reply:undefined};
    if(!settings.recontactEnabled)return {action:'RECONTACT_DISABLED',reply:undefined};
    const conversation=await db.chatbotConversation.upsert({
      where:{chatKey:body.chatKey},
      create:{chatKey:body.chatKey,displayName:body.displayName},
      update:body.displayName?{displayName:body.displayName}:{},
    });
    if(conversation.recontactOptOut)throw new ConflictException('La conversación rechazó recontactos.');
    if(conversation.recontactCount>=settings.recontactMaxAttempts){
      throw new ConflictException(`Se alcanzó el máximo de ${settings.recontactMaxAttempts} recontactos para esta conversación.`);
    }
    const aiSettings=await db.aiSettings.findUniqueOrThrow({where:{id:'singleton'}});
    const key=aiSettings.apiKeyEncrypted?decryptSecret(aiSettings.apiKeyEncrypted):process.env.OPENAI_API_KEY;
    if(!aiSettings.enabled)throw new ServiceUnavailableException('La IA está deshabilitada en Configuración.');
    if(!aiSettings.responsesEnabled)throw new ServiceUnavailableException('Las respuestas con IA están deshabilitadas en Configuración.');
    if(!key?.trim())throw new ServiceUnavailableException('No hay una API key de OpenAI configurada para generar la sugerencia.');
    const service=new ChatbotResponseService({
      client:createAiClient({apiKey:key}),
      model:settings.model??aiSettings.model??DEFAULT_AI_MODEL,
    });
    const result=await service.respond({
      chatKey:body.chatKey,
      latestMessage:'Redactá ahora un único mensaje proactivo de recontacto para retomar esta conversación. No respondas esta instrucción; entregá solamente el texto que se enviaría al cliente.',
      conversationSummary:conversation.summary??undefined,
      recentMessages:settings.maxRecentSnippets===0?[]:(body.recentMessages??[]).slice(-settings.maxRecentSnippets),
      config:{
        persona:`${settings.persona}\n\nINSTRUCCIÓN ESPECÍFICA DE RECONTACTO\n${settings.recontactPrompt||'Retomá la conversación de forma natural, breve y útil, sin inventar información.'}\n${conversation.displayName?`El nombre visible del cliente es ${conversation.displayName}.`:''}`,
        openingMessages:[],
        closingMessages:[],
        responses:[{
          id:'recontact',enabled:true,activators:[],similarityThreshold:0,
          answer:settings.recontactPrompt||'Retomá la conversación de forma natural, breve y útil, sin inventar información.',
          context:'Es un mensaje proactivo sujeto a revisión humana antes del envío.',
          attachments:{imageUrl:null,url:null,quote:null},
        }],
        escalationInstructions:'Este texto será revisado antes de enviarse. Generá una sugerencia de recontacto y no escales.',
        modelCanEscalate:false,
        businessContext:'Mensaje proactivo de recontacto; no presupongas que el cliente acaba de escribir.',
        responseStyle:settings.responseStyle,
        multiMessage:{maxBubbles:1,splitMode:'FIXED_ONLY'},
      },
    });
    if(!result.metadata.usedAi||!result.metadata.success){
      throw new BadGatewayException(
        result.metadata.error
          ?`OpenAI no pudo generar la sugerencia: ${result.metadata.error}`
          :'OpenAI no pudo generar una respuesta válida. Revisá la conexión y el modelo configurado.',
      );
    }
    const reply=result.result.reply.trim().slice(0,settings.responseStyle.maxCharacters);
    if(!reply)throw new BadRequestException('La IA no generó una respuesta utilizable');
    const log=await db.chatbotMessageLog.create({data:{
      conversationKey:body.chatKey,direction:'OUTBOUND',actor:'BOT',mode:'SUGGEST',status:'SUGGESTED',text:reply,
      model:result.metadata.model,promptTokens:result.metadata.usage?.promptTokens,
      completionTokens:result.metadata.usage?.completionTokens,totalTokens:result.metadata.usage?.totalTokens,
      inputHash:result.metadata.inputHash,decisionMetadata:{
        recontact:true,recontactAttempt:conversation.recontactCount+1,settingsUpdatedAt:settings.updatedAt,
        decisionReason:result.result.decisionReason,usedAi:result.metadata.usedAi,
      },
    }});
    return jsonSafe({reply,messages:[reply],quoteFollowupMessage:null,logId:log.id,action:'SUGGESTED'});
  }

  @Post('recontact/:chatKey/mark-sent')
  async markRecontactSent(
    @Param('chatKey',new ZodPipe(z.string().trim().min(1).max(CHAT_KEY_MAX))) chatKey:string,
    @CurrentUser() _actor:RequestUser,
  ) {
    const settings=await db.chatbotSettings.findUniqueOrThrow({where:{id:'singleton'},select:{recontactMaxAttempts:true}});
    const existing=await db.chatbotConversation.findUnique({where:{chatKey},select:{recontactCount:true,recontactOptOut:true}});
    if(!existing)throw new NotFoundException('Conversación de chatbot inexistente');
    if(existing.recontactOptOut)throw new ConflictException('La conversación rechazó recontactos.');
    if(existing.recontactCount>=settings.recontactMaxAttempts){
      throw new ConflictException(`Se alcanzó el máximo de ${settings.recontactMaxAttempts} recontactos para esta conversación.`);
    }
    const now=new Date();
    const changed=await db.chatbotConversation.updateMany({
      where:{chatKey,recontactOptOut:false,recontactCount:{lt:settings.recontactMaxAttempts}},
      data:{recontactCount:{increment:1},lastRecontactAt:now},
    });
    if(changed.count===0)throw new ConflictException('El recontacto no pudo marcarse porque cambió el estado de la conversación.');
    const conversation=await db.chatbotConversation.findUniqueOrThrow({where:{chatKey}});
    return jsonSafe({action:'MARKED_SENT',recontactCount:conversation.recontactCount,lastRecontactAt:conversation.lastRecontactAt});
  }

  @Post('respond')
  async respond(
    @Body(new ZodPipe(chatbotRespondSchema)) body: ChatbotRespondInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return jsonSafe(await runChatbotResponse(body, actor.id));
  }


  @Post('logs/:id/action')
  async logAction(
    @Param('id') id: string,
    @Body(new ZodPipe(chatbotLogActionSchema)) body: ChatbotLogActionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const old = await db.chatbotMessageLog.findUnique({where: {id}});
    if (!old) throw new NotFoundException('Registro de chatbot inexistente');
    if(body.action==='ATTACHMENT_SENT'||body.action==='ATTACHMENT_FAILED'){
      const metadata=(old.decisionMetadata??{}) as Record<string,unknown>;
      const events=Array.isArray(metadata.attachmentEvents)?metadata.attachmentEvents:[];
      const next=await db.chatbotMessageLog.update({
        where:{id},
        data:{decisionMetadata:{
          ...metadata,
          attachmentEvents:[...events,{
            attachment:body.attachment??'archivo',
            status:body.action==='ATTACHMENT_SENT'?'SENT':'FAILED',
            error:body.error??null,
            at:new Date().toISOString(),
          }],
        }},
      });
      if(body.action==='ATTACHMENT_FAILED'){
        const reason=`Falló un adjunto automático: ${body.attachment??'archivo'}. ${body.error??''}`.trim();
        await db.chatbotConversation.update({
          where:{chatKey:old.conversationKey},
          data:{escalatedAt:new Date(),escalationReason:reason},
        });
        await createEscalationNotification(db,old.conversationKey,reason,id);
      }
      await db.auditLog.create({data:{
        userId:actor.id,entityType:'ChatbotMessageLog',entityId:id,action:body.action,
        previous:jsonSafe(old),next:jsonSafe(next),
      }});
      return jsonSafe(next);
    }
    const sent = body.action === 'SENT' || body.action === 'HUMAN_SENT';
    const next = await db.$transaction(async (tx) => {
      const log = await tx.chatbotMessageLog.update({
        where: {id},
        data: {
          status: sent ? 'SENT' : body.action === 'SEND_FAILED' ? 'SEND_FAILED' : 'DISMISSED',
          actor: body.action === 'HUMAN_SENT' ? 'HUMAN' : old.actor,
          text: body.text ?? old.text,
          error: body.error,
          sentAt: sent ? new Date() : null,
        },
      });
      if (sent) await tx.chatbotConversation.update({
        where: {chatKey: old.conversationKey},
        data: {lastOutboundText: body.text ?? old.text, lastOutboundAt: new Date()},
      });
      if (old.notificationId) await tx.notification.update({
        where: {id: old.notificationId},
        data: {actedAt: new Date(), readAt: new Date()},
      });
      await tx.auditLog.create({data: {
        userId: actor.id,
        entityType: 'ChatbotMessageLog',
        entityId: id,
        action: body.action,
        previous: jsonSafe(old),
        next: jsonSafe(log),
      }});
      return log;
    });
    return jsonSafe(next);
  }

  @Post('logs/:id/create-request')
  async createRequestFromSuggestion(
    @Param('id') id:string,
    @CurrentUser() actor:RequestUser,
  ){
    const log=await db.chatbotMessageLog.findUnique({where:{id}});
    if(!log)throw new NotFoundException('Registro de chatbot inexistente');
    if(log.mode!=='SUGGEST')throw new BadRequestException('Esta acción manual solo corresponde a una sugerencia');
    const metadata=(log.decisionMetadata??{}) as Record<string,unknown>;
    const parsedDraft=z.object({
      title:z.string().min(1).max(300),
      summary:z.string().min(1).max(10000),
      expectedUse:z.string().max(1000).nullable(),
      requiredComponents:z.array(z.string().min(1).max(500)).max(100),
      maximumBudgetCents:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    }).strict().safeParse(metadata.requestDraft);
    if(!metadata.shouldCreateRequest||!parsedDraft.success){
      throw new BadRequestException('La sugerencia no contiene una solicitud extraída válida');
    }
    const phone=log.conversationKey.startsWith('tel:')?log.conversationKey.slice(4):null;
    const result=await db.$transaction(async tx=>{
      const ensured=await ensureChatbotRequest(
        tx,log.conversationKey,phone,parsedDraft.data,actor.id,log.id,
      );
      if(log.notificationId){
        const notification=await tx.notification.findUnique({where:{id:log.notificationId}});
        await tx.notification.update({
          where:{id:log.notificationId},
          data:{metadata:{
            ...((notification?.metadata??{}) as Record<string,unknown>),
            requestId:ensured.request.id,
            requestCreated:ensured.created,
          }},
        });
      }
      return ensured;
    });
    return jsonSafe({
      id:result.request.id,
      title:result.request.title,
      state:result.request.state,
      created:result.created,
    });
  }
}
