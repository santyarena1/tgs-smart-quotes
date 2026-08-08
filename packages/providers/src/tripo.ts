// Cambiar acá si Tripo modifica la base de su API OpenAPI v2.
export const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

type TripoEnvelope = { code?: number; message?: string; data?: Record<string, unknown> };

async function tripoJson(response: Response, action: string): Promise<TripoEnvelope> {
  let body: TripoEnvelope;
  try { body = await response.json() as TripoEnvelope; }
  catch { throw new Error(`Tripo devolvió una respuesta inválida al ${action} (HTTP ${response.status})`); }
  if (!response.ok || (typeof body.code === 'number' && body.code !== 0)) throw new Error(`Tripo no pudo ${action} (HTTP ${response.status}${body.message ? `: ${body.message}` : ''})`);
  return body;
}

export async function uploadImage(bytes: Buffer, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'image.jpg');
  const body = await tripoJson(await fetch(`${TRIPO_BASE}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form }), 'subir una imagen');
  const token = body.data?.image_token;
  if (typeof token !== 'string' || !token) throw new Error('Tripo no devolvió el token de la imagen');
  return token;
}

export async function createMultiviewTask(imageTokens: string[], apiKey: string): Promise<string> {
  const body = await tripoJson(await fetch(`${TRIPO_BASE}/task`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'multiview_to_model', files: imageTokens.map(file_token => ({ type: 'jpg', file_token })) }),
  }), 'crear la tarea multivista');
  const taskId = body.data?.task_id;
  if (typeof taskId !== 'string' || !taskId) throw new Error('Tripo no devolvió el identificador de la tarea');
  return taskId;
}

export async function getTask(taskId: string, apiKey: string): Promise<{ status: string; modelUrl?: string; progress?: number }> {
  const body = await tripoJson(await fetch(`${TRIPO_BASE}/task/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${apiKey}` } }), 'consultar la tarea');
  const data = body.data ?? {};
  const output = typeof data.output === 'object' && data.output ? data.output as Record<string, unknown> : {};
  if (typeof data.status !== 'string' || !data.status) throw new Error('Tripo no devolvió el estado de la tarea');
  // El mapeo queda aislado porque Tripo puede renombrar estos campos.
  const rawModelUrl = output.pbr_model ?? output.model;
  return { status: data.status, ...(typeof rawModelUrl === 'string' ? { modelUrl: rawModelUrl } : {}), ...(typeof data.progress === 'number' ? { progress: data.progress } : {}) };
}

export async function generateModelFromImages(imageUrls: string[], apiKey: string, opts: { pollMs?: number; timeoutMs?: number } = {}): Promise<Buffer> {
  if (imageUrls.length < 1 || imageUrls.length > 4) throw new Error('Tripo requiere entre 1 y 4 imágenes');
  const tokens: string[] = [];
  for (const url of imageUrls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se pudo descargar una foto para Tripo (HTTP ${response.status})`);
    tokens.push(await uploadImage(Buffer.from(await response.arrayBuffer()), apiKey));
  }
  const taskId = await createMultiviewTask(tokens, apiKey);
  const pollMs = opts.pollMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await getTask(taskId, apiKey);
    if (task.status === 'success') {
      if (!task.modelUrl) throw new Error('Tripo completó la tarea pero no devolvió la URL del modelo');
      const model = await fetch(task.modelUrl);
      if (!model.ok) throw new Error(`No se pudo descargar el modelo generado por Tripo (HTTP ${model.status})`);
      return Buffer.from(await model.arrayBuffer());
    }
    if (['failed', 'cancelled', 'unknown'].includes(task.status.toLowerCase())) throw new Error(`La generación de Tripo terminó con estado ${task.status}`);
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw new Error('Tripo excedió el tiempo máximo de generación de 5 minutos');
}
