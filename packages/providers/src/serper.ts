// Cambiar acá si Serper modifica el endpoint de búsqueda de imágenes.
export const SERPER_IMAGES_URL='https://google.serper.dev/images';
export type SerperImage={url:string;title?:string;source?:string;width?:number;height?:number};
export async function searchImages(query:string,apiKey:string,num=20):Promise<SerperImage[]>{
 const response=await fetch(SERPER_IMAGES_URL,{method:'POST',headers:{'Content-Type':'application/json','X-API-KEY':apiKey},body:JSON.stringify({q:query,num,gl:'ar',hl:'es'})});
 if(!response.ok){
  let detail='';
  try{const body=await response.text();if(body)detail=`: ${body.slice(0,300)}`;}catch{/* sin body legible */}
  throw new Error(`Serper no pudo buscar imágenes (HTTP ${response.status})${detail}`);
 }
 const data=await response.json() as {images?:Array<Record<string,unknown>>};
 return(data.images??[]).flatMap(item=>typeof item.imageUrl==='string'?[{url:item.imageUrl,...(typeof item.title==='string'?{title:item.title}:{}),...(typeof item.source==='string'?{source:item.source}:{}),...(typeof(item.width??item.imageWidth)==='number'?{width:(item.width??item.imageWidth) as number}:{}),...(typeof(item.height??item.imageHeight)==='number'?{height:(item.height??item.imageHeight) as number}:{})}]:[]);
}

// Búsqueda web de Google vía Serper: sirve para leer medidas y especificaciones de un producto en los fragmentos de los resultados.
export const SERPER_SEARCH_URL='https://google.serper.dev/search';
export type SerperWebResult={title:string;snippet:string;link:string};
export async function searchWeb(query:string,apiKey:string,num=8):Promise<SerperWebResult[]>{
 const response=await fetch(SERPER_SEARCH_URL,{method:'POST',headers:{'Content-Type':'application/json','X-API-KEY':apiKey},body:JSON.stringify({q:query,num,gl:'ar',hl:'es'}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Serper no pudo buscar en la web (HTTP ${response.status})`);
 const data=await response.json() as {organic?:Array<Record<string,unknown>>};
 return(data.organic??[]).map(item=>({title:typeof item.title==='string'?item.title:'',snippet:typeof item.snippet==='string'?item.snippet:'',link:typeof item.link==='string'?item.link:''}));
}
