import {BadRequestException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {mkdir,readFile,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';

export const UPLOADS_ROOT=process.env.UPLOADS_DIR
  ?path.resolve(process.env.UPLOADS_DIR)
  :path.resolve(process.cwd(),'storage','uploads');

export const BRANDING_DIR=path.join(UPLOADS_ROOT,'branding');

const MIME_TO_EXT=new Map<string,string>([
  ['image/png','png'],
  ['image/jpeg','jpg'],
  ['image/jpg','jpg'],
  ['image/webp','webp'],
  ['image/gif','gif'],
]);

const EXT_TO_MIME:Record<string,string>={
  png:'image/png',
  jpg:'image/jpeg',
  webp:'image/webp',
  gif:'image/gif',
  ico:'image/x-icon',
  svg:'image/svg+xml',
};

const LOGO_FILE_RE=/^logo-[a-f0-9]{8,64}\.(png|jpg|webp|gif)$/;
const FAVICON_FILE_RE=/^favicon-[a-f0-9]{8,64}\.(ico|png|svg)$/;

export function logoPublicUrl(filename:string):string{
  return `/api/uploads/branding/${filename}`;
}
export function faviconPublicUrl(filename:string):string{return `/api/uploads/branding/${filename}`}

/**
 * Devuelve una ruta relativa (`/api/uploads/branding/<archivo>`) sin depender del
 * host. Migra en lectura cualquier URL absoluta antigua (p.ej. localhost) al mismo
 * archivo servido por el proxy `/api`. Deja intactos data URLs u otros valores.
 */
export function normalizeLogoUrl(url:string|null|undefined):string|null{
  if(!url)return null;
  if(url.startsWith('data:'))return url;
  const name=filenameFromLogoUrl(url);
  if(name&&LOGO_FILE_RE.test(name))return `/api/uploads/branding/${name}`;
  return url;
}
export function normalizeFaviconUrl(url:string|null|undefined):string|null{
  if(!url)return null;
  if(url.startsWith('data:'))return url;
  const name=filenameFromLogoUrl(url);
  if(name&&FAVICON_FILE_RE.test(name))return faviconPublicUrl(name);
  return url;
}

export function filenameFromLogoUrl(url:string|null|undefined):string|null{
  if(!url)return null;
  try{
    const pathname=url.startsWith('http')?new URL(url).pathname:url;
    const match=pathname.match(/\/uploads\/branding\/([^/?#]+)$/);
    return match?.[1]??null;
  }catch{
    return null;
  }
}
export const filenameFromFaviconUrl=filenameFromLogoUrl;

export function assertSafeBrandingFilename(filename:string):string{
  if(!LOGO_FILE_RE.test(filename)&&!FAVICON_FILE_RE.test(filename)){
    throw new BadRequestException('Nombre de archivo de branding inválido');
  }
  return filename;
}

export async function saveFavicon(buffer:Buffer,mime:string):Promise<{filename:string;url:string;mime:string}>{
  const normalized=mime.toLowerCase().split(';')[0]!.trim();
  const ext=normalized==='image/png'?'png':normalized==='image/svg+xml'?'svg':normalized==='image/x-icon'||normalized==='image/vnd.microsoft.icon'||normalized==='application/octet-stream'?'ico':null;
  if(!ext)throw new BadRequestException('Formato no permitido. Usá ICO, PNG o SVG.');
  if(buffer.byteLength===0)throw new BadRequestException('El archivo está vacío');
  if(buffer.byteLength>1024*1024)throw new BadRequestException('El favicon no puede superar 1 MB');
  await mkdir(BRANDING_DIR,{recursive:true});
  const hash=createHash('sha256').update(buffer).digest('hex').slice(0,16);
  const filename=`favicon-${hash}.${ext}`;
  await writeFile(path.join(BRANDING_DIR,filename),buffer);
  return{filename,url:faviconPublicUrl(filename),mime:EXT_TO_MIME[ext]!};
}

export async function removeManagedFaviconFile(url:string|null|undefined):Promise<void>{
  const name=filenameFromFaviconUrl(url);
  if(!name||!FAVICON_FILE_RE.test(name))return;
  await unlink(path.join(BRANDING_DIR,name)).catch(()=>undefined);
}

export async function saveBrandingLogo(buffer:Buffer,mime:string):Promise<{filename:string;url:string;mime:string}>{
  const normalized=mime.toLowerCase().split(';')[0]!.trim();
  const ext=MIME_TO_EXT.get(normalized);
  if(!ext){
    throw new BadRequestException('Formato no permitido. Usá PNG, JPG, WEBP o GIF.');
  }
  if(buffer.byteLength===0){
    throw new BadRequestException('El archivo está vacío');
  }
  if(buffer.byteLength>2*1024*1024){
    throw new BadRequestException('El logo no puede superar 2 MB');
  }
  await mkdir(BRANDING_DIR,{recursive:true});
  const hash=createHash('sha256').update(buffer).digest('hex').slice(0,16);
  const filename=`logo-${hash}.${ext}`;
  await writeFile(path.join(BRANDING_DIR,filename),buffer);
  return {filename,url:logoPublicUrl(filename),mime:EXT_TO_MIME[ext]!};
}

export async function removeManagedLogoFile(logoUrl:string|null|undefined):Promise<void>{
  const name=filenameFromLogoUrl(logoUrl);
  if(!name||!LOGO_FILE_RE.test(name))return;
  await unlink(path.join(BRANDING_DIR,name)).catch(()=>undefined);
}

/** Para PDF: embebe logos locales como data URL (Playwright no depende de la red). */
export async function resolveLogoForPdf(logoUrl:string|null|undefined):Promise<string|null>{
  if(!logoUrl)return null;
  if(logoUrl.startsWith('data:'))return logoUrl;
  const name=filenameFromLogoUrl(logoUrl);
  if(!name||!LOGO_FILE_RE.test(name))return logoUrl;
  try{
    const ext=name.split('.').pop()!;
    const mime=EXT_TO_MIME[ext];
    if(!mime)return logoUrl;
    const buf=await readFile(path.join(BRANDING_DIR,name));
    return `data:${mime};base64,${buf.toString('base64')}`;
  }catch{
    return logoUrl;
  }
}

export function brandingFilePath(filename:string):string{
  return path.join(BRANDING_DIR,assertSafeBrandingFilename(filename));
}

export function mimeForBrandingFilename(filename:string):string{
  const ext=assertSafeBrandingFilename(filename).split('.').pop()!;
  return EXT_TO_MIME[ext]??'application/octet-stream';
}
