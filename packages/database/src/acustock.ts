import { XMLParser } from "fast-xml-parser";
import { db } from "./client.js";

export type AcustockFeedProduct = {
  mpn: string;
  title: string;
  description: string;
  priceCents: bigint;
  salePriceCents: bigint | null;
  stockQuantity: number;
  availability: string;
  brand: string | null;
  productType: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  tags: string[];
};

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
});

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "#text" in (value as XmlRecord)) {
    return text((value as XmlRecord)["#text"]);
  }
  return String(value).trim();
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function optionalNumber(value: unknown): number | null {
  const raw = text(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseAcustockPriceToCents(value: string): bigint {
  const normalized = value
    .trim()
    .replace(/\s*ARS\s*$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Precio AcuStock inválido: ${value}`);
  }
  const [pesos, decimals = ""] = normalized.split(".");
  return BigInt(pesos!) * 100n + BigInt(decimals.padEnd(2, "0"));
}

function parseTags(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const rawTags = (value as XmlRecord).tag;
  const tags = Array.isArray(rawTags) ? rawTags : rawTags == null ? [] : [rawTags];
  return tags
    .map((tag) => {
      if (typeof tag !== "object" || tag == null) return text(tag);
      const record = tag as XmlRecord;
      const label = text(record["#text"]);
      const type = text(record["@_tipo"]);
      return label ? (type ? `${type}: ${label}` : label) : "";
    })
    .filter(Boolean);
}

function mapItem(item: XmlRecord): AcustockFeedProduct {
  const mpn = text(item.mpn);
  if (!mpn) throw new Error("El feed contiene un producto sin MPN");
  const price = text(item.price);
  if (!price) throw new Error(`El producto ${mpn} no tiene precio`);
  const quantity = Number.parseInt(text(item.stock_quantity) || "0", 10);
  return {
    mpn,
    title: text(item.title) || mpn,
    description: text(item.description),
    priceCents: parseAcustockPriceToCents(price),
    salePriceCents: optionalText(item.sale_price)
      ? parseAcustockPriceToCents(text(item.sale_price))
      : null,
    stockQuantity: Number.isFinite(quantity) ? quantity : 0,
    availability: text(item.availability) || text(item.stock_status) || "unknown",
    brand: optionalText(item.brand),
    productType: optionalText(item.product_type),
    imageUrl: optionalText(item.image_link),
    productUrl: optionalText(item.link ?? item["g:link"]),
    weightKg: optionalNumber(item.weight),
    lengthCm: optionalNumber(item.length),
    widthCm: optionalNumber(item.width),
    heightCm: optionalNumber(item.height),
    tags: parseTags(item.tags),
  };
}

export function parseAcustockFeed(xml: string): {
  products: AcustockFeedProduct[];
  generatedAt: string | null;
} {
  const document = parser.parse(xml) as XmlRecord;
  const channel = ((document.rss as XmlRecord | undefined)?.channel ?? null) as XmlRecord | null;
  if (!channel) throw new Error("El XML de AcuStock no contiene rss/channel");
  const end = channel.acustock_feed_end as XmlRecord | undefined;
  if (!end || text(end["@_complete"] ?? end.complete) !== "1") {
    throw new Error("El feed de AcuStock está incompleto");
  }
  const rawItems = Array.isArray(channel.item)
    ? channel.item
    : channel.item == null
      ? []
      : [channel.item];
  const products = rawItems.map((item) => mapItem(item as XmlRecord));
  const expected = Number.parseInt(text(end.items), 10);
  if (Number.isFinite(expected) && products.length !== expected) {
    throw new Error(`Feed AcuStock incompleto: esperaba ${expected} productos y recibió ${products.length}`);
  }
  return { products, generatedAt: optionalText(end.generated_at) };
}

export async function syncAcustockCatalog(feedUrl = process.env.ACUSTOCK_FEED_URL) {
  if (!feedUrl) throw new Error("Falta configurar ACUSTOCK_FEED_URL");
  const response = await fetch(feedUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`AcuStock respondió HTTP ${response.status}`);
  const { products, generatedAt } = parseAcustockFeed(await response.text());
  const syncedAt = new Date();
  const batchSize = 100;

  for (let offset = 0; offset < products.length; offset += batchSize) {
    const batch = products.slice(offset, offset + batchSize);
    await db.$transaction(
      batch.map((product) =>
        db.acustockProduct.upsert({
          where: { mpn: product.mpn },
          create: { ...product, lastSyncedAt: syncedAt },
          update: { ...product, lastSyncedAt: syncedAt },
        }),
      ),
    );
  }

  const currentMpns = products.map((product) => product.mpn);
  const discontinued = await db.acustockProduct.updateMany({
    where: { mpn: { notIn: currentMpns }, lastSyncedAt: { lt: syncedAt } },
    data: { stockQuantity: 0, availability: "discontinued" },
  });

  return {
    synced: products.length,
    discontinued: discontinued.count,
    syncedAt: syncedAt.toISOString(),
    generatedAt,
  };
}
