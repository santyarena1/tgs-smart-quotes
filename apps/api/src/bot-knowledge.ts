/**
 * Datos reales del sistema para que el bot no responda "de memoria".
 *
 * Antes de cada respuesta se consulta, según lo que pregunta el cliente:
 *  - productos del catálogo que coinciden (precio contado vigente, si figura con stock);
 *  - PCs publicadas en la tienda que encajan con su presupuesto (precio, cuotas, juegos, link);
 *  - el presupuesto vinculado al chat (qué trae, total y cuotas).
 *
 * Todo sale como texto compacto en "DATOS DEL SISTEMA": la IA solo puede afirmar
 * precios que estén ahí.
 */
import {db} from '@tgs/database';
import {normalizeText} from '@tgs/validation';
import {applyInterestBps} from './calculator-seed.js';

const STOPWORDS = new Set(('hola buenas buen dia tardes noches quiero queria quisiera saber consulta consultar info informacion mas sobre ' +
  'tienen tenes hay precio cuanto sale cuesta vale para por con sin una uno unos unas los las del que como esta este esto ' +
  'me te le nos se mi tu su ya si no muy mucho poco algo pero tambien solo pc compu computadora gamer completa armada favor gracias').split(' '));

/** Palabras que indican que el cliente pregunta por un producto puntual. */
const PRODUCT_HINT = /\b(ryzen|intel|core|i[3579]|rtx|gtx|rx|radeon|geforce|nvidia|amd|monitor|teclado|mouse|auricular|gabinete|fuente|ram|ddr[45]|ssd|nvme|m\.?2|disco|placa|mother|motherboard|cooler|silla|webcam|parlante|microfono|joystick|notebook|procesador|video)\b|\d{3,}/;

/** Palabras que indican que quiere una PC armada. */
const PC_HINT = /\b(pc|compu|computadora|equipo|armad[ao]|gamer|para jugar|presupuesto)\b/;

const money = (cents: bigint) => `$${Number(cents / 100n).toLocaleString('es-AR')}`;

function searchTerms(text: string): string[] {
  const words = normalizeText(text).split(' ').filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  // Primero lo que tiene números (modelos: 5600, 4060…), después el resto.
  return [...new Set([...words.filter((word) => /\d/.test(word)), ...words.filter((word) => !/\d/.test(word))])].slice(0, 4);
}

async function financing() {
  const [company, plans] = await Promise.all([
    db.companySettings.findUnique({where: {id: 'singleton'}, select: {listInterestBps: true}}),
    db.financingPlan.findMany({where: {active: true}, orderBy: [{sortOrder: 'asc'}, {installments: 'asc'}]}),
  ]);
  return {listInterestBps: company?.listInterestBps ?? 0, plans};
}

function installmentsText(cashCents: bigint, fin: Awaited<ReturnType<typeof financing>>): string {
  if (!fin.plans.length) return '';
  const list = applyInterestBps(cashCents, fin.listInterestBps);
  const parts = fin.plans.slice(0, 4).map((plan) => {
    const total = applyInterestBps(list, plan.interestBps);
    const n = BigInt(Math.max(1, plan.installments));
    const each = (total + n / 2n) / n;
    return `${plan.installments} cuotas de ${money(each)}${plan.interestBps === 0 ? ' sin interés' : ''}${plan.bank ? ` (${plan.bank})` : ''}`;
  });
  return `precio de lista ${money(list)}; ${parts.join('; ')}`;
}

async function catalogMatches(text: string): Promise<string[]> {
  const terms = searchTerms(text);
  if (!terms.length) return [];
  const byAll = await db.acustockProduct.findMany({
    where: {
      availability: {not: 'discontinued'},
      AND: terms.slice(0, 3).map((term) => ({OR: [{title: {contains: term, mode: 'insensitive' as const}}, {mpn: {contains: term, mode: 'insensitive' as const}}]})),
    },
    orderBy: [{stockQuantity: 'desc'}],
    take: 6,
  });
  const rows = byAll.length ? byAll : await db.acustockProduct.findMany({
    where: {availability: {not: 'discontinued'}, title: {contains: terms[0] ?? '', mode: 'insensitive'}},
    orderBy: [{stockQuantity: 'desc'}],
    take: 5,
  });
  return rows.map((row) => {
    const price = row.salePriceCents ?? row.priceCents;
    const stock = row.stockQuantity > 0 ? 'figura con stock en el sistema' : 'sin stock en el sistema';
    return `- ${row.title} — ${money(price)} contado/transferencia — ${stock}${row.productUrl ? ` — ${row.productUrl}` : ''}`;
  });
}

