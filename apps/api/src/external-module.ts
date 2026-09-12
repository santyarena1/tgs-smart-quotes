import{BadGatewayException,BadRequestException,Body,ConflictException,Controller,Delete,Get,NotFoundException,Param,Patch,Post,Put,Query,Req,StreamableFile}from'@nestjs/common';
import{createHmac,randomUUID}from'node:crypto';import{createReadStream,existsSync}from'node:fs';import path from'node:path';import{z}from'zod';import{db,enqueueJob}from'@tgs/database';import{assetFromUrlSchema,assetModeSchema,assetUpdateSchema,DEFAULT_LANDING_LAYOUT,idSchema,landingLayoutSchema,quoteEnrichmentUpdateSchema,thumbnailGenerateSchema,thumbnailRulesSchema,thumbnailTemplateCreateSchema,thumbnailTemplateUpdateSchema,productContentSchema,quoteFamilyPublishSettingsSchema,type ProductContentInput,type QuoteFamilyPublishSettingsInput,type AssetFromUrlInput,type AssetModeInput,type AssetUpdateInput,type LandingLayout,type QuoteEnrichmentUpdateInput,type ThumbnailGenerateInput,type ThumbnailRules,type ThumbnailTemplateCreateInput,type ThumbnailTemplateUpdateInput}from'@tgs/contracts';import{buildPublishPayload,generateBackground,getHiggsfieldKey,getSerperKey,publishQuote,removeBackground,removeBackgroundDetailed,resolvePublishVersionId,searchImages,unpublishQuote,WordpressPublishError}from'@tgs/providers';import{loadPublishRun,PublishRunConflictError,startPublishRun}from'./publish-pipeline.js';import{generateProductDescription,loadEnrichmentItems,runQuoteEnrichment}from'./quote-enrichment.js';import{buildStoreTitle}from'./quote-title.js';import{loadMediaStorage,normalizeMediaUrl,ownStorageKeyFromUrl,readMedia}from'@tgs/storage';import{createAiClient,DEFAULT_AI_MODEL,describeOpenAiError}from'@tgs/ai';import{decryptSecret}from'@tgs/config';import{CurrentUser,jsonSafe,type RequestUser,ZodPipe}from'./infrastructure.js';import{renderThumbnail}from'./thumbnail-render.js';import{generateAiThumbnail,ThumbnailAiUnavailable}from'./thumbnail-ai.js';import{getRecutJob,startRecutJob}from'./cutouts.js';
const serperQuerySchema=z.object({q:z.string().trim().min(1).max(300)}).strict();
// Elegir como imagen del hero una de las fotos ya cargadas. Se recibe el id de
// la imagen (no la URL) para que el servidor resuelva la dirección real y no
// se pueda apuntar el hero a cualquier lado.
const heroFromAssetSchema=z.object({assetId:idSchema.nullable().optional(),imageUrl:z.string().url().nullable().optional()}).strict();
// Contenido web propio de un ítem escrito a mano (sin producto de catálogo).
const itemContentSchema=z.object({description:z.string().trim().max(2000).nullable()}).strict();
const itemImageFromUrlSchema=z.object({url:z.string().url(),mode:z.enum(['remove-bg','as-is'])}).strict();
const audit=(tx:any,userId:string,entityId:string,action:string,previous:unknown,next:unknown,entityType='ProductAsset')=>tx.auditLog.create({data:{userId,entityType,entityId,action,previous:previous==null?null:jsonSafe(previous),next:next==null?null:jsonSafe(next)}});
const ext=(filename:string,mimetype:string)=>{const found=/\.([a-zA-Z0-9]{2,5})$/.exec(filename)?.[1]?.toLowerCase();if(found&&['png','jpg','jpeg','webp','gif'].includes(found))return found;return mimetype==='image/png'?'png':mimetype==='image/webp'?'webp':'jpg';};
const modelExt=(filename:string)=>/\.gltf$/i.test(filename)?'gltf':/\.glb$/i.test(filename)?'glb':null;
// Devuelve la key solo si el archivo lo guardamos nosotros; las URLs externas
// (por ejemplo una imagen de Serper usada "tal cual") no se tocan.
const ownStorageKey=async(url:string)=>ownStorageKeyFromUrl(url);
async function requireProduct(id:string){if(!await db.product.findUnique({where:{id},select:{id:true}}))throw new NotFoundException('Producto inexistente');}
async function downloadBytes(url:string,label:string){const response=await fetch(url);if(!response.ok)throw new BadRequestException(`No se pudo descargar ${label} (HTTP ${response.status})`);return Buffer.from(await response.arrayBuffer());}
async function quoteVersion(id:string){const version=await db.quoteVersion.findUnique({where:{id},include:{items:{orderBy:{position:'asc'}},family:true}});if(!version)throw new NotFoundException('Versión de presupuesto inexistente');return version;}
const installmentTotal=(base:bigint,bps:number)=>(base*BigInt(10000+bps)+5000n)/10000n;
function enrichmentData(body:QuoteEnrichmentUpdateInput){return{descriptionHtml:body.descriptionHtml,powerWatts:body.powerWatts,recommendedPsuWatts:body.recommendedPsuWatts,powerNote:body.powerNote,gamesJson:body.games as any,programsJson:body.programs as any,compatibilityJson:body.compatibility as any,...(body.title!==undefined?{title:body.title}:{}),...(body.tagline!==undefined?{tagline:body.tagline}:{}),...(body.shortDescription!==undefined?{shortDescription:body.shortDescription}:{}),...(body.highlights!==undefined?{highlightsJson:body.highlights as any}:{}),...(body.audience!==undefined?{audience:body.audience}:{})};}
// Navegador simulado: muchos sitios (los que aparecen en los resultados de
// Serper) responden 403 a un user-agent de servidor.
const BROWSER_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
/**
 * Descarga una imagen externa y la guarda en nuestro disco.
 *
 * Antes las imágenes elegidas desde Serper se guardaban como enlace al sitio
 * de origen. Eso hacía que se rompieran solas (el sitio las borra, cambia la
 * URL o bloquea el hotlinking) y que "quitar fondo" fallara al no poder
 * descargarlas. Ahora la imagen queda en nuestro servidor apenas se elige.
 */
