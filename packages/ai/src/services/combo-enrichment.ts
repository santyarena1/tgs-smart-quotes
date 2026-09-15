import {runAiTask} from "../runner.js";
import {comboEnrichmentInputSchema,comboEnrichmentOutputSchema,type ComboEnrichmentInput,type ComboEnrichmentOutput} from "../schemas.js";
import {AiTask,type AiRunOptions,type AiServiceDeps,type AiServiceResult} from "../types.js";

/**
 * Textos de un combo de la tienda (pack de periféricos/extras que se vende
 * como un producto único, ver BLOCK-10). Es el hermano chico del
 * enriquecimiento de PCs: título, bajada, descripción corta, descripción
 * HTML, puntos fuertes y público. Sin juegos ni compatibilidad: no hay PC.
 * Comparte la tarea QUOTE_ENRICHMENT (misma caché y mismo registro de
 * costos); el formato en el hash separa las respuestas.
 */
const SYSTEM=`Sos el redactor comercial senior de The Gamer Shop, tienda de PC gamer de Argentina. Recibís la lista de productos de un COMBO (pack de periféricos o accesorios que se vende junto, con descuento) y devolvés SOLO JSON estructurado, en español rioplatense, con:

- title: nombre comercial del combo, corto y vendedor (máximo 70 caracteres), empezando con "Combo" (ej: "Combo Gamer Esencial: teclado + mouse + auriculares"). Sin precios.
- tagline: una oración corta (máximo 110 caracteres) con el beneficio principal de llevarse todo junto.
- shortDescription: 1 a 2 oraciones (máximo 260 caracteres) para buscadores y redes: qué trae, para quién.
- descriptionHtml: descripción comercial en HTML simple y seguro (p, ul, li, strong). Entre 90 y 170 palabras. Explicá qué logra el conjunto y por qué conviene llevarlo junto; nombrá cada producto una vez.
- highlights: 3 a 5 puntos fuertes, una línea cada uno (máximo 80 caracteres), concretos y basados en los productos.
- audience: para quién está pensado (máximo 160 caracteres).

Reglas duras: no inventes precios, descuentos ni especificaciones numéricas que no estén en los nombres de los productos.`;

const fallback=(input:ComboEnrichmentInput):ComboEnrichmentOutput=>({
 title:`Combo ${input.items.map(item=>item.name).join(' + ')}`.slice(0,70),
 tagline:'',
 shortDescription:'',
 descriptionHtml:`<p>Combo The Gamer Shop compuesto por ${input.items.map(item=>`${item.quantity} × ${item.name}`).join(', ')}.</p>`,
 highlights:[],
 audience:'',
});

export class ComboEnrichmentService{
 constructor(private readonly deps:AiServiceDeps){}
 async enrich(input:ComboEnrichmentInput,options?:AiRunOptions,customInstructions?:string|null):Promise<AiServiceResult<ComboEnrichmentOutput>>{
  const parsed=comboEnrichmentInputSchema.parse(input);
  const extra=customInstructions?.trim();
  const systemPrompt=extra?`${SYSTEM}\n\nInstrucciones adicionales definidas por el negocio (respetalas siempre que no contradigan las reglas anteriores): ${extra}`:SYSTEM;
  const hashPayload={format:'combo-v1',...parsed,...(extra?{customInstructions:extra}:{})};
  return runAiTask({task:AiTask.QUOTE_ENRICHMENT,input:parsed,hashPayload,schema:comboEnrichmentOutputSchema,schemaName:'combo_enrichment',systemPrompt,buildUserPrompt:value=>`Productos del combo:\n${value.items.map(item=>`- ${item.quantity} × ${item.name}${item.line?` [${item.line}]`:''}`).join('\n')}\n\nGenerá título, bajada, descripción corta, descripción HTML, puntos fuertes y público.`,fallback,deps:this.deps,options});
 }
}
