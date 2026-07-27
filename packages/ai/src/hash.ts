import { createHash } from "node:crypto";

/** Serializa valores de forma estable para cache (claves ordenadas, BigInt → string). */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const key of sorted) {
      const entry = record[key];
      if (entry !== undefined) {
        out[key] = canonicalize(entry);
      }
    }
    return out;
  }
  return value;
}

/** SHA-256 del JSON canónico de la entrada (cache AiRequest / SimilarityCache). */
export function inputHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}
