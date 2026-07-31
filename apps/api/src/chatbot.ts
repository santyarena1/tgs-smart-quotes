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
import {ChatbotResponseService, createAiClient, DEFAULT_AI_MODEL, inputHash} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {
  chatbotConversationUpdateSchema,
  chatbotLogActionSchema,
  chatbotLogsQuerySchema,
  chatbotRespondSchema,
  chatbotSettingsInputSchema,
  type ChatbotConversationUpdate,
  type ChatbotLogActionInput,
  type ChatbotRespondInput,
  type ChatbotSettingsInput,
  type RequestCreateInput,
} from '@tgs/contracts';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {normalizePhone, normalizeText, productSimilarity} from '@tgs/validation';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';
import {createQuoteRequest} from './quotes.js';
import {saveChatbotRuleImage} from './chatbot-storage.js';

const CHAT_KEY_MAX = 200;
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function settingsDto(row: any): ChatbotSettingsInput & {id: 'singleton'; updatedAt: Date} {
  const emptyAttachments={imageUrl:null,url:null,quote:null};
  const ids=new Set<string>();
  const uniqueId=(raw:unknown,prefix:string)=>{
    const base=(typeof raw==='string'&&raw.trim()?raw.trim():`${prefix}-${ids.size+1}`).slice(0,90);
    let id=base;
    let suffix=2;
    while(ids.has(id))id=`${base}-${suffix++}`;
    ids.add(id);
    return id;
  };
  const stored=Array.isArray(row.knowledgeEntries)?row.knowledgeEntries:[];
  const unified=stored.filter((entry:any)=>entry&&Array.isArray(entry.activators)&&typeof entry.answer==='string');
  const legacyKnowledge=stored.filter((entry:any)=>entry&&!Array.isArray(entry.activators)&&Array.isArray(entry.patterns));
  const responses=[
    ...unified.map((entry:any)=>({
      id:uniqueId(entry.id,'respuesta'),
      enabled:entry.enabled!==false,
      activators:entry.activators.filter((value:unknown)=>typeof value==='string'&&value.trim()),
      similarityThreshold:Number.isInteger(entry.similarityThreshold)?entry.similarityThreshold:90,
      answer:entry.answer,
      context:typeof entry.context==='string'?entry.context:'',
      attachments:entry.attachments&&typeof entry.attachments==='object'?entry.attachments:emptyAttachments,
    })),
    ...legacyKnowledge.map((entry:any)=>({
      id:uniqueId(entry.id,'faq'),
      enabled:entry.enabled!==false,
      activators:entry.patterns.filter((value:unknown)=>typeof value==='string'&&value.trim()),
      similarityThreshold:90,
      answer:entry.answer,
      context:'',
      attachments:emptyAttachments,
    })),
    ...(Array.isArray(row.customRules)?row.customRules:[]).map((rule:any)=>{
      const responseContext=typeof rule.responseContext==='string'?rule.responseContext.trim():'';
      const instruction=typeof rule.instruction==='string'?rule.instruction.trim():'';
      return {
        id:uniqueId(rule.id,'regla'),
        enabled:rule.enabled!==false,
        activators:Array.isArray(rule.triggerKeywords)
          ?rule.triggerKeywords.filter((value:unknown)=>typeof value==='string'&&value.trim())
          :[],
        similarityThreshold:Array.isArray(rule.triggerKeywords)&&rule.triggerKeywords.length===0
          ?0
          :Number.isInteger(rule.triggerSimilarityThreshold)
            ?rule.triggerSimilarityThreshold
            :100,
        answer:responseContext||instruction||'Responder según el contexto configurado.',
        context:responseContext?instruction:'',
        attachments:rule.attachments&&typeof rule.attachments==='object'
          ?rule.attachments
          :emptyAttachments,
      };
    }),
  ];
  const {knowledgeEntries:_legacyKnowledge,customRules:_legacyRules,...base}=row;
  return {
    ...base,
    openingMessages: row.openingMessages,
    closingMessages: row.closingMessages,
    responses,
    escalationKeywords: row.escalationKeywords,
    businessHours: row.businessHours,
    outsideHoursBehavior: row.outsideHoursBehavior,
    responseStyle: row.responseStyle,
    ignoredAutoMessages: Array.isArray(row.ignoredAutoMessages)
      ? row.ignoredAutoMessages
      : ['¡Hola! ¿Cómo podemos ayudarte'],
    autoDelayMaxSeconds: Number.isInteger(row.autoDelayMaxSeconds) ? row.autoDelayMaxSeconds : 0,
    reuseSimilarityThreshold: Number.isInteger(row.reuseSimilarityThreshold)
      ? row.reuseSimilarityThreshold
      : 90,
  };
}

