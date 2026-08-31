import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Almacenamiento de medios (imágenes de productos, miniaturas, modelos 3D).
 *
 * Vive en el disco del servidor, bajo el volumen persistente que Railway monta
 * en `/data` (`UPLOADS_DIR`), y se sirve por la propia API en
 * `/api/uploads/media/<key>`. Reemplaza a Cloudflare R2: una integración
 * externa menos que configurar, y los archivos quedan al lado del resto de los
 * uploads (PDFs, logos) en vez de en un bucket aparte.
 *
 * IMPORTANTE: en Railway hay que tener un Volume montado en `/data`, o los
 * archivos se pierden en cada redeploy (el filesystem del contenedor es
 * efímero). El Dockerfile ya define `UPLOADS_DIR=/data/uploads`.
 */

export type StoredFile = { url: string; key: string };
export type MediaStorage = {
  put(key: string, body: Buffer, contentType?: string): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
};

/** Carpeta raíz de uploads, compartida con branding/calculadora/chatbot. */
export const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "storage", "uploads");

/** Subcarpeta propia para no mezclarse con los otros uploads. */
export const MEDIA_DIR = path.join(UPLOADS_ROOT, "media");

/** Base pública de la API. WordPress descarga las imágenes desde acá, así que
 *  tiene que ser una URL absoluta y alcanzable desde afuera. */
export const apiPublicUrl = () =>
  (process.env.API_PUBLIC_URL ?? "http://localhost:3001/api").replace(/\/$/, "");

/**
 * Valida una key antes de tocar el disco: solo subcarpetas simples, sin
 * `..` ni rutas absolutas, para que nunca se pueda escribir o borrar fuera
 * de la carpeta de medios.
 */
export function assertSafeKey(key: string): string {
  const clean = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.length > 400) throw new Error("Key de archivo inválida");
  if (!/^[A-Za-z0-9._/-]+$/.test(clean)) throw new Error("Key de archivo inválida");
  if (clean.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Key de archivo inválida");
  }
  return clean;
}

export function mediaFilePath(key: string): string {
  const full = path.resolve(MEDIA_DIR, assertSafeKey(key));
  // Defensa en profundidad: aunque la key ya se validó, se confirma que la
  // ruta resuelta siga cayendo adentro de MEDIA_DIR.
  const root = path.resolve(MEDIA_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Key de archivo inválida");
  }
  return full;
}

export function createMediaStorage(): MediaStorage {
  const publicUrl = (key: string) => `${apiPublicUrl()}/uploads/media/${assertSafeKey(key)}`;
  return {
    publicUrl,
    async put(key, body) {
      const safe = assertSafeKey(key);
      const full = mediaFilePath(safe);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return { url: publicUrl(safe), key: safe };
    },
    async delete(key) {
      // Borrar algo que ya no está no es un error: el objetivo es que no quede.
      await unlink(mediaFilePath(key)).catch(() => undefined);
    },
  };
}

/**
 * Antes esto cargaba las credenciales de R2 desde la base y fallaba si faltaba
 * alguna. Ahora no hay nada que configurar, pero se mantiene asíncrona para no
 * tener que cambiar los llamados (`await (await loadMediaStorage()).put(...)`).
 */
export async function loadMediaStorage(): Promise<MediaStorage> {
  return createMediaStorage();
}

/**
 * Si la URL apunta a un archivo servido por nosotros, devuelve su key; si es
 * una URL externa (por ejemplo una imagen de Serper que se usó "tal cual"),
 * devuelve null. Se usa para borrar del disco solo lo que subimos nosotros.
 */
export function ownStorageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = "/uploads/media/";
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const key = url.slice(index + marker.length).split(/[?#]/)[0];
  if (!key) return null;
  try {
    return assertSafeKey(decodeURIComponent(key));
  } catch {
    return null;
  }
}
