"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "../components/SessionProvider";
import { LiteProvider, useLite } from "./LiteContext";
import { saveUiMode } from "./lite-mode";

function LiteBar() {
  const { user, logout } = useSession();
  const { branches, branchId, setBranchId, locked } = useLite();
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("tgs.theme", next); } catch { /* sin storage */ }
    setTheme(next);
  }

  function leaveLite() {
    saveUiMode("full");
    router.push("/dashboard");
  }

  const tabs = [
    { href: "/lite", label: "Presupuestos" },
    { href: "/lite/colecciones", label: "Colecciones" },
    { href: "/lite/editor-pdf", label: "Editor PDF" },
    { href: "/lite/configuracion", label: "Configuración" },
  ];
  const isActive = (href: string) => (href === "/lite" ? pathname === "/lite" : pathname.startsWith(href));

  return (
    <header className="lt-bar">
      <Link href="/lite" className="lt-brand" aria-label="TGS Lite">
        <span className="lt-logo">TGS</span>
        <span className="lt-brand-text">Lite</span>
      </Link>
      <nav className="lt-tabs" aria-label="Secciones">
        {tabs.map((t) => <Link key={t.href} href={t.href} className={isActive(t.href) ? "lt-tab active" : "lt-tab"}>{t.label}</Link>)}
      </nav>
      <span className="lt-spacer" />
      <label className="lt-branch" title={locked ? "Tu local" : "Cambiar de local"}>
        <span className="lt-dot" aria-hidden="true" />
        <select value={branchId ?? ""} disabled={locked || branches.length < 2} onChange={(e) => setBranchId(e.target.value)} aria-label="Local">
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <button type="button" className="lt-switch on" role="switch" aria-checked="true" onClick={leaveLite} title="Volver al sistema completo">
        <span className="lt-switch-track"><span className="lt-switch-knob" /></span>
        <span>LITE</span>
      </button>
      <button type="button" className="lt-icon" onClick={toggleTheme} aria-label="Cambiar tema" title="Cambiar tema">
        {theme === "dark" ? "☀" : "☾"}
      </button>
      <span className="lt-user" title={user?.displayName || user?.username}>{(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase()}</span>
      <button type="button" className="lt-icon" onClick={() => void logout()} aria-label="Cerrar sesión" title="Cerrar sesión">⎋</button>
    </header>
  );
}

export function LiteShell({ children }: { children: React.ReactNode }) {
  return (
    <LiteProvider>
      <div className="lite">
        <LiteBar />
        <main className="lt-main">{children}</main>
      </div>
    </LiteProvider>
  );
}
