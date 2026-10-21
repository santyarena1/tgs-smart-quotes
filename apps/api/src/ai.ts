import {BadRequestException, Body, Controller, NotFoundException, Param, Post} from '@nestjs/common';
import {db} from '@tgs/database';
import {
  aiAnalyzeRequestSchema,
  aiCompatibilitySchema,
  aiIntentSchema,
  aiSuggestResponseSchema,
  idSchema,
  type AiAnalyzeRequestInput,
  type AiCompatibilityInput,
  type AiIntentInput,
  type AiSuggestResponseInput,
} from '@tgs/contracts';
import {
  AiTask,
  CompatibilityFeedbackService,
  createAiClient,
  DEFAULT_AI_MODEL,
  IntentClassificationService,
  RequestAnalysisService,
  ResponseSuggestionService,
  type AiCacheRecord,
  type AiCacheRepo,
  type AiServiceDeps,
} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {z} from 'zod';
import {BadGatewayException} from '@nestjs/common';
import {describeOpenAiError} from '@tgs/ai';
import {activeVersion, loadFamily, statusEvent} from './quotes.js';
import {CurrentUser, jsonSafe, type RequestUser, ZodPipe} from './infrastructure.js';

// `AiRequest.task` es un enum de Prisma que todavía no incluye INTENT_CLASSIFICATION (solo existe
// en el tipo `AiTask` de `@tgs/ai`). Para no romper la escritura, el cache solo persiste en
// `AiRequest` las tareas que sí están en el enum de base; INTENT_CLASSIFICATION corre sin cache
// persistente (se documenta también en docs/specs/BLOCK-3.md).
const PERSISTABLE_TASKS: Set<AiTask> = new Set([
  AiTask.REQUEST_ANALYSIS,
  AiTask.COMPATIBILITY,
  AiTask.RESPONSE_SUGGESTION,
  AiTask.SEMANTIC_SIMILARITY,
]);

function buildCacheRepo(): AiCacheRepo {
  return {
    async findCached(task, inputHash) {
      if (!PERSISTABLE_TASKS.has(task)) return null;
      const row = await db.aiRequest.findFirst({
        where: {task: task as any, inputHash, success: true},
        orderBy: {createdAt: 'desc'},
      });
      return row ? {resultJson: row.resultJson, model: row.model} : null;
    },
    async save(record: AiCacheRecord) {
      if (!PERSISTABLE_TASKS.has(record.task)) return;
      await db.aiRequest.create({
        data: {
          task: record.task as any,
          model: record.model,
          inputHash: record.inputHash,
          entityType: record.entityType ?? null,
          entityId: record.entityId ?? null,
          requestId: record.requestId ?? null,
          success: record.success,
          error: record.error ?? null,
          durationMs: record.durationMs ?? null,
          usageJson: record.usageJson ? (record.usageJson as any) : undefined,
          costUsdCents: record.costUsdCents ?? 0n,
          cacheHit: record.cacheHit ?? false,
          resultJson: record.resultJson as any,
        },
      });
    },
  };
}

/** Resuelve el cliente OpenAI desde Configuración (key cifrada) con fallback a `OPENAI_API_KEY`. */
async function resolveAiDeps(taskEnabledField: 'analysisEnabled' | 'compatibilityEnabled' | 'responsesEnabled' | 'intentEnabled'): Promise<AiServiceDeps & {settings: any}> {
  const settings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  const enabled = settings.enabled && Boolean(settings[taskEnabledField]);
  if (!enabled) {
    return {client: null, model: settings.model ?? DEFAULT_AI_MODEL, cache: buildCacheRepo(), settings};
  }
  const key = settings.apiKeyEncrypted ? decryptSecret(settings.apiKeyEncrypted) : process.env.OPENAI_API_KEY;
  return {client: createAiClient({apiKey: key}), model: settings.model ?? DEFAULT_AI_MODEL, cache: buildCacheRepo(), settings};
}

