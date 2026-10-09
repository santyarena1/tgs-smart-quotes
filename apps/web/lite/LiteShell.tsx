"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "../components/SessionProvider";
import { LiteProvider, useLite } from "./LiteContext";
import { FxToggle } from "../components/FxToggle";
import { LiteVersion } from "./LiteChangelog";
import { FIXED_BAR_SKINS } from "../lib/skins";
import { saveUiMode } from "./lite-mode";
import logo from "./tgs-logo-lite.png";

/** "Naon" -> "The Gamer Shop Naon"; si el local ya se llama "The Gamer Shop …" queda igual. */
function storeLabel(branchName: string): string {
  const name = branchName.trim();
  return /gamer\s*shop/i.test(name) ? name : `The Gamer Shop ${name}`;
}

function LiteBar() {
  const { user, logout } = useSession();
  const { branches, branchId, setBranchId, locked } = useLite();
  const pathname = usePathname();
  const router = useRouter();
  // El local de la sesión sale del perfil del usuario, no del selector.
  const ownBranch = branches.find((b) => b.id === user?.branchId)?.name;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [scrolled, setScrolled] = useState(false);
  const [compact, setCompact] = useState(false);
  const [away, setAway] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const lastGripDown = useRef(0);
  const posRef = useRef(pos);
  posRef.current = pos;
  const toolsRef = useRef(toolsOpen);
  toolsRef.current = toolsOpen;

  // La barra se achica al hacer scroll y se esconde al bajar (vuelve al subir) para dejar más pantalla útil.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if ((FIXED_BAR_SKINS as string[]).includes(document.documentElement.dataset.skin ?? "")) {
        setScrolled(false); setCompact(false); setAway(false);
        return;
      }
      setScrolled(y > 24);
      setCompact(y > 160);
      if (Math.abs(y - lastY) > 8) {
        const moved = posRef.current.x !== 0 || posRef.current.y !== 0;
        setAway(y > lastY && y > 260 && !moved && !toolsRef.current);
        lastY = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("tgs-skin-change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("tgs-skin-change", onScroll);
    };
  }, []);

  // Posición elegida por la persona (arrastrando la barra), recordada por navegador.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("tgs.lite.bar");
      if (!raw) return;
      const v = JSON.parse(raw) as { x?: number; y?: number };
      if (Number.isFinite(v.x) && Number.isFinite(v.y)) setPos({ x: v.x as number, y: v.y as number });
    } catch { /* sin storage o dato roto */ }
  }, []);

  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const bar = barRef.current;
    if (!bar || e.button > 0 || (FIXED_BAR_SKINS as string[]).includes(document.documentElement.dataset.skin ?? "")) return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastGripDown.current < 380) { lastGripDown.current = 0; resetPos(); return; }
    lastGripDown.current = now;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...posRef.current };
    const rect = bar.getBoundingClientRect();
    const baseLeft = rect.left - origin.x;
    const baseTop = rect.top - origin.y;
    setDragging(true);
    setAway(false);
    const clamp = (x: number, y: number) => ({
      x: Math.min(Math.max(x, 8 - baseLeft), window.innerWidth - rect.width - 8 - baseLeft),
      y: Math.min(Math.max(y, 6 - baseTop), window.innerHeight - rect.height - 6 - baseTop),
    });
    const move = (ev: PointerEvent) => setPos(clamp(origin.x + ev.clientX - startX, origin.y + ev.clientY - startY));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setDragging(false);
      // Imán: al centro y a los bordes superior e inferior si queda cerca.
      let { x, y } = posRef.current;
      const centerX = baseLeft + x + rect.width / 2;
      if (Math.abs(centerX - window.innerWidth / 2) < 48) x = window.innerWidth / 2 - rect.width / 2 - baseLeft;
      const top = baseTop + y;
      if (top < 44) y = 10 - baseTop;
      else if (top > window.innerHeight - rect.height - 48) y = window.innerHeight - rect.height - 12 - baseTop;
      const snapped = clamp(x, y);
      if (Math.abs(snapped.x - origin.x) < 3 && Math.abs(snapped.y - origin.y) < 3) return;
      setPos(snapped);
      try { window.localStorage.setItem("tgs.lite.bar", JSON.stringify(snapped)); } catch { /* sin storage */ }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function resetPos() {
    setPos({ x: 0, y: 0 });
    try { window.localStorage.removeItem("tgs.lite.bar"); } catch { /* sin storage */ }
  }

  useEffect(() => { setToolsOpen(false); }, [pathname]);

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
    <header ref={barRef} className={`lt-bar${scrolled ? " scrolled" : ""}${compact ? " compact" : ""}${toolsOpen ? " tools-open" : ""}${away ? " away" : ""}${dragging ? " dragging" : ""}`} style={{ "--bx": `${pos.x}px`, "--by": `${pos.y}px` } as React.CSSProperties}>
      <button type="button" className="lt-bar-grip" onPointerDown={startDrag} aria-label="Mover la barra" title="Arrastrá para mover la barra · doble toque para volver a su lugar"><span aria-hidden="true" /></button>
      <Link href="/lite" className="lt-brand" aria-label="TGS Lite">
        <img className="lt-logo-img" src={logo.src} alt="The Gamer Shop Lite" width={44} height={44} />
      </Link>
      <nav className="lt-tabs" aria-label="Secciones">
        {tabs.map((t) => <Link key={t.href} href={t.href} className={isActive(t.href) ? "lt-tab active" : "lt-tab"}>{t.label}</Link>)}
      </nav>
      <span className="lt-spacer" />
      <div className="lt-bar-tools" id="lt-bar-tools">
        {ownBranch ? (
          <span className="lt-store" title={`Sesión iniciada en ${storeLabel(ownBranch)}`}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9.5 4.5 4h15L21 9.5" /><path d="M4 9.5V20h16V9.5" /><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M10 20v-5h4v5" />
            </svg>
            <span>{storeLabel(ownBranch)}</span>
          </span>
        ) : null}
        {locked && ownBranch ? null : <label className="lt-branch" title={locked ? "Tu local" : "Cambiar de local"}>
          <span className="lt-dot" aria-hidden="true" />
          <select value={branchId ?? ""} disabled={locked || branches.length < 2} onChange={(e) => setBranchId(e.target.value)} aria-label="Local">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>}
        <button type="button" className="lt-switch on" role="switch" aria-checked="true" onClick={leaveLite} title="Volver al sistema completo">
          <span className="lt-switch-track"><span className="lt-switch-knob" /></span>
          <span>LITE</span>
        </button>
        <LiteVersion enabled={Boolean(user)} />
        <FxToggle variant="icon" />
        <button type="button" className={`lt-switch tgs-red${theme === "dark" ? " on" : ""}`} role="switch" aria-checked={theme === "dark"} onClick={toggleTheme} title="Cambiar entre modo claro y oscuro">
          <span className="lt-switch-track"><span className="lt-switch-knob" /></span>
          <span>Oscuro</span>
        </button>
        <span className="lt-user" title={user?.displayName || user?.username}>{(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase()}</span>
        <button type="button" className="lt-icon" onClick={() => void logout()} aria-label="Cerrar sesión" title="Cerrar sesión">⎋</button>
      </div>
      <button type="button" className="lt-bar-more" aria-expanded={toolsOpen} aria-controls="lt-bar-tools" onClick={() => setToolsOpen((v) => !v)} aria-label="Más opciones" title="Más opciones">
        <span aria-hidden="true" />
      </button>
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
