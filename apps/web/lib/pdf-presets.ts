import type { PdfLayoutDocument } from "./types";

export type PdfPreset = {
  id: string;
  name: string;
  description: string;
  /** Sin `document` = diseño original de la plantilla. */
  document?: PdfLayoutDocument;
};

/** Estilos listos para aplicar: sólo tocan el estilo global, no las posiciones de los bloques. */
export const PDF_PRESETS: PdfPreset[] = [
  { id: "original", name: "Original", description: "El diseño histórico de la plantilla." },
  {
    id: "tgs-rojo",
    name: "TGS rojo",
    description: "Acento rojo de marca, tabla con cabecera roja.",
    document: {
      accentColor: "#d4171e", tableHeaderBg: "#d4171e", tableHeaderColor: "#ffffff",
      tableZebra: true, cardRadius: 6,
    },
  },
  {
    id: "azul-corporativo",
    name: "Azul corporativo",
    description: "Sobrio, con acento azul y filas alternadas.",
    document: {
      accentColor: "#1b4f91", tableHeaderBg: "#1b4f91", tableHeaderColor: "#ffffff",
      tableBorderColor: "#c9d6e8", tableZebra: true, cardRadius: 8, cardBackground: "#f5f8fd",
      cardBorderColor: "#c9d6e8",
    },
  },
  {
    id: "oscuro",
    name: "Oscuro elegante",
    description: "Cabecera negra y acento dorado.",
    document: {
      accentColor: "#9a6a00", tableHeaderBg: "#14161b", tableHeaderColor: "#ffffff",
      textColor: "#14161b", cardRadius: 4, cardBackground: "#fafafa",
    },
  },
  {
    id: "minimal",
    name: "Minimalista",
    description: "Gris suave, sin fondos, mucho aire.",
    document: {
      accentColor: "#363b45", tableHeaderBg: "#eef0f4", tableHeaderColor: "#14161b",
      tableBorderColor: "#e6e8ec", tableDensity: "comfortable", cardRadius: 0,
      cardBackground: "#ffffff", cardBorderColor: "#e6e8ec", fontFamily: "Helvetica",
    },
  },
  {
    id: "compacto",
    name: "Compacto",
    description: "Filas ajustadas para presupuestos largos.",
    document: { tableDensity: "compact", cardRadius: 3 },
  },
];

/** Devuelve el preset cuyo `document` coincide exactamente con el actual, si hay uno. */
export function matchingPresetId(document: PdfLayoutDocument | undefined): string | null {
  const current = JSON.stringify(sortKeys(document ?? {}));
  const found = PDF_PRESETS.find((preset) => JSON.stringify(sortKeys(preset.document ?? {})) === current);
  return found?.id ?? null;
}

function sortKeys(value: object): object {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
