/**
 * Reportes del CRM: qué está pasando ahora, qué tan rápido respondemos (bot y
 * personas por separado), cómo convierte el embudo, qué anuncio trae ventas, cómo
 * rinde cada vendedor y el bot.
 */
import {Controller, Get, Query} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {jsonSafe, ZodPipe} from './infrastructure.js';

const querySchema = z.object({days: z.coerce.number().int().min(1).max(365).default(30)}).strict();

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

@Controller('crm/reports')
export class CrmReportsController {
  @Get()
  async report(@Query(new ZodPipe(querySchema)) query: {days: number}) {
    const now = new Date();
    const since = new Date(now.getTime() - query.days * 86_400_000);
    const trainers = (await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {trainerNumbers: true}}))?.trainerNumbers ?? [];
    const notClients = Prisma.sql`c."chatKey" NOT LIKE 'sim:%' ${trainers.length ? Prisma.sql`AND c."chatKey" NOT IN (${Prisma.join(trainers)})` : Prisma.empty}`;

    // ------------------------------------------------ ahora mismo
    const waiting = await db.$queryRaw<Array<{chatKey: string; waitingSince: Date}>>`
      SELECT c."chatKey", c."lastInboundAt" AS "waitingSince"
        FROM "ChatbotConversation" c
       WHERE ${notClients}
         AND c."resolvedAt" IS NULL
         AND c."lastInboundAt" IS NOT NULL
         AND (c."lastOutboundAt" IS NULL OR c."lastOutboundAt" < c."lastInboundAt")
         AND (c."snoozedUntil" IS NULL OR c."snoozedUntil" <= now())
       ORDER BY c."lastInboundAt" ASC`;
    const needsHumanUnassigned = await db.chatbotConversation.count({
      where: {escalatedAt: {not: null}, assignedUserId: null, resolvedAt: null, NOT: [{chatKey: {startsWith: 'sim:'}}, {chatKey: {in: trainers}}]},
    });

    // ------------------------------------------------ primera respuesta (bot vs persona)
    const firsts = await db.$queryRaw<Array<{chatKey: string; inboundAt: Date; outboundAt: Date | null; actor: string | null}>>`
      SELECT c."chatKey", fi."createdAt" AS "inboundAt", fo."createdAt" AS "outboundAt", fo.actor
        FROM "ChatbotConversation" c
        JOIN LATERAL (
          SELECT l."createdAt" FROM "ChatbotMessageLog" l
           WHERE l."conversationKey" = c."chatKey" AND l.direction = 'INBOUND'
           ORDER BY l."createdAt" ASC LIMIT 1) fi ON true
        LEFT JOIN LATERAL (
          SELECT l."createdAt", l.actor::text AS actor FROM "ChatbotMessageLog" l
           WHERE l."conversationKey" = c."chatKey" AND l.direction = 'OUTBOUND'
             AND l.status IN ('SENT', 'DELIVERED', 'READ') AND l."createdAt" > fi."createdAt"
           ORDER BY l."createdAt" ASC LIMIT 1) fo ON true
       WHERE ${notClients} AND fi."createdAt" >= ${since}`;
    const minutes = (row: {inboundAt: Date; outboundAt: Date | null}) => row.outboundAt ? (row.outboundAt.getTime() - row.inboundAt.getTime()) / 60_000 : null;
    const byBot = firsts.filter((row) => row.actor === 'BOT').map(minutes).filter((value): value is number => value !== null);
    const byHuman = firsts.filter((row) => row.actor === 'HUMAN').map(minutes).filter((value): value is number => value !== null);

    // ------------------------------------------------ embudo y motivos de pérdida
    const stages = await db.$queryRaw<Array<{stage: string; total: bigint; value: bigint | null}>>`
      SELECT c.stage, COUNT(*) AS total, SUM(c."leadValueCents") AS value
        FROM "ChatbotConversation" c
       WHERE ${notClients} AND c."createdAt" >= ${since}
       GROUP BY c.stage`;
    const lost = await db.$queryRaw<Array<{reason: string | null; total: bigint}>>`
      SELECT c."lostReason" AS reason, COUNT(*) AS total
        FROM "ChatbotConversation" c
       WHERE ${notClients} AND c.stage = 'LOST' AND c."stageChangedAt" >= ${since}
       GROUP BY c."lostReason" ORDER BY total DESC`;

    // ------------------------------------------------ por anuncio
    const ads = await db.$queryRaw<Array<{ad: string | null; headline: string | null; leads: bigint; won: bigint; wonValue: bigint | null}>>`
      SELECT c.origin->>'source_id' AS ad, MAX(c.origin->>'headline') AS headline,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE c.stage = 'WON') AS won,
             SUM(c."leadValueCents") FILTER (WHERE c.stage = 'WON') AS "wonValue"
        FROM "ChatbotConversation" c
       WHERE ${notClients} AND c.origin IS NOT NULL AND c."createdAt" >= ${since}
       GROUP BY c.origin->>'source_id'
       ORDER BY leads DESC LIMIT 15`;

    // ------------------------------------------------ por vendedor
    const sellers = await db.$queryRaw<Array<{userId: string | null; name: string | null; chats: bigint; won: bigint; wonValue: bigint | null}>>`
      SELECT u.id AS "userId", COALESCE(u."displayName", u.username) AS name,
             COUNT(c."chatKey") AS chats,
             COUNT(c."chatKey") FILTER (WHERE c.stage = 'WON') AS won,
             SUM(c."leadValueCents") FILTER (WHERE c.stage = 'WON') AS "wonValue"
        FROM "ChatbotConversation" c
        JOIN "User" u ON u.id = c."assignedUserId"
       WHERE ${notClients} AND c."lastMessageAt" >= ${since}
       GROUP BY u.id, u."displayName", u.username
       ORDER BY "wonValue" DESC NULLS LAST, chats DESC`;
    const messagesBySeller = await db.$queryRaw<Array<{userId: string; total: bigint}>>`
      SELECT l."decisionMetadata"->>'sentByUserId' AS "userId", COUNT(*) AS total
        FROM "ChatbotMessageLog" l
       WHERE l.direction = 'OUTBOUND' AND l.actor = 'HUMAN' AND l."createdAt" >= ${since}
         AND l."decisionMetadata" ? 'sentByUserId'
       GROUP BY 1`;
    const sent = new Map(messagesBySeller.map((row) => [row.userId, Number(row.total)]));

    // ------------------------------------------------ temperatura e intenciones
    const temperature = await db.$queryRaw<Array<{bucket: string; total: bigint}>>`
      SELECT CASE WHEN c.temperature >= 66 THEN 'HOT' WHEN c.temperature >= 31 THEN 'WARM' ELSE 'COLD' END AS bucket, COUNT(*) AS total
        FROM "ChatbotConversation" c
       WHERE ${notClients} AND c.temperature IS NOT NULL AND c."lastMessageAt" >= ${since} AND c.stage NOT IN ('WON', 'LOST')
       GROUP BY 1`;
    const intents = await db.$queryRaw<Array<{intent: string; total: bigint}>>`
      SELECT c."lastIntent" AS intent, COUNT(*) AS total
        FROM "ChatbotConversation" c
       WHERE ${notClients} AND c."lastIntent" IS NOT NULL AND c."lastMessageAt" >= ${since}
       GROUP BY 1 ORDER BY total DESC`;

    // ------------------------------------------------ bot
    const [botReplies, escalations, suggestions, learned, reasons] = await Promise.all([
      db.chatbotMessageLog.count({where: {actor: 'BOT', direction: 'OUTBOUND', status: {in: ['SENT', 'DELIVERED', 'READ']}, createdAt: {gte: since}}}),
      db.chatbotMessageLog.count({where: {status: 'ESCALATED', createdAt: {gte: since}}}),
      db.$queryRaw<Array<{approved: bigint; edited: bigint; dismissed: bigint}>>`
        SELECT COUNT(*) FILTER (WHERE l."decisionMetadata" ? 'approvedByUserId' AND (l."decisionMetadata"->>'editedBeforeSending') = 'false') AS approved,
               COUNT(*) FILTER (WHERE (l."decisionMetadata"->>'editedBeforeSending') = 'true') AS edited,
               COUNT(*) FILTER (WHERE l."decisionMetadata" ? 'dismissedByUserId') AS dismissed
          FROM "ChatbotMessageLog" l
         WHERE l.direction = 'OUTBOUND' AND l."createdAt" >= ${since}`,
      db.botLearning.count({where: {status: 'APPROVED', decidedAt: {gte: since}}}),
      db.$queryRaw<Array<{reason: string | null; total: bigint}>>`
        SELECT l."escalationReason" AS reason, COUNT(*) AS total
          FROM "ChatbotMessageLog" l
         WHERE l.status = 'ESCALATED' AND l."createdAt" >= ${since}
         GROUP BY 1 ORDER BY total DESC LIMIT 6`,
    ]);
    const assisted = await db.chatbotConversation.count({
      where: {stage: 'WON', stageChangedAt: {gte: since}, messages: {some: {actor: 'BOT', direction: 'OUTBOUND'}}},
    });

    return jsonSafe({
      days: query.days,
      now: {
        waiting: waiting.length,
        oldestWaitMinutes: waiting[0] ? Math.round((now.getTime() - waiting[0].waitingSince.getTime()) / 60_000) : null,
        needsHumanUnassigned,
      },
      firstResponse: {
        conversations: firsts.length,
        bot: {count: byBot.length, medianMinutes: median(byBot)},
        human: {count: byHuman.length, medianMinutes: median(byHuman)},
        unanswered: firsts.filter((row) => !row.outboundAt).length,
      },
      funnel: stages.map((row) => ({stage: row.stage, total: Number(row.total), valueCents: row.value ?? 0n})),
      temperature: Object.fromEntries(temperature.map((row) => [row.bucket, Number(row.total)])),
      intents: intents.map((row) => ({intent: row.intent, total: Number(row.total)})),
      lostReasons: lost.map((row) => ({reason: row.reason ?? 'Sin motivo', total: Number(row.total)})),
      ads: ads.map((row) => ({ad: row.ad, headline: row.headline, leads: Number(row.leads), won: Number(row.won), wonValueCents: row.wonValue ?? 0n})),
      sellers: sellers.map((row) => ({
        name: row.name ?? 'Sin nombre',
        chats: Number(row.chats),
        won: Number(row.won),
        wonValueCents: row.wonValue ?? 0n,
        messages: row.userId ? sent.get(row.userId) ?? 0 : 0,
      })),
      bot: {
        replies: botReplies,
        escalations,
        suggestionsApproved: Number(suggestions[0]?.approved ?? 0),
        suggestionsEdited: Number(suggestions[0]?.edited ?? 0),
        suggestionsDismissed: Number(suggestions[0]?.dismissed ?? 0),
        learned,
        assistedSales: assisted,
        escalationReasons: reasons.map((row) => ({reason: row.reason ?? 'Sin motivo', total: Number(row.total)})),
      },
    });
  }
}
