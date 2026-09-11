import OpenAI, { toFile } from "openai";

/**
 * Generación de miniaturas con el modelo de imágenes de OpenAI.
 *
 * Es el mismo mecanismo que usa ChatGPT cuando se le pegan una plantilla y la
 * foto de un gabinete y se le pide "hacé la miniatura": el endpoint de edición
 * acepta varias imágenes de entrada (referencias de estilo + foto del
 * producto) y un prompt, y devuelve una imagen nueva. No hay caché: cada
 * llamada es una imagen distinta a propósito (se regenera hasta que guste).
 */

export const DEFAULT_IMAGE_MODEL = "gpt-image-1";
export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageSize = (typeof IMAGE_SIZES)[number];

export type ThumbnailImageInput = {
  prompt: string;
  /** Imágenes de entrada, en el orden en que el prompt las menciona. */
  images: { buffer: Buffer; name: string; mime: string }[];
  size: ImageSize;
  quality: ImageQuality;
  model?: string;
  /** Fondo transparente (para recortes de gabinete que después se componen). */
  transparent?: boolean;
};

export type ThumbnailImageResult = {
  /** PNG generado. */
  buffer: Buffer;
  model: string;
  durationMs: number;
  usage: unknown;
  /** Costo estimado en centavos de USD (tarifa publicada por imagen). */
  costUsdCents: bigint;
};

/**
 * Precio aproximado por imagen (USD) según calidad y tamaño, para el registro
 * de costos. Son las tarifas publicadas de gpt-image-1; si cambian, esto solo
 * afecta el informe, no la generación.
 */
function estimateCostUsdCents(quality: ImageQuality, size: ImageSize): bigint {
  const square = size === "1024x1024";
  const table: Record<ImageQuality, [number, number]> = {
    low: [1.1, 1.6],
    medium: [4.2, 6.3],
    high: [16.7, 25],
  };
  const [sq, rect] = table[quality];
  return BigInt(Math.round(square ? sq : rect));
}

export async function generateThumbnailImage(client: OpenAI, input: ThumbnailImageInput): Promise<ThumbnailImageResult> {
  if (!input.images.length) throw new Error("La generación necesita al menos una imagen de entrada");
  const model = input.model?.trim() || DEFAULT_IMAGE_MODEL;
  const files = await Promise.all(input.images.map((image) => toFile(image.buffer, image.name, { type: image.mime })));
  const started = Date.now();
  const response = await client.images.edit({
    model,
    image: files,
    prompt: input.prompt,
    n: 1,
    size: input.size,
    quality: input.quality,
    // Que el gabinete salga igual al de la foto (mismo modelo, mismos colores),
    // en vez de "un gabinete parecido".
    input_fidelity: "high",
    output_format: "png",
    ...(input.transparent ? { background: "transparent" as const } : {}),
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI no devolvió ninguna imagen");
  return {
    buffer: Buffer.from(b64, "base64"),
    model,
    durationMs: Date.now() - started,
    usage: response.usage ?? null,
    costUsdCents: estimateCostUsdCents(input.quality, input.size),
  };
}
