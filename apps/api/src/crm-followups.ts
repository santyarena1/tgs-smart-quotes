/**
 * Seguimiento automático de presupuestos sin respuesta.
 *
 * Si se mandó un presupuesto y el cliente no contestó, se le escribe solo a las X
 * horas (pasos configurables). Se corta en cuanto el cliente responde, y se vuelve
 * a contar desde cero si un vendedor escribe. Dentro de las 24 h se manda texto
 * libre; pasada la ventana, solo una plantilla aprobada (si no hay, ese paso se omite).
 */
import {Body, Controller, Get, Logger, Put} from '@nestjs/common';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {jsonSafe, ZodPipe} from './infrastructure.js';
import {enqueueOutbound} from './whatsapp-outbound.js';
import {windowState} from './whatsapp-window.js';

const logger = new Logger('CrmFollowups');

const stepSchema = z.object({
  afterHours: z.coerce.number().min(0.5).max(24 * 14),
  text: z.string().trim().max(1000).nullable().default(null),
  templateId: z.string().trim().max(100).nullable().default(null),
  variables: z.array(z.string().trim().max(200)).max(10).default([]),
}).strict();

const configSchema = z.object({
  enabled: z.boolean(),
  onlyBotChats: z.boolean().default(false),
  steps: z.array(stepSchema).max(6),
}).strict();
export type FollowupConfig = z.infer<typeof configSchema>;

export function parseFollowups(value: unknown): FollowupConfig {
  const parsed = configSchema.safeParse(value);
  return parsed.success ? parsed.data : {enabled: false, onlyBotChats: false, steps: []};
}

/** Saludo con el nombre del cliente si se lo conoce. */
function personalize(text: string, name: string | null): string {
  const first = name && !/^\+?\d/.test(name) ? name.split(/\s+/)[0] ?? '' : '';
  return text.replace(/\{nombre\}/gi, first).replace(/\s+([!?.,])/g, '$1').trim();
}

type Plan = {chatKey: string; name: string | null; step: number; dueAt: Date; mode: 'TEXT' | 'TEMPLATE' | 'SKIP'};

/** Para cada chat que espera respuesta a un presupuesto: qué seguimiento toca y cuándo. */
async function plan(config: FollowupConfig, now = new Date()): Promise<Plan[]> {
  if (!config.steps.length) return [];
  const trainers = (await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {trainerNumbers: true}}))?.trainerNumbers ?? [];
  const chats = await db.chatbotConversation.findMany({
    where: {
      stage: {in: ['QUOTE_SENT', 'NEGOTIATION']},
      resolvedAt: null,
      recontactOptOut: false,
      lastOutboundAt: {not: null},
      OR: [{lastInboundAt: null}, {lastOutboundAt: {gt: db.chatbotConversation.fields.lastInboundAt}}],
      NOT: [{chatKey: {startsWith: 'sim:'}}, {chatKey: {in: trainers}}],
      AND: [{OR: [{snoozedUntil: null}, {snoozedUntil: {lte: now}}]}],
      ...(config.onlyBotChats ? {botPausedAt: null, escalatedAt: null} : {}),
    },
    select: {chatKey: true, displayName: true, waContactName: true, windowExpiresAt: true},
    take: 300,
  });
  const templates = new Map((await db.whatsappTemplate.findMany({where: {status: 'APPROVED'}, select: {id: true}})).map((row) => [row.id, true]));
  const plans: Plan[] = [];
  for (const chat of chats) {
    const outbound = await db.chatbotMessageLog.findMany({
      where: {conversationKey: chat.chatKey, direction: 'OUTBOUND', status: {in: ['SEND_PENDING', 'SENT', 'DELIVERED', 'READ', 'DISMISSED']}},
      orderBy: {createdAt: 'desc'},
      take: 20,
      select: {createdAt: true, status: true, decisionMetadata: true},
    });
    // El reloj arranca en lo último que escribimos que NO fue un seguimiento.
    const anchor = outbound.find((log) => !(log.decisionMetadata as any)?.followupStep && log.status !== 'DISMISSED');
    if (!anchor) continue;
    const done = outbound.filter((log) => log.createdAt > anchor.createdAt && (log.decisionMetadata as any)?.followupStep).length;
    const step = config.steps[done];
    if (!step) continue;
    const dueAt = new Date(anchor.createdAt.getTime() + step.afterHours * 3_600_000);
    const open = windowState(chat.windowExpiresAt, dueAt > now ? dueAt : now).open;
    const mode: Plan['mode'] = open && step.text ? 'TEXT' : step.templateId && templates.has(step.templateId) ? 'TEMPLATE' : 'SKIP';
    plans.push({chatKey: chat.chatKey, name: chat.displayName || chat.waContactName, step: done, dueAt, mode});
  }
  return plans.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

