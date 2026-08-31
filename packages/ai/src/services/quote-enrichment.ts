import {runAiTask} from "../runner.js";
import {quoteEnrichmentInputSchema,quoteEnrichmentOutputSchema,type QuoteEnrichmentInput,type QuoteEnrichmentOutput} from "../schemas.js";
import {AiTask,type AiRunOptions,type AiServiceDeps,type AiServiceResult} from "../types.js";
const SYSTEM=`Sos un asistente comercial de The Gamer Shop, Argentina. Redactá en español HTML simple y seguro sobre la configuración cotizada, sin inventar precios ni especificaciones. Para juegos y programas usá solo niveles cualitativos. Todo tier de juego y toda nota de programa debe incluir literalmente "(estimado)". Nunca des FPS ni métricas numéricas inventadas. La compatibilidad es orientativa y debe basarse solamente en los nombres provistos. Respondé solo JSON estructurado.`;
const estimated=(value:string)=>value.toLocaleLowerCase('es-AR').includes('estimado')?value:`${value} (estimado)`;
const fallback=(input:QuoteEnrichmentInput):QuoteEnrichmentOutput=>({descriptionHtml:`<p>Configuración The Gamer Shop compuesta por ${input.items.map(item=>`${item.quantity} × ${item.name}`).join(', ')}.</p>`,games:[],programs:[],compatibility:['Compatibilidad orientativa; recomendamos validación técnica antes del armado.']});
export class QuoteEnrichmentService{
 constructor(private readonly deps:AiServiceDeps){}
 async enrich(input:QuoteEnrichmentInput,options?:AiRunOptions,customInstructions?:string|null):Promise<AiServiceResult<QuoteEnrichmentOutput>>{
  const parsed=quoteEnrichmentInputSchema.parse(input);
  const extra=customInstructions?.trim();
  const systemPrompt=extra?`${SYSTEM}\n\nInstrucciones adicionales definidas por el negocio (respetalas siempre que no contradigan las reglas anteriores): ${extra}`:SYSTEM;
  const hashPayload=extra?{...parsed,customInstructions:extra}:parsed;
  const response=await runAiTask({task:AiTask.QUOTE_ENRICHMENT,input:parsed,hashPayload,schema:quoteEnrichmentOutputSchema,schemaName:'quote_enrichment',systemPrompt,buildUserPrompt:value=>`Ítems cotizados:\n${value.items.map(item=>`- ${item.quantity} × ${item.name}`).join('\n')}\n\nGenerá descripción comercial, juegos y programas cualitativos, y observaciones de compatibilidad.`,fallback,deps:this.deps,options});
  return{...response,result:{...response.result,games:response.result.games.map(game=>({...game,tier:estimated(game.tier)})),programs:response.result.programs.map(program=>({...program,note:estimated(program.note)}))}};
 }
}
