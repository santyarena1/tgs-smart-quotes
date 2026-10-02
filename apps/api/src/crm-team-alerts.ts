/** Configuración de avisos al equipo (sin dependencias, para no formar ciclos de imports). */
import {db} from '@tgs/database';

export type TeamAlerts = {
  enabled: boolean;
  /** chatKeys (`tel:549...`) de los vendedores que reciben el aviso. */
  numbers: string[];
  /** Plantilla aprobada para avisar a quien no le escribió al bot en las últimas 24 h. */
  templateId: string | null;
  /** El bot manda solo el presupuesto apenas la solicitud queda LISTA. */
  autoSendQuote: boolean;
};

export const DEFAULT_TEAM_ALERTS: TeamAlerts = {enabled: true, numbers: [], templateId: null, autoSendQuote: true};

export function parseTeamAlerts(value: unknown): TeamAlerts {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<TeamAlerts> : {};
  return {
    enabled: raw.enabled !== false,
    numbers: Array.isArray(raw.numbers) ? raw.numbers.filter((item): item is string => typeof item === 'string') : [],
    templateId: typeof raw.templateId === 'string' && raw.templateId ? raw.templateId : null,
    autoSendQuote: raw.autoSendQuote !== false,
  };
}

/** Vendedores que reciben avisos: el bot no los atiende como clientes. */
export async function isTeamNumber(chatKey: string): Promise<boolean> {
  const row = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {teamAlerts: true}});
  return parseTeamAlerts(row?.teamAlerts).numbers.includes(chatKey);
}

