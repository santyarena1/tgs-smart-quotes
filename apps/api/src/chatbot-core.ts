/**
 * Núcleo compartido del chatbot: helpers de configuración, matching de reglas,
 * reutilización de respuestas, horario comercial, escalación y creación de solicitudes.
 *
 * Vivían dentro de `chatbot.ts` cuando el único disparador era el endpoint HTTP que
 * llamaba la extensión. Ahora el webhook de WhatsApp Cloud API también necesita
 * invocarlos desde código, así que se extrajeron acá sin cambiar una sola regla.
 */
import {createQuoteRequest} from './quotes.js';
import {
  DEFAULT_SALES_RULES,
  DEFAULT_STAGE_PLAYBOOK,
  DEFAULT_WRITING_FILTERS,
  type ChatbotSettingsInput,
  type RequestCreateInput,
  type WritingFilters,
} from '@tgs/contracts';
import {db} from '@tgs/database';
import {parseTeamAlerts} from './crm-team-alerts.js';
import {normalizePhone, normalizeText, productSimilarity} from '@tgs/validation';

export const CHAT_KEY_MAX = 200;
export const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export const defaultMultiMessage:ChatbotSettingsInput['multiMessage']={
  enabled:true,splitMode:'AI_NATURAL',maxBubbles:3,openingMessage:'',closingMessage:'',
  quoteFollowup:{enabled:true,message:'Decime si querés cambiar algo o sumar/sacar componentes 👍'},
  draftMode:'QUEUE',betweenDelayMinSeconds:2,betweenDelayMaxSeconds:6,
};