@Controller('requests')
export class RequestAiController {
  /** Analiza el texto original de una solicitud (uso, componentes, presupuesto detectado). */
  @Post(':id/ai/analyze')
  async analyze(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(aiAnalyzeRequestSchema)) body: AiAnalyzeRequestInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const request = await db.quoteRequest.findUnique({where: {id}});
    if (!request) throw new NotFoundException('Solicitud inexistente');
    const deps = await resolveAiDeps('analysisEnabled');
    const service = new RequestAnalysisService(deps);
    const {result, metadata} = await service.analyze(
      {text: request.originalText || request.title},
      {regenerate: body.regenerate, entity: {entityType: 'QuoteRequest', entityId: request.id, requestId: request.id}},
    );
    await db.quoteStatusEvent.create({data: {
      type: 'ANALISIS_IA',
      requestId: request.id,
      customerId: request.customerId,
      userId: actor.id,
      next: jsonSafe(result),
      metadata: jsonSafe({usedAi: metadata.usedAi, cacheHit: metadata.cacheHit, model: metadata.model}),
    }});
    return jsonSafe({result, metadata});
  }
}

const quoteChatSchema = z.object({
  /** Resumen del presupuesto que se está armando: es lo ÚNICO que el asistente conoce. */
  context: z.string().trim().min(1).max(9000),
  messages: z.array(z.object({role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000)})).min(1).max(24),
}).strict();

/** El chat del presupuesto va siempre con GPT-4o mini, sin importar el modelo elegido en Ajustes → IA. */
const QUOTE_CHAT_MODEL = 'gpt-4o-mini';

const QUOTE_CHAT_SYSTEM = [
  'Sos el asistente de The Gamer Shop (Argentina) y ayudás al vendedor mientras arma un presupuesto de PC.',
  'Tu ÚNICA fuente de información es el presupuesto que aparece en el bloque PRESUPUESTO. No tenés acceso a nada más del sistema (clientes, costos, otros presupuestos, ventas).',
  'Respondé preguntas sobre ese presupuesto: rendimiento estimado en juegos y aplicaciones (FPS orientativos por resolución y calidad), compatibilidad entre componentes (socket, chipset, tipo de RAM, consumo y fuente, gabinete, refrigeración), cuellos de botella, mejoras posibles y cómo explicárselo al cliente.',
  'Si la pregunta no se relaciona con el presupuesto o con PC gamer, decí amablemente que solo podés ayudar con este presupuesto.',
  'No inventes especificaciones que no conozcas con certeza y aclarás que los FPS son estimaciones orientativas. Si falta un componente clave (CPU, placa, RAM, GPU, fuente), avisalo en vez de suponerlo. Los precios son los del presupuesto; no inventes otros.',
  'Español rioplatense, tono cercano y profesional, respuestas breves (máximo ~150 palabras), con viñetas cortas cuando ayuden y sin encabezados largos.',
].join(' ');

@Controller('quotes')
export class QuoteAiController {
  /** Chat con el presupuesto en edición como único contexto (no guarda nada). */
  @Post('ai-chat')
  async chat(@Body(new ZodPipe(quoteChatSchema)) body: z.infer<typeof quoteChatSchema>) {
    const settings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
    if (!settings.enabled) throw new BadRequestException('La IA está desactivada. Activala en Ajustes → IA.');
    const key = settings.apiKeyEncrypted ? decryptSecret(settings.apiKeyEncrypted) : process.env.OPENAI_API_KEY;
    const client = createAiClient({apiKey: key});
    if (!client) throw new BadRequestException('Falta la API key de OpenAI. Cargala en Ajustes → IA.');
    let completion;
    try {
      completion = await client.chat.completions.create({
        model: QUOTE_CHAT_MODEL,
        max_tokens: 600,
        messages: [
          {role: 'system', content: `${QUOTE_CHAT_SYSTEM}

PRESUPUESTO:
${body.context}`},
          ...body.messages,
        ],
      });
    } catch (error) {
      throw new BadGatewayException(describeOpenAiError(error).message);
    }
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new BadGatewayException('La IA no devolvió una respuesta.');
    return {reply};
  }

