import {Controller, Get, NotFoundException, Param, Query} from '@nestjs/common';
import {db} from '@tgs/database';
import {idSchema, similarityLimitQuerySchema, type SimilarityLimitQuery} from '@tgs/contracts';
import {normalizeText, productSimilarity} from '@tgs/validation';
import {createAiClient, DEFAULT_AI_MODEL, inputHash, SemanticSimilarityService} from '@tgs/ai';
import {decryptSecret} from '@tgs/config';
import {jsonSafe, ZodPipe} from './infrastructure.js';

/**
 * `GET /quotes/:id/similar` y `GET /quotes/:id/habitual-components`.
 *
 * Ambos endpoints son minería de solo lectura sobre presupuestos existentes: no mutan estado ni
 * generan eventos de timeline. `similar` compara la versión activa del presupuesto contra la
 * versión activa de cada otra familia usando `productSimilarity` (`@tgs/validation`) agrupado por
 * concepto de línea (`PcLine.concept`), pesado según `OperationsSettings`. `habitual-components`
 * mina qué productos aparecen junto a los ítems clave del presupuesto en versiones ACEPTADO.
 */

const SIMILARITY_SOURCE_TYPE = 'QUOTE_FAMILY';

type ConceptKey = 'CPU' | 'MOTHERBOARD' | 'GPU' | 'OTHER';
const CONCEPTS: readonly ConceptKey[] = ['CPU', 'MOTHERBOARD', 'GPU', 'OTHER'];

type ConceptItems = Record<ConceptKey, string[]>;

function emptyConceptItems(): ConceptItems {
  return {CPU: [], MOTHERBOARD: [], GPU: [], OTHER: []};
}

function conceptOf(concept: string | null | undefined): ConceptKey {
  return concept === 'CPU' || concept === 'MOTHERBOARD' || concept === 'GPU' ? concept : 'OTHER';
}

type ActiveItem = {
  productId: string | null;
  frozenName: string;
  line: {concept: string; keyLine: boolean} | null;
};

/** Tope de familias recientes que se comparan. Recorrer todo el historial (y todas
 * sus versiones) bloqueaba el proceso minutos al abrir un presupuesto. */
const SIMILAR_CANDIDATE_CAP = 400;
/** Versiones aceptadas recientes que entran en la minería de componentes habituales. */
const HABITUAL_VERSION_CAP = 500;
/** Llamadas de IA en la zona ambigua. El resto se queda con el puntaje determinístico. */
const SIMILAR_AI_CAP = 4;

const activeItemSelect = {
  productId: true,
  frozenName: true,
  line: {select: {concept: true, keyLine: true}},
} as const;

/** Resuelve solo la versión activa, con ítems y concepto de línea. */
async function loadActiveVersionItems(familyId: string) {
  const family = await db.quoteFamily.findUnique({
    where: {id: familyId},
    select: {id: true, visibleNumber: true, internalName: true, activeVersion: true},
  });
  if (!family) return null;
  const version = await db.quoteVersion.findUnique({
    where: {familyId_version: {familyId, version: family.activeVersion}},
    select: {items: {select: activeItemSelect}},
  });
  const items: ActiveItem[] = version?.items ?? [];
  return {family, items};
}

function bucketByConcept(items: ReadonlyArray<ActiveItem>): ConceptItems {
  const buckets = emptyConceptItems();
  for (const item of items) {
    buckets[conceptOf(item.line?.concept)].push(item.frozenName);
  }
  return buckets;
}

/** Mejor coincidencia (0-100) entre dos listas de nombres del mismo concepto; 0 si alguna está vacía. */
function conceptScore(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  let best = 0;
  for (const nameA of a) {
    for (const nameB of b) {
      const score = productSimilarity(nameA, nameB);
      if (score > best) best = score;
    }
  }
  return best;
}

function weightedScore(
  source: ConceptItems,
  candidate: ConceptItems,
  weightsBps: Record<ConceptKey, number>,
): {score: number; breakdown: Record<ConceptKey, number>} {
  const breakdown: Record<ConceptKey, number> = {CPU: 0, MOTHERBOARD: 0, GPU: 0, OTHER: 0};
  let weighted = 0;
  for (const concept of CONCEPTS) {
    const conceptValue = conceptScore(source[concept], candidate[concept]);
    breakdown[concept] = conceptValue;
    weighted += (weightsBps[concept] / 10000) * conceptValue;
  }
  return {score: Math.max(0, Math.min(100, Math.round(weighted))), breakdown};
}

