export type CollectionQuoteRef = {
  id: string;
  visibleNumber: string;
  internalName: string;
  customerName?: string | null;
};

export function quoteCollectionLabel(quote: CollectionQuoteRef): string {
  const customer = quote.customerName?.trim();
  const title = `${quote.visibleNumber} · ${quote.internalName}`;
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
