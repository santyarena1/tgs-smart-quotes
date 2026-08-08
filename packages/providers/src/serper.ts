// Cambiar acá si Serper modifica el endpoint de búsqueda de imágenes.
export const SERPER_IMAGES_URL='https://google.serper.dev/images';
export type SerperImage={url:string;title?:string;source?:string;width?:number;height?:number};
export async function searchImages(query:string,apiKey:string,num=20):Promise<SerperImage[]>{
 const response=await fetch(SERPER_IMAGES_URL,{method:'POST',headers:{'Content-Type':'application/json','X-API-KEY':apiKey},body:JSON.stringify({q:query,num})});
 if(!response.ok)throw new Error(`Serper no pudo buscar imágenes (HTTP ${response.status})`);
 const data=await response.json() as {images?:Array<Record<string,unknown>>};
 return(data.images??[]).flatMap(item=>typeof item.imageUrl==='string'?[{url:item.imageUrl,...(typeof item.title==='string'?{title:item.title}:{}),...(typeof item.source==='string'?{source:item.source}:{}),...(typeof(item.width??item.imageWidth)==='number'?{width:(item.width??item.imageWidth) as number}:{}),...(typeof(item.height??item.imageHeight)==='number'?{height:(item.height??item.imageHeight) as number}:{})}]:[]);
}
