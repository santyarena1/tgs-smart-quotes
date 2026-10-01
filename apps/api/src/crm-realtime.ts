/**
 * Tiempo real del CRM: un canal SSE por pestaña abierta.
 *
 * En vez de avisar a mano desde cada lugar que toca un chat (fácil de olvidar en
 * alguno), un único vigilante mira cada segundo qué conversaciones y mensajes
 * cambiaron en la base y lo empuja a todas las pantallas. Así cualquier cambio
 * —venga del webhook, de la cola, del bot o de otro vendedor— llega en ~1 s.
 *
 * La presencia ("Lucas está viendo / escribiendo") vive en memoria: es efímera y
 * se renueva con un latido de cada pantalla.
 */
import {Body, Controller, Get, Logger, Post, Req, Res} from '@nestjs/common';
import {db} from '@tgs/database';
import {z} from 'zod';
import {CurrentUser, type RequestUser, SkipRateLimit, ZodPipe} from './infrastructure.js';

const logger = new Logger('CrmRealtime');
const FEED_MS = 1_000;
const HEARTBEAT_MS = 25_000;
const PRESENCE_TTL_MS = 30_000;

type Subscriber = {id: number; userId: string; send: (event: string, data: unknown) => void};
type Presence = {userId: string; name: string; typing: boolean; at: number};

const subscribers = new Map<number, Subscriber>();
let nextId = 1;

function broadcast(event: string, data: unknown) {
  for (const subscriber of subscribers.values()) subscriber.send(event, data);
}

// ---------------------------------------------------------------- cambios

let cursor: Date | null = null;
let feedTimer: NodeJS.Timeout | null = null;

/** Chats que cambiaron desde el último vistazo. Usa el reloj de la base para no perder nada. */
async function pollChanges() {
  const [clock] = await db.$queryRaw<Array<{now: Date}>>`SELECT now() AS now`;
  const now = clock?.now ?? new Date();
  if (!cursor) {
    cursor = now;
    return;
  }
  // `updatedAt` lo escribe Prisma con el reloj de la API, no el de la base: se
  // superponen 3 s para no perder nada por una diferencia de relojes. Repetir un
  // aviso es inocuo (la pantalla vuelve a leer ese chat); perderlo no.
  const since = new Date(cursor.getTime() - 3_000);
  const rows = await db.$queryRaw<Array<{chatKey: string}>>`
    SELECT "chatKey" FROM "ChatbotConversation" WHERE "updatedAt" > ${since}
    UNION
    SELECT "conversationKey" FROM "ChatbotMessageLog" WHERE "updatedAt" > ${since}
  `;
  cursor = now;
  // Con la superposición, un mismo cambio se vería durante 3 vueltas: se avisa una vez
  // por versión del chat.
  const fresh: string[] = [];
  for (const {chatKey} of rows) {
    if (chatKey.startsWith('sim:')) continue;
    fresh.push(chatKey);
  }
  const changed = await changedSinceLastBroadcast(fresh);
  if (changed.length) broadcast('chats', {chatKeys: changed});
}

/** Última versión avisada de cada chat (su `updatedAt` más reciente entre chat y mensajes). */
const lastVersion = new Map<string, number>();

async function changedSinceLastBroadcast(chatKeys: string[]): Promise<string[]> {
  if (!chatKeys.length) return [];
  const versions = await db.$queryRaw<Array<{chatKey: string; version: Date}>>`
    SELECT c."chatKey", GREATEST(c."updatedAt", COALESCE(MAX(l."updatedAt"), c."updatedAt")) AS version
      FROM "ChatbotConversation" c
      LEFT JOIN "ChatbotMessageLog" l ON l."conversationKey" = c."chatKey" AND l."updatedAt" > now() - interval '1 minute'
     WHERE c."chatKey" = ANY(${chatKeys})
     GROUP BY c."chatKey", c."updatedAt"
  `;
  const changed: string[] = [];
  for (const {chatKey, version} of versions) {
    const value = new Date(version).getTime();
    if (lastVersion.get(chatKey) === value) continue;
    lastVersion.set(chatKey, value);
    changed.push(chatKey);
  }
  if (lastVersion.size > 5_000) lastVersion.clear();
  return changed;
}

function ensureFeed() {
  if (feedTimer || !subscribers.size) return;
  const tick = async () => {
    try {
      await pollChanges();
    } catch (error) {
      logger.warn(JSON.stringify({event: 'crm_feed_failed', error: error instanceof Error ? error.message : String(error)}));
    } finally {
      // Sin nadie mirando no hay nada que vigilar: se apaga hasta la próxima conexión.
      feedTimer = subscribers.size ? setTimeout(() => void tick(), FEED_MS) : null;
      if (!feedTimer) cursor = null;
    }
  };
  feedTimer = setTimeout(() => void tick(), FEED_MS);
}

// ---------------------------------------------------------------- presencia

const presence = new Map<string, Map<string, Presence>>();

function presenceOf(chatKey: string) {
  const viewers = presence.get(chatKey);
  if (!viewers) return [];
  const now = Date.now();
  for (const [userId, entry] of viewers) if (now - entry.at > PRESENCE_TTL_MS) viewers.delete(userId);
  return [...viewers.values()].map(({userId, name, typing}) => ({userId, name, typing}));
}

function publishPresence(chatKey: string) {
  broadcast('presence', {chatKey, viewers: presenceOf(chatKey)});
}

/** Saca a un usuario de todos los chats (cerró la pestaña o cambió de chat). */
function leaveAll(userId: string, except?: string) {
  for (const [chatKey, viewers] of presence) {
    if (chatKey === except || !viewers.has(userId)) continue;
    viewers.delete(userId);
    publishPresence(chatKey);
  }
}

const presenceSchema = z.object({
  chatKey: z.string().trim().min(1).max(200).nullable(),
  typing: z.boolean().default(false),
}).strict();

@Controller('crm')
export class CrmRealtimeController {
  /** Canal de eventos: `chats` (qué chats cambiaron) y `presence` (quién mira/escribe). */
  @SkipRateLimit()
  @Get('stream')
  stream(@Req() req: any, @Res() reply: any, @CurrentUser() user: RequestUser) {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Que ningún proxy intermedio acumule los eventos.
      'X-Accel-Buffering': 'no',
    });
    const id = nextId++;
    const send = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    subscribers.set(id, {id, userId: user.id, send});
    send('ready', {at: new Date().toISOString()});
    // Estado actual de presencia para el que recién llega.
    for (const chatKey of presence.keys()) {
      const viewers = presenceOf(chatKey);
      if (viewers.length) send('presence', {chatKey, viewers});
    }
    ensureFeed();
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      subscribers.delete(id);
      if (![...subscribers.values()].some((subscriber) => subscriber.userId === user.id)) leaveAll(user.id);
    });
  }

  /** Latido de presencia: qué chat tengo abierto y si estoy escribiendo. */
  @SkipRateLimit()
  @Post('presence')
  presence(@Body(new ZodPipe(presenceSchema)) body: {chatKey: string | null; typing: boolean}, @CurrentUser() user: RequestUser) {
    leaveAll(user.id, body.chatKey ?? undefined);
    if (body.chatKey) {
      const viewers = presence.get(body.chatKey) ?? new Map<string, Presence>();
      const previous = viewers.get(user.id);
      viewers.set(user.id, {userId: user.id, name: user.displayName || user.username, typing: body.typing, at: Date.now()});
      presence.set(body.chatKey, viewers);
      if (!previous || previous.typing !== body.typing) publishPresence(body.chatKey);
    }
    return {ok: true};
  }
}
