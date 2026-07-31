import { describe, expect, it } from "vitest";
import { parseAcustockFeed, parseAcustockPriceToCents } from "./acustock.js";

describe("AcuStock feed", () => {
  it("convierte el formato monetario argentino a centavos", () => {
    expect(parseAcustockPriceToCents("21.362,31 ARS")).toBe(2_136_231n);
    expect(parseAcustockPriceToCents("10 ARS")).toBe(1_000n);
  });

  it("mapea opcionales, medidas y tags con tipo", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item>
          <mpn>ABC_1</mpn><title>Mouse</title><description>Mouse USB</description>
          <price>21.362,31 ARS</price><sale_price>20.000,00 ARS</sale_price>
          <availability>in_stock</availability><stock_quantity>5</stock_quantity>
          <brand>Acme</brand><product_type>Accesorios</product_type>
          <weight>0.2</weight><length>10</length><width>5</width><height>3</height>
          <tags><tag tipo="proveedor">Disponible en 24hs</tag></tags>
        </item>
        <acustock_feed_end complete="1"><items>1</items><generated_at>2026-07-28</generated_at></acustock_feed_end>
      </channel></rss>`;
    const result = parseAcustockFeed(xml);
    expect(result.products[0]).toMatchObject({
      mpn: "ABC_1",
      priceCents: 2_136_231n,
      salePriceCents: 2_000_000n,
      stockQuantity: 5,
      weightKg: 0.2,
      tags: ["proveedor: Disponible en 24hs"],
    });
  });
});
