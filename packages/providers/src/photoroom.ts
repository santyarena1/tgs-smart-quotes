// Cambiar acá si Photoroom modifica el endpoint de segmentación.
export const PHOTOROOM_SEGMENT_URL='https://sdk.photoroom.com/v1/segment';
export async function removeBackground(imageBytes:Buffer,apiKey:string):Promise<Buffer>{
 const form=new FormData(); form.append('image_file',new Blob([new Uint8Array(imageBytes)]),'image');
 const response=await fetch(PHOTOROOM_SEGMENT_URL,{method:'POST',headers:{'x-api-key':apiKey},body:form});
 if(!response.ok)throw new Error(`Photoroom no pudo quitar el fondo (HTTP ${response.status})`);
 return Buffer.from(await response.arrayBuffer());
}