function normalizedRuleText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/\s+/g, ' ')
    .trim();
}

function responseMatchScore(response:ChatbotSettingsInput['responses'][number],message:string):number {
  const normalizedMessage = normalizedRuleText(message);
  if(!response.enabled)return -1;
  if(response.activators.length===0)return 0;
  let best=-1;
  for(const activator of response.activators){
    const normalizedActivator=normalizedRuleText(activator);
    if(!normalizedActivator)continue;
    const direct=normalizedMessage.includes(normalizedActivator);
    const similarity=direct?100:productSimilarity(normalizedMessage,normalizedActivator);
    if(direct||similarity>=response.similarityThreshold)best=Math.max(best,similarity);
  }
  return best;
}

function matchedResponse(
  responses: ChatbotSettingsInput['responses'],
  message: string,
) {
  return responses
    .map(response=>({response,score:responseMatchScore(response,message)}))
    .filter(item=>item.score>=0)
    .sort((a,b)=>b.score-a.score||b.response.activators.join(' ').length-a.response.activators.join(' ').length)[0]??null;
}

function replyLooksChatSpecific(reply:string,displayName:string|null|undefined):boolean {
  const normalizedReply=normalizeText(reply);
  const normalizedName=normalizeText(displayName??'');
  if(normalizedName.length>=3&&!/^\d+$/.test(normalizedName)&&normalizedReply.includes(normalizedName))return true;
  return /\b(?:tgs[-\s]?\d{3,}|presupuesto\s*(?:nro|n°|numero)?\s*\d+|\+?54\s*9?\s*\d{2,})\b/i.test(reply)
    || /(?:\$\s*\d|ars\s*\d|\b\d{1,3}(?:[./-]\d{1,2}){1,2}\b)/i.test(reply);
}

async function findReusableReply(message:string,threshold:number,currentInboundId:string) {
  if(threshold===0)return null;
  const normalized=normalizeText(message);
  if(!normalized)return null;
  const inbounds=await db.chatbotMessageLog.findMany({
    where:{id:{not:currentInboundId},direction:'INBOUND',status:'OBSERVED'},
    orderBy:{createdAt:'desc'},
    take:1000,
    include:{conversation:{select:{displayName:true}}},
  });
  const scored=inbounds
    .map(candidate=>({
      candidate,
      similarity:normalizeText(candidate.text)===normalized
        ?100
        :productSimilarity(candidate.text,message),
    }))
    .filter(item=>item.similarity>=threshold)
    .sort((a,b)=>b.similarity-a.similarity||b.candidate.createdAt.getTime()-a.candidate.createdAt.getTime());
  if(!scored.length)return null;
  const outboundByInbound=new Map(
    (await db.chatbotMessageLog.findMany({
      where:{
        pairedMessageId:{in:scored.map(item=>item.candidate.id)},
        direction:'OUTBOUND',
        status:{in:['SUGGESTED','SEND_PENDING','SENT']},
        shouldEscalate:false,
        text:{not:''},
      },
      orderBy:{createdAt:'desc'},
    })).map(outbound=>[outbound.pairedMessageId,outbound]),
  );
  for(const item of scored){
    const outbound=outboundByInbound.get(item.candidate.id);
    if(!outbound||replyLooksChatSpecific(outbound.text,item.candidate.conversation.displayName))continue;
    return {
      reply:outbound.text,
      similarity:item.similarity,
      sourceInboundLogId:item.candidate.id,
      sourceOutboundLogId:outbound.id,
    };
  }
  return null;
}