async function runDue() {
  const settings = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {followups: true}});
  const config = parseFollowups(settings?.followups);
  if (!config.enabled) return;
  const now = new Date();
  for (const item of (await plan(config, now)).filter((entry) => entry.dueAt <= now)) {
    const step = config.steps[item.step];
    if (!step) continue;
    const metadata = {followupStep: item.step + 1, automated: true};
    if (item.mode === 'SKIP') {
      // Ventana cerrada y sin plantilla: se deja asentado y se pasa al paso siguiente.
      await db.chatbotMessageLog.create({data: {
        conversationKey: item.chatKey, direction: 'OUTBOUND', actor: 'SYSTEM', status: 'DISMISSED', channel: 'CLOUD_API', text: '',
        error: `Seguimiento ${item.step + 1} omitido: la ventana de 24 h estaba cerrada y el paso no tiene plantilla aprobada.`,
        decisionMetadata: metadata as Prisma.InputJsonValue,
      }});
      continue;
    }
    const template = item.mode === 'TEMPLATE' && step.templateId
      ? await db.whatsappTemplate.findUnique({where: {id: step.templateId}, select: {body: true}})
      : null;
    const text = item.mode === 'TEXT'
      ? personalize(step.text ?? '', item.name)
      : (template?.body ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => step.variables[Number(index) - 1] ?? match);
    // Actor HUMAN: es una decisión del negocio (configurada), no del bot, y no debe frenarse
    // por las reglas del bot ni pausarlo.
    const log = await db.chatbotMessageLog.create({data: {
      conversationKey: item.chatKey, direction: 'OUTBOUND', actor: 'HUMAN', status: 'SEND_PENDING', channel: 'CLOUD_API', text,
      decisionMetadata: metadata as Prisma.InputJsonValue,
    }});
    await enqueueOutbound(item.chatKey, log.id, [item.mode === 'TEXT'
      ? {kind: 'TEXT', payload: {text}}
      : {kind: 'TEMPLATE', payload: {templateId: step.templateId ?? undefined, variables: step.variables}}]);
    logger.log(JSON.stringify({event: 'crm_followup_sent', chatKey: item.chatKey, step: item.step + 1, mode: item.mode}));
  }
}

let timer: NodeJS.Timeout | null = null;

export function startFollowups(): void {
  if (timer) return;
  const tick = async () => {
    try {
      await runDue();
    } catch (error) {
      logger.warn(JSON.stringify({event: 'crm_followups_failed', error: error instanceof Error ? error.message : String(error)}));
    } finally {
      timer = setTimeout(() => void tick(), 60_000);
    }
  };
  timer = setTimeout(() => void tick(), 30_000);
}

@Controller('crm/followups')
export class CrmFollowupsController {
  @Get()
  async get() {
    const settings = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}, select: {followups: true}});
    return parseFollowups(settings.followups);
  }

  @Put()
  async set(@Body(new ZodPipe(configSchema)) body: FollowupConfig) {
    await db.chatbotSettings.update({where: {id: 'singleton'}, data: {followups: body as unknown as Prisma.InputJsonValue}});
    return body;
  }

  /** Próximos seguimientos (lo que va a salir y cuándo), para ver antes de activarlo. */
  @Get('upcoming')
  async upcoming() {
    const settings = await db.chatbotSettings.findUniqueOrThrow({where: {id: 'singleton'}, select: {followups: true}});
    const config = parseFollowups(settings.followups);
    const plans = await plan({...config, steps: config.steps});
    return jsonSafe(plans.slice(0, 50));
  }
}
