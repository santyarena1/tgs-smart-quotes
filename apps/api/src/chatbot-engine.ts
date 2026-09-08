/**
 * Motor de decisión del chatbot.
 *
 * Contiene, sin ningún cambio de comportamiento, la lógica que antes vivía dentro
 * del método `respond()` del controller. Se extrajo para que el webhook de
 * WhatsApp Cloud API pueda invocarla desde código, sin dar una vuelta por HTTP.
 *
 * Las tres barreras del kill-switch, la escalación, la reutilización determinística
 * de respuestas y la creación automática de solicitudes se conservan tal cual.
 */
import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {ChatbotResponseService, createAiClient, DEFAULT_AI_MODEL, inputHash} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {type ChatbotRespondInput} from '@tgs/contracts';
import {db, Prisma} from '@tgs/database';
import {jsonSafe} from './infrastructure.js';
import {splitChatbotAiMessages} from './chatbot-message-splitter.js';
import {
  createEscalationNotification,
  ensureChatbotRequest,
  explicitEscalation,
  findReusableReply,
  isOutsideBusinessHours,
  matchedResponse,
  resolveRuleAttachments,
  settingsDto,
} from './chatbot-core.js';

/** Ejecuta el ciclo completo de decisión para un mensaje entrante. */
export async function runChatbotResponse(body: ChatbotRespondInput, actorId: string) {
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
            messages:[reusable.reply],
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
            messages: [],
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
            multiMessage:{
              maxBubbles:settings.multiMessage.maxBubbles,
              splitMode:settings.multiMessage.splitMode,
            },
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
    const legacyReply=[baseReply,...configuredUrls.filter(url=>!baseReply.includes(url))]
      .filter(Boolean)
      .join('\n\n');
    const resolvedAttachments=await resolveRuleAttachments(settings.responses,body.message);
    const aiMessages=settings.multiMessage.splitMode==='FIXED_ONLY'
      ?[baseReply]
      :settings.multiMessage.enabled
        ?splitChatbotAiMessages(result.result.messages,baseReply,settings.multiMessage.maxBubbles)
        :(result.result.messages.length?result.result.messages:[baseReply]).slice(0,settings.multiMessage.maxBubbles);
    let messages=settings.multiMessage.enabled
      ?[
          ...(!conversation.lastOutboundText&&settings.multiMessage.openingMessage.trim()?[settings.multiMessage.openingMessage.trim()]:[]),
          ...aiMessages.map(message=>message.trim()).filter(Boolean),
          ...(settings.multiMessage.closingMessage.trim()?[settings.multiMessage.closingMessage.trim()]:[]),
        ]
      :[legacyReply];
    if(settings.multiMessage.enabled&&configuredUrls.length){
      const urls=configuredUrls.filter(url=>!messages.some(message=>message.includes(url)));
      if(urls.length){
        const last=messages.length-1;
        if(last>=0)messages[last]=[messages[last],...urls].join('\n\n');
        else messages=urls;
      }
    }
    messages=shouldEscalate?[]:messages.filter(Boolean);
    const reply=messages.join('\n');
    const quoteFollowupMessage=!shouldEscalate
      &&settings.multiMessage.quoteFollowup.enabled
      &&resolvedAttachments.some(attachment=>attachment.quote)
      ?settings.multiMessage.quoteFollowup.message.trim()||null
      :null;
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
          actorId,
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
      messages: output.action === 'AUTO_REPLY' || output.action === 'SUGGESTED' || output.action === 'SIMULATED'
        ? messages
        : [],
      quoteFollowupMessage: output.action === 'AUTO_REPLY' || output.action === 'SUGGESTED' || output.action === 'SIMULATED'
        ? quoteFollowupMessage
        : null,
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
      multiMessage:{
        draftMode:settings.multiMessage.draftMode,
        betweenDelayMinSeconds:settings.multiMessage.betweenDelayMinSeconds,
        betweenDelayMaxSeconds:settings.multiMessage.betweenDelayMaxSeconds,
      },
    });
}