async function resolveRuleAttachments(responses:ChatbotSettingsInput['responses'],message:string) {
  const match=matchedResponse(responses,message);
  const resolved=[];
  if(match){
    const response=match.response;
    const attachment:any={ruleId:response.id};
    if(response.attachments.imageUrl){
      const pathname=new URL(response.attachments.imageUrl,'http://localhost').pathname;
      attachment.image={
        url:response.attachments.imageUrl,
        filename:pathname.split('/').pop()||`respuesta-${response.id}.jpg`,
      };
    }
    if(response.attachments.quote){
      const family=await db.quoteFamily.findUnique({
        where:{id:response.attachments.quote.familyId},
        select:{id:true,visibleNumber:true,activeVersion:true,versions:{select:{version:true}}},
      });
      if(family){
        const version=response.attachments.quote.useLatest
          ?family.activeVersion
          :response.attachments.quote.version;
        if(version&&family.versions.some(item=>item.version===version)){
          attachment.quote={
            familyId:family.id,
            version,
            visibleNumber:family.visibleNumber,
            filename:`${family.visibleNumber}-V${version}-SIMPLE.pdf`,
          };
        }
      }
    }
    if(attachment.image||attachment.quote)resolved.push(attachment);
  }
  return resolved;
}

function isOutsideBusinessHours(config: ChatbotSettingsInput['businessHours']): boolean {
  if (!config.enabled) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const weekday = parts.find((part) => part.type === 'weekday')?.value.toLowerCase();
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const dayIndex = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(weekday ?? '');
    const ranges = config.schedule[dayNames[Math.max(0, dayIndex)] ?? 'sunday'];
    const now = `${hour}:${minute}`;
    return !ranges.some((range) => now >= range.from && now < range.to);
  } catch {
    // Una zona inválida nunca habilita envíos fuera de horario accidentalmente.
    return true;
  }
}

function explicitEscalation(message: string, keywords: string[]): string | null {
  const normalized = message.toLocaleLowerCase('es-AR');
  const match = keywords.find((keyword) => normalized.includes(keyword.toLocaleLowerCase('es-AR')));
  return match ? `Regla explícita por palabra o frase: "${match}"` : null;
}

async function createEscalationNotification(tx: any, chatKey: string, reason: string, logId: string) {
  return tx.notification.create({
    data: {
      chatPhone: chatKey,
      type: 'CHATBOT_ESCALATION',
      title: 'El chatbot necesita intervención',
      body: `La conversación quedó pausada para revisión humana. Motivo interno: ${reason}`,
      entityType: 'ChatbotConversation',
      entityId: chatKey,
      metadata: {chatbotLogId: logId, reason},
    },
  });
}

type ChatbotRequestDraft = {
  title: string;
  summary: string;
  expectedUse: string | null;
  requiredComponents: string[];
  maximumBudgetCents: number | null;
};

async function matchCustomerByPhone(tx:any, phone:string|null|undefined) {
  const normalized=normalizePhone(phone);
  if(!normalized)return null;
  return tx.customer.findFirst({where:{normalizedPhone:normalized}});
}

function requestBody(
  draft:ChatbotRequestDraft,
  phone:string|null,
  customerId:string|null,
):RequestCreateInput {
  return {
    title:draft.title,
    originalText:draft.summary,
    internalNotes:'Solicitud detectada y creada automáticamente por el chatbot desde WhatsApp.',
    customerId,
    detectedPhone:phone,
    maximumBudgetCents:draft.maximumBudgetCents==null?null:String(draft.maximumBudgetCents),
    expectedUse:draft.expectedUse,
    requiredComponents:draft.requiredComponents,
    assigneeId:null,
    state:'PENDIENTE',
  };
}

