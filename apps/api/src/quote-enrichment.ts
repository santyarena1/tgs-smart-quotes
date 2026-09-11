/**
 * Enriquecimiento IA de una versión de presupuesto (descripción, título,
 * juegos, programas, compatibilidad). Lo usan el endpoint manual del editor
 * web y el pipeline "Preparar y publicar", por eso vive aparte del controller.
 */
import {createHash} from 'node:crypto';
import {BadGatewayException, BadRequestException} from '@nestjs/common';
import {createAiClient, DEFAULT_AI_MODEL, DEFAULT_GAMES_TO_ANALYZE, describeOpenAiError, QuoteEnrichmentService, type AiCacheRepo} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {db} from '@tgs/database';
import {buildStoreTitle} from './quote-title.js';

export const aiCache: AiCacheRepo = {
  async findCached(task, inputHash) {
    const row = await db.aiRequest.findFirst({where: {task: task as any, inputHash, success: true}, orderBy: {createdAt: 'desc'}});
    return row ? {resultJson: row.resultJson, model: row.model} : null;
  },
  async save(record) {
    await db.aiRequest.create({
      data: {
        task: record.task as any,
        model: record.model,
        inputHash: record.inputHash,
        entityType: record.entityType ?? null,
        entityId: record.entityId ?? null,
        success: record.success,
        error: record.error ?? null,
        durationMs: record.durationMs ?? null,
        usageJson: record.usageJson as any,
        costUsdCents: record.costUsdCents ?? 0n,
        resultJson: record.resultJson as any,
      },
    });
  },
};

export async function enrichmentService() {
  const settings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  const key = settings.enabled ? (settings.apiKeyEncrypted ? decryptSecret(settings.apiKeyEncrypted) : process.env.OPENAI_API_KEY) : undefined;
  return new QuoteEnrichmentService({client: key ? createAiClient({apiKey: key}) : null, model: settings.model ?? DEFAULT_AI_MODEL, cache: aiCache});
}

type EnrichmentItem = {name: string; quantity: number; line: string | null};

/** Hash estable de los ítems: si cambia, el enriquecimiento guardado quedó viejo. */
export function enrichmentItemsHash(items: EnrichmentItem[]): string {
  const canonical = items.map((item) => `${item.quantity}x${item.name.trim().toLowerCase()}`).sort().join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export async function loadEnrichmentItems(versionId: string): Promise<EnrichmentItem[]> {
  const items = await db.quoteItem.findMany({
    where: {versionId},
    orderBy: {position: 'asc'},
    select: {frozenName: true, quantity: true, line: {select: {name: true}}},
  });
  return items.map((item) => ({name: item.frozenName, quantity: item.quantity, line: item.line?.name ?? null}));
}

/**
 * Corre la IA y guarda el resultado en QuoteEnrichment. Los campos de
 * potencia no se tocan: son manuales (cálculo, no IA).
 */
export async function runQuoteEnrichment(versionId: string, userId: string | null) {
  const items = await loadEnrichmentItems(versionId);
  if (!items.length) throw new Error('El presupuesto no tiene ítems');
  const aiSettings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  // Juegos configurados en Ajustes → IA (uno por línea); si no hay, los del sistema.
  const games = (aiSettings.gamesToAnalyze ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
  const {result, metadata} = await (await enrichmentService()).enrich(
    {items, games: games.length ? games : DEFAULT_GAMES_TO_ANALYZE},
    {entity: {entityType: 'QuoteVersion', entityId: versionId}},
    aiSettings.pcDescriptionPrompt,
  );
  const clean = (value: string | null | undefined) => (value ?? '').trim() || null;
  const data = {
    descriptionHtml: result.descriptionHtml,
    gamesJson: result.games as any,
    programsJson: result.programs as any,
    compatibilityJson: result.compatibility as any,
    // Título con formato fijo de specs: las reglas leen los nombres y la IA
    // solo rellena lo que no se pudo leer.
    title: buildStoreTitle(items, result.specs),
    tagline: clean(result.tagline),
    shortDescription: clean(result.shortDescription),
    highlightsJson: result.highlights.filter((entry) => entry.trim().length > 0) as any,
    audience: clean(result.audience),
    itemsHash: enrichmentItemsHash(items),
  };
  const old = await db.quoteEnrichment.findUnique({where: {quoteVersionId: versionId}});
  const next = await db.$transaction(async (tx) => {
    const saved = await tx.quoteEnrichment.upsert({
      where: {quoteVersionId: versionId},
      create: {quoteVersionId: versionId, ...data},
      update: data,
    });
    await tx.auditLog.create({
      data: {
        userId,
        entityType: 'QuoteEnrichment',
        entityId: saved.id,
        action: 'GENERATE',
        ...(old ? {previous: JSON.parse(JSON.stringify(old, bigintSafe)) as any} : {}),
        next: JSON.parse(JSON.stringify(saved, bigintSafe)) as any,
      },
    });
    return saved;
  });
  return {enrichment: next, ai: {usedAi: metadata.usedAi, cacheHit: metadata.cacheHit, model: metadata.model}};
}

const bigintSafe = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);

// ------------------------------------------------ descripción de un componente

const PRODUCT_DESCRIPTION_SYSTEM =
  'Sos redactor comercial de The Gamer Shop, Argentina. Redactá en español una descripción breve (1 a 2 oraciones, máximo 220 caracteres) de un componente de PC gamer para mostrar debajo de su nombre en una ficha de producto. Tono profesional y directo, sin emojis, sin inventar especificaciones numéricas que no te dieron, sin repetir el nombre completo del producto tal cual.';

/** Descripción corta de un componente. La usan el botón del editor y el pipeline. */
export async function generateProductDescription(productName: string): Promise<string> {
  const settings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
  if (!settings.enabled) throw new BadRequestException('La IA está desactivada. Activala en Ajustes → IA.');
  const key = settings.apiKeyEncrypted ? decryptSecret(settings.apiKeyEncrypted) : process.env.OPENAI_API_KEY;
  const client = createAiClient({apiKey: key});
  if (!client) throw new BadRequestException('Falta la API key de OpenAI. Cargala en Ajustes → IA.');
  const extra = settings.productDescriptionPrompt?.trim();
  const systemPrompt = extra
    ? `${PRODUCT_DESCRIPTION_SYSTEM}\n\nInstrucciones adicionales definidas por el negocio (respetalas siempre que no contradigan las reglas anteriores): ${extra}`
    : PRODUCT_DESCRIPTION_SYSTEM;
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: settings.model ?? DEFAULT_AI_MODEL,
      max_tokens: 150,
      messages: [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: `Componente: ${productName}`},
      ],
    });
  } catch (error) {
    throw new BadGatewayException(describeOpenAiError(error).message);
  }
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new BadGatewayException('La IA no devolvió una respuesta.');
  return text;
}
