import sharp from 'sharp';
import type { BuildSpec } from './reference-prompt.js';

/**
 * Verificación automática de la imagen: un modelo de visión mira el resultado y se compara con lo que lleva el presupuesto
 * (con o sin placa de video, refrigeración, RAM con o sin RGB). Si no coincide se regenera con una corrección explícita.
 */
export type InteriorFindings = {
  gpu_visible: boolean;
  liquid_cooler_visible: boolean;
  tower_air_cooler_visible: boolean;
  ram_with_rgb: boolean | null;
};

export type Evaluation = { issues: string[]; corrections: string[] };

/** Compara lo que se ve con lo que debería verse. Cada diferencia trae su texto para el usuario y su corrección para el reintento. */
export function evaluateFindings(spec: BuildSpec, seen: InteriorFindings): Evaluation {
  const issues: string[] = [];
  const corrections: string[] = [];
  const add = (issue: string, correction: string) => {
    issues.push(issue);
    corrections.push(correction);
  };

  if (!spec.gpu && seen.gpu_visible) {
    add('se ve una placa de video y el presupuesto no la incluye', 'En el intento anterior apareció una placa de video y NO corresponde: ELIMINALA por completo. El slot PCIe x16 debe verse VACÍO, sin nada insertado, y no debe haber ninguna tarjeta ni backplate.');
  }
  if (spec.gpu && !seen.gpu_visible) {
    add('no se ve la placa de video del presupuesto', `En el intento anterior NO se veía la placa de video y SÍ corresponde: ${spec.gpu} DEBE verse montada, horizontal, en el slot PCIe x16.`);
  }
  if (spec.cooling.type === 'stock' && (seen.liquid_cooler_visible || seen.tower_air_cooler_visible)) {
    add('se ve un cooler o watercooler que el presupuesto no incluye', 'En el intento anterior apareció refrigeración que NO corresponde (radiador, tubos, bomba o un disipador de torre grande): ELIMINALA. La CPU debe usar solo el cooler stock pequeño que viene con el procesador.');
  }
  if (spec.cooling.type === 'liquid' && !seen.liquid_cooler_visible) {
    add('no se ve la refrigeración líquida del presupuesto', `En el intento anterior NO se veía la refrigeración líquida y SÍ corresponde: ${spec.cooling.name} DEBE verse con su radiador, ventiladores y tubos hacia el bloque de la CPU.`);
  }
  if (spec.cooling.type === 'air' && seen.liquid_cooler_visible) {
    add('se ve refrigeración líquida y el presupuesto lleva un cooler de aire', 'En el intento anterior apareció refrigeración líquida que NO corresponde: ELIMINALA y mostrá el cooler de aire del presupuesto.');
  }
  if (spec.ram.length && seen.ram_with_rgb !== null && seen.ram_with_rgb !== spec.ramRgb) {
    add(spec.ramRgb ? 'la RAM debería tener RGB y no se ve' : 'la RAM tiene RGB y el presupuesto no lo incluye', spec.ramRgb ? 'En el intento anterior la RAM salió SIN luces y SÍ corresponde RGB: los módulos DEBEN verse con iluminación RGB.' : 'En el intento anterior la RAM salió con luces RGB y NO corresponde: los módulos deben verse lisos, SIN ninguna luz.');
  }
  return { issues, corrections };
}

const QUESTION = `Mirá esta imagen de una PC de escritorio y respondé SOLO un JSON con estas claves booleanas, según lo que se VE (no lo que se supone):
- "gpu_visible": hay una placa de video dedicada montada (una tarjeta gruesa con ventiladores o backplate en el slot PCIe).
- "liquid_cooler_visible": hay refrigeración líquida (radiador con ventiladores y/o tubos y bloque-bomba sobre el procesador).
- "tower_air_cooler_visible": hay un disipador de torre grande de aire sobre el procesador (NO cuentes el cooler stock chico).
- "ram_with_rgb": los módulos de RAM tienen luces RGB encendidas; null si no se ven módulos de RAM.
Formato: {"gpu_visible":false,"liquid_cooler_visible":false,"tower_air_cooler_visible":false,"ram_with_rgb":null}`;

/** Le pide a un modelo de visión que describa lo que hay dentro de la PC. Devuelve null si no se pudo verificar (nunca rompe la generación). */
/** Solo lo que se usa del cliente de OpenAI (se tipa por su forma: el paquete se resuelve en dos copias y los tipos nominales no coinciden). */
export type VisionClient = { chat: { completions: { create: (args: any) => Promise<{ choices: Array<{ message?: { content?: string | null } }> }> } } };

export async function inspectInterior(client: VisionClient, model: string, image: Buffer): Promise<InteriorFindings | null> {
  try {
    const flat = await sharp(image).flatten({ background: '#d1d5db' }).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Sos un inspector de imágenes de computadoras. Respondés únicamente con el JSON pedido.' },
        { role: 'user', content: [{ type: 'text', text: QUESTION }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${flat.toString('base64')}`, detail: 'high' } }] },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<InteriorFindings>;
    if (typeof parsed.gpu_visible !== 'boolean') return null;
    return {
      gpu_visible: parsed.gpu_visible,
      liquid_cooler_visible: Boolean(parsed.liquid_cooler_visible),
      tower_air_cooler_visible: Boolean(parsed.tower_air_cooler_visible),
      ram_with_rgb: typeof parsed.ram_with_rgb === 'boolean' ? parsed.ram_with_rgb : null,
    };
  } catch {
    return null;
  }
}
