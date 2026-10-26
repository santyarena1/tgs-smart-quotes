import { api } from "./api";
import { protectedCollectionsOf } from "./collection-protection";
import type { Collection } from "./types";

/**
 * Colecciones protegidas que contienen el presupuesto, leídas del servidor en el momento de guardar
 * (el candado pudo cambiar desde que se cargó la pantalla). Si falla la consulta se usa la lista que ya había.
 */
export async function currentProtectedCollections(familyId: string, known: readonly Collection[]): Promise<Collection[]> {
  try {
    return protectedCollectionsOf(await api<Collection[]>("/collections"), familyId);
  } catch {
    return protectedCollectionsOf(known, familyId);
  }
}
