/** Atajos para elegir modelo. Tiene que coincidir con RECOMMENDED_AI_MODELS de @tgs/contracts. */
export const RECOMMENDED_AI_MODELS: ReadonlyArray<{id: string; title: string; text: string}> = [
  {id: "gpt-5.2", title: "GPT-5.2", text: "Recomendado para el bot y el CRM: entiende la charla y responde con más criterio."},
  {id: "gpt-4o", title: "GPT-4o", text: "Sólido y rápido. Un poco menos fino para vender."},
  {id: "gpt-4o-mini", title: "GPT-4o mini", text: "Económico. Era el anterior: se queda corto en un chat de venta."},
];
