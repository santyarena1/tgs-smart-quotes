import { z } from "zod";
import { runAiTask } from "../runner.js";
import { AiTask, type AiServiceDeps, type AiServiceResult } from "../types.js";

/**
 * El "jefe" del bot le escribe por WhatsApp desde un número entrenador. Este servicio
 * entiende qué quiere: enseñarle algo, confirmar o descartar lo que propuso, probarlo
 * como si fuera un cliente o preguntarle qué sabe. Nunca aplica nada solo: devuelve
 * propuestas que una persona aprueba.
 */
export const botTrainerInputSchema = z.object({
  message: z.string().min(1),
  recentConversation: z.array(z.object({ from: z.enum(["TRAINER", "BOT"]), text: z.string() })).default([]),
  pendingProposals: z.array(z.object({ id: z.string(), summary: z.string() })).default([]),
  openQuestions: z.array(z.object({ id: z.string(), question: z.string(), occurrences: z.number().int() })).default([]),
  knowledge: z.array(z.object({ id: z.string(), temas: z.array(z.string()), informacion: z.string() })).default([]),
  guidance: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  persona: z.string().default(""),
}).strict();
export type BotTrainerInput = z.infer<typeof botTrainerInputSchema>;

export const botTrainerOutputSchema = z.object({
  intent: z.enum(["TEACH", "CONFIRM", "REJECT", "TEST", "QUERY", "CHAT"]),
  reply: z.string(),
  proposals: z.array(z.object({
    kind: z.enum(["GUIDANCE", "KNOWLEDGE"]),
    summary: z.string(),
    /** GUIDANCE: la indicación tal como la va a seguir el bot. */
    text: z.string().nullable(),
    /** KNOWLEDGE: palabras o frases con las que el cliente lo pregunta. */
    activators: z.array(z.string()),
    /** KNOWLEDGE: la información autorizada. */
    answer: z.string().nullable(),
    context: z.string().nullable(),
    /** Si corrige un dato que ya existe, su id. */
    replacesId: z.string().nullable(),
    /** Si responde una pregunta abierta, su id. */
    answersQuestionId: z.string().nullable(),
  }).strict()),
  confirmIds: z.array(z.string()),
  rejectIds: z.array(z.string()),
  testMessage: z.string().nullable(),
}).strict();
export type BotTrainerOutput = z.infer<typeof botTrainerOutputSchema>;

function fallback(): BotTrainerOutput {
  return {
    intent: "CHAT",
    reply: "No pude procesar eso ahora. Probá de nuevo en un rato o cargalo desde el CRM, en Entrenamiento.",
    proposals: [],
    confirmIds: [],
    rejectIds: [],
    testMessage: null,
  };
}

function systemPrompt(): string {
  return `Sos el asistente de entrenamiento del bot de ventas de WhatsApp de The Gamer Shop (PCs gamer, componentes y periféricos). Quien te escribe es el DUEÑO o un encargado: no es un cliente. Hablás en rioplatense, breve y claro, como un empleado que toma nota de lo que le pide el jefe.

Tu trabajo es entender qué quiere y devolver un objeto estructurado:

intent:
- TEACH: te enseña algo nuevo o corrige algo (un dato del negocio, una regla de cómo atender, cuándo derivar, un cambio de tono). Armá una o más proposals.
- CONFIRM: aprueba algo pendiente ("sí", "dale", "aplicalo"). Poné los ids en confirmIds.
- REJECT: descarta algo pendiente ("no", "cancelá", "eso no"). Poné los ids en rejectIds.
- TEST: quiere ver cómo respondería el bot a un cliente ("probá: …", "si un cliente te dice …"). Poné en testMessage el mensaje exacto del cliente.
- QUERY: pregunta qué sabés, qué está pendiente o qué no supiste responder. Respondé en reply con la información provista.
- CHAT: cualquier otra cosa; respondé corto y llevalo a enseñar o probar.

Cómo armar proposals (TEACH):
- KNOWLEDGE = un dato concreto del negocio que el bot tiene que poder informar (precio de envío, garantía, horarios, medios de pago, políticas). Completá activators (cómo lo preguntaría un cliente, 3 a 8 frases cortas), answer (el dato completo y exacto, tal cual lo dijo el dueño, sin inventar nada) y context (criterio para usarlo, o null). Si actualiza un dato que ya está en la BASE DE CONOCIMIENTO, poné su id en replacesId y en answer el dato completo nuevo.
- GUIDANCE = una indicación de criterio o tono ("si preguntan por notebooks, derivá", "no ofrezcas cuotas sin interés"). Completá text redactado como instrucción clara para el bot, en segunda persona.
- Si lo que te enseña responde una PREGUNTA ABIERTA, poné su id en answersQuestionId.
- summary: una frase que empieza con "Entendí:" y resume lo que vas a aplicar.
- Nunca inventes datos que el dueño no dijo. Si falta algo importante (por ejemplo dice "el envío sale tanto" sin decir a dónde), preguntalo en reply y no propongas todavía.
- Si el mensaje mezcla varias cosas, una proposal por cada una.

reply:
- Para TEACH: confirmá lo que entendiste en 1 o 2 frases y terminá con "¿Lo aplico? Respondé Sí o corregime." Si tenés una duda, preguntala en vez de proponer.
- Para CONFIRM/REJECT: una frase corta confirmando ("Listo, ya lo tengo en cuenta." / "Dale, lo descarto.").
- Para TEST: una frase corta tipo "Así le respondería a un cliente:" (el sistema agrega la respuesta).
- Para QUERY: la respuesta concreta, corta, en lista si son varias cosas.
- Sin emojis innecesarios, sin formalidades.

Cuando no haya nada que corresponda, devolvé listas vacías y null en los campos que no apliquen.`;
}

