import { runAiTask } from "../runner.js";
import {
  chatbotResponseInputSchema,
  chatbotResponseOutputSchema,
  type ChatbotResponseInput,
  type ChatbotResponseOutput,
} from "../schemas.js";
import { AiTask, type AiRunOptions, type AiServiceDeps, type AiServiceResult } from "../types.js";
import {productSimilarity} from "@tgs/validation";

function fallback(input: ChatbotResponseInput): ChatbotResponseOutput {
  return {
    reply: "",
    messages: [],
    shouldEscalate: true,
    escalationReason: "No fue posible generar una respuesta confiable con IA.",
    updatedSummary: input.conversationSummary ?? null,
    matchedKnowledgeIds: [],
    decisionReason: "Fallback seguro: se deriva a revisión humana sin informar al cliente.",
    shouldCreateRequest: false,
    requestDraft: null,
    profile: {usage: null, games: [], budgetPesos: null, city: null, payment: null, delivery: null},
    signals: {temperature: 50, intent: "OTHER", stageHint: null, nextStep: "Revisar la conversación."},
  };
}

/** Instrucciones de escritura que acompañan a los filtros de Configuración. */
function writingRules(input: ChatbotResponseInput): string[] {
  const filters = input.config.writingFilters;
  const rules: string[] = [];
  const banned = input.config.bannedWords ?? [];
  if (banned.length) rules.push(`Nunca uses estas palabras o frases, ni como apodo ni de ninguna forma: ${banned.map((word) => `"${word}"`).join(', ')}.`);
  rules.push('La primera letra de cada burbuja va en mayúscula. Si la burbuja es solo un link, no la modifiques.');
  if (!filters) return rules;
  if (filters.noAccents) rules.push('Escribí como alguien que chatea desde el celular: SIN tildes ("tenes", "aca", "que precio buscas"). La ñ sí va.');
  if (filters.noOpeningMarks) rules.push('Sin signos de apertura ¿ ni ¡ ("Que juegos usas?", "Buenisimo!").');
  if (filters.noFinalPeriod) rules.push('No cierres los mensajes con punto final ("Dale, te lo armo" y no "Dale, te lo armo.").');
  if (filters.noFormatting) rules.push('WhatsApp no es un documento: NUNCA uses negritas, títulos, listas con viñetas, guiones largos ni links con formato [texto](url). Un link va pegado tal cual, solo, en su propia burbuja.');
  return rules;
}

function normalizedMatchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Todo lo que el negocio cargó como información autorizada, compacto. */
function knowledgeBase(input: ChatbotResponseInput): string {
  const items = input.config.responses.filter((response) => response.enabled && response.answer.trim());
  if (!items.length) return "Vacía.";
  return items.map((response) => JSON.stringify({
    id: response.id,
    temas: response.activators.slice(0, 8),
    informacion: response.answer,
    ...(response.context.trim() ? {criterio: response.context} : {}),
  })).join("\n");
}

