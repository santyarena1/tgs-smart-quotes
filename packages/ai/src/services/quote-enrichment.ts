import {runAiTask} from "../runner.js";
import {quoteEnrichmentInputSchema,quoteEnrichmentOutputSchema,type QuoteEnrichmentInput,type QuoteEnrichmentOutput} from "../schemas.js";
import {AiTask,type AiRunOptions,type AiServiceDeps,type AiServiceResult} from "../types.js";

/**
 * Enriquecimiento "profundo" de una PC armada para la tienda.
 *
 * Además de la descripción, el modelo propone el título comercial, la bajada,
 * la descripción corta, los puntos fuertes y para quién es la PC, y hace un
 * análisis de juegos por resolución y calidad estimadas. Las reglas de
 * siempre se mantienen: nada de FPS ni números inventados, todo rendimiento
 * lleva "(estimado)", y solo se razona sobre los nombres que se le dan.
 */
const SYSTEM=`Sos el redactor comercial senior de The Gamer Shop, tienda de PC gamer de Argentina. Recibís la lista de componentes de una PC armada y devolvés SOLO JSON estructurado, en español rioplatense, con:

- specs: las specs clave en formato corto y en MAYÚSCULAS, leídas SOLO de los nombres de los componentes (null si no está): cpu (ej: "RYZEN 5 7600X", "INTEL I5 12400F"), gpu con su VRAM si figura (ej: "RTX 3070 8GB", "RX 7600 8GB"; null si la PC usa gráficos integrados), ramGb (total en GB como número, sumando módulos), storage (ej: "512GB M.2", "1TB SSD", "1TB M.2 + 2TB HDD"), os (ej: "WINDOWS 11"; null si no hay licencia de Windows entre los ítems).
- tagline: una oración corta (máximo 110 caracteres) que complemente al título con el beneficio principal.
- shortDescription: 1 a 2 oraciones (máximo 260 caracteres) para buscadores y catálogos de redes: qué es, para qué sirve, para quién.
- descriptionHtml: descripción comercial en HTML simple y seguro (p, ul, li, strong). Entre 120 y 220 palabras. Explicá qué logra el conjunto, no repitas la lista de piezas.
- highlights: 3 a 5 puntos fuertes, una línea cada uno (máximo 80 caracteres), concretos y basados en los componentes.
- audience: para quién está pensada (máximo 160 caracteres).
- games: el rendimiento ESTIMADO de CADA UNO de los juegos de la lista que se te pasa (todos, en ese orden; si la PC no puede correr alguno de forma jugable, igual incluilo con settings "Bajo" y una nota que lo diga). tier es un texto corto tipo "1080p Alto (estimado)". resolution es solo "1080p", "1440p" o "4K". settings es solo "Bajo", "Medio", "Alto" o "Ultra". note es una aclaración opcional de una oración o null (útil para DLSS/FSR, juegos de CPU, o si depende del servidor/mods). Siempre cualitativo, NUNCA FPS ni porcentajes. Si no hay placa de video dedicada, sé conservador.
- programs: 3 a 6 programas o usos (edición de video, streaming, diseño 3D, oficina, etc.) con una nota cualitativa.
- compatibility: observaciones de compatibilidad orientativas basadas solo en los nombres recibidos (socket, RAM, fuente, tamaño). Si no hay nada que observar, lista vacía.

Reglas duras: no inventes precios ni especificaciones numéricas que no estén en los nombres; todo tier de juego y toda nota de programa debe incluir literalmente "(estimado)"; no uses FPS ni métricas numéricas de rendimiento.`;
/** Lista por defecto: la de la tienda, del más liviano al más pesado. */
export const DEFAULT_GAMES_TO_ANALYZE=["Fortnite","Counter-Strike 2","Valorant","GTA V","EA Sports FC 25","Los Sims 4","Lineage 2","Minecraft","Rocket League","Roblox","Assetto Corsa","World of Warcraft","Call of Duty: Warzone","Marvel Rivals","ARK: Survival Evolved","Red Dead Redemption 2","Assassin's Creed Mirage","Dragon Ball: Sparking! Zero","The Last of Us Part I","God of War Ragnarök"];
const estimated=(value:string)=>value.toLocaleLowerCase('es-AR').includes('estimado')?value:`${value} (estimado)`;
const fallback=(input:QuoteEnrichmentInput):QuoteEnrichmentOutput=>({
 specs:{cpu:null,gpu:null,ramGb:null,storage:null,os:null},
 tagline:'',
 shortDescription:'',
 descriptionHtml:`<p>Configuración The Gamer Shop compuesta por ${input.items.map(item=>`${item.quantity} × ${item.name}`).join(', ')}.</p>`,
 highlights:[],
 audience:'',
 games:[],
 programs:[],
 compatibility:['Compatibilidad orientativa; recomendamos validación técnica antes del armado.'],
});
export class QuoteEnrichmentService{
 constructor(private readonly deps:AiServiceDeps){}
 async enrich(input:QuoteEnrichmentInput,options?:AiRunOptions,customInstructions?:string|null):Promise<AiServiceResult<QuoteEnrichmentOutput>>{
  const parsed=quoteEnrichmentInputSchema.parse(input);
  const extra=customInstructions?.trim();
  const systemPrompt=extra?`${SYSTEM}\n\nInstrucciones adicionales definidas por el negocio (respetalas siempre que no contradigan las reglas anteriores): ${extra}`:SYSTEM;
  // `v2` en el hash: el formato de salida cambió y no hay que reutilizar
  // respuestas cacheadas del formato anterior.
  const hashPayload={format:'v3',...parsed,...(extra?{customInstructions:extra}:{})};
  const response=await runAiTask({task:AiTask.QUOTE_ENRICHMENT,input:parsed,hashPayload,schema:quoteEnrichmentOutputSchema,schemaName:'quote_enrichment',systemPrompt,buildUserPrompt:value=>`Componentes de la PC:\n${value.items.map(item=>`- ${item.quantity} × ${item.name}${item.line?` [${item.line}]`:''}`).join('\n')}\n\nJuegos a analizar (todos):\n${(value.games?.length?value.games:DEFAULT_GAMES_TO_ANALYZE).map(game=>`- ${game}`).join('\n')}\n\nGenerá specs, bajada, descripción corta, descripción HTML, puntos fuertes, público, análisis de juegos por resolución y calidad estimadas, programas y observaciones de compatibilidad.`,fallback,deps:this.deps,options});
  return{...response,result:{...response.result,games:response.result.games.map(game=>({...game,tier:estimated(game.tier)})),programs:response.result.programs.map(program=>({...program,note:estimated(program.note)}))}};
 }
}
