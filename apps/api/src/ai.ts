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

@Controller('quotes')
export class QuoteAiController {
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
