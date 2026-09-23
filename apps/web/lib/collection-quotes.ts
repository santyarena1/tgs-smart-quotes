export type CollectionQuoteRef = {
  id: string;
  visibleNumber: string;
  internalName: string;
  customerName?: string | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Acepta el resumen de la API o la fila cruda `{ familyId, family: { ... } }`. */
export function normalizeCollectionQuote(raw: unknown): CollectionQuoteRef | null {
  const row = record(raw);
  if (!row) return null;
  const family = record(row.family);
  const customer =
    record(row.customer) ??
    (family ? record(family.customer) : null);
  const id = text(row.familyId) || text(row.id) || text(family?.id);
  if (!id) return null;
  return {
    id,
    visibleNumber: text(row.visibleNumber) || text(family?.visibleNumber),
    internalName: text(row.internalName) || text(family?.internalName),
    customerName: text(row.customerName) || text(customer?.name) || null,
  };
}

export function quoteCollectionLabel(quote: CollectionQuoteRef): string {
  const number = quote.visibleNumber.trim() || "—";
  const name = quote.internalName.trim() || "Sin nombre";
  const customer = quote.customerName?.trim();
  const title = `${number} · ${name}`;
  return customer ? `${title} (${customer})` : title;
}

/** Presupuestos de la colección, en el orden de `familyIds`. */
export function quotesForCollection<T extends CollectionQuoteRef>(
  quotes: readonly T[],
  familyIds: readonly string[],
): T[] {
  const byId = new Map(quotes.map((quote) => [quote.id, quote]));
  return familyIds.flatMap((id) => {
    const quote = byId.get(id);
    return quote ? [quote] : [];
  });
}

export function associatedQuotesOf(
  collection: { familyIds?: readonly string[]; quotes?: readonly unknown[] },
  catalog: readonly CollectionQuoteRef[] = [],
): CollectionQuoteRef[] {
  const byId = new Map<string, CollectionQuoteRef>();
  for (const quote of catalog) byId.set(quote.id, quote);
  for (const raw of collection.quotes ?? []) {
    const quote = normalizeCollectionQuote(raw);
    if (!quote) continue;
    const previous = byId.get(quote.id);
    byId.set(quote.id, {
      id: quote.id,
      visibleNumber: quote.visibleNumber || previous?.visibleNumber || "",
      internalName: quote.internalName || previous?.internalName || "",
      customerName: quote.customerName || previous?.customerName || null,
    });
  }
  const ids =
    collection.familyIds && collection.familyIds.length > 0
      ? collection.familyIds
      : [...byId.keys()];
  return quotesForCollection([...byId.values()], ids);
}

export function quotesMatchingQuery<T extends CollectionQuoteRef>(
  quotes: readonly T[],
  query: string,
  excludeIds: ReadonlySet<string>,
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return quotes
    .filter((quote) => {
      if (excludeIds.has(quote.id)) return false;
      return (
        quote.visibleNumber.toLowerCase().includes(q) ||
        quote.internalName.toLowerCase().includes(q) ||
        (quote.customerName ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, limit);
}