async function ensureChatbotRequest(
  tx:any,
  chatKey:string,
  phone:string|null,
  draft:ChatbotRequestDraft,
  actorId:string,
  logId:string,
) {
  // Serializa decisiones concurrentes del mismo chat antes de revisar/crear la solicitud.
  await tx.$queryRaw`SELECT "chatKey" FROM "ChatbotConversation" WHERE "chatKey" = ${chatKey} FOR UPDATE`;
  const conversation=await tx.chatbotConversation.findUnique({
    where:{chatKey},
    include:{activeRequest:true},
  });
  if(conversation?.activeRequest&&conversation.activeRequest.state!=='CERRADA'){
    return {request:conversation.activeRequest,created:false};
  }

  const normalized=normalizePhone(phone);
  let existing=null;
  if(normalized){
    const candidates=await tx.quoteRequest.findMany({
      where:{state:'PENDIENTE',detectedPhone:{not:null}},
      orderBy:{createdAt:'desc'},
      take:100,
    });
    existing=candidates.find((candidate:any)=>normalizePhone(candidate.detectedPhone)===normalized)??null;
  }
  if(existing){
    await tx.chatbotConversation.update({
      where:{chatKey},
      data:{activeRequestId:existing.id},
    });
    return {request:existing,created:false};
  }

  const customer=await matchCustomerByPhone(tx,phone);
  const request=await createQuoteRequest(
    tx,
    requestBody(draft,phone,customer?.id??null),
    actorId,
    {automated:true,source:'CHATBOT_AUTO',chatKey,chatbotLogId:logId},
  );
  await tx.chatbotConversation.update({
    where:{chatKey},
    data:{activeRequestId:request.id},
  });
  await tx.notification.create({data:{
    type:'CHATBOT_REQUEST_CREATED',
    title:'El chatbot creó una solicitud',
    body:`${request.title} quedó en Solicitudes como PENDIENTE para preparar y cotizar.`,
    chatPhone:chatKey,
    entityType:'QuoteRequest',
    entityId:request.id,
    metadata:{chatbotLogId:logId,automated:true},
  }});
  return {request,created:true};
}

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
      const next = await tx.chatbotSettings.update({
        where: {id: 'singleton'},
        data: {
          ...body,
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
    const settings = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}});
    const [rows,pendingSuggestions]=await Promise.all([
      db.chatbotConversation.findMany({
        orderBy: {updatedAt: 'desc'},
        take: 300,
        include: {
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
        ? {status:'ESCALATED',label:'Escalado'}
        : latestOutbound?.status==='SEND_FAILED'
          ? {status:'UNRESOLVED',label:'No resuelto'}
          : row.activeRequest&&row.activeRequest.state!=='CERRADA'
            ? {status:'PENDING_REQUEST',label:'Presupuesto'}
            : suggestionChats.has(row.chatKey)
              ? {status:'SUGGESTION',label:'Aprobar'}
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

  @Put('conversations/:chatKey')
  async putConversation(
    @Param('chatKey') rawChatKey: string,
    @Body(new ZodPipe(chatbotConversationUpdateSchema)) body: ChatbotConversationUpdate,
    @CurrentUser() actor: RequestUser,
  ) {
    const chatKey = decodeURIComponent(rawChatKey).slice(0, CHAT_KEY_MAX);
    const next = await db.chatbotConversation.upsert({
      where: {chatKey},
      create: {
        chatKey,
        displayName: body.displayName,
        modeOverride: body.modeOverride,
      },
      update: {
        displayName: body.displayName,
        modeOverride: body.modeOverride,
        ...(body.clearEscalation ? {escalatedAt: null, escalationReason: null} : {}),
      },
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

  @Get('logs')
  async logs(@Query(new ZodPipe(chatbotLogsQuerySchema)) query: {chatKey?: string; limit: number}) {
    return jsonSafe(await db.chatbotMessageLog.findMany({
      where: query.chatKey ? {conversationKey: query.chatKey} : undefined,
      orderBy: {createdAt: 'desc'},
      take: query.limit,
    }));
  }

  @Post('respond')
  async respond(
    @Body(new ZodPipe(chatbotRespondSchema)) body: ChatbotRespondInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const settings = settingsDto(await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}}));
    const conversation = await db.chatbotConversation.upsert({
      where: {chatKey: body.chatKey},
      create: {chatKey: body.chatKey, displayName: body.displayName},
      update: body.displayName ? {displayName: body.displayName} : {},
      include: {activeRequest: true},
    });
    const configuredMode = conversation.modeOverride ?? settings.defaultMode;
    const effectiveMode = body.simulation ? 'AUTO' : body.manualSuggestion ? 'SUGGEST' : configuredMode;

    let inbound: any;
    try {
      inbound = await db.chatbotMessageLog.create({data: {
        conversationKey: body.chatKey,
        direction: 'INBOUND',
        actor: 'CUSTOMER',
        mode: effectiveMode,
        status: 'OBSERVED',
        text: body.message,
        inboundFingerprint: body.messageFingerprint,
        decisionMetadata: {messageType: body.messageType, simulated: body.simulation},
      }});
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await db.chatbotMessageLog.findFirst({
          where: {
            conversationKey: body.chatKey,
            inboundFingerprint: body.messageFingerprint,
            direction: 'OUTBOUND',
          },
          orderBy: {createdAt: 'desc'},
        });
        return {
          action: 'DUPLICATE',
          effectiveMode,
          autoSend: false,
          duplicateStatus: existing?.status,
          ...(existing?.status === 'SUGGESTED'
            ? {
                reply: existing.text,
                logId: existing.id,
                notificationId: existing.notificationId,
              }
            : {}),
        };
      }
      throw error;
    }

    await db.chatbotConversation.update({
      where: {chatKey: body.chatKey},
      data: {
        lastInboundFingerprint: body.messageFingerprint,
        lastInboundText: body.message,
        lastInboundAt: new Date(),
      },
    });

    // Segunda barrera del kill-switch: se evalúa en cada request y antes de invocar IA.
    if (!settings.enabled || effectiveMode === 'OFF') {
      return {action: settings.enabled ? 'OFF' : 'DISABLED', effectiveMode, autoSend: false, inboundLogId: inbound.id};
    }
    if (conversation.escalatedAt) {
      return {action: 'ESCALATED', effectiveMode, autoSend: false, inboundLogId: inbound.id};
    }

    const outsideHours = isOutsideBusinessHours(settings.businessHours);
    if (outsideHours && settings.outsideHoursBehavior.mode === 'OFF') {
      return {action: 'OUTSIDE_HOURS', effectiveMode, autoSend: false, inboundLogId: inbound.id};
    }

    const keywordReason = explicitEscalation(body.message, settings.escalationKeywords);
    const localEscalationReason = body.messageType === 'AUDIO'
      ? 'Mensaje de audio recibido, requiere atención humana.'
      : keywordReason;
    const reusable = localEscalationReason
      ? null
      : await findReusableReply(body.message, settings.reuseSimilarityThreshold, inbound.id);
    const aiSettings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
    const key = aiSettings.apiKeyEncrypted
      ? decryptSecret(aiSettings.apiKeyEncrypted)
      : process.env.OPENAI_API_KEY;
    if(!localEscalationReason&&!reusable){
      if(!aiSettings.enabled)throw new ServiceUnavailableException('La IA está deshabilitada en Configuración.');
      if(!aiSettings.responsesEnabled)throw new ServiceUnavailableException('Las respuestas con IA están deshabilitadas en Configuración.');
      if(!key?.trim())throw new ServiceUnavailableException('No hay una API key de OpenAI configurada para generar la sugerencia.');
    }
    const service = new ChatbotResponseService({
      client: localEscalationReason ? null : createAiClient({apiKey: key}),
      model: settings.model ?? aiSettings.model ?? DEFAULT_AI_MODEL,
    });
    const result = reusable
      ? {
          result:{
            reply:reusable.reply,
            shouldEscalate:false,
            escalationReason:null,
            updatedSummary:null,
            matchedKnowledgeIds:[],
            decisionReason:`Respuesta reutilizada por similitud determinística del ${reusable.similarity}%.`,
            shouldCreateRequest:false,
            requestDraft:null,
          },
          metadata:{
            model:'respuesta-reutilizada',
            inputHash:inputHash({message:body.message,reusable}),
            usedAi:false,
            cacheHit:true,
            durationMs:0,
            success:true,
            costUsdCents:0n,
            usage:{promptTokens:0,completionTokens:0,totalTokens:0},
            error:undefined,
          },
        }
      : localEscalationReason
      ? {
          result: {
            reply: '',
            shouldEscalate: true,
            escalationReason: localEscalationReason,
            updatedSummary: conversation.summary ?? null,
            matchedKnowledgeIds: [],
            decisionReason: body.messageType === 'AUDIO'
              ? 'El mensaje entrante es un audio sin transcripción disponible.'
              : 'Coincidió una regla explícita de escalación.',
            shouldCreateRequest: false,
            requestDraft: null,
          },
          metadata: {
            model: 'regla-local', inputHash: inputHash({
              message: body.message,
              messageType: body.messageType,
              localEscalationReason,
            }),
            usedAi: false, cacheHit: false, durationMs: 0, success: true, costUsdCents: 0n,
            usage: undefined, error: undefined,
          },
        }
      : await service.respond({
          chatKey: body.chatKey,
          latestMessage: body.message,
          conversationSummary: conversation.summary ?? undefined,
          activeRequest: conversation.activeRequest && conversation.activeRequest.state !== 'CERRADA'
            ? {
                id: conversation.activeRequest.id,
                title: conversation.activeRequest.title,
                state: conversation.activeRequest.state,
              }
            : undefined,
          recentMessages: settings.maxRecentSnippets === 0
            ? []
            : (body.recentMessages ?? []).slice(-settings.maxRecentSnippets),
          config: {
            persona: settings.persona,
            openingMessages: settings.openingMessages,
            closingMessages: settings.closingMessages,
            responses: settings.responses,
            escalationInstructions: settings.escalationInstructions,
            modelCanEscalate: settings.modelCanEscalate,
            businessContext: outsideHours
              ? `Fuera de horario. Conducta configurada: ${settings.outsideHoursBehavior.mode}. Mensaje permitido: ${settings.outsideHoursBehavior.message}`
              : 'Dentro del horario de atención.',
            responseStyle: settings.responseStyle,
          },
        });

    if(!localEscalationReason&&!reusable&&(!result.metadata.usedAi||!result.metadata.success)){
      throw new BadGatewayException(
        result.metadata.error
          ? `OpenAI no pudo generar la sugerencia: ${result.metadata.error}`
          : 'OpenAI no pudo generar una respuesta válida. Revisá la conexión y el modelo configurado.',
      );
    }

    const shouldEscalate = Boolean(result.result.shouldEscalate);
    const reason = result.result.escalationReason ?? (shouldEscalate ? 'El modelo indicó que no puede resolver con seguridad.' : null);
    const responseMatch=matchedResponse(settings.responses,body.message);
    const configuredUrls=responseMatch?.response.attachments.url
      ?[responseMatch.response.attachments.url]
      :[];
    const baseReply=result.result.reply.trim().slice(0,settings.responseStyle.maxCharacters);
    const reply=[baseReply,...configuredUrls.filter(url=>!baseReply.includes(url))]
      .filter(Boolean)
      .join('\n\n');
    const resolvedAttachments=await resolveRuleAttachments(settings.responses,body.message);
    if (!shouldEscalate && !reply) throw new BadRequestException('La IA no generó una respuesta utilizable');
    if (!shouldEscalate && settings.responseStyle.avoidRepetition && reply === conversation.lastOutboundText?.trim()) {
      throw new ConflictException('La respuesta repite exactamente el último mensaje; se bloqueó por seguridad');
    }

    // Tercera lectura autoritativa: cubre el caso en que el operador apaga el bot mientras la IA responde.
    const stillEnabled = await db.chatbotSettings.findUniqueOrThrow({
      where: {id: 'singleton'},
      select: {enabled: true},
    });
    if (!stillEnabled.enabled) {
      const blocked = await db.chatbotMessageLog.create({data: {
        conversationKey: body.chatKey,
        direction: 'OUTBOUND',
        actor: 'SYSTEM',
        mode: effectiveMode,
        status: 'SEND_FAILED',
        text: reply,
        inboundFingerprint: body.messageFingerprint,
        pairedMessageId: inbound.id,
        model: result.metadata.model,
        inputHash: result.metadata.inputHash,
        shouldEscalate,
        escalationReason: reason,
        decisionMetadata: {
          matchedKnowledgeIds: result.result.matchedKnowledgeIds,
          decisionReason: result.result.decisionReason,
          blockedByKillSwitch: true,
        },
        error: 'Kill-switch apagado mientras se generaba la respuesta.',
      }});
      return {action: 'DISABLED', effectiveMode, autoSend: false, inboundLogId: inbound.id, logId: blocked.id};
    }

    const output = await db.$transaction(async (tx) => {
      const log = await tx.chatbotMessageLog.create({data: {
        conversationKey: body.chatKey,
        direction: 'OUTBOUND',
        actor: 'BOT',
        mode: effectiveMode,
        status: body.simulation
          ? 'SUGGESTED'
          : shouldEscalate
            ? 'ESCALATED'
            : effectiveMode === 'AUTO'
              ? 'SEND_PENDING'
              : 'SUGGESTED',
        text: reply,
        inboundFingerprint: body.messageFingerprint,
        pairedMessageId: inbound.id,
        model: result.metadata.model,
        promptTokens: result.metadata.usage?.promptTokens,
        completionTokens: result.metadata.usage?.completionTokens,
        totalTokens: result.metadata.usage?.totalTokens,
        inputHash: result.metadata.inputHash,
        shouldEscalate,
        escalationReason: reason,
        decisionMetadata: {
          matchedKnowledgeIds: result.result.matchedKnowledgeIds,
          matchedResponseId: responseMatch?.response.id??null,
          matchedResponseScore: responseMatch?.score??null,
          decisionReason: result.result.decisionReason,
          reusedResponse: reusable,
          shouldCreateRequest: result.result.shouldCreateRequest,
          requestDraft: result.result.requestDraft,
          outsideBusinessHours: outsideHours,
          settingsUpdatedAt: settings.updatedAt,
          usedAi: result.metadata.usedAi,
          aiSuccess: result.metadata.success,
          aiError: result.metadata.error,
          simulated: body.simulation,
          simulationOutcome: body.simulation ? {
            wouldSendText: Boolean(reply),
            wouldEscalate: shouldEscalate,
            escalationReason: reason,
            wouldCreateRequest: result.result.shouldCreateRequest,
            wouldAttach: resolvedAttachments,
          } : undefined,
        },
      }});
      let requestResult:{request:any;created:boolean}|null=null;
      if(!body.simulation&&effectiveMode==='AUTO'&&result.result.shouldCreateRequest&&result.result.requestDraft){
        const phone=body.detectedPhone??(body.chatKey.startsWith('tel:')?body.chatKey.slice(4):null);
        requestResult=await ensureChatbotRequest(
          tx,
          body.chatKey,
          phone,
          result.result.requestDraft,
          actor.id,
          log.id,
        );
      }
      if(!body.simulation)await tx.chatbotConversation.update({
        where: {chatKey: body.chatKey},
        data: {
          ...(result.result.updatedSummary !== null
            ? {summary: result.result.updatedSummary}
            : {}),
          summaryMessageCount: {increment: 1},
          ...(shouldEscalate ? {escalatedAt: new Date(), escalationReason: reason} : {}),
        },
      });
      if(body.simulation){
        return {log,notification:null,action:'SIMULATED' as const,requestResult};
      }
      if (shouldEscalate) {
        const notification = await createEscalationNotification(tx, body.chatKey, reason ?? 'Revisión humana requerida', log.id);
        await tx.chatbotMessageLog.update({where: {id: log.id}, data: {notificationId: notification.id}});
        return {log, notification, action: 'ESCALATED' as const, requestResult};
      }
      if (effectiveMode === 'SUGGEST') {
        // La sugerencia ya queda visible en el panel del chat y auditada en ChatbotMessageLog.
        // No generamos una notificación de campana porque no requiere una acción adicional.
        return {log, notification: null, action: 'SUGGESTED' as const, requestResult};
      }
      return {log, notification: null, action: 'AUTO_REPLY' as const, requestResult};
    });

    return jsonSafe({
      action: output.action,
      effectiveMode,
      autoSend: output.action === 'AUTO_REPLY',
      reply: output.action === 'AUTO_REPLY' || output.action === 'SUGGESTED' || output.action === 'SIMULATED'
        ? reply
        : undefined,
      logId: output.log.id,
      notificationId: output.notification?.id,
      request: output.requestResult ? {
        id: output.requestResult.request.id,
        title: output.requestResult.request.title,
        state: output.requestResult.request.state,
        created: output.requestResult.created,
      } : undefined,
      autoDelayMaxSeconds: output.action === 'AUTO_REPLY' || output.action === 'SIMULATED'
        ? settings.autoDelayMaxSeconds
        : 0,
      simulation: body.simulation,
      wouldEscalate: body.simulation&&shouldEscalate?{reason}:undefined,
      reused: reusable ?? undefined,
      attachments: resolvedAttachments,
    });
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
