import{decryptSecret}from'@tgs/config';import{db}from'@tgs/database';
async function loadKey(field:'photoroomKeyEnc'|'serperKeyEnc'|'tripoKeyEnc',provider:string){const c=await db.externalModuleConfig.findUnique({where:{id:'singleton'},select:{photoroomKeyEnc:true,serperKeyEnc:true,tripoKeyEnc:true}});const encrypted=c?.[field];if(!encrypted)throw new Error(`Falta configurar la API key de ${provider}`);return decryptSecret(encrypted);}
export const getPhotoroomKey=()=>loadKey('photoroomKeyEnc','Photoroom');
export const getSerperKey=()=>loadKey('serperKeyEnc','Serper');
export const getTripoKey=()=>loadKey('tripoKeyEnc','Tripo');
export*from'./photoroom.js';export*from'./serper.js';export*from'./tripo.js';export*from'./higgsfield.js';