/** Descarga una imagen externa simulando un navegador y valida que lo sea. */
async function downloadImage(url:string):Promise<{buffer:Buffer;contentType:string}>{
 let response:Response;
 try{
  response=await fetch(url,{headers:{'user-agent':BROWSER_UA,accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8'},signal:AbortSignal.timeout(20000)});
 }catch(error){
  throw new BadRequestException(`No se pudo descargar la imagen del sitio de origen: ${error instanceof Error?error.message:'error de conexión'}. Probá con otra imagen.`);
 }
 if(!response.ok)throw new BadRequestException(`El sitio de origen no permitió descargar la imagen (HTTP ${response.status}). Probá con otra imagen.`);
 const contentType=(response.headers.get('content-type')??'').split(';')[0]!.trim().toLowerCase();
 const buffer=Buffer.from(await response.arrayBuffer());
 if(!buffer.length)throw new BadRequestException('La imagen de origen vino vacía. Probá con otra imagen.');
 if(!contentType.startsWith('image/'))throw new BadRequestException('Ese enlace no devolvió una imagen. Probá con otra.');
 return {buffer,contentType};
}
/**
 * Guarda la foto de un ítem escrito a mano, con el fondo quitado si se pidió.
 * Si el recorte falla, se guarda igual la imagen original y se avisa: es
 * preferible tener la foto con fondo que quedarse sin foto.
 */
async function saveItemImage(itemId:string,source:Buffer,contentType:string,mode:'remove-bg'|'as-is',userId:string){
 const storage=await loadMediaStorage();
 let bytes=source;
 let extension=contentType==='image/png'?'png':contentType==='image/webp'?'webp':contentType==='image/gif'?'gif':'jpg';
 let aviso:string|null=null;
 let cut:string|null=null;
 if(mode==='remove-bg'){
  try{const result=await removeBackgroundDetailed(source);bytes=result.buffer;extension='png';cut=result.method;}
  catch(error){aviso=error instanceof Error?error.message:'No se pudo quitar el fondo.';}
 }
 const stored=await storage.put(`quote-items/${itemId}/${randomUUID()}.${extension}`,bytes,extension==='png'?'image/png':contentType);
 const old=await db.quoteItem.findUnique({where:{id:itemId}});
 const previousKey=ownStorageKeyFromUrl(old?.webImageUrl);
 const next=await db.$transaction(async tx=>{const saved=await tx.quoteItem.update({where:{id:itemId},data:{webImageUrl:stored.url,webImageCut:cut}});await audit(tx,userId,itemId,'UPDATE_IMAGE',old,saved,'QuoteItem');return saved;});
 // La foto anterior de este ítem ya no la usa nadie.
 if(previousKey&&previousKey!==stored.key)try{await storage.delete(previousKey);}catch{}
 return {...next,aviso};
}
async function storeRemoteImage(productId:string,url:string){
 let response:Response;
 try{
  response=await fetch(url,{headers:{'user-agent':BROWSER_UA,accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8'},signal:AbortSignal.timeout(20000)});
 }catch(error){
  throw new BadRequestException(`No se pudo descargar la imagen del sitio de origen: ${error instanceof Error?error.message:'error de conexión'}. Probá con otra imagen.`);
 }
 if(!response.ok)throw new BadRequestException(`El sitio de origen no permitió descargar la imagen (HTTP ${response.status}). Probá con otra imagen.`);
 const contentType=(response.headers.get('content-type')??'').split(';')[0]!.trim().toLowerCase();
 const buffer=Buffer.from(await response.arrayBuffer());
 if(!buffer.length)throw new BadRequestException('La imagen de origen vino vacía. Probá con otra imagen.');
 if(!contentType.startsWith('image/'))throw new BadRequestException('Ese enlace no devolvió una imagen. Probá con otra.');
 const extension=contentType==='image/png'?'png':contentType==='image/webp'?'webp':contentType==='image/gif'?'gif':'jpg';
 return (await loadMediaStorage()).put(`product-assets/${productId}/source-${randomUUID()}.${extension}`,buffer,contentType);
}
/**
 * Quita el fondo de una imagen ya cargada y guarda el resultado.
 *
 * Corre acá, en la API, y no en el worker: el worker es un servicio aparte en
 * Railway, con su propio disco, así que no podía leer las imágenes que guarda
 * la API ni dejar el resultado donde la API lo sirve (de ahí el "fetch failed"
 * al intentar bajarlas por HTTP). Acá está el disco y también sharp.
 *
 * El origen se lee del disco cuando es un archivo nuestro; si es una URL
 * externa se descarga simulando un navegador.
 */
async function removeAssetBackground(assetId:string){
 const asset=await db.productAsset.findUnique({where:{id:assetId}});
 if(!asset)throw new NotFoundException('Imagen inexistente');
 if(!asset.sourceUrl)throw new BadRequestException('La imagen no tiene origen');
 const storage=await loadMediaStorage();
 let source:Buffer;
 const ownKey=ownStorageKeyFromUrl(asset.sourceUrl);
 try{
  if(ownKey){
   source=await readMedia(ownKey);
  }else{
   const response=await fetch(asset.sourceUrl,{headers:{'user-agent':BROWSER_UA,accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8'},signal:AbortSignal.timeout(25000)});
   if(!response.ok)throw new Error(`el sitio de origen respondió HTTP ${response.status}`);
   source=Buffer.from(await response.arrayBuffer());
  }
 }catch(error){
  const detalle=error instanceof Error?error.message:'no se pudo leer';
  await db.productAsset.update({where:{id:assetId},data:{status:'FAILED',lastError:`No se pudo leer la imagen de origen: ${detalle}`}});
  throw new BadRequestException(`No se pudo leer la imagen de origen: ${detalle}`);
 }
 try{
  const {buffer:png,method}=await removeBackgroundDetailed(source);
  const stored=await storage.put(`product-assets/${asset.productId}/${asset.id}.png`,png,'image/png');
  return db.productAsset.update({where:{id:asset.id},data:{url:stored.url,storageKey:stored.key,status:'READY',lastError:null,cutMethod:method}});
 }catch(error){
  const detalle=error instanceof Error?error.message:'No se pudo quitar el fondo';
  await db.productAsset.update({where:{id:assetId},data:{status:'FAILED',lastError:detalle.slice(0,500)}});
  throw new BadRequestException(detalle);
 }
}
async function createAsset(productId:string,input:{url:string;origin:'UPLOAD'|'SERPER'|'OFFICIAL';mode:'remove-bg'|'as-is'},userId:string){
 await requireProduct(productId);return db.$transaction(async tx=>{
  // La primera imagen del producto queda como principal sola: si no, un
  // producto podía terminar con imágenes cargadas y ninguna elegida.
  const existing=await tx.productAsset.count({where:{productId}});
  // `approved` se deja siempre en true: no cambiaba nada de lo que se publica
  // (el armado del payload solo mira status y url), así que pedir un paso de
  // "aprobar" aparte era solo un botón de más.
  const asset=await tx.productAsset.create({data:{productId,origin:input.origin,sourceUrl:input.url,url:input.mode==='as-is'?input.url:null,status:input.mode==='as-is'?'READY':'PENDING',approved:true,isPrimary:existing===0}});
  await audit(tx,userId,asset.id,'CREATE',null,asset);return asset;});
}
function resolveWpPluginZip(){const candidates=[process.env.WP_PLUGIN_ZIP_PATH,path.resolve(process.cwd(),'wordpress-plugin/tgs-smart-quotes.zip'),path.resolve(process.cwd(),'../../wordpress-plugin/tgs-smart-quotes.zip'),path.resolve(process.cwd(),'storage/wordpress-plugin/tgs-smart-quotes.zip'),path.resolve(process.cwd(),'../../storage/wordpress-plugin/tgs-smart-quotes.zip')].filter((value):value is string=>Boolean(value));return candidates.find(existsSync)??null;}
function savedLandingLayout(value:unknown):LandingLayout{const parsed=landingLayoutSchema.safeParse(value);return parsed.success?parsed.data:DEFAULT_LANDING_LAYOUT;}
const publishBodySchema=z.object({versionId:idSchema.nullable().optional()}).strict();
const prepareBodySchema=z.object({versionId:idSchema.nullable().optional(),publish:z.boolean().optional()}).strict();
const previewQuerySchema=z.object({versionId:idSchema.optional()}).strict();
const generateTitleBodySchema=z.object({versionId:idSchema.nullable().optional(),apply:z.boolean().optional()}).strict();
async function requireFamily(id:string){if(!await db.quoteFamily.findUnique({where:{id},select:{id:true}}))throw new NotFoundException('Presupuesto inexistente');}
function translateWordpressError(error:unknown){if(error instanceof WordpressPublishError){if(error.httpStatus===400)return new BadRequestException(error.message);if(error.httpStatus===404)return new NotFoundException(error.message);return new BadGatewayException(error.message);}return error;}
/**
 * Estado de la publicación de un presupuesto, con la versión publicada y la
 * activa. `isStale` = la tienda muestra una versión anterior a la activa.
 */
async function publicationView(familyId:string){const family=await db.quoteFamily.findUnique({where:{id:familyId},select:{activeVersion:true,webTitle:true,webTagline:true,versions:{select:{id:true,version:true,state:true}},webPublication:true}});if(!family)throw new NotFoundException('Presupuesto inexistente');const active=family.versions.find(v=>v.version===family.activeVersion)??family.versions[0]??null;const publication=family.webPublication;const published=publication?family.versions.find(v=>v.id===publication.quoteVersionId)??null:null;return{...(publication??{status:'DRAFT' as const,url:null,lastError:null,lastErrorAt:null,publishedAt:null,wpProductId:null,thumbnailUrl:null,quoteVersionId:null}),quoteFamilyId:familyId,webTitle:family.webTitle,webTagline:family.webTagline,publishedVersionNumber:published?.version??null,activeVersionId:active?.id??null,activeVersionNumber:active?.version??null,isStale:Boolean(publication?.status==='PUBLISHED'&&published&&active&&published.id!==active.id)};}

@Controller('external-module')
export class ExternalModuleController{
 @Get('landing-layout')async landingLayout(){const config=await db.externalModuleConfig.findUnique({where:{id:'singleton'},select:{landingLayoutJson:true}});return jsonSafe(savedLandingLayout(config?.landingLayoutJson));}
 @Put('landing-layout')async updateLandingLayout(@Body(new ZodPipe(landingLayoutSchema))body:LandingLayout,@CurrentUser()u:RequestUser){const old=await db.externalModuleConfig.findUnique({where:{id:'singleton'},select:{landingLayoutJson:true}});const next=await db.$transaction(async tx=>{const saved=await tx.externalModuleConfig.upsert({where:{id:'singleton'},create:{id:'singleton',landingLayoutJson:body as any},update:{landingLayoutJson:body as any}});await audit(tx,u.id,'singleton','UPDATE_LAYOUT',old?.landingLayoutJson??null,body,'ExternalModuleConfig');return saved;});return jsonSafe(savedLandingLayout(next.landingLayoutJson));}
 // Las URLs propias se reescriben contra la base pública actual: las imágenes
 // guardadas mientras esa base estaba mal configurada quedaron apuntando a
 // localhost, y así se arreglan solas sin tocar la base de datos.
 @Get('products/:productId/assets')async list(@Param('productId',new ZodPipe(idSchema))productId:string){await requireProduct(productId);const rows=await db.productAsset.findMany({where:{productId},orderBy:[{isPrimary:'desc'},{createdAt:'desc'}]});return jsonSafe(rows.map(row=>({...row,url:normalizeMediaUrl(row.url),sourceUrl:normalizeMediaUrl(row.sourceUrl)})));}
 @Post('products/:productId/assets/upload')async upload(@Param('productId',new ZodPipe(idSchema))productId:string,@Query(new ZodPipe(assetModeSchema))input:AssetModeInput,@Req()req:any,@CurrentUser()u:RequestUser){
  await requireProduct(productId);if(typeof req.file!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');const part=await req.file();if(!part)throw new BadRequestException('Seleccioná una imagen');const mimetype=String(part.mimetype??'');if(!mimetype.startsWith('image/'))throw new BadRequestException('El archivo debe ser una imagen');const buffer=await part.toBuffer();if(!buffer.length)throw new BadRequestException('La imagen está vacía');
  const key=`product-assets/${productId}/source-${randomUUID()}.${ext(String(part.filename??''),mimetype)}`;const stored=await(await loadMediaStorage()).put(key,buffer,mimetype);const asset=await createAsset(productId,{url:stored.url,origin:'UPLOAD',mode:input.mode},u.id);return jsonSafe(input.mode==='remove-bg'?await removeAssetBackground(asset.id):asset);
 }
 @Post('products/:productId/assets/from-url')async fromUrl(@Param('productId',new ZodPipe(idSchema))productId:string,@Body(new ZodPipe(assetFromUrlSchema))input:AssetFromUrlInput,@CurrentUser()u:RequestUser){await requireProduct(productId);const stored=await storeRemoteImage(productId,input.url);const asset=await createAsset(productId,{url:stored.url,origin:input.origin??'SERPER',mode:input.mode},u.id);return jsonSafe(input.mode==='remove-bg'?await removeAssetBackground(asset.id):asset);}
 @Put('products/:productId/content')async updateContent(@Param('productId',new ZodPipe(idSchema))productId:string,@Body(new ZodPipe(productContentSchema))body:ProductContentInput,@CurrentUser()u:RequestUser){await requireProduct(productId);return jsonSafe(await db.$transaction(async tx=>{const old=await tx.product.findUnique({where:{id:productId}});const next=await tx.product.update({where:{id:productId},data:{description:body.description}});await audit(tx,u.id,productId,'UPDATE_CONTENT',old,next,'Product');return next;}));}
 @Post('products/:productId/content/generate')async generateContent(@Param('productId',new ZodPipe(idSchema))productId:string,@CurrentUser()u:RequestUser){const product=await db.product.findUnique({where:{id:productId}});if(!product)throw new NotFoundException('Producto inexistente');const description=await generateProductDescription(product.name);return jsonSafe(await db.$transaction(async tx=>{const old=await tx.product.findUnique({where:{id:productId}});const next=await tx.product.update({where:{id:productId},data:{description}});await audit(tx,u.id,productId,'GENERATE_CONTENT',old,next,'Product');return next;}));}
 @Put('quote-families/:familyId/publish-settings')async updatePublishSettings(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Body(new ZodPipe(quoteFamilyPublishSettingsSchema))body:QuoteFamilyPublishSettingsInput,@CurrentUser()u:RequestUser){const old=await db.quoteFamily.findUnique({where:{id:familyId}});if(!old)throw new NotFoundException('Presupuesto inexistente');const data={...(body.autoRepublish!==undefined?{autoRepublish:body.autoRepublish}:{}),...(body.webTitle!==undefined?{webTitle:body.webTitle?.trim()||null}:{}),...(body.webTagline!==undefined?{webTagline:body.webTagline?.trim()||null}:{})};const next=await db.$transaction(async tx=>{const saved=await tx.quoteFamily.update({where:{id:familyId},data});await audit(tx,u.id,familyId,'UPDATE_PUBLISH_SETTINGS',old,saved,'QuoteFamily');return saved;});return jsonSafe(next);}
 // Regenera la miniatura con IA a pedido (botón en Publicación Web), aunque ya
 // hubiera una: cada llamada es una imagen nueva.
 @Post('quote-families/:familyId/thumbnail/generate')async generateFamilyThumbnail(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Body(new ZodPipe(z.object({regenerateCase:z.boolean().optional()}).strict().optional()))body:{regenerateCase?:boolean}|undefined,@CurrentUser()u:RequestUser){const family=await db.quoteFamily.findUnique({where:{id:familyId},select:{id:true,thumbnailUrl:true}});if(!family)throw new NotFoundException('Presupuesto inexistente');const versionId=await resolvePublishVersionId(familyId);try{const generated=await generateAiThumbnail({familyId,versionId,userId:u.id,regenerateCase:Boolean(body?.regenerateCase)});return{thumbnailUrl:generated.url,detail:generated.detail};}catch(error){if(error instanceof ThumbnailAiUnavailable)throw new BadRequestException(error.message);throw new BadGatewayException(error instanceof Error?error.message:'No se pudo generar la miniatura');}}
 @Post('quote-families/:familyId/thumbnail')async uploadFamilyThumbnail(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Req()req:any,@CurrentUser()u:RequestUser){const family=await db.quoteFamily.findUnique({where:{id:familyId}});if(!family)throw new NotFoundException('Presupuesto inexistente');if(typeof req.file!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');const part=await req.file();if(!part)throw new BadRequestException('Selecciona una imagen');const mimetype=String(part.mimetype??'');if(!mimetype.startsWith('image/'))throw new BadRequestException('El archivo debe ser una imagen');const buffer=await part.toBuffer();if(!buffer.length)throw new BadRequestException('La imagen esta vacia');const key=`quote-thumbnails/${familyId}/${randomUUID()}.${ext(String(part.filename??''),mimetype)}`;const stored=await(await loadMediaStorage()).put(key,buffer,mimetype);const next=await db.$transaction(async tx=>{const saved=await tx.quoteFamily.update({where:{id:familyId},data:{thumbnailUrl:stored.url}});await audit(tx,u.id,familyId,'UPDATE_THUMBNAIL',{thumbnailUrl:family.thumbnailUrl},saved,'QuoteFamily');return saved;});return jsonSafe(next);}
 // Sin este try/catch, cualquier fallo de Serper (key inválida, cuenta sin
 // crédito, timeout) sale como un 500 genérico "Internal server error" y el
 // detalle real que devuelve la API se pierde antes de llegar a la pantalla.
 /**
  * Fotos disponibles para usar como imagen del hero: son las imágenes listas
  * de los componentes de esta PC. Antes la única forma de poner la foto de la
  * ficha era subir una miniatura a mano.
  */
 @Get('quote-families/:familyId/hero-options')async heroOptions(@Param('familyId',new ZodPipe(idSchema))familyId:string){
  const family=await db.quoteFamily.findUnique({where:{id:familyId},include:{versions:{orderBy:{version:'desc'},take:1,include:{items:{orderBy:{position:'asc'}}}}}});
  if(!family)throw new NotFoundException('Presupuesto inexistente');
  const productIds=Array.from(new Set((family.versions[0]?.items??[]).map(item=>item.productId).filter((id):id is string=>Boolean(id))));
  if(!productIds.length)return [];
  const assets=await db.productAsset.findMany({where:{productId:{in:productIds},status:'READY',url:{not:null}},orderBy:[{isPrimary:'desc'},{createdAt:'desc'}]});
  const products=await db.product.findMany({where:{id:{in:productIds}},select:{id:true,name:true}});
  const nameById=new Map(products.map(product=>[product.id,product.name]));
  return jsonSafe(assets.map(asset=>({id:asset.id,url:normalizeMediaUrl(asset.url),productId:asset.productId,productName:nameById.get(asset.productId)??''})));
 }
 /**
  * Marca una imagen de un componente como la foto grande del hero. Mandar
  * `assetId: null` la desmarca y la ficha vuelve a usar la miniatura.
  */
 @Put('quote-families/:familyId/hero-image')async setHeroImage(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Body(new ZodPipe(heroFromAssetSchema))body:{assetId?:string|null;imageUrl?:string|null},@CurrentUser()u:RequestUser){
  const family=await db.quoteFamily.findUnique({where:{id:familyId}});
  if(!family)throw new NotFoundException('Presupuesto inexistente');
  if(body.assetId){
   const asset=await db.productAsset.findUnique({where:{id:body.assetId}});
   if(!asset||!asset.url)throw new NotFoundException('Imagen inexistente');
   if(asset.status!=='READY')throw new BadRequestException('Esa imagen todavía se está procesando.');
  }
  // Elegir una imagen limpia la otra vía, así siempre hay una sola foto de hero.
  const data=body.imageUrl!==undefined&&body.imageUrl!==null
   ?{heroImageUrl:body.imageUrl,heroAssetId:null}
   :{heroAssetId:body.assetId??null,heroImageUrl:null};
  const next=await db.$transaction(async tx=>{const saved=await tx.quoteFamily.update({where:{id:familyId},data});await audit(tx,u.id,familyId,'UPDATE_HERO_IMAGE',{heroAssetId:family.heroAssetId,heroImageUrl:family.heroImageUrl},saved,'QuoteFamily');return saved;});
  return jsonSafe(next);
 }
 /**
  * Contenido web de un ítem escrito a mano.
  *
  * Los componentes que no están en el catálogo no tienen producto donde
  * guardar foto ni descripción. Estos endpoints las guardan en el propio ítem
  * del presupuesto: sirven para esta PC y no se reutilizan en otras.
  */
 @Put('quote-items/:itemId/content')async updateItemContent(@Param('itemId',new ZodPipe(idSchema))itemId:string,@Body(new ZodPipe(itemContentSchema))body:{description:string|null},@CurrentUser()u:RequestUser){
  const old=await db.quoteItem.findUnique({where:{id:itemId}});
  if(!old)throw new NotFoundException('Ítem inexistente');
  const next=await db.$transaction(async tx=>{const saved=await tx.quoteItem.update({where:{id:itemId},data:{webDescription:body.description}});await audit(tx,u.id,itemId,'UPDATE_CONTENT',old,saved,'QuoteItem');return saved;});
  return jsonSafe(next);
 }
 @Post('quote-items/:itemId/image/upload')async uploadItemImage(@Param('itemId',new ZodPipe(idSchema))itemId:string,@Query(new ZodPipe(assetModeSchema))input:AssetModeInput,@Req()req:any,@CurrentUser()u:RequestUser){
  const item=await db.quoteItem.findUnique({where:{id:itemId}});
  if(!item)throw new NotFoundException('Ítem inexistente');
  if(typeof req.file!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');
  const part=await req.file();if(!part)throw new BadRequestException('Seleccioná una imagen');
  const mimetype=String(part.mimetype??'');if(!mimetype.startsWith('image/'))throw new BadRequestException('El archivo debe ser una imagen');
  const buffer=await part.toBuffer();if(!buffer.length)throw new BadRequestException('La imagen está vacía');
  return jsonSafe(await saveItemImage(item.id,buffer,mimetype,input.mode,u.id));
 }
 @Post('quote-items/:itemId/image/from-url')async itemImageFromUrl(@Param('itemId',new ZodPipe(idSchema))itemId:string,@Body(new ZodPipe(itemImageFromUrlSchema))body:{url:string;mode:'remove-bg'|'as-is'},@CurrentUser()u:RequestUser){
  const item=await db.quoteItem.findUnique({where:{id:itemId}});
  if(!item)throw new NotFoundException('Ítem inexistente');
  const {buffer,contentType}=await downloadImage(body.url);
  return jsonSafe(await saveItemImage(item.id,buffer,contentType,body.mode,u.id));
 }
 @Delete('quote-items/:itemId/image')async deleteItemImage(@Param('itemId',new ZodPipe(idSchema))itemId:string,@CurrentUser()u:RequestUser){
  const item=await db.quoteItem.findUnique({where:{id:itemId}});
  if(!item)throw new NotFoundException('Ítem inexistente');
  const key=ownStorageKeyFromUrl(item.webImageUrl);
  const next=await db.$transaction(async tx=>{const saved=await tx.quoteItem.update({where:{id:itemId},data:{webImageUrl:null}});await audit(tx,u.id,itemId,'DELETE_IMAGE',item,saved,'QuoteItem');return saved;});
  if(key)try{await(await loadMediaStorage()).delete(key);}catch{}
  return jsonSafe(next);
 }
 @Get('serper/images')async images(@Query(new ZodPipe(serperQuerySchema))query:{q:string}){
  let key:string;
  try{key=await getSerperKey();}catch(error){throw new BadRequestException(error instanceof Error?error.message:'Falta configurar la API key de Serper');}
  try{return{images:await searchImages(query.q,key)};}catch(error){throw new BadGatewayException(error instanceof Error?error.message:'Serper no pudo buscar imágenes');}
 }
 // El recorte se hace en el momento (ver removeAssetBackground): sharp tarda
 // menos de un segundo, así que no hace falta dejar la imagen "procesando" ni
 // que el usuario recargue para saber si salió bien.
 @Post('assets/:id/remove-bg')async removeBg(@Param('id',new ZodPipe(idSchema))id:string,@CurrentUser()u:RequestUser){const old=await db.productAsset.findUnique({where:{id}});if(!old)throw new NotFoundException('Imagen inexistente');const next=await removeAssetBackground(id);await db.$transaction(tx=>audit(tx,u.id,id,'REMOVE_BG',old,next));return jsonSafe(next);}
 @Post('assets/:id/confirm-as-is')async asIs(@Param('id',new ZodPipe(idSchema))id:string,@CurrentUser()u:RequestUser){return jsonSafe(await db.$transaction(async tx=>{const old=await tx.productAsset.findUnique({where:{id}});if(!old)throw new NotFoundException('Imagen inexistente');if(!old.sourceUrl)throw new BadRequestException('La imagen no tiene origen');const next=await tx.productAsset.update({where:{id},data:{url:old.sourceUrl,approved:true,status:'READY'}});await audit(tx,u.id,id,'CONFIRM_AS_IS',old,next);return next;}));}
 @Patch('assets/:id')async update(@Param('id',new ZodPipe(idSchema))id:string,@Body(new ZodPipe(assetUpdateSchema))body:AssetUpdateInput,@CurrentUser()u:RequestUser){return jsonSafe(await db.$transaction(async tx=>{const old=await tx.productAsset.findUnique({where:{id}});if(!old)throw new NotFoundException('Imagen inexistente');if(body.isPrimary)await tx.productAsset.updateMany({where:{productId:old.productId,id:{not:id}},data:{isPrimary:false}});const next=await tx.productAsset.update({where:{id},data:body});await audit(tx,u.id,id,'UPDATE',old,next);return next;}));}
 @Delete('assets/:id')async delete(@Param('id',new ZodPipe(idSchema))id:string,@CurrentUser()u:RequestUser){const asset=await db.productAsset.findUnique({where:{id}});if(!asset)throw new NotFoundException('Imagen inexistente');await db.$transaction(async tx=>{await tx.productAsset.delete({where:{id}});
  // Si la que se borró era la principal, asciende otra: un producto no puede
  // quedar con imágenes cargadas y ninguna elegida como principal.
  if(asset.isPrimary){const next=await tx.productAsset.findFirst({where:{productId:asset.productId},orderBy:[{status:'asc'},{createdAt:'desc'}]});if(next)await tx.productAsset.update({where:{id:next.id},data:{isPrimary:true}});}
  await audit(tx,u.id,id,'DELETE',asset,null);});if(asset.storageKey)try{await(await loadMediaStorage()).delete(asset.storageKey);}catch{}return{ok:true};}
 @Get('thumbnail-templates')async thumbnailTemplates(){return jsonSafe(await db.thumbnailTemplate.findMany({orderBy:[{active:'desc'},{createdAt:'desc'}]}));}
 @Post('thumbnail-templates')async createThumbnailTemplate(@Body(new ZodPipe(thumbnailTemplateCreateSchema))body:ThumbnailTemplateCreateInput,@CurrentUser()u:RequestUser){return jsonSafe(await db.$transaction(async tx=>{const next=await tx.thumbnailTemplate.create({data:{name:body.name,rulesJson:body.rules as any}});await audit(tx,u.id,next.id,'CREATE',null,next,'ThumbnailTemplate');return next;}));}
 @Post('thumbnail-templates/:id/image')async uploadThumbnailTemplateImage(@Param('id',new ZodPipe(idSchema))id:string,@Req()req:any,@CurrentUser()u:RequestUser){const old=await db.thumbnailTemplate.findUnique({where:{id}});if(!old)throw new NotFoundException('Plantilla inexistente');if(typeof req.file!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');const part=await req.file();if(!part)throw new BadRequestException('Seleccioná una imagen de plantilla');const mimetype=String(part.mimetype??'');if(!mimetype.startsWith('image/'))throw new BadRequestException('El archivo debe ser una imagen');const buffer=await part.toBuffer();if(!buffer.length)throw new BadRequestException('La imagen está vacía');const storage=await loadMediaStorage();const stored=await storage.put(`thumbnail-templates/${id}/${randomUUID()}.${ext(String(part.filename??''),mimetype)}`,buffer,mimetype);const next=await db.$transaction(async tx=>{const saved=await tx.thumbnailTemplate.update({where:{id},data:{templateImageUrl:stored.url,templateKey:stored.key}});await audit(tx,u.id,id,'UPLOAD_IMAGE',old,saved,'ThumbnailTemplate');return saved;});if(old.templateKey)try{await storage.delete(old.templateKey);}catch{}return jsonSafe(next);}
 @Put('thumbnail-templates/:id')async updateThumbnailTemplate(@Param('id',new ZodPipe(idSchema))id:string,@Body(new ZodPipe(thumbnailTemplateUpdateSchema))body:ThumbnailTemplateUpdateInput,@CurrentUser()u:RequestUser){return jsonSafe(await db.$transaction(async tx=>{const old=await tx.thumbnailTemplate.findUnique({where:{id}});if(!old)throw new NotFoundException('Plantilla inexistente');const next=await tx.thumbnailTemplate.update({where:{id},data:{...(body.name!==undefined?{name:body.name}:{}),...(body.rules!==undefined?{rulesJson:body.rules as any}:{}),...(body.fonts!==undefined?{fontsJson:body.fonts as any}:{}),...(body.active!==undefined?{active:body.active}:{})}});await audit(tx,u.id,id,'UPDATE',old,next,'ThumbnailTemplate');return next;}));}
 @Delete('thumbnail-templates/:id')async deleteThumbnailTemplate(@Param('id',new ZodPipe(idSchema))id:string,@CurrentUser()u:RequestUser){const old=await db.thumbnailTemplate.findUnique({where:{id}});if(!old)throw new NotFoundException('Plantilla inexistente');await db.$transaction(async tx=>{await tx.thumbnailTemplate.delete({where:{id}});await audit(tx,u.id,id,'DELETE',old,null,'ThumbnailTemplate');});if(old.templateKey)try{await(await loadMediaStorage()).delete(old.templateKey);}catch{}return{ok:true};}
 @Post('products/:productId/thumbnail')async generateThumbnail(@Param('productId',new ZodPipe(idSchema))productId:string,@Body(new ZodPipe(thumbnailGenerateSchema))body:ThumbnailGenerateInput){await requireProduct(productId);const[product,template,asset]=await Promise.all([db.product.findUnique({where:{id:productId},select:{name:true}}),db.thumbnailTemplate.findUnique({where:{id:body.templateId}}),db.productAsset.findFirst({where:{productId,status:'READY',url:{not:null}},orderBy:[{isPrimary:'desc'},{createdAt:'desc'}]})]);if(!template)throw new NotFoundException('Plantilla inexistente');if(!template.active)throw new BadRequestException('La plantilla está inactiva');if(!asset?.url)throw new BadRequestException('El producto no tiene una imagen principal lista');const parsed=thumbnailRulesSchema.safeParse(template.rulesJson);if(!parsed.success)throw new BadRequestException('Las reglas guardadas de la plantilla no son válidas');const rules:ThumbnailRules=parsed.data;const productBuffer=await downloadBytes(asset.url,'la imagen del producto');let backgroundBuffer:Buffer|null=null;let generatedBackground=false;if(body.useHiggsfield)try{backgroundBuffer=await generateBackground(body.higgsfieldPrompt??body.title??product?.name??'Fondo de producto tecnológico',{width:rules.width,height:rules.height},await getHiggsfieldKey());generatedBackground=true;}catch{}if(!backgroundBuffer&&template.templateImageUrl)backgroundBuffer=await downloadBytes(template.templateImageUrl,'la imagen de plantilla');const title=body.title??product?.name??'';const texts=rules.texts.map(text=>({value:text.source==='title'?title:text.value??'',x:text.x,y:text.y,fontSize:text.fontSize,color:text.color,...(text.fontFamily?{fontFamily:text.fontFamily}:{}),...(text.align?{align:text.align}:{})}));const renderRules=generatedBackground?{...rules,background:{type:'template' as const}}:rules;const output=await renderThumbnail({rules:renderRules,backgroundBuffer,productBuffer,texts});const stored=await(await loadMediaStorage()).put(`thumbnails/${productId}/${randomUUID()}.jpg`,output,'image/jpeg');return{url:stored.url};}
 @Get('products/:productId/case-model')async caseModel(@Param('productId',new ZodPipe(idSchema))productId:string){await requireProduct(productId);return jsonSafe(await db.caseModel3D.findUnique({where:{productId}}));}
 @Post('products/:productId/case-model/upload')async uploadCaseModel(@Param('productId',new ZodPipe(idSchema))productId:string,@Req()req:any,@CurrentUser()u:RequestUser){
  await requireProduct(productId);if(typeof req.file!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');const part=await req.file();if(!part)throw new BadRequestException('Seleccioná un modelo GLB');const extension=modelExt(String(part.filename??''));if(!extension)throw new BadRequestException('El archivo debe tener extensión .glb o .gltf');const mimetype=String(part.mimetype??'').toLowerCase();const tolerated=['model/gltf-binary','model/gltf+json','application/octet-stream','application/gltf-buffer',''];if(!tolerated.includes(mimetype))throw new BadRequestException('El tipo de archivo no corresponde a un modelo GLB/GLTF');const buffer=await part.toBuffer();if(!buffer.length)throw new BadRequestException('El modelo está vacío');
  const stored=await(await loadMediaStorage()).put(`case-models/${productId}/upload-${randomUUID()}.${extension}`,buffer,extension==='glb'?'model/gltf-binary':'model/gltf+json');const previous=await db.caseModel3D.findUnique({where:{productId}});const next=await db.$transaction(async tx=>{const saved=await tx.caseModel3D.upsert({where:{productId},create:{productId,source:'UPLOAD',glbUrl:stored.url,glbKey:stored.key,status:'READY',sourcePhotos:[]},update:{source:'UPLOAD',glbUrl:stored.url,glbKey:stored.key,status:'READY',sourcePhotos:[],tripoJobId:null}});await audit(tx,u.id,saved.id,'UPLOAD',previous,saved,'CaseModel3D');return saved;});return jsonSafe(next);
 }
 @Post('products/:productId/case-model/tripo')async tripoCaseModel(@Param('productId',new ZodPipe(idSchema))productId:string,@Req()req:any,@CurrentUser()u:RequestUser){
  await requireProduct(productId);if(typeof req.files!=='function')throw new BadRequestException('Upload multipart no disponible en el servidor');const files:Array<{buffer:Buffer;extension:string;mimetype:string}>=[];for await(const part of req.files()){if(part.fieldname!=='photos')continue;const mimetype=String(part.mimetype??'');if(!mimetype.startsWith('image/'))throw new BadRequestException('Todos los archivos deben ser imágenes');if(files.length>=4)throw new BadRequestException('Podés subir hasta 4 fotos');const buffer=await part.toBuffer();if(!buffer.length)throw new BadRequestException('Una de las fotos está vacía');files.push({buffer,extension:ext(String(part.filename??''),mimetype),mimetype});}if(files.length<1)throw new BadRequestException('Seleccioná entre 1 y 4 fotos');
  const storage=await loadMediaStorage();const urls:string[]=[];for(const file of files){const stored=await storage.put(`case-photos/${productId}/${randomUUID()}.${file.extension}`,file.buffer,file.mimetype);urls.push(stored.url);}const previous=await db.caseModel3D.findUnique({where:{productId}});const next=await db.$transaction(async tx=>{const saved=await tx.caseModel3D.upsert({where:{productId},create:{productId,source:'TRIPO',sourcePhotos:urls,status:'PENDING'},update:{source:'TRIPO',sourcePhotos:urls,status:'PENDING',glbUrl:null,glbKey:null,tripoJobId:null}});await audit(tx,u.id,saved.id,'GENERATE_TRIPO',previous,saved,'CaseModel3D');return saved;});await enqueueJob('case-model:tripo',{caseModelId:next.id},{entityType:'CaseModel3D',entityId:next.id});return jsonSafe(next);
 }
 @Delete('case-model/:id')async deleteCaseModel(@Param('id',new ZodPipe(idSchema))id:string,@CurrentUser()u:RequestUser){const model=await db.caseModel3D.findUnique({where:{id}});if(!model)throw new NotFoundException('Modelo 3D inexistente');await db.$transaction(async tx=>{await tx.caseModel3D.delete({where:{id}});await audit(tx,u.id,id,'DELETE',model,null,'CaseModel3D');});try{const storage=await loadMediaStorage();const keys=(await Promise.all(model.sourcePhotos.map(ownStorageKey))).filter((key):key is string=>Boolean(key));if(model.glbKey)keys.push(model.glbKey);for(const key of new Set(keys))try{await storage.delete(key);}catch{}}catch{}return{ok:true};}
 @Get('wp-plugin/download')downloadWpPlugin(){const zip=resolveWpPluginZip();if(!zip)throw new NotFoundException('ZIP del plugin no encontrado. Ejecutá `pnpm wp-plugin:zip` en el servidor.');return new StreamableFile(createReadStream(zip),{type:'application/zip',disposition:'attachment; filename="tgs-smart-quotes.zip"'});}
 // ---------------------------------------------------------- publicación
 // La publicación es por presupuesto (familia). Devuelve también qué versión
 // está en la tienda y cuál es la activa, para que el panel avise cuando la
 // tienda quedó mostrando una versión anterior.
 /**
  * Todas las publicaciones en una sola respuesta, indexadas por presupuesto.
  * El listado pedía una por PC y con muchas PCs se pasaba del rate limit
  * ("Demasiadas solicitudes").
  */
 @Get('publications')async publications(){const families=await db.quoteFamily.findMany({where:{isBuiltPc:true},select:{id:true,activeVersion:true,webTitle:true,webTagline:true,versions:{select:{id:true,version:true}},webPublication:true}});const out:Record<string,unknown>={};for(const family of families){const active=family.versions.find(v=>v.version===family.activeVersion)??family.versions[0]??null;const publication=family.webPublication;const published=publication?family.versions.find(v=>v.id===publication.quoteVersionId)??null:null;out[family.id]={...(publication??{status:'DRAFT',url:null,lastError:null,lastErrorAt:null,publishedAt:null,wpProductId:null,thumbnailUrl:null,quoteVersionId:null}),quoteFamilyId:family.id,webTitle:family.webTitle,webTagline:family.webTagline,publishedVersionNumber:published?.version??null,activeVersionId:active?.id??null,activeVersionNumber:active?.version??null,isStale:Boolean(publication?.status==='PUBLISHED'&&published&&active&&published.id!==active.id)};}return jsonSafe(out);}
 @Get('quote-families/:familyId/publication')async publication(@Param('familyId',new ZodPipe(idSchema))familyId:string){return jsonSafe(await publicationView(familyId));}
 @Post('quote-families/:familyId/publish')async publish(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Body(new ZodPipe(publishBodySchema))body:{versionId?:string|null},@CurrentUser()u:RequestUser){await requireFamily(familyId);const old=await db.webPublication.findUnique({where:{quoteFamilyId:familyId}});try{const{webPublication}=await publishQuote(familyId,{versionId:body.versionId??null});await db.$transaction(tx=>audit(tx,u.id,webPublication.id,'PUBLISH',old,webPublication,'WebPublication'));return jsonSafe(await publicationView(familyId));}catch(error){throw translateWordpressError(error);}}
 @Post('quote-families/:familyId/unpublish')async unpublish(@Param('familyId',new ZodPipe(idSchema))familyId:string,@CurrentUser()u:RequestUser){await requireFamily(familyId);const old=await db.webPublication.findUnique({where:{quoteFamilyId:familyId}});try{const next=await unpublishQuote(familyId);if(next)await db.$transaction(tx=>audit(tx,u.id,next.id,'UNPUBLISH',old,next,'WebPublication'));}catch(error){throw translateWordpressError(error);}return jsonSafe(await publicationView(familyId));}
 // "Preparar y publicar": completa lo que falta y publica, en segundo plano.
 @Post('quote-families/:familyId/prepare')async prepare(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Body(new ZodPipe(prepareBodySchema))body:{versionId?:string|null;publish?:boolean},@CurrentUser()u:RequestUser){await requireFamily(familyId);let versionId:string;try{versionId=await resolvePublishVersionId(familyId,body.versionId??null);}catch(error){throw translateWordpressError(error);}try{const run=await startPublishRun({familyId,versionId,userId:u.id,publish:body.publish!==false});await db.$transaction(tx=>audit(tx,u.id,run.id,'PREPARE',null,{familyId,versionId,publish:body.publish!==false},'WebPublishRun'));return jsonSafe(run);}catch(error){if(error instanceof PublishRunConflictError)throw new ConflictException(error.message);throw error;}}
 /**
  * Regenera título (formato de specs) y bajada a pedido, sin correr todo el
  * pipeline. Con `apply` los guarda en el presupuesto pisando lo que había;
  * si no, solo los devuelve como propuesta. Reusa el enriquecimiento (la IA
  * cachea por hash de ítems, así que repetirlo no cuesta si no cambió nada).
  */
 @Post('quote-families/:familyId/generate-title')async generateTitle(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Body(new ZodPipe(generateTitleBodySchema))body:{versionId?:string|null;apply?:boolean},@CurrentUser()u:RequestUser){const family=await db.quoteFamily.findUnique({where:{id:familyId}});if(!family)throw new NotFoundException('Presupuesto inexistente');let versionId:string;try{versionId=await resolvePublishVersionId(familyId,body.versionId??null);}catch(error){throw translateWordpressError(error);}const items=await loadEnrichmentItems(versionId);if(!items.length)throw new BadRequestException('El presupuesto no tiene ítems');let title=buildStoreTitle(items);let tagline:string|null=null;let ai={usedAi:false,cacheHit:false,model:null as string|null};try{const result=await runQuoteEnrichment(versionId,u.id);title=result.enrichment.title??title;tagline=result.enrichment.tagline??null;ai=result.ai;}catch(error){// Sin IA igual hay título por reglas; se avisa que la bajada no se pudo generar.
if(!title)throw error instanceof Error?new BadRequestException(error.message):error;}if(!title)throw new BadRequestException('No se pudo leer el procesador de los componentes para armar el título');if(body.apply){const next=await db.$transaction(async tx=>{const saved=await tx.quoteFamily.update({where:{id:familyId},data:{webTitle:title,...(tagline?{webTagline:tagline}:{})}});await audit(tx,u.id,familyId,'GENERATE_TITLE',{webTitle:family.webTitle,webTagline:family.webTagline},{webTitle:saved.webTitle,webTagline:saved.webTagline},'QuoteFamily');return saved;});return jsonSafe({title,tagline,applied:true,webTitle:next.webTitle,webTagline:next.webTagline,ai});}return jsonSafe({title,tagline,applied:false,webTitle:family.webTitle,webTagline:family.webTagline,ai});}
 @Get('quote-families/:familyId/prepare/latest')async latestRun(@Param('familyId',new ZodPipe(idSchema))familyId:string){await requireFamily(familyId);const run=await db.webPublishRun.findFirst({where:{quoteFamilyId:familyId},orderBy:{startedAt:'desc'},select:{id:true}});return jsonSafe(run?await loadPublishRun(run.id):null);}
 @Get('publish-runs/:runId')async publishRun(@Param('runId',new ZodPipe(idSchema))runId:string){const run=await loadPublishRun(runId);if(!run)throw new NotFoundException('Corrida inexistente');return jsonSafe(run);}
 @Get('quote-families/:familyId/publish-preview')async publishPreview(@Param('familyId',new ZodPipe(idSchema))familyId:string,@Query(new ZodPipe(previewQuerySchema))query:{versionId?:string}){await requireFamily(familyId);try{return jsonSafe(await buildPublishPayload(familyId,query.versionId??null));}catch(error){throw translateWordpressError(error);}}
 @Get('quotes/:versionId/payload')async quotePayload(@Param('versionId',new ZodPipe(idSchema))versionId:string){const version=await quoteVersion(versionId);const company=await db.companySettings.findUniqueOrThrow({where:{id:'singleton'}});const activePlans=await db.financingPlan.findMany({where:{active:true},orderBy:{sortOrder:'asc'}});const snapshot=version.financingSnapshot;const plans=Array.isArray(snapshot)?snapshot:(snapshot&&typeof snapshot==='object'&&Array.isArray((snapshot as any).plans)?(snapshot as any).plans:activePlans);const list=installmentTotal(version.totalSaleCents,company.listInterestBps);return jsonSafe({externalId:version.family.id,familyId:version.family.id,versionId:version.id,visibleNumber:version.family.visibleNumber,version:version.version,items:version.items.map(item=>({name:item.frozenName,quantity:item.quantity,unitPriceCents:item.frozenSalePriceCents,subtotalCents:item.subtotalCents})),price:{listCents:list,cashCents:version.totalSaleCents,transferCents:version.totalSaleCents,currency:'ARS'},installmentPlans:plans.map((plan:any)=>{const total=installmentTotal(list,Number(plan.interestBps??0));return{bank:plan.bank??null,installments:Number(plan.installments),interestBps:Number(plan.interestBps??0),totalCents:total,installmentCents:(total+BigInt(Number(plan.installments))/2n)/BigInt(Number(plan.installments))};}),financingSnapshot:version.financingSnapshot});}
 // Payload exacto que se le manda a WordPress al publicar. La vista previa de
 // la app lo consume para mostrar lo que realmente se va a publicar (mismos
 // textos, precios, imagenes y tokens de diseno), en vez de una maqueta aparte.
 // Revisión de recortes a pedido: rehace con el modelo las fotos que no fueron recortadas con él (force: todas).
 @Post('quotes/:versionId/recut-images')async recutImages(@Param('versionId',new ZodPipe(idSchema))versionId:string,@Body(new ZodPipe(z.object({force:z.boolean().optional()}).strict().optional()))body:{force?:boolean}|undefined,@CurrentUser()u:RequestUser){await quoteVersion(versionId);const job=startRecutJob(versionId,u.id,{force:Boolean(body?.force)});return{jobId:job.id,status:job.status};}
 @Get('recut-jobs/:jobId')async recutJob(@Param('jobId',new ZodPipe(idSchema))jobId:string){const job=getRecutJob(jobId);if(!job)throw new NotFoundException('Revisión inexistente (o ya vencida)');return{jobId:job.id,status:job.status,...(job.summary?{...job.summary,detail:job.detail}:{}),...(job.error?{error:job.error}:{})};}
 @Get('quotes/:versionId/enrichment')async getEnrichment(@Param('versionId',new ZodPipe(idSchema))versionId:string){await quoteVersion(versionId);return jsonSafe(await db.quoteEnrichment.findUnique({where:{quoteVersionId:versionId}}));}
 @Post('quotes/:versionId/enrich')async enrichQuote(@Param('versionId',new ZodPipe(idSchema))versionId:string,@CurrentUser()u:RequestUser){const version=await quoteVersion(versionId);if(!version.items.length)throw new BadRequestException('El presupuesto no tiene ítems');const{enrichment,ai}=await runQuoteEnrichment(versionId,u.id);return jsonSafe({...enrichment,ai});}
 @Put('quotes/:versionId/enrichment')async updateEnrichment(@Param('versionId',new ZodPipe(idSchema))versionId:string,@Body(new ZodPipe(quoteEnrichmentUpdateSchema))body:QuoteEnrichmentUpdateInput,@CurrentUser()u:RequestUser){await quoteVersion(versionId);const old=await db.quoteEnrichment.findUnique({where:{quoteVersionId:versionId}});const data=enrichmentData(body);const next=await db.$transaction(async tx=>{const saved=await tx.quoteEnrichment.upsert({where:{quoteVersionId:versionId},create:{quoteVersionId:versionId,...data},update:data});await audit(tx,u.id,saved.id,'UPDATE',old,saved,'QuoteEnrichment');return saved;});return jsonSafe(next);}
}