  /** Feedback de compatibilidad orientativa sobre los ítems de la versión activa. */
  @Post(':id/ai/compatibility')
  async compatibility(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(aiCompatibilitySchema)) body: AiCompatibilityInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const family = await loadFamily(db, id);
    const version = activeVersion(family);
    if (!version.items.length) throw new BadRequestException('El presupuesto no tiene ítems para evaluar');
    const request = family.requestId ? await db.quoteRequest.findUnique({where: {id: family.requestId}}) : null;
    const deps = await resolveAiDeps('compatibilityEnabled');
    const service = new CompatibilityFeedbackService(deps);
    const {result, metadata} = await service.evaluate(
      {
        items: version.items.map((item: any) => ({name: item.frozenName, quantity: item.quantity})),
        requestText: request?.originalText ?? undefined,
        expectedUse: request?.expectedUse ?? undefined,
      },
      {regenerate: body.regenerate, entity: {entityType: 'QuoteVersion', entityId: version.id}},
    );
    await statusEvent(db, {
      type: 'COMPATIBILIDAD_IA',
      familyId: id,
      versionId: version.id,
      requestId: family.requestId,
      customerId: family.customerId,
      userId: actor.id,
      next: result,
      metadata: {usedAi: metadata.usedAi, cacheHit: metadata.cacheHit},
    });
    return jsonSafe({result, metadata});
  }

  /** Sugiere un mensaje comercial editable para acompañar el envío del presupuesto. */
  @Post(':id/ai/suggest-response')
  async suggestResponse(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(aiSuggestResponseSchema)) body: AiSuggestResponseInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const family = await loadFamily(db, id);
    const version = activeVersion(family);
    const request = family.requestId ? await db.quoteRequest.findUnique({where: {id: family.requestId}}) : null;
    const deps = await resolveAiDeps('responsesEnabled');
    const tone = body.tone ?? deps.settings.defaultTone;
    const service = new ResponseSuggestionService(deps);
    const {result, metadata} = await service.suggest(
      {
        tone,
        expectedUse: request?.expectedUse ?? undefined,
        maxBudgetCents: request?.maximumBudgetCents ? Number(request.maximumBudgetCents) : null,
        components: version.items.map((item: any) => item.frozenName),
        totalSaleCents: Number(version.totalSaleCents),
      },
      {regenerate: body.regenerate, entity: {entityType: 'QuoteVersion', entityId: version.id}},
    );
    await db.aiSuggestion.create({data: {
      entityType: 'QuoteVersion',
      entityId: version.id,
      tone,
      text: result.text,
      model: metadata.model,
      inputHash: metadata.inputHash,
    }});
    await statusEvent(db, {
      type: 'SUGERENCIA_IA',
      familyId: id,
      versionId: version.id,
      requestId: family.requestId,
      customerId: family.customerId,
      userId: actor.id,
      next: result,
      metadata: {tone, usedAi: metadata.usedAi, cacheHit: metadata.cacheHit},
    });
    return jsonSafe({result, metadata});
  }

  /** Clasifica la intención de una respuesta de cliente (no persiste ni cambia estado por sí sola). */
  @Post(':id/ai/intent')
  async intent(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(aiIntentSchema)) body: AiIntentInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const family = await loadFamily(db, id);
    const version = activeVersion(family);
    const deps = await resolveAiDeps('intentEnabled');
    const service = new IntentClassificationService(deps);
    const {result, metadata} = await service.classify(
      {replyText: body.replyText, context: body.context},
      {entity: {entityType: 'QuoteVersion', entityId: version.id}},
    );
    const requiresReview = result.confidence < (deps.settings.minIntentConfidence ?? 70);
    await statusEvent(db, {
      type: 'INTENCION_DETECTADA',
      familyId: id,
      versionId: version.id,
      requestId: family.requestId,
      customerId: family.customerId,
      userId: actor.id,
      next: result,
      metadata: {usedAi: metadata.usedAi, requiresReview},
    });
    return jsonSafe({result, metadata, requiresReview});
  }
}
