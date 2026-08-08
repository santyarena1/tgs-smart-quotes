import{db,type ProcessingJob}from'@tgs/database';import{getPhotoroomKey,removeBackground}from'@tgs/providers';import{loadR2FromModuleConfig}from'@tgs/storage';
export async function removeProductAssetBackground(job:ProcessingJob){
 const assetId=typeof job.payload==='object'&&job.payload&&'assetId'in job.payload?(job.payload as{assetId?:unknown}).assetId:null;
 if(typeof assetId!=='string')throw new Error('Payload inválido: falta assetId');
 try{const asset=await db.productAsset.findUnique({where:{id:assetId}});if(!asset)throw new Error('La imagen de producto no existe');if(!asset.sourceUrl)throw new Error('La imagen no tiene URL de origen');
 const response=await fetch(asset.sourceUrl);if(!response.ok)throw new Error(`No se pudo descargar la imagen de origen (HTTP ${response.status})`);
 const result=await removeBackground(Buffer.from(await response.arrayBuffer()),await getPhotoroomKey());const key=`product-assets/${asset.productId}/${asset.id}.png`;const stored=await(await loadR2FromModuleConfig()).put(key,result,'image/png');
 return db.productAsset.update({where:{id:asset.id},data:{url:stored.url,storageKey:stored.key,status:'READY'}});
 }catch(error){await db.productAsset.updateMany({where:{id:assetId},data:{status:'FAILED'}});throw error;}
}