@Controller('quotes')
export class SimilarityController {
  /** Ranking determinístico (con desempate IA opcional en zona ambigua) de presupuestos similares. */
  @Get(':id/similar')
  async similar(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Query(new ZodPipe(similarityLimitQuerySchema)) query: SimilarityLimitQuery,
  ) {
    const source = await loadActiveVersionItems(id);
    if (!source) throw new NotFoundException('Presupuesto inexistente');
    const sourceConcepts = bucketByConcept(source.items);

    const [operations, aiSettings] = await Promise.all([
      db.operationsSettings.findUniqueOrThrow({where: {id: 'singleton'}}),
      db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}}),
    ]);
    const weightsBps: Record<ConceptKey, number> = {
      CPU: operations.similarityCpuBps,
      MOTHERBOARD: operations.similarityMotherBps,
      GPU: operations.similarityGpuBps,
      OTHER: operations.similarityOtherBps,
    };
    const ambiguousAiEnabled = Boolean(aiSettings.enabled && aiSettings.ambiguousSimilarityAi);

    const cachePayload = {
      weightsBps,
      ambiguousMin: operations.similarityAmbiguousMin,
      ambiguousMax: operations.similarityAmbiguousMax,
      ambiguousAiEnabled,
      aiModel: ambiguousAiEnabled ? (aiSettings.model ?? DEFAULT_AI_MODEL) : null,
      sourceConcepts,
      limit: query.limit,
    };
    const hash = inputHash(cachePayload);
    const cached = await db.similarityCache.findUnique({
      where: {
        sourceType_sourceId_inputHash: {sourceType: SIMILARITY_SOURCE_TYPE, sourceId: id, inputHash: hash},
      },
    });
    if (cached) return cached.resultJson;

    const candidateRows = await db.$queryRaw<Array<{
      versionId: string;
      familyId: string;
      visibleNumber: string;
      internalName: string;
    }>>`
      SELECT v.id AS "versionId", f.id AS "familyId", f."visibleNumber" AS "visibleNumber", f."internalName" AS "internalName"
      FROM "QuoteFamily" f
      JOIN "QuoteVersion" v ON v."familyId" = f.id AND v.version = f."activeVersion"
      WHERE f.id <> ${id}
      ORDER BY f."lastActivityAt" DESC NULLS LAST, f."updatedAt" DESC
      LIMIT ${SIMILAR_CANDIDATE_CAP}
    `;
    const candidateItems = candidateRows.length
      ? await db.quoteItem.findMany({
          where: {versionId: {in: candidateRows.map((row) => row.versionId)}},
          select: {versionId: true, ...activeItemSelect},
        })
      : [];
    const itemsByVersion = new Map<string, ActiveItem[]>();
    for (const item of candidateItems) {
      const list = itemsByVersion.get(item.versionId) ?? [];
      list.push(item);
      itemsByVersion.set(item.versionId, list);
    }

    const key = ambiguousAiEnabled
      ? aiSettings.apiKeyEncrypted
        ? decryptSecret(aiSettings.apiKeyEncrypted)
        : process.env.OPENAI_API_KEY
      : undefined;
    const aiService =
      ambiguousAiEnabled && key
        ? new SemanticSimilarityService({client: createAiClient({apiKey: key}), model: aiSettings.model ?? DEFAULT_AI_MODEL})
        : null;

    type Ranked = {
      familyId: string;
      visibleNumber: string;
      internalName: string;
      score: number;
      breakdown: Record<ConceptKey, number>;
    };
    const ranked: Ranked[] = [];

    for (const candidate of candidateRows) {
      const items = itemsByVersion.get(candidate.versionId) ?? [];
      if (!items.length) continue;
      const candidateConcepts = bucketByConcept(items);
      const {score, breakdown} = weightedScore(sourceConcepts, candidateConcepts, weightsBps);
      ranked.push({
        familyId: candidate.familyId,
        visibleNumber: candidate.visibleNumber,
        internalName: candidate.internalName,
        score,
        breakdown,
      });
    }

    ranked.sort((a, b) => b.score - a.score || a.visibleNumber.localeCompare(b.visibleNumber));
    if (aiService) {
      const ambiguous = ranked
        .filter((row) => row.score >= operations.similarityAmbiguousMin && row.score <= operations.similarityAmbiguousMax)
        .slice(0, SIMILAR_AI_CAP);
      await Promise.all(ambiguous.map(async (row) => {
        const {result} = await aiService.compare({
          candidateA: {label: source.family.internalName},
          candidateB: {label: row.internalName},
          deterministicScore: row.score,
        });
        row.score = result.score;
      }));
      ranked.sort((a, b) => b.score - a.score || a.visibleNumber.localeCompare(b.visibleNumber));
    }
    const result = jsonSafe({
      familyId: id,
      limit: query.limit,
      items: ranked.slice(0, query.limit),
    });

    await db.similarityCache.upsert({
      where: {
        sourceType_sourceId_inputHash: {sourceType: SIMILARITY_SOURCE_TYPE, sourceId: id, inputHash: hash},
      },
      update: {resultJson: result},
      create: {sourceType: SIMILARITY_SOURCE_TYPE, sourceId: id, inputHash: hash, resultJson: result},
    });

    return result;
  }

  /**
   * Minería de "componentes habituales": productos que suelen acompañar a los ítems clave
   * (`PcLine.keyLine`) del presupuesto actual en versiones ACEPTADO (o, si no hay ítems clave,
   * en el universo general de ACEPTADO). Excluye productos ya presentes en la versión activa.
   */
  @Get(':id/habitual-components')
  async habitualComponents(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Query(new ZodPipe(similarityLimitQuerySchema)) query: SimilarityLimitQuery,
  ) {
    const source = await loadActiveVersionItems(id);
    if (!source) throw new NotFoundException('Presupuesto inexistente');

    const aiSettings = await db.aiSettings.findUniqueOrThrow({where: {id: 'singleton'}});
    const threshold = aiSettings.frequentSupportThreshold;
    const similarityThreshold = aiSettings.productSimilarityThreshold;

    const presentProductIds = new Set(
      source.items.map((item) => item.productId).filter((value): value is string => Boolean(value)),
    );
    const presentNames = new Set(source.items.map((item) => normalizeText(item.frozenName)));
    const referenceNames = source.items.filter((item) => item.line?.keyLine).map((item) => item.frozenName);

    const acceptedVersions = await db.quoteVersion.findMany({
      where: {state: 'ACEPTADO', familyId: {not: id}},
      orderBy: [{lastActivityAt: 'desc'}, {id: 'desc'}],
      take: HABITUAL_VERSION_CAP,
      select: {
        familyId: true,
        items: {select: {productId: true, frozenName: true, lineId: true}},
      },
    });

    let sampleSize = 0;
    const counts = new Map<
      string,
      {productId: string | null; name: string; lineId: string | null; support: number}
    >();

    for (const version of acceptedVersions) {
      if (version.familyId === id) continue;
      const items = version.items;
      const matchesReference = referenceNames.length
        ? items.some((item) =>
            referenceNames.some((ref) => productSimilarity(ref, item.frozenName) >= similarityThreshold),
          )
        : true;
      if (!matchesReference) continue;
      sampleSize += 1;

      const seen = new Set<string>();
      for (const item of items) {
        if (item.productId && presentProductIds.has(item.productId)) continue;
        const normalized = normalizeText(item.frozenName);
        if (!item.productId && presentNames.has(normalized)) continue;
        const key = item.productId ?? `name:${normalized}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const current = counts.get(key) ?? {
          productId: item.productId,
          name: item.frozenName,
          lineId: item.lineId,
          support: 0,
        };
        current.support += 1;
        if (!current.lineId && item.lineId) current.lineId = item.lineId;
        counts.set(key, current);
      }
    }

    const productIds = [...counts.values()]
      .map((row) => row.productId)
      .filter((value): value is string => Boolean(value));
    const products = productIds.length
      ? await db.product.findMany({
          where: {id: {in: productIds}},
          select: {id: true, defaultLineId: true},
        })
      : [];
    const defaultLineByProduct = new Map(products.map((p) => [p.id, p.defaultLineId]));

    const items = [...counts.values()]
      .filter((row) => row.support >= threshold)
      .sort((a, b) => b.support - a.support || a.name.localeCompare(b.name))
      .slice(0, query.limit)
      .map((row) => ({
        ...row,
        lineId: row.lineId ?? (row.productId ? defaultLineByProduct.get(row.productId) ?? null : null),
        sampleSize,
      }));

    return jsonSafe({familyId: id, sampleSize, threshold, items});
  }
}