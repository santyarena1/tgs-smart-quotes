import type { Metadata } from "next";
import "./styles.css";

/** Lee el tema guardado (claro por defecto) y lo fija en <html> antes del primer render. */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("tgs.theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;

export const metadata: Metadata = {
  title: "TGS Presupuestos",
  description: "Gestión interna de presupuestos — The Gamer Shop",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