export class BotTrainerService {
  constructor(private readonly deps: AiServiceDeps) {}

  async handle(input: BotTrainerInput): Promise<AiServiceResult<BotTrainerOutput>> {
    const parsed = botTrainerInputSchema.parse(input);
    return runAiTask({
      task: AiTask.CHATBOT_RESPONSE,
      input: parsed,
      hashPayload: { trainer: parsed, at: Date.now() },
      schema: botTrainerOutputSchema,
      schemaName: "bot_trainer",
      systemPrompt: systemPrompt(),
      buildUserPrompt: (value) => JSON.stringify({
        mensajeDelDueño: value.message,
        conversacionReciente: value.recentConversation,
        propuestasPendientes: value.pendingProposals,
        preguntasAbiertasDeClientes: value.openQuestions,
        baseDeConocimiento: value.knowledge,
        indicacionesVigentes: value.guidance,
        personaDelBot: value.persona,
      }, null, 2),
      fallback,
      deps: this.deps,
      options: { regenerate: true },
    });
  }
}

/** A partir de una sugerencia del bot que un vendedor corrigió, propone qué aprender. */
export const sellerEditOutputSchema = z.object({
  worthLearning: z.boolean(),
  summary: z.string(),
  guidance: z.string().nullable(),
}).strict();
export type SellerEditOutput = z.infer<typeof sellerEditOutputSchema>;

export class SellerEditLearningService {
  constructor(private readonly deps: AiServiceDeps) {}

  async propose(input: { customerMessage: string; botDraft: string; sentByHuman: string }): Promise<AiServiceResult<SellerEditOutput>> {
    return runAiTask({
      task: AiTask.CHATBOT_RESPONSE,
      input,
      hashPayload: { sellerEdit: input },
      schema: sellerEditOutputSchema,
      schemaName: "seller_edit_learning",
      systemPrompt: `Un vendedor corrigió una respuesta que había redactado el bot de ventas antes de mandarla al cliente. Decidí si la corrección enseña algo general que el bot debería aplicar en el futuro (un dato del negocio, un criterio, un cambio de tono) o si fue un ajuste puntual de ese chat.
- worthLearning=false si solo cambió detalles menores, nombres o datos de ese cliente.
- Si vale la pena: guidance = una indicación clara en segunda persona para el bot ("Cuando pregunten X, decí Y" / "No ofrezcas Z"), sin inventar datos que no estén en la corrección. summary = una frase que empieza con "Entendí:".
- Si no vale la pena: guidance null y summary explicando por qué en pocas palabras.`,
      buildUserPrompt: (value) => JSON.stringify({ mensajeDelCliente: value.customerMessage, borradorDelBot: value.botDraft, loQueMandoElVendedor: value.sentByHuman }, null, 2),
      fallback: () => ({ worthLearning: false, summary: "No se pudo analizar la corrección.", guidance: null }),
      deps: this.deps,
    });
  }
}
