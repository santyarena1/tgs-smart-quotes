import{db,type ProcessingJob}from'@tgs/database';import{removeBackground}from'@tgs/providers';import{loadMediaStorage}from'@tgs/storage';
export async function removeProductAssetBackground(job:ProcessingJob){
 const assetId=typeof job.payload==='object'&&job.payload&&'assetId'in job.payload?(job.payload as{assetId?:unknown}).assetId:null;
 if(typeof assetId!=='string')throw new Error('Payload inválido: falta assetId');
 try{const asset=await db.productAsset.findUnique({where:{id:assetId}});if(!asset)throw new Error('La imagen de producto no existe');if(!asset.sourceUrl)throw new Error('La imagen no tiene URL de origen');
 const response=await fetch(asset.sourceUrl);if(!response.ok)throw new Error(`No se pudo descargar la imagen de origen (HTTP ${response.status})`);
 // El recorte se hace en el propio servidor con sharp (ver @tgs/providers):
 // ya no depende de la API de Photoroom ni de ninguna key.
 const result=await removeBackground(Buffer.from(await response.arrayBuffer()));const key=`product-assets/${asset.productId}/${asset.id}.png`;const stored=await(await loadMediaStorage()).put(key,result,'image/png');
 return db.productAsset.update({where:{id:asset.id},data:{url:stored.url,storageKey:stored.key,status:'READY',lastError:null}});
 }catch(error){
  // El motivo se guarda en el asset para poder mostrarlo en pantalla en vez de
  // dejar la imagen en "falló" sin explicación.
  const lastError=error instanceof Error?error.message.slice(0,500):'No se pudo quitar el fondo';
  await db.productAsset.updateMany({where:{id:assetId},data:{status:'FAILED',lastError}});throw error;}
}
