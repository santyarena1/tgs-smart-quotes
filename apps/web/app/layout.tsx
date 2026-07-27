import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "TGS Presupuestos",
  description: "Gestión interna de presupuestos — The Gamer Shop",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
