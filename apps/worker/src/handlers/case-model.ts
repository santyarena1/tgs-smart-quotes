import { db, type ProcessingJob } from '@tgs/database';
import { generateModelFromImages, getTripoKey } from '@tgs/providers';
import { loadMediaStorage } from '@tgs/storage';

export async function generateCaseModelWithTripo(job: ProcessingJob) {
  const caseModelId = typeof job.payload === 'object' && job.payload && 'caseModelId' in job.payload ? (job.payload as { caseModelId?: unknown }).caseModelId : null;
  if (typeof caseModelId !== 'string') throw new Error('Payload inválido: falta caseModelId');
  try {
    const model = await db.caseModel3D.findUnique({ where: { id: caseModelId } });
    if (!model) throw new Error('El modelo 3D del gabinete no existe');
    if (model.sourcePhotos.length < 1 || model.sourcePhotos.length > 4) throw new Error('El modelo requiere entre 1 y 4 fotos de origen');
    await db.caseModel3D.update({ where: { id: model.id }, data: { status: 'PROCESSING' } });
    const glb = await generateModelFromImages(model.sourcePhotos, await getTripoKey());
    const stored = await (await loadMediaStorage()).put(`case-models/${model.productId}/${model.id}.glb`, glb, 'model/gltf-binary');
    return db.caseModel3D.update({ where: { id: model.id }, data: { glbUrl: stored.url, glbKey: stored.key, status: 'READY' } });
  } catch (error) {
    await db.caseModel3D.updateMany({ where: { id: caseModelId }, data: { status: 'FAILED' } });
    throw error;
  }
}
