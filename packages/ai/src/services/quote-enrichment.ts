import {runAiTask} from "../runner.js";
import {quoteEnrichmentInputSchema,quoteEnrichmentOutputSchema,type QuoteEnrichmentInput,type QuoteEnrichmentOutput} from "../schemas.js";
import {AiTask,type AiRunOptions,type AiServiceDeps,type AiServiceResult} from "../types.js";

/**
 * Enriquecimiento "profundo" de una PC armada para la tienda.
 *
 * Además de la descripción, el modelo propone el título comercial, la bajada,
 * la descripción corta, los puntos fuertes y para quién es la PC, y hace un
 * análisis de juegos por resolución, calidad y rango de FPS estimados. Las
 * reglas de siempre se mantienen: todo rendimiento lleva "(estimado)", los
 * FPS son siempre un rango orientativo y solo se razona sobre los nombres que
 * se le dan.
 */
const SYSTEM=`Sos el redactor comercial senior de The Gamer Shop, tienda de PC gamer de Argentina. Recibís la lista de componentes de una PC armada y devolvés SOLO JSON estructurado, en español rioplatense, con:

- specs: las specs clave en formato corto y en MAYÚSCULAS, leídas SOLO de los nombres de los componentes (null si no está): cpu (ej: "RYZEN 5 7600X", "INTEL I5 12400F"), gpu con su VRAM si figura (ej: "RTX 3070 8GB", "RX 7600 8GB"; null si la PC usa gráficos integrados), ramGb (total en GB como número, sumando módulos), storage (ej: "512GB M.2", "1TB SSD", "1TB M.2 + 2TB HDD"), os (ej: "WINDOWS 11"; null si no hay licencia de Windows entre los ítems).
- tagline: una oración corta (máximo 110 caracteres) que complemente al título con el beneficio principal.
- shortDescription: 1 a 2 oraciones (máximo 260 caracteres) para buscadores y catálogos de redes: qué es, para qué sirve, para quién.
- descriptionHtml: descripción comercial en HTML simple y seguro (p, ul, li, strong). Entre 120 y 220 palabras. Explicá qué logra el conjunto, no repitas la lista de piezas.
- highlights: 3 a 5 puntos fuertes, una línea cada uno (máximo 80 caracteres), concretos y basados en los componentes.
- audience: para quién está pensada (máximo 160 caracteres).
- games: el rendimiento ESTIMADO de CADA UNO de los juegos de la lista que se te pasa (todos, en ese orden; si la PC no puede correr alguno de forma jugable, igual incluilo con settings "Bajo" y una nota que lo diga). tier es un texto corto tipo "1080p Alto (estimado)". resolution es solo "1080p", "1440p" o "4K". settings es solo "Bajo", "Medio", "Alto" o "Ultra". fps es el rango de cuadros por segundo ESTIMADO a esa resolución y calidad, siempre como rango con la unidad (ej: "90-120 FPS", "60-75 FPS"), nunca un número exacto ni porcentajes; null solo si la PC no puede correr el juego de forma jugable. note es una aclaración opcional de una oración o null (útil para DLSS/FSR, juegos de CPU, o si depende del servidor/mods). Si no hay placa de video dedicada, sé conservador con calidad y FPS. Con placa dedicada NO seas conservador: calibrá según la clase real de la placa (referencia, sin DLSS/FSR, CPU acorde):
  · Gama de entrada (GTX 1650/1660, RTX 3050, RX 6500/6600, Arc A380): esports (Fortnite, CS2, Valorant, Rocket League, Roblox, Minecraft, LoL) 1080p Alto/Ultra 120-200+ FPS; AAA pesados 1080p Medio 50-70.
  · Gama media (RTX 2060 SUPER/3060/4060/5060, RX 6650 XT/7600, Arc B570/B580): esports 1080p Ultra 200+; AAA 1080p Alto/Ultra 70-100, 1440p Alto 55-75.
  · Gama media-alta (RTX 3060 Ti/3070/4060 Ti/4070/5060 Ti/5070, RX 6700 XT/6800/7700 XT/7800 XT): esports 1440p Ultra 200+; AAA 1440p Alto/Ultra 80-120, 4K Alto 45-60.
  · Gama alta (RTX 3080/4070 Ti/4080/5070 Ti/5080, RX 7900 XT/XTX, 9070 XT): AAA 1440p Ultra 120-160, 4K Ultra 70-100.
  · Tope (RTX 4090/5090): 4K Ultra 100+.
  Elegí para cada juego la resolución más alta que se mantenga jugable con buenos FPS (no bajes a 1080p Medio una placa de gama media-alta). Un juego liviano nunca queda por debajo de "Alto" con placa dedicada de gama media o superior.
- programs: 3 a 6 programas o usos (edición de video, streaming, diseño 3D, oficina, etc.) con una nota cualitativa.
- compatibility: observaciones de compatibilidad orientativas basadas solo en los nombres recibidos (socket, RAM, fuente, tamaño). Si no hay nada que observar, lista vacía.

Reglas duras: no inventes precios ni especificaciones numéricas que no estén en los nombres; todo tier de juego y toda nota de programa debe incluir literalmente "(estimado)"; los FPS van solo en el campo fps, como rango orientativo, nunca como promesa exacta.`;
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
  // `format` en el hash: cada vez que cambia el formato de salida (v4: rango
  // de FPS por juego) no hay que reutilizar respuestas cacheadas del anterior.
  const hashPayload={format:'v5',...parsed,...(extra?{customInstructions:extra}:{})};
  const response=await runAiTask({task:AiTask.QUOTE_ENRICHMENT,input:parsed,hashPayload,schema:quoteEnrichmentOutputSchema,schemaName:'quote_enrichment',systemPrompt,buildUserPrompt:value=>`Componentes de la PC:\n${value.items.map(item=>`- ${item.quantity} × ${item.name}${item.line?` [${item.line}]`:''}`).join('\n')}\n\nJuegos a analizar (todos):\n${(value.games?.length?value.games:DEFAULT_GAMES_TO_ANALYZE).map(game=>`- ${game}`).join('\n')}\n\nGenerá specs, bajada, descripción corta, descripción HTML, puntos fuertes, público, análisis de juegos por resolución, calidad y FPS estimados, programas y observaciones de compatibilidad.`,fallback,deps:this.deps,options});
  return{...response,result:{...response.result,games:response.result.games.map(game=>({...game,tier:estimated(game.tier)})),programs:response.result.programs.map(program=>({...program,note:estimated(program.note)}))}};
 }
}
