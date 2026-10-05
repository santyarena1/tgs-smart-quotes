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
import {alertTeamNewRequest} from './crm-requests.js';
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
import {recordUnansweredQuestion} from './bot-training.js';
import {applySignals, mergeProfile, type LeadProfile, type SalesSignals} from './crm-pipeline.js';
import {buildSystemData} from './bot-knowledge.js';
import {
  createEscalationNotification,
  draftFromLead,
  ensureChatbotRequest,
  explicitEscalation,
  explicitPhrase,
  findReusableReply,
  isOutsideBusinessHours,
  matchedResponse,
  resolveAdAttachments,
  resolveRuleAttachments,
  settingsDto,
  casualText,
  pesosToCents,
} from './chatbot-core.js';
import {formatAdContext, matchAdCampaign} from './chatbot-ads.js';

/** Mismo texto ignorando mayúsculas, tildes, signos y espacios: "¡Hola!" = "Hola". */
function sameText(left: string, right: string): boolean {
  const plain = (value: string) => value
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, '');
  const a = plain(left);
  return a.length > 0 && a === plain(right);
}

/**
 * Ejecuta el ciclo completo de decisión para un mensaje entrante.
 *
 * Con la Cloud API el webhook ya guardó el mensaje del cliente: se pasa su
 * `existingInboundId` y el motor lo reutiliza en vez de registrarlo otra vez
 * (antes eso duplicaba el mensaje en "Sugerir" y cortaba la respuesta
 * automática como DUPLICATE por el índice único del fingerprint).
 */
