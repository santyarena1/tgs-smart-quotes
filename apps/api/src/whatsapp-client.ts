/**
 * Wrapper de la Graph API de WhatsApp Cloud. Sin lógica de negocio: solo traduce
 * llamadas a HTTP y errores de Meta a excepciones con mensaje en español.
 *
 * Reemplaza a todas las primitivas de la extensión que manipulaban el DOM
 * (`sendMessageAutomatically`, `attachFileToComposer`, el puente Lexical).
 */
import {BadGatewayException, BadRequestException, Logger} from '@nestjs/common';
import {decryptSecret} from '@tgs/config';
import {db} from '@tgs/database';

const GRAPH_BASE = 'https://graph.facebook.com';
const TIMEOUT_MS = 15_000;

const logger = new Logger('WhatsappClient');

export type WhatsappCredentials = {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
};

export type SendResult = {waMessageId: string};

/** Error de Meta con su código preservado, que es lo que permite diagnosticar sin adivinar. */
export class WhatsappApiError extends BadGatewayException {
  constructor(message: string, readonly code: number | null, readonly httpStatus: number) {
    super(message);
  }
}

/**
 * Lee las credenciales y falla con un motivo explícito si falta alguna.
 * Nunca devuelve el token en un objeto que pueda terminar logueado por accidente.
 */
export async function loadCredentials(): Promise<WhatsappCredentials> {
  const row = await db.whatsappCloudSettings.findUnique({where: {id: 'singleton'}});
  if (!row?.enabled) throw new BadRequestException('La integración con WhatsApp Cloud API está desactivada.');
  if (!row.phoneNumberId) throw new BadRequestException('Falta configurar el Phone Number ID de WhatsApp.');
  if (!row.accessTokenEncrypted) throw new BadRequestException('Falta configurar el access token de WhatsApp.');
  return {
    phoneNumberId: row.phoneNumberId,
    accessToken: decryptSecret(row.accessTokenEncrypted),
    apiVersion: row.apiVersion,
  };
}

async function graphFetch(
  credentials: WhatsappCredentials,
  path: string,
  init: RequestInit,
): Promise<any> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(credentials.apiVersion)}/${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {Authorization: `Bearer ${credentials.accessToken}`, ...(init.headers ?? {})},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Un fallo de red es reintentable; se distingue del rechazo de Meta, que no lo es.
    throw new WhatsappApiError(
      `No se pudo conectar con Meta: ${error instanceof Error ? error.message : String(error)}`,
      null,
      0,
    );
  }
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const code = typeof payload?.error?.code === 'number' ? payload.error.code : null;
    const detail = payload?.error?.error_user_msg || payload?.error?.message || `HTTP ${response.status}`;
    logger.warn(JSON.stringify({event: 'whatsapp_api_error', status: response.status, code, path}));
    throw new WhatsappApiError(`Meta rechazó la operación: ${detail}`, code, response.status);
  }
  return payload;
}

