import{decryptSecret}from'@tgs/config';import{db}from'@tgs/database';
async function loadKey(field:'photoroomKeyEnc'|'serperKeyEnc',provider:string){const c=await db.externalModuleConfig.findUnique({where:{id:'singleton'},select:{photoroomKeyEnc:true,serperKeyEnc:true}});const encrypted=c?.[field];if(!encrypted)throw new Error(`Falta configurar la API key de ${provider}`);return decryptSecret(encrypted);}
export const getPhotoroomKey=()=>loadKey('photoroomKeyEnc','Photoroom');
export const getSerperKey=()=>loadKey('serperKeyEnc','Serper');
export*from'./photoroom.js';export*from'./serper.js';