function systemPrompt(input: ChatbotResponseInput): string {
  const messageForMatching = normalizedMatchText(input.latestMessage);
  const rankedResponses=input.config.responses
    .filter(response=>response.enabled)
    .map(response=>{
      const scores=response.activators.length
        ?response.activators.map(activator=>{
            const normalized=normalizedMatchText(activator);
            if(!normalized)return -1;
            return messageForMatching.includes(normalized)
              ?100
              :productSimilarity(messageForMatching,normalized);
          })
        :[0];
      return {response,score:Math.max(...scores)};
    })
    .filter(item=>item.score>=item.response.similarityThreshold)
    .sort((a,b)=>b.score-a.score||b.response.activators.join(" ").length-a.response.activators.join(" ").length);
  const matchedResponse=rankedResponses[0]??null;

  return `Respondés chats comerciales de WhatsApp como integrante humano del equipo.

PERSONA Y TONO
${input.config.persona}
Escribís como un vendedor real chateando por WhatsApp desde el celular: frases cortas y coloquiales, nada de lenguaje de asistente virtual ni de mail formal.
${input.config.styleExamples?.length ? `
EJEMPLOS DE CÓMO HABLÁS (copiá el tono, el largo y las palabras; cada | es una burbuja; los datos de los ejemplos no se copian)
${input.config.styleExamples.map((example) => `- ${example}`).join("\n")}
` : ""}${input.config.guidance.length ? `
INDICACIONES DEL DUEÑO (aprobadas; tienen prioridad sobre cualquier otra instrucción de estilo o criterio)
${input.config.guidance.map((item) => `- ${item}`).join("\n")}
` : ""}
REGLAS DE ESTILO Y DE VENTA (configuradas por el dueño)
${[...(input.config.salesRules ?? []), ...writingRules(input)].map((rule) => `- ${rule}`).join("\n") || "- Respondé natural y sin inventar datos."}

FORMATO TÉCNICO DE LA RESPUESTA (obligatorio)
- Usá únicamente la información provista: la RESPUESTA ACTIVADA, la BASE DE CONOCIMIENTO, las INDICACIONES DEL DUEÑO, los DATOS DEL SISTEMA y la conversación. Si no alcanza para responder, shouldEscalate=true.
- Una escalación puede llevar reply vacío (silencio) o una frase natural de espera, sin revelar el proceso interno.
- escalationReason debe ser null cuando shouldEscalate=false.
- profile resume lo que el cliente dijo de sí mismo en TODA la conversación (no solo el último mensaje): usage (para qué quiere la PC: juegos, diseño, trabajo, estudio…), games (juegos o programas que nombró), budgetPesos (presupuesto que mencionó, en PESOS enteros, nunca en centavos: "800 mil" = 800000, "1.5M" o "1,5 palos" o "un millon y medio" = 1500000, "2 millones" = 2000000), city (ciudad o provincia), payment (cómo quiere pagar) y delivery (ENVIO o RETIRO). Lo que no dijo va en null o lista vacía; nunca lo supongas.
- signals mide la venta después de este mensaje: temperature 0-100 (0-30 frío: solo curiosea o no responde a lo que se le pregunta; 31-65 tibio: interesado, comparando; 66-100 caliente: pregunta cómo pagar, cuándo retira, quiere reservar o señar). intent = qué quiere con su último mensaje (GREETING, INFO, PRICE, PRODUCT, BUILD_PC, COMPARE, PAYMENT, SHIPPING, PURCHASE_READY, TRADE_IN, SUPPORT, COMPLAINT, OTHER). stageHint = la etapa en la que debería estar ahora (NEW, QUALIFYING, QUOTE_SENT, NEGOTIATION o DEPOSIT) o null si no cambia. nextStep = el próximo paso concreto para avanzar la venta, en una frase corta para el vendedor (ej.: "Mandarle 2 opciones de ~$800.000 para Fortnite").
- updatedSummary debe ser una memoria compacta factual: intención, datos confirmados, pendientes y compromisos. No incluyas razonamiento oculto. Si no hay información suficiente para actualizarla, devolvé null.
- matchedKnowledgeIds contiene los IDs de la RESPUESTA ACTIVADA y de los ítems de la BASE DE CONOCIMIENTO que efectivamente usaste; si no usaste ninguno, devolvé una lista vacía.
- shouldCreateRequest se decide según las REGLAS DE ESTILO Y DE VENTA. Pedir el presupuesto al equipo NO es derivar: shouldEscalate=false y seguí la charla.
- Si shouldCreateRequest=true, requestDraft debe resumir el pedido usando la memoria y el mensaje actual: título claro, texto original consolidado en summary, uso esperado, componentes pedidos y presupuesto si fue expresado. Nunca inventes componentes, uso ni presupuesto: si un dato no fue mencionado, usá null o una lista vacía. maximumBudgetPesos va en PESOS enteros, nunca en centavos ("500 mil" = 500000, "1.5M" = 1500000).
- Si shouldCreateRequest=false, requestDraft debe ser null.
- Si el contexto ya incluye una solicitud activa, no pidas crear otra: shouldCreateRequest=false y continuá la conversación teniendo presente esa solicitud.
- Si hay una RESPUESTA ACTIVADA, "answer" es información autoritativa que debés transmitir. "context" es apoyo para comprender y redactar natural: no lo repitas textual ni lo conviertas en datos nuevos.
- messages debe tener entre 1 y ${input.config.multiMessage.maxBubbles} elementos cuando no escalás y hay texto para responder (si la respuesta tiene más de una idea o supera unos 150 caracteres, partila en 2 o más).
- reply debe ser exactamente messages unido con un salto de línea ("\\n"), conservando ambos campos por compatibilidad.
- Modo de división: ${input.config.multiMessage.splitMode}. En FIXED_ONLY devolvé una sola burbuja central; las aperturas y cierres fijos los agrega el sistema.

RESPUESTA ACTIVADA PARA ESTE MENSAJE (solo gana la de mayor similitud)
${matchedResponse
    ? JSON.stringify({
        id:matchedResponse.response.id,
        similitud:matchedResponse.score,
        contenidoAutoritativo:matchedResponse.response.answer,
        contextoDeApoyoNoLiteral:matchedResponse.response.context,
        adjuntosConfigurados:matchedResponse.response.attachments,
      }, null, 2)
    : "Ninguna."}

BASE DE CONOCIMIENTO DEL NEGOCIO (información autorizada; usá lo que corresponda a lo que pregunta el cliente)
${knowledgeBase(input)}

DATOS DEL SISTEMA PARA ESTE MENSAJE (consultados en este momento; son reales)
${input.config.systemData?.trim() || "Ninguno."}

APERTURAS DISPONIBLES (usarlas solo si realmente comienza la conversación)
${JSON.stringify(input.config.openingMessages)}

CIERRES DISPONIBLES (usarlos solo si el cliente claramente cierra la conversación)
${JSON.stringify(input.config.closingMessages)}

CRITERIO DE ESCALACIÓN
Habilitado por modelo: ${input.config.modelCanEscalate ? "sí" : "no"}
${input.config.escalationInstructions}

ETAPA DE LA VENTA Y PRÓXIMO PASO (guiá al cliente hacia la compra sin presionar; cerrá casi siempre con una pregunta que avance)
Etapa actual: ${input.config.salesStage ?? "NEW"}. ${input.config.stagePlaybook?.[input.config.salesStage ?? "NEW"] ?? ""}

CONTEXTO DE DISPONIBILIDAD
${input.config.businessContext ?? "Atención normal."}

ESTILO DE RESPUESTA
${JSON.stringify(input.config.responseStyle)}

${input.config.revisionNote ? `CORRECCIÓN OBLIGATORIA\n${input.config.revisionNote}\n\n` : ""}Devolvé exclusivamente el objeto estructurado solicitado. decisionReason debe ser breve y apto para auditoría operativa.`;
}