export async function runChatbotResponse(body: ChatbotRespondInput, actorId: string, existingInboundId?: string) {
    const settings = settingsDto(await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}}));
    const ads = settings.ads ?? [];
    const selectedAd = body.adCampaignId
      ? ads.find((ad) => ad.id === body.adCampaignId) ?? null
      : null;
    const simulatedOrigin = selectedAd
      ? {
          source_id: selectedAd.adId || selectedAd.id,
          source_type: 'ad',
          headline: selectedAd.headline || selectedAd.name,
          body: selectedAd.context,
        }
      : undefined;
    const conversation = await db.chatbotConversation.upsert({
      where: {chatKey: body.chatKey},
      create: {
        chatKey: body.chatKey,
        displayName: body.displayName,
        ...(simulatedOrigin ? {origin: simulatedOrigin as Prisma.InputJsonValue} : {}),
      },
      update: {
        ...(body.displayName ? {displayName: body.displayName} : {}),
        ...(simulatedOrigin ? {origin: simulatedOrigin as Prisma.InputJsonValue} : {}),
      },
      include: {activeRequest: true},
    });
    const campaign = selectedAd ?? matchAdCampaign(ads, conversation.origin);
    const liveMode = conversation.modeOverride ?? settings.defaultMode;
    const previewReply = Boolean(body.simulation && body.previewReply);
    // Probar redacta como Automático para ver el texto, salvo que el bot esté
    // apagado: ahí un cliente real no recibe nada, a menos que pidan la vista previa.
    const effectiveMode = body.manualSuggestion && !body.simulation
      ? 'SUGGEST'
      : body.simulation
        ? (previewReply || (settings.enabled && liveMode !== 'OFF') ? 'AUTO' : 'OFF')
        : liveMode;

    let inbound: any;
    if (existingInboundId) {
      inbound = await db.chatbotMessageLog.findUniqueOrThrow({where: {id: existingInboundId}});
    } else try {
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

    // El webhook ya actualizó la conversación con el mensaje real.
    if (!existingInboundId) {
      await db.chatbotConversation.update({
        where: {chatKey: body.chatKey},
        data: {
          lastInboundFingerprint: body.messageFingerprint,
          lastInboundText: body.message,
          lastInboundAt: new Date(),
        },
      });
    }

    // Segunda barrera del kill-switch: se evalúa en cada request y antes de invocar IA.
    if ((!settings.enabled || effectiveMode === 'OFF') && !previewReply) {
      return {action: settings.enabled ? 'OFF' : 'DISABLED', effectiveMode, liveMode, autoSend: false, inboundLogId: inbound.id};
    }
    if (conversation.escalatedAt) {
      return {action: 'ESCALATED', effectiveMode, autoSend: false, inboundLogId: inbound.id};
    }
    // Un vendedor tiene el chat: el bot no responde solo. Una sugerencia pedida a
    // mano por el vendedor sí se genera (es el vendedor el que decide mandarla).
    if (conversation.botPausedAt && !body.manualSuggestion && !body.simulation) {
      return {action: 'PAUSED', effectiveMode, autoSend: false, inboundLogId: inbound.id};
    }

    // Un chat marcado "responde siempre" se atiende como si el local estuviera abierto.
    const outsideHours = !conversation.alwaysOn && isOutsideBusinessHours(settings.businessHours);
    if (outsideHours && settings.outsideHoursBehavior.mode === 'OFF' && !previewReply) {
      return {action: 'OUTSIDE_HOURS', effectiveMode, liveMode, autoSend: false, inboundLogId: inbound.id};
    }

    const keywordReason = explicitEscalation(body.message, settings.escalationKeywords);
    const localEscalationReason = body.messageType === 'AUDIO'
      ? 'Mensaje de audio recibido, requiere atención humana.'
      : keywordReason;
    // Datos reales del sistema (catálogo, PCs publicadas, presupuesto del chat).
    const catalogData = localEscalationReason ? '' : await buildSystemData({
      chatKey: body.chatKey,
      message: body.message,
      budgetCents: typeof (conversation.profile as {budgetCents?: unknown} | null)?.budgetCents === 'number'
        ? (conversation.profile as {budgetCents: number}).budgetCents
        : campaign?.advertisedPriceCents && /^\d+$/.test(campaign.advertisedPriceCents)
          ? Number(campaign.advertisedPriceCents)
          : null,
      recentText: (body.recentMessages ?? []).slice(-6).map((item) => item.text).join(' '),
    }).catch(() => '');
    const adContext = campaign ? formatAdContext(campaign, conversation.origin) : '';
    const systemData = [adContext, catalogData].filter(Boolean).join('\n\n');
    // Con precios, stock o un anuncio no se reutiliza una respuesta vieja: cada aviso es otro producto.
    const reusable = localEscalationReason || systemData || campaign
      ? null
      : await findReusableReply(body.message, settings.reuseSimilarityThreshold, inbound.id, settings.updatedAt);
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
            messages:reusable.bubbles,
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
            businessContext: outsideHours && !previewReply
              ? `Fuera de horario. Conducta configurada: ${settings.outsideHoursBehavior.mode}. Mensaje permitido: ${settings.outsideHoursBehavior.message}`
              : 'Dentro del horario de atención.',
            responseStyle: settings.responseStyle,
            systemData: systemData || undefined,
            salesStage: conversation.stage,
            salesRules: settings.salesRules,
            stagePlaybook: settings.stagePlaybook,
            writingFilters: settings.writingFilters,
            guidance: (settings.guidance as Array<{text?: unknown; enabled?: unknown}>)
              .filter((item) => item && item.enabled !== false && typeof item.text === 'string')
              .map((item) => String(item.text)),
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
    const askedForQuote = Boolean(explicitPhrase(body.message, settings.requestKeywords ?? []));
    const hasActiveRequest = Boolean(conversation.activeRequest && conversation.activeRequest.state !== 'CERRADA');
    // Si el cliente pidió el presupuesto con una frase configurada, se crea en este turno.
    // Si el anuncio ya tiene PDF, ese PDF se adjunta: no hace falta otra solicitud.
    if (!shouldEscalate && askedForQuote && !hasActiveRequest && !campaign?.quote) {
      result.result.shouldCreateRequest = true;
      if (!result.result.requestDraft) {
        const {maximumBudgetCents, ...draft} = draftFromLead(
          body.message,
          conversation.summary,
          conversation.profile as {usage?: string | null; games?: string[]; budgetCents?: number | null} | null,
        );
        result.result.requestDraft = {...draft, maximumBudgetPesos: maximumBudgetCents ? Math.round(maximumBudgetCents / 100) : null};
      }
    }
    const responseMatch=matchedResponse(settings.responses,body.message);
    const configuredUrls=responseMatch?.response.attachments.url
      ?[responseMatch.response.attachments.url]
      :[];
    const baseReply=result.result.reply.trim().slice(0,settings.responseStyle.maxCharacters);
    const legacyReply=[baseReply,...configuredUrls.filter(url=>!baseReply.includes(url))]
      .filter(Boolean)
      .join('\n\n');
    const ruleAttachments=await resolveRuleAttachments(settings.responses,body.message);
    const adAttachments=campaign?await resolveAdAttachments(campaign.quote,campaign.id):[];
    const resolvedAttachments=[
      ...adAttachments,
      ...ruleAttachments.filter((item)=>!adAttachments.length||!(item as {quote?:unknown}).quote),
    ];
    const aiMessages=settings.multiMessage.splitMode==='FIXED_ONLY'
      ?[baseReply]
      :settings.multiMessage.enabled
        ?splitChatbotAiMessages(result.result.messages,baseReply,settings.multiMessage.maxBubbles)
        :(result.result.messages.length?result.result.messages:[baseReply]).slice(0,settings.multiMessage.maxBubbles);
    // La IA a veces repite la apertura o el cierre fijos que ya agrega el sistema:
    // se quitan de sus burbujas (enteras o como comienzo del mensaje).
    const adOpening=campaign?.openingMessage.trim()??'';
    const fixedOpening=adOpening||settings.multiMessage.openingMessage.trim();
    const fixedClosing=settings.multiMessage.closingMessage.trim();
    const withoutFixed=(message:string)=>{
      let text=message.trim();
      for(const fixed of [fixedOpening,fixedClosing].filter(Boolean)){
        if(sameText(text,fixed))return '';
        if(sameText(text.slice(0,fixed.length),fixed))text=text.slice(fixed.length).trim();
      }
      return text;
    };
    let messages=settings.multiMessage.enabled
      ?[
          // Solo en la primera respuesta del chat. El historial cubre el simulador, que
          // no registra salientes en la conversación. Si vino de un anuncio, manda esa apertura.
          ...(!conversation.lastOutboundText&&!(body.recentMessages??[]).some(item=>item.direction==='OUTBOUND')&&fixedOpening?[fixedOpening]:[]),
          ...aiMessages.map(withoutFixed).filter(Boolean),
          ...(fixedClosing?[fixedClosing]:[]),
        ]
      :[legacyReply];
    if(settings.multiMessage.enabled&&configuredUrls.length){
      // El link va en un mensaje propio, como lo manda el equipo.
      const urls=configuredUrls.filter(url=>!messages.some(message=>message.includes(url)));
      messages=[...messages,...urls];
    }
    messages=shouldEscalate?[]:messages.map((text)=>casualText(text,settings.writingFilters)).filter(Boolean);
    const reply=messages.join('\n');
    const quoteFollowupMessage=!shouldEscalate
      &&settings.multiMessage.quoteFollowup.enabled
      &&resolvedAttachments.some(attachment=>attachment.quote)
      ?casualText(settings.multiMessage.quoteFollowup.message.trim(),settings.writingFilters)||null
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
    if (!stillEnabled.enabled && !previewReply) {
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
          matchedAdId: campaign?.id??null,
          decisionReason: result.result.decisionReason,
          // Lo que se aprueba desde el CRM: burbujas separadas y adjuntos, igual que en AUTO.
          bubbles: messages,
          attachments: resolvedAttachments,
          quoteFollowupMessage,
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
          {...result.result.requestDraft, maximumBudgetCents: pesosToCents(result.result.requestDraft.maximumBudgetPesos)},
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
        // La charla de prueba es un cliente: guarda memoria, etapa y derivación
        // en el chat sim:, sin crear solicitudes ni avisos.
        await tx.chatbotConversation.update({
          where: {chatKey: body.chatKey},
          data: {
            ...(result.result.updatedSummary !== null ? {summary: result.result.updatedSummary} : {}),
            summaryMessageCount: {increment: 1},
            ...(!shouldEscalate && reply ? {lastOutboundText: reply, lastOutboundAt: new Date()} : {}),
            ...(shouldEscalate ? {escalatedAt: new Date(), escalationReason: reason} : {}),
          },
        });
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

    // El bot pidió un presupuesto al equipo: aviso en la campana y por WhatsApp a los vendedores.
    if (output.requestResult?.created) {
      void alertTeamNewRequest(output.requestResult.request.id, body.chatKey).catch(() => undefined);
    }

    // La ficha del cliente se completa sola con lo que surge de la charla.
    const aiProfile = (result.result as {profile?: {budgetPesos?: number | null} & Omit<LeadProfile, 'budgetCents'>}).profile;
    if (aiProfile && (!body.simulation || body.chatKey.startsWith('sim:'))) {
      const {budgetPesos, ...rest} = aiProfile;
      void mergeProfile(body.chatKey, {...rest, budgetCents: pesosToCents(budgetPesos)}).catch(() => undefined);
    }
    // Temperatura, intención y próximo paso. En la prueba solo si el chat es sim:.
    const signals = (result.result as {signals?: SalesSignals}).signals;
    if (signals && (!body.simulation || body.chatKey.startsWith('sim:'))) {
      void applySignals(body.chatKey, signals).catch(() => undefined);
    }

    // El modelo derivó porque no sabía: queda como pregunta para enseñarle (y se le
    // consulta al entrenador). Las derivaciones por palabra clave o audio no cuentan.
    if (output.action === 'ESCALATED' && !localEscalationReason && !reusable && !body.simulation) {
      void recordUnansweredQuestion(body.chatKey, body.message, reason, output.log.id).catch(() => undefined);
    }

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
      liveMode: body.simulation ? liveMode : undefined,
      wouldCreateRequest: body.simulation ? Boolean(result.result.shouldCreateRequest) : undefined,
      previewedDespite: body.simulation && previewReply && (!settings.enabled || liveMode === 'OFF' || (outsideHours && settings.outsideHoursBehavior.mode === 'OFF'))
        ? (!settings.enabled ? 'DISABLED' : liveMode === 'OFF' ? 'OFF' : 'OUTSIDE_HOURS')
        : undefined,
      wouldEscalate: body.simulation&&shouldEscalate?{reason}:undefined,
      // Para el simulador de Configuración: qué regla se activó y por qué decidió así.
      matchedResponseId: responseMatch?.response.id??null,
      matchedResponseScore: responseMatch?.score??null,
      matchedAdId: campaign?.id??null,
      decisionReason: result.result.decisionReason??null,
      signals: (result.result as {signals?: SalesSignals}).signals ?? null,
      reused: reusable ?? undefined,
      attachments: resolvedAttachments,
      multiMessage:{
        draftMode:settings.multiMessage.draftMode,
        betweenDelayMinSeconds:settings.multiMessage.betweenDelayMinSeconds,
        betweenDelayMaxSeconds:settings.multiMessage.betweenDelayMaxSeconds,
      },
    });
}