async function sendMessage(credentials: WhatsappCredentials, body: Record<string, unknown>): Promise<SendResult> {
  const payload = await graphFetch(credentials, `${encodeURIComponent(credentials.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({messaging_product: 'whatsapp', recipient_type: 'individual', ...body}),
  });
  const waMessageId = payload?.messages?.[0]?.id;
  if (typeof waMessageId !== 'string') {
    throw new WhatsappApiError('Meta aceptó el mensaje pero no devolvió su identificador.', null, 200);
  }
  return {waMessageId};
}

export function sendText(credentials: WhatsappCredentials, to: string, body: string) {
  // `preview_url` desactivado: una previsualización inesperada cambia cómo se ve el mensaje.
  return sendMessage(credentials, {to, type: 'text', text: {body, preview_url: false}});
}

export function sendDocument(
  credentials: WhatsappCredentials,
  to: string,
  mediaId: string,
  filename: string,
  caption?: string,
) {
  return sendMessage(credentials, {
    to,
    type: 'document',
    document: {id: mediaId, filename, ...(caption ? {caption} : {})},
  });
}

export function sendImage(credentials: WhatsappCredentials, to: string, mediaId: string, caption?: string) {
  return sendMessage(credentials, {to, type: 'image', image: {id: mediaId, ...(caption ? {caption} : {})}});
}

/**
 * Plantilla aprobada: la única vía permitida fuera de la ventana de 24 h.
 * Las variables se mandan posicionalmente, en el mismo orden que {{1}}, {{2}}…
 */
export function sendTemplate(
  credentials: WhatsappCredentials,
  to: string,
  name: string,
  language: string,
  variables: string[],
) {
  return sendMessage(credentials, {
    to,
    type: 'template',
    template: {
      name,
      language: {code: language},
      ...(variables.length
        ? {components: [{type: 'body', parameters: variables.map((text) => ({type: 'text', text}))}]}
        : {}),
    },
  });
}

/** Sube un binario y devuelve el `media_id` que después se referencia al enviar. */
export async function uploadMedia(
  credentials: WhatsappCredentials,
  bytes: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([new Uint8Array(bytes)], {type: mimeType}), filename);
  const payload = await graphFetch(credentials, `${encodeURIComponent(credentials.phoneNumberId)}/media`, {
    method: 'POST',
    body: form,
  });
  const mediaId = payload?.id;
  if (typeof mediaId !== 'string') throw new WhatsappApiError('Meta no devolvió el identificador del archivo subido.', null, 200);
  return mediaId;
}

/** Descarga un medio entrante. Meta da primero una URL temporal que también requiere el token. */
export async function downloadMedia(
  credentials: WhatsappCredentials,
  mediaId: string,
): Promise<{bytes: Buffer; mimeType: string}> {
  const meta = await graphFetch(credentials, encodeURIComponent(mediaId), {method: 'GET'});
  const url = meta?.url;
  if (typeof url !== 'string') throw new WhatsappApiError('Meta no devolvió la URL del archivo.', null, 200);
  const response = await fetch(url, {
    headers: {Authorization: `Bearer ${credentials.accessToken}`},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new WhatsappApiError(`No se pudo descargar el archivo: HTTP ${response.status}`, null, response.status);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: meta?.mime_type ?? response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

/** Marca un entrante como leído para que el cliente vea el doble tilde azul. */
export async function markAsRead(credentials: WhatsappCredentials, waMessageId: string): Promise<void> {
  await graphFetch(credentials, `${encodeURIComponent(credentials.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({messaging_product: 'whatsapp', status: 'read', message_id: waMessageId}),
  });
}

/** Verifica credenciales contra Meta y devuelve los datos públicos del número. */
export async function verifyNumber(credentials: WhatsappCredentials) {
  const payload = await graphFetch(
    credentials,
    `${encodeURIComponent(credentials.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
    {method: 'GET'},
  );
  return {
    displayPhoneNumber: typeof payload?.display_phone_number === 'string' ? payload.display_phone_number : null,
    verifiedName: typeof payload?.verified_name === 'string' ? payload.verified_name : null,
    qualityRating: typeof payload?.quality_rating === 'string' ? payload.quality_rating : null,
  };
}

/** Lista las plantillas del WABA para sincronizar estado y cuerpo aprobados. */
export async function listTemplates(credentials: WhatsappCredentials, businessAccountId: string) {
  const payload = await graphFetch(
    credentials,
    `${encodeURIComponent(businessAccountId)}/message_templates?limit=200&fields=name,language,status,category,components`,
    {method: 'GET'},
  );
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.map((item: any) => {
    const bodyComponent = Array.isArray(item?.components)
      ? item.components.find((component: any) => component?.type === 'BODY')
      : null;
    const body = typeof bodyComponent?.text === 'string' ? bodyComponent.text : '';
    return {
      name: String(item?.name ?? ''),
      language: String(item?.language ?? 'es_AR'),
      status: String(item?.status ?? 'PENDING'),
      category: String(item?.category ?? 'MARKETING'),
      body,
      variableCount: countTemplateVariables(body),
    };
  }).filter((item: {name: string}) => Boolean(item.name));
}

/** Cuenta los placeholders {{n}} distintos que espera el cuerpo de una plantilla. */
export function countTemplateVariables(body: string): number {
  const found = new Set<number>();
  for (const match of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const index = Number(match[1]);
    if (Number.isInteger(index) && index > 0) found.add(index);
  }
  return found.size;
}
