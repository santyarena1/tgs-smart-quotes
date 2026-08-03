import {BadRequestException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {UPLOADS_ROOT} from './branding-storage.js';

export const CHATBOT_RULE_IMAGES_DIR=path.join(UPLOADS_ROOT,'chatbot-rules');
const MIME_EXT:Record<string,string>={
  'image/png':'png',
  'image/jpeg':'jpg',
  'image/jpg':'jpg',
  'image/webp':'webp',
  'image/gif':'gif',
};
const EXT_MIME:Record<string,string>={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
const SAFE_FILE=/^rule-[a-f0-9]{16}\.(png|jpg|webp|gif)$/;

export async function saveChatbotRuleImage(buffer:Buffer,mime:string) {
  const normalized=mime.toLowerCase().split(';')[0]!.trim();
  const ext=MIME_EXT[normalized];
  if(!ext)throw new BadRequestException('Formato no permitido. Usá PNG, JPG, WEBP o GIF.');
  if(!buffer.length)throw new BadRequestException('La imagen está vacía');
  if(buffer.length>5*1024*1024)throw new BadRequestException('La imagen no puede superar 5 MB');
  await mkdir(CHATBOT_RULE_IMAGES_DIR,{recursive:true});
  const hash=createHash('sha256').update(buffer).digest('hex').slice(0,16);
  const filename=`rule-${hash}.${ext}`;
  await writeFile(path.join(CHATBOT_RULE_IMAGES_DIR,filename),buffer);
  return {filename,mime:EXT_MIME[ext]!,url:`/api/uploads/chatbot-rules/${filename}`};
}

export function chatbotRuleImagePath(filename:string) {
  if(!SAFE_FILE.test(filename))throw new BadRequestException('Nombre de imagen inválido');
  return path.join(CHATBOT_RULE_IMAGES_DIR,filename);
}

export function chatbotRuleImageMime(filename:string) {
  const ext=filename.split('.').pop()??'';
  return EXT_MIME[ext]??'application/octet-stream';
}