async function publishedPcs(budgetCents: number | null, fin: Awaited<ReturnType<typeof financing>>): Promise<string[]> {
  const rows = await db.webPublication.findMany({
    where: {status: 'PUBLISHED', quoteFamily: {kind: 'PC'}},
    include: {
      quoteFamily: {select: {webTitle: true, internalName: true}},
      quoteVersion: {select: {totalSaleCents: true, enrichment: {select: {title: true, gamesJson: true}}}},
    },
    take: 80,
  });
  const scored = rows
    .filter((row) => row.quoteVersion.totalSaleCents > 0n)
    .map((row) => ({row, total: row.quoteVersion.totalSaleCents}))
    .sort((a, b) => budgetCents
      ? Math.abs(Number(a.total) - budgetCents) - Math.abs(Number(b.total) - budgetCents)
      : Number(a.total - b.total))
    .slice(0, 5)
    .sort((a, b) => Number(a.total - b.total));
  return scored.map(({row, total}) => {
    const title = row.quoteFamily.webTitle || row.quoteVersion.enrichment?.title || row.quoteFamily.internalName;
    const games = Array.isArray(row.quoteVersion.enrichment?.gamesJson) ? (row.quoteVersion.enrichment?.gamesJson as unknown[]).filter((game): game is string => typeof game === 'string').slice(0, 6) : [];
    const cuotas = installmentsText(total, fin);
    return `- ${title} — ${money(total)} contado/transferencia${cuotas ? ` (${cuotas})` : ''}${games.length ? ` — corre: ${games.join(', ')}` : ''}${row.url ? ` — ${row.url}` : ''}`;
  });
}

async function linkedQuote(chatKey: string, fin: Awaited<ReturnType<typeof financing>>): Promise<string[]> {
  const conversation = await db.chatbotConversation.findUnique({where: {chatKey}, select: {lastQuoteFamilyId: true, lastQuoteVersion: true}});
  if (!conversation?.lastQuoteFamilyId) return [];
  const family = await db.quoteFamily.findUnique({
    where: {id: conversation.lastQuoteFamilyId},
    select: {visibleNumber: true, activeVersion: true, internalName: true},
  });
  if (!family) return [];
  const version = await db.quoteVersion.findFirst({
    where: {familyId: conversation.lastQuoteFamilyId, version: conversation.lastQuoteVersion ?? family.activeVersion},
    select: {totalSaleCents: true, items: {select: {frozenName: true, quantity: true}, orderBy: {position: 'asc'}}},
  });
  if (!version) return [];
  const items = version.items.map((item) => `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.frozenName}`).join('; ');
  const cuotas = installmentsText(version.totalSaleCents, fin);
  return [`- Presupuesto ${family.visibleNumber} (ya enviado a este cliente): ${items}. Total ${money(version.totalSaleCents)} contado/transferencia${cuotas ? ` (${cuotas})` : ''}.`];
}

/**
 * Arma "DATOS DEL SISTEMA" para un mensaje. Nunca falla: si una consulta se cae,
 * esa parte simplemente no aparece.
 */
export async function buildSystemData(input: {chatKey: string; message: string; budgetCents: number | null; recentText: string}): Promise<string> {
  const text = normalizeText(input.message);
  const context = normalizeText(`${input.recentText} ${input.message}`);
  const wantsProduct = PRODUCT_HINT.test(text);
  const wantsPc = PC_HINT.test(context) || Boolean(input.budgetCents);
  const fin = await financing().catch(() => ({listInterestBps: 0, plans: []}));

  const [quote, products, pcs] = await Promise.all([
    linkedQuote(input.chatKey, fin).catch(() => []),
    wantsProduct ? catalogMatches(input.message).catch(() => []) : Promise.resolve([]),
    wantsPc ? publishedPcs(input.budgetCents, fin).catch(() => []) : Promise.resolve([]),
  ]);

  const sections: string[] = [];
  if (quote.length) sections.push(`PRESUPUESTO DE ESTE CLIENTE\n${quote.join('\n')}`);
  if (products.length) {
    sections.push(`PRODUCTOS DEL CATÁLOGO QUE COINCIDEN (precio vigente; el stock lo confirma una persona antes de reservar)\n${products.join('\n')}`);
  }
  if (pcs.length) {
    sections.push(`PCs ARMADAS PUBLICADAS EN LA TIENDA (precio vigente${input.budgetCents ? `, las más cercanas a su presupuesto de ${money(BigInt(input.budgetCents))}` : ''}). Podés recomendar 1 o 2 que encajen con lo que quiere y preguntarle cuál le gusta. NO copies el título de la tienda: contala como un vendedor ("una con Ryzen 5 5500, 16 de RAM y una 1660 Super, te queda en $1.056.900"), una PC por burbuja, y el link solo en su propia burbuja.\n${pcs.join('\n')}`);
  }
  return sections.join('\n\n');
}
