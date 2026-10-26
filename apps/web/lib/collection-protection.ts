import type { Collection } from "./types";

/** Una colección sin el dato (versiones viejas del servidor) se considera protegida. */
export function isCollectionProtected(collection: Pick<Collection, "isProtected">): boolean {
  return collection.isProtected !== false;
}

/** Colecciones protegidas que contienen el presupuesto: si hay alguna, editarlo tiene que crear una copia. */
export function protectedCollectionsOf<T extends Pick<Collection, "isProtected" | "familyIds">>(
  collections: readonly T[],
  familyId: string,
): T[] {
  return collections.filter((c) => isCollectionProtected(c) && (c.familyIds ?? []).includes(familyId));
}

export function protectionNotice(collection: { name: string }, on: boolean): string {
  return on
    ? `Protección activada en la colección: ${collection.name}`
    : `Protección desactivada en la colección: ${collection.name}`;
}

/** Aviso al guardar una copia en lugar de modificar el original. */
export function copyInsteadNotice(visibleNumber: string, names: readonly string[]): string {
  return `${visibleNumber} está en ${names.length > 1 ? "las colecciones protegidas" : "la colección protegida"} ${names.map((n) => `“${n}”`).join(", ")}: se creó un presupuesto nuevo con tus cambios y el original quedó intacto.`;
}