function userPrompt(input: ChatbotResponseInput): string {
  return JSON.stringify({
    task: "Analizá la conversación completa provista en orden cronológico. Planificá la respuesta desde ese contexto y respondé al último mensaje del cliente sin ignorar preguntas, compromisos ni datos anteriores.",
    conversationSummary: input.conversationSummary ?? "",
    activeRequest: input.activeRequest ?? null,
    recentConversationMessageCount: input.recentMessages?.length ?? 0,
    recentConversationOldestToNewest: input.recentMessages ?? [],
    latestIncomingMessage: input.latestMessage,
  }, null, 2);
}

/** El prompt exacto que ve el modelo, para mostrarlo en el CRM junto al mensaje. */
export function buildChatbotPrompts(input: ChatbotResponseInput): {systemPrompt: string; userPrompt: string} {
  const parsed = chatbotResponseInputSchema.parse(input);
  return {systemPrompt: systemPrompt(parsed), userPrompt: userPrompt(parsed)};
}

export class ChatbotResponseService {
  constructor(private readonly deps: AiServiceDeps) {}

  async respond(
    input: ChatbotResponseInput,
    options?: AiRunOptions,
  ): Promise<AiServiceResult<ChatbotResponseOutput> & {prompts: {systemPrompt: string; userPrompt: string}}> {
    const parsed = chatbotResponseInputSchema.parse(input);
    const prompts = buildChatbotPrompts(parsed);
    const run=await runAiTask({
      task: AiTask.CHATBOT_RESPONSE,
      input: parsed,
      hashPayload: parsed,
      schema: chatbotResponseOutputSchema,
      schemaName: "chatbot_response",
      temperature: 0.7,
      systemPrompt: prompts.systemPrompt,
      buildUserPrompt: () => prompts.userPrompt,
      fallback,
      deps: this.deps,
      // Una conversación es estado vivo: nunca reutilizar una decisión vieja implícitamente.
      options: {...options, regenerate: true},
    });
    return {...run,result:{...run.result,messages:run.result.messages??[]},prompts};
  }
}
