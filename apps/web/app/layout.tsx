import type { Metadata } from "next";
import { Anton, Barlow, Bebas_Neue, Inter, Lexend, Orbitron, Rajdhani, Space_Grotesk } from "next/font/google";
import "./styles.css";
import "./skins/base.css";
import "./skins/features.css";
import "./skins/rich.css";
import "./skins/bluered.css";
import "./skins/darkyellow.css";
import "./skins/gamer.css";
import "./skins/gotham.css";
import "./skins/minimal.css";
import "./skins/simplicity.css";
import "./skins/original.css";
import { FxBackground } from "../components/FxBackground";
import { GamerShowcase } from "../components/GamerShowcase";
import { ModalExit } from "../components/ModalExit";

const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", display: "swap" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap", preload: false });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-rajdhani", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas", display: "swap", preload: false });
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap", preload: false });

/** Lee el tema guardado (claro por defecto) y lo fija en <html> antes del primer render. */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("tgs.theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light";var f=localStorage.getItem("tgs.fx");var k=localStorage.getItem("tgs.skin");document.documentElement.dataset.skin=/^(original|tgs|minimal|bluered|darkyellow|gamer|gotham|simplicity)$/.test(k)?k:"tgs";document.documentElement.dataset.fx=f?(f==="off"?"off":"on"):(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches?"off":"on")}catch(e){document.documentElement.dataset.theme="light";document.documentElement.dataset.fx="on";document.documentElement.dataset.skin="tgs"}})()`;

export const metadata: Metadata = {
  title: "TGS Presupuestos",
  description: "Gestión interna de presupuestos — The Gamer Shop",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${lexend.variable} ${anton.variable} ${orbitron.variable} ${rajdhani.variable} ${inter.variable} ${spaceGrotesk.variable} ${bebas.variable} ${barlow.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body><GamerShowcase /><FxBackground /><ModalExit />{children}</body>
    </html>
  );
}