export function settingsDto(row: any): ChatbotSettingsInput & {id: 'singleton'; updatedAt: Date} {
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
  // followups se edita en CRM → Seguimientos, no en Configuración → Chatbot.
  // Si viaja en el GET, el PUT .strict() tira "Unrecognized key(s): followups"
  // y no se puede guardar el horario.
  const {knowledgeEntries:_legacyKnowledge,customRules:_legacyRules,followups:_followups,...base}=row;
  return {
    ...base,
    openingMessages: row.openingMessages,
    closingMessages: row.closingMessages,
    responses,
    escalationKeywords: row.escalationKeywords,
    businessHours: row.businessHours,
    outsideHoursBehavior: row.outsideHoursBehavior,
    responseStyle: row.responseStyle,
    multiMessage: row.multiMessage&&typeof row.multiMessage==='object'
      ? {...defaultMultiMessage,...row.multiMessage,quoteFollowup:{...defaultMultiMessage.quoteFollowup,...row.multiMessage.quoteFollowup}}
      : defaultMultiMessage,
    productMessageIntro:typeof row.productMessageIntro==='string'?row.productMessageIntro:'Este sería el producto 👇',
    quoteSendPrompt:typeof row.quoteSendPrompt==='string'&&row.quoteSendPrompt.trim()?row.quoteSendPrompt:'Redactá un mensaje breve y cálido presentando el presupuesto adjunto, respondiendo puntualmente a lo que el cliente pidió según los últimos mensajes. No inventes datos.',
    ignoredAutoMessages: Array.isArray(row.ignoredAutoMessages)
      ? row.ignoredAutoMessages
      : ['¡Hola! ¿Cómo podemos ayudarte'],
    autoDelayMaxSeconds: Number.isInteger(row.autoDelayMaxSeconds) ? row.autoDelayMaxSeconds : 0,
    reuseSimilarityThreshold: Number.isInteger(row.reuseSimilarityThreshold)
      ? row.reuseSimilarityThreshold
      : 90,
    recontactEnabled: row.recontactEnabled === true,
    recontactDays: Number.isInteger(row.recontactDays) ? row.recontactDays : 30,
    recontactPrompt: typeof row.recontactPrompt === 'string' ? row.recontactPrompt : '',
    recontactMaxAttempts: Number.isInteger(row.recontactMaxAttempts) ? row.recontactMaxAttempts : 1,
    replyDebounceSeconds: Number.isInteger(row.replyDebounceSeconds) ? row.replyDebounceSeconds : 10,
    autoResumeHours: Number.isInteger(row.autoResumeHours) ? row.autoResumeHours : 0,
    trainerNumbers: Array.isArray(row.trainerNumbers) ? row.trainerNumbers : [],
    guidance: Array.isArray(row.guidance) ? row.guidance : [],
    transcribeAudio: row.transcribeAudio !== false,
    describeImages: row.describeImages !== false,
    salesRules: Array.isArray(row.salesRules) ? (row.salesRules as string[]) : DEFAULT_SALES_RULES,
    stagePlaybook: row.stagePlaybook && typeof row.stagePlaybook === 'object' && !Array.isArray(row.stagePlaybook)
      ? {...DEFAULT_STAGE_PLAYBOOK, ...(row.stagePlaybook as Record<string, string>)}
      : DEFAULT_STAGE_PLAYBOOK,
    teamAlerts: parseTeamAlerts(row.teamAlerts),
    writingFilters: row.writingFilters && typeof row.writingFilters === 'object'
      ? {...DEFAULT_WRITING_FILTERS, ...(row.writingFilters as Partial<WritingFilters>)}
      : DEFAULT_WRITING_FILTERS,
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
  const messageWords = ` ${wordsOf(message)} `;
  if(!response.enabled)return -1;
  if(response.activators.length===0)return 0;
  let best=-1;
  for(const activator of response.activators){
    const normalizedActivator=normalizedRuleText(activator);
    if(!normalizedActivator)continue;
    // Palabra o frase completa: "seña" no cuenta dentro de "diseñar".
    const activatorWords=wordsOf(activator);
    const direct=activatorWords.length>0&&messageWords.includes(` ${activatorWords} `);
    const similarity=direct?100:productSimilarity(normalizedMessage,normalizedActivator);
    if(direct||similarity>=response.similarityThreshold)best=Math.max(best,similarity);
  }
  return best;
}

export function matchedResponse(
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

/**
 * Reutiliza una respuesta ya dada a una pregunta casi igual, para no gastar IA.
 *
 * Solo sirven respuestas de clientes reales (no del simulador `sim:`) generadas con
 * la configuración vigente: si el bot se reconfiguró, una respuesta vieja contradice
 * lo nuevo y hace imposible ajustarlo.
 */
export async function findReusableReply(message:string,threshold:number,currentInboundId:string,settingsUpdatedAt:Date) {
  if(threshold===0)return null;
  const normalized=normalizeText(message);
  if(!normalized)return null;
  const inbounds=await db.chatbotMessageLog.findMany({
    where:{id:{not:currentInboundId},direction:'INBOUND',status:'OBSERVED',NOT:{conversationKey:{startsWith:'sim:'}}},
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
    const metadata=(outbound.decisionMetadata??{}) as Record<string,unknown>;
    if(metadata.simulated===true)continue;
    const generatedWith=typeof metadata.settingsUpdatedAt==='string'?new Date(metadata.settingsUpdatedAt).getTime():NaN;
    if(generatedWith!==settingsUpdatedAt.getTime())continue;
    const stored=Array.isArray(metadata.sentBubbles)?metadata.sentBubbles:Array.isArray(metadata.bubbles)?metadata.bubbles:[];
    const bubbles=stored.filter((bubble):bubble is string=>typeof bubble==='string'&&bubble.trim().length>0);
    return {
      bubbles:bubbles.length?bubbles:[outbound.text],
      reply:outbound.text,
      similarity:item.similarity,
      sourceInboundLogId:item.candidate.id,
      sourceOutboundLogId:outbound.id,
    };
  }
  return null;
}

export async function resolveRuleAttachments(responses:ChatbotSettingsInput['responses'],message:string) {
  const match=matchedResponse(responses,message);
  const resolved=[];
  if(match){
    const response=match.response;
    const attachment:any={ruleId:response.id};
    if(response.attachments.imageUrl){
      const pathname=new URL(response.attachments.imageUrl,'http://localhost').pathname;
      attachment.image={
        url:pathname,
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

export function isOutsideBusinessHours(config: ChatbotSettingsInput['businessHours']): boolean {
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

/** Minúsculas, sin tildes y solo letras/números separados por un espacio. */
function wordsOf(value: string): string {
  return value
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/**
 * Palabras completas, no subcadenas: "rma" no debe activarse con "información" ni
 * "formas". Tampoco importan las tildes: "devolucion" matchea "devolución".
 */
export function explicitEscalation(message: string, keywords: string[]): string | null {
  const normalized = ` ${wordsOf(message)} `;
  const match = keywords.find((keyword) => {
    const words = wordsOf(keyword);
    return words.length > 0 && normalized.includes(` ${words} `);
  });
  return match ? `Regla explícita por palabra o frase: "${match}"` : null;
}

export async function createEscalationNotification(tx: any, chatKey: string, reason: string, logId: string) {
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

export type ChatbotRequestDraft = {
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

export async function ensureChatbotRequest(
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

/**
 * Escritura de WhatsApp de una persona real, según los filtros de Configuración:
 * sin formato de documento (negritas, títulos, links con corchetes, guiones largos),
 * sin tildes, sin signos de apertura (¿ ¡) y sin punto al final del mensaje (los
 * suspensivos y los del medio quedan). La ñ se respeta. Los links no se tocan.
 */
export function casualText(text: string, filters: WritingFilters = DEFAULT_WRITING_FILTERS): string {
  let plain = text;
  if (filters.noFormatting) {
    plain = plain
      .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '$2')
      .replace(/\*\*|__/g, '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/\s+—\s+/g, ', ')
      .replace(/—/g, '-');
  }
  plain = plain
    .split(/(\bhttps?:\/\/\S+)/)
    .map((part, index) => {
      if (index % 2) return part;
      let out = part;
      if (filters.noOpeningMarks) out = out.replace(/[¿¡]/g, '');
      if (filters.noAccents) out = out.replace(/[áéíóúüÁÉÍÓÚÜ]/g, (char) => char.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      return out;
    })
    .join('')
    .trim();
  return filters.noFinalPeriod ? plain.replace(/(?<!\.)\.((?:\s*\p{Extended_Pictographic}\uFE0F?)*)$/u, '$1') : plain;
}
