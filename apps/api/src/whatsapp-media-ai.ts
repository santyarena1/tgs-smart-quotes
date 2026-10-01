/**
 * Que el bot entienda lo que no es texto.
 *
 * - Audio: se transcribe y el bot lo responde como si fuera un mensaje escrito. Antes
 *   todo audio derivaba a una persona.
 * - Imagen: se describe lo que muestra (una PC, una captura con specs, un comprobante)
 *   para que el bot y el vendedor sepan de qué habla el cliente.
 *
 * Si algo falla, el mensaje queda como estaba y se comporta como antes (deriva).
 */
import {Logger} from '@nestjs/common';
import {decryptSecret} from '@tgs/config';
import {db, Prisma} from '@tgs/database';
import OpenAI, {toFile} from 'openai';
import {downloadMedia, loadCredentials} from './whatsapp-client.js';

const logger = new Logger('WhatsappMediaAi');
const TIMEOUT_MS = 25_000;

async function openai(): Promise<OpenAI | null> {
  const ai = await db.aiSettings.findUnique({where: {id: 'singleton'}});
  const key = ai?.apiKeyEncrypted ? decryptSecret(ai.apiKeyEncrypted) : process.env.OPENAI_API_KEY;
  return key?.trim() ? new OpenAI({apiKey: key, timeout: TIMEOUT_MS, maxRetries: 1}) : null;
}

async function transcribe(client: OpenAI, bytes: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('mp4') ? 'm4a' : 'ogg';
  const file = await toFile(bytes, `audio.${extension}`, {type: mimeType.split(';')[0] ?? 'audio/ogg'});
  try {
    const result = await client.audio.transcriptions.create({file, model: 'gpt-4o-mini-transcribe', language: 'es'});
    return result.text.trim();
  } catch {
    // Cuentas sin el modelo nuevo: whisper sigue disponible.
    const retry = await toFile(bytes, `audio.${extension}`, {type: mimeType.split(';')[0] ?? 'audio/ogg'});
    const result = await client.audio.transcriptions.create({file: retry, model: 'whisper-1', language: 'es'});
    return result.text.trim();
  }
}

async function describe(client: OpenAI, bytes: Buffer, mimeType: string, caption: string | null): Promise<string> {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content: 'Sos el asistente de un local de PCs gamer y componentes. Describí en español, en 1 a 3 frases, lo que muestra la imagen que mandó un cliente por WhatsApp, para que un vendedor entienda qué quiere: productos, modelos, specs, precios o texto visible (transcribilo si es una captura), si parece un comprobante de pago o una PC con un problema. Sin suposiciones: si algo no se ve claro, decilo.',
      },
      {
        role: 'user',
        content: [
          {type: 'text', text: caption ? `El cliente escribió junto a la imagen: "${caption}"` : 'El cliente mandó solo la imagen.'},
          {type: 'image_url', image_url: {url: `data:${mimeType.split(';')[0]};base64,${bytes.toString('base64')}`, detail: 'low'}},
        ],
      },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

/**
 * Enriquece un entrante con audio o imagen. Devuelve true si el bot ya puede
 * responderlo como texto.
 */
export async function enrichInboundMedia(logId: string): Promise<boolean> {
  const log = await db.chatbotMessageLog.findUnique({where: {id: logId}});
  if (!log?.mediaId || !log.mediaMimeType) return false;
  const kind = log.mediaMimeType.startsWith('audio/') ? 'audio' : log.mediaMimeType.startsWith('image/') ? 'image' : null;
  if (!kind) return false;

  const settings = await db.chatbotSettings.findUnique({where: {id: 'singleton'}, select: {transcribeAudio: true, describeImages: true}});
  if (kind === 'audio' && !settings?.transcribeAudio) return false;
  if (kind === 'image' && !settings?.describeImages) return false;

  const client = await openai();
  if (!client) return false;
  const metadata = (log.decisionMetadata ?? {}) as Record<string, unknown>;
  try {
    const file = await downloadMedia(await loadCredentials(), log.mediaId);
    if (kind === 'audio') {
      const transcript = await transcribe(client, file.bytes, log.mediaMimeType);
      if (!transcript) return false;
      await db.chatbotMessageLog.update({where: {id: logId}, data: {
        text: `[Audio] ${transcript}`,
        decisionMetadata: {...metadata, messageType: 'TEXT', supported: true, transcript, wasAudio: true} as Prisma.InputJsonValue,
      }});
    } else {
      const caption = log.text && !/^\[Imagen recibida\]$/.test(log.text) ? log.text : null;
      const description = await describe(client, file.bytes, log.mediaMimeType, caption);
      if (!description) return false;
      await db.chatbotMessageLog.update({where: {id: logId}, data: {
        text: `[Imagen] ${description}${caption ? `\nTexto del cliente: ${caption}` : ''}`,
        decisionMetadata: {...metadata, messageType: 'TEXT', supported: true, imageDescription: description, caption, wasImage: true} as Prisma.InputJsonValue,
      }});
    }
    return true;
  } catch (error) {
    logger.warn(JSON.stringify({event: 'whatsapp_media_ai_failed', logId, kind, error: error instanceof Error ? error.message : String(error)}));
    return false;
  }
}
