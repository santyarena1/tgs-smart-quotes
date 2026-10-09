/**
 * Temas visuales. Solo cambian el aspecto (colores, fuentes, animaciones, detalles, barras): nunca la estructura.
 * El tema se guarda por usuario (columna User.uiSkin) y se recuerda por navegador para pintar sin parpadeo.
 */
export type SkinId = "original" | "tgs" | "minimal" | "bluered" | "darkyellow" | "gamer" | "gotham" | "simplicity";

export const DEFAULT_SKIN: SkinId = "tgs";
export const SKIN_STORAGE_KEY = "tgs.skin";

type Palette = { bg: string; card: string; ink: string; muted: string; line: string; side: string; accent: string; accent2: string };

export type SkinDef = {
  id: SkinId;
  name: string;
  tagline: string;
  description: string;
  /** Cómo se ven los títulos y el texto, para la vista previa. */
  fonts: { display: string; body: string };
  effects: "Sin efectos" | "Sutiles" | "Con efectos" | "Extremos";
  bar: string;
  light: Palette;
  dark: Palette;
};

export const SKINS: SkinDef[] = [
  {
    id: "original",
    name: "Original",
    tagline: "La interfaz de siempre",
    description: "El diseño clásico de antes de los temas: sobrio, con el rojo de la marca, sin fondo animado y con las barras fijas como siempre.",
    fonts: { display: "Bahnschrift, 'Segoe UI Semibold', Arial, sans-serif", body: "'Segoe UI', Candara, system-ui, sans-serif" },
    effects: "Sin efectos",
    bar: "Barras fijas",
    light: { bg: "#eef0f4", card: "#ffffff", ink: "#14161b", muted: "#6b7280", line: "#e6e8ec", side: "#191c22", accent: "#d4171e", accent2: "#a91016" },
    dark: { bg: "#101217", card: "#1a1d24", ink: "#e8eaee", muted: "#9aa3b2", line: "#2b303a", side: "#191c22", accent: "#ef4148", accent2: "#d4171e" },
  },
  {
    id: "tgs",
    name: "TGS",
    tagline: "The Gamer Shop",
    description: "El estilo de la tienda: negro profundo y rojo, títulos en Anton, cristal líquido, fondo de cuadros con partículas y destellos de neón.",
    fonts: { display: "var(--font-anton), Anton, Impact, sans-serif", body: "var(--font-lexend), Lexend, system-ui, sans-serif" },
    effects: "Con efectos",
    bar: "Barra flotante tipo cristal líquido",
    light: { bg: "#f8f8fa", card: "#ffffff", ink: "#0d0d10", muted: "#666672", line: "#e7e7ec", side: "#0c0c0f", accent: "#e8192c", accent2: "#c20f20" },
    dark: { bg: "#070708", card: "#111114", ink: "#f5f5f5", muted: "#99999f", line: "#2a2a30", side: "#0c0c0f", accent: "#ff2438", accent2: "#d50025" },
  },
  {
    id: "minimal",
    name: "SuperMinimalist",
    tagline: "Nada que sobre",
    description: "Ultra minimalista: blanco y negro, líneas finísimas, sin sombras ni efectos, mucho aire y letra liviana. Lo justo para trabajar.",
    fonts: { display: "var(--font-inter), Inter, system-ui, sans-serif", body: "var(--font-inter), Inter, system-ui, sans-serif" },
    effects: "Sin efectos",
    bar: "Barra fija y delgada",
    light: { bg: "#ffffff", card: "#ffffff", ink: "#111111", muted: "#8a8a8a", line: "#ececec", side: "#ffffff", accent: "#111111", accent2: "#111111" },
    dark: { bg: "#0a0a0a", card: "#0a0a0a", ink: "#ededed", muted: "#7d7d7d", line: "#1f1f1f", side: "#0a0a0a", accent: "#ffffff", accent2: "#ffffff" },
  },
  {
    id: "bluered",
    name: "DarkBlueRed",
    tagline: "Azul profundo y rojo",
    description: "Azul marino con acentos rojos y un modo claro en azul hielo. Cristal líquido azulado, brillos fríos y fondo con partículas azules y rojas.",
    fonts: { display: "var(--font-space), 'Space Grotesk', system-ui, sans-serif", body: "var(--font-inter), Inter, system-ui, sans-serif" },
    effects: "Con efectos",
    bar: "Barra flotante de cristal azul",
    light: { bg: "#eef3fb", card: "#ffffff", ink: "#0b1630", muted: "#5a6785", line: "#d9e2f2", side: "#0b1630", accent: "#2f5bea", accent2: "#e5383b" },
    dark: { bg: "#070d1f", card: "#0e1a38", ink: "#e8eeff", muted: "#8b9bc4", line: "#1d2c57", side: "#0a1430", accent: "#3b82f6", accent2: "#ef4444" },
  },
  {
    id: "darkyellow",
    name: "DarkYellow",
    tagline: "Negro cálido y dorado",
    description: "Inspirado en DarkBlueRed pero en negro cálido con amarillo dorado y un modo claro en crema. Cristal líquido, brillos dorados y fondo con partículas amarillas.",
    fonts: { display: "var(--font-space), 'Space Grotesk', system-ui, sans-serif", body: "var(--font-inter), Inter, system-ui, sans-serif" },
    effects: "Con efectos",
    bar: "Barra flotante de cristal dorado",
    light: { bg: "#fbf7ea", card: "#fffdf5", ink: "#1c1708", muted: "#766a44", line: "#e8e0c4", side: "#17120a", accent: "#e0a800", accent2: "#b58300" },
    dark: { bg: "#0b0905", card: "#17130a", ink: "#fff7dc", muted: "#aa9e74", line: "#2e2610", side: "#17120a", accent: "#facc15", accent2: "#f59e0b" },
  },
  {
    id: "gamer",
    name: "BeGamer",
    tagline: "Modo extremo",
    description: "Radical: neones rojos sobre negro, bordes que giran con luz, esquinas tipo HUD, líneas láser, lluvia de datos y brillo en todo. Pensado para gamers.",
    fonts: { display: "var(--font-orbitron), Orbitron, sans-serif", body: "var(--font-rajdhani), Rajdhani, sans-serif" },
    effects: "Extremos",
    bar: "Barra HUD con esquinas cortadas",
    light: { bg: "#ececf0", card: "#ffffff", ink: "#0a0a0d", muted: "#5c5c68", line: "#d3d3dc", side: "#050507", accent: "#ff1f3d", accent2: "#b30023" },
    dark: { bg: "#030304", card: "#0a0a0d", ink: "#f4f4f6", muted: "#8e8e98", line: "#2a0f14", side: "#050507", accent: "#ff1f3d", accent2: "#ff5a36" },
  },
  {
    id: "gotham",
    name: "Gotham",
    tagline: "La ciudad nunca duerme",
    description: "Noir de ciudad nocturna: acero y negro con detalles amarillos de señal, lluvia, relámpagos, niebla, un skyline con ventanas encendidas y un reflector que cruza las nubes.",
    fonts: { display: "var(--font-bebas), 'Bebas Neue', Impact, sans-serif", body: "var(--font-barlow), Barlow, system-ui, sans-serif" },
    effects: "Con efectos",
    bar: "Barra flotante de acero ahumado",
    light: { bg: "#dfe3e7", card: "#f4f6f8", ink: "#0d1116", muted: "#5b6670", line: "#c9d0d6", side: "#0b0e12", accent: "#4d6277", accent2: "#f2c230" },
    dark: { bg: "#06080b", card: "#0f1318", ink: "#e6ebf0", muted: "#7f8c98", line: "#1c242c", side: "#0b0e12", accent: "#8ea4b8", accent2: "#f2c230" },
  },
  {
    id: "simplicity",
    name: "Simplicity",
    tagline: "Simple y efectivo",
    description: "Limpio y amable: tarjetas suaves, un solo acento verde azulado suave, transiciones discretas y nada que sobrecargue la vista.",
    fonts: { display: "var(--font-inter), Inter, system-ui, sans-serif", body: "var(--font-inter), Inter, system-ui, sans-serif" },
    effects: "Sutiles",
    bar: "Barra fija con sombra suave",
    light: { bg: "#f5f7f8", card: "#ffffff", ink: "#16202a", muted: "#6b7885", line: "#e3e8ec", side: "#ffffff", accent: "#3f8a7e", accent2: "#2f7065" },
    dark: { bg: "#0f1417", card: "#161d21", ink: "#e6edf1", muted: "#8a99a4", line: "#232d33", side: "#12181b", accent: "#6cc3b5", accent2: "#54ac9d" },
  },
];

/** Temas con la barra de LITE fija y de punta a punta: no flota, no se arrastra ni se comprime al hacer scroll. */
export const FIXED_BAR_SKINS: SkinId[] = ["gotham", "gamer"];

export const SKIN_IDS = SKINS.map((s) => s.id);

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === "string" && (SKIN_IDS as string[]).includes(value);
}

export function readStoredSkin(): SkinId {
  try {
    const stored = window.localStorage.getItem(SKIN_STORAGE_KEY);
    if (isSkinId(stored)) return stored;
  } catch { /* sin storage */ }
  return DEFAULT_SKIN;
}

/** Aplica el tema en la página al instante y lo recuerda en este navegador. */
export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id;
  try { window.localStorage.setItem(SKIN_STORAGE_KEY, id); } catch { /* sin storage */ }
  window.dispatchEvent(new CustomEvent("tgs-skin-change", { detail: id }));
}
