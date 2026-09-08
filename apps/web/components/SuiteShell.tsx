"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../lib/api";
import { CHANGELOG, currentAppVersion, type ChangelogEntry } from "../lib/changelog";
import type { Branding, NavId } from "../lib/types";
import { PersonalizableSidebarNav, type SidebarNavGroup } from "./PersonalizableSidebarNav";
import { useSession } from "./SessionProvider";
import { Modal, initials } from "./shared";

const ADMIN_ROUTES: NavId[] = ["usuarios", "empleados", "gastos", "publicacion-web"];

const NAV_GROUPS: SidebarNavGroup[] = [
  { id: "operacion", label: "Principal", ungrouped: true, items: [
    { id: "dashboard", label: "Dashboard", icon: "▣" },
    { id: "solicitudes", label: "Solicitudes", icon: "☑" },
    { id: "presupuestos", label: "Presupuestos", icon: "▤" },
    { id: "colecciones", label: "Colecciones", icon: "◆" },
    { id: "calculadora", label: "Calculadora", icon: "%" },
    { id: "mi-cuenta", label: "Mi cuenta", icon: "●" },
  ] },
  { id: "catalogo", label: "Catálogo", items: [
    { id: "clientes", label: "Clientes", icon: "☺" },
    { id: "productos", label: "Productos", icon: "❏" },
    { id: "publicacion-web", label: "Publicación Web", icon: "❖" },
    { id: "fichas-componentes", label: "Fichas de Componentes", icon: "▩" },
    { id: "catalogo-acustock", label: "Catálogo AcuStock", icon: "▦" },
    { id: "combos", label: "Combos", icon: "⊞" },
    { id: "lineas", label: "Líneas PC", icon: "▥" },
  ] },
  { id: "sistema", label: "Sistema", items: [
    { id: "notificaciones", label: "Notificaciones", icon: "◉" },
    { id: "recontactos", label: "Recontactos", icon: "↻" },
    { id: "editor-pdf", label: "Editor de PDF", icon: "▧" },
    { id: "usuarios", label: "Usuarios", icon: "♟" },
    { id: "empleados", label: "Empleados", icon: "♙" },
    { id: "gastos", label: "Gastos mensuales", icon: "◧" },
    { id: "modulo-externo", label: "Módulo Externo", icon: "◈" },
    { id: "configuracion", label: "Configuración", icon: "⚙" },
  ] },
];

function ChangelogEntryView({ entry }: { entry: ChangelogEntry }) {
  return <article className="side-changelog-entry">
    <header><strong>v{entry.version}</strong><time dateTime={entry.date}>{entry.date}</time></header>
    <p>{entry.title}</p>
    <ul>{entry.items.map((item) => <li key={item}>{item}</li>)}</ul>
  </article>;
}

export function SuiteShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname.split("/").filter(Boolean)[0] as NavId | undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [externalEnabled, setExternalEnabled] = useState(false);
  const [externalChecked, setExternalChecked] = useState(false);
  const [employeePortalAvailable, setEmployeePortalAvailable] = useState(false);
  const [employeePortalChecked, setEmployeePortalChecked] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogPopupOpen, setChangelogPopupOpen] = useState(false);
  const changelogRef = useRef<HTMLDivElement>(null);

  const allowedNavGroups = useMemo(() => NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !ADMIN_ROUTES.includes(item.id) || user?.role === "ADMIN")
      .filter((item) => item.id !== "mi-cuenta" || employeePortalAvailable)
      .filter((item) => item.id !== "modulo-externo" || externalEnabled),
  })), [employeePortalAvailable, externalEnabled, user?.role]);

  useEffect(() => {
    void api<Branding>("/settings/branding").then(setBranding).catch(() => setBranding(null));
  }, [pathname, user]);

  useEffect(() => {
    if (!user) return;
    setExternalChecked(false);
    void api<{ enabled: boolean }>("/settings/external-module")
      .then((response) => setExternalEnabled(response.enabled))
      .catch(() => setExternalEnabled(false))
      .finally(() => setExternalChecked(true));
    const changed = (event: Event) => {
      setExternalEnabled((event as CustomEvent<boolean>).detail);
      setExternalChecked(true);
    };
    window.addEventListener("tgs-external-module-changed", changed);
    return () => window.removeEventListener("tgs-external-module-changed", changed);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setEmployeePortalChecked(false);
    void api<{ enabled: boolean; hasEmployee: boolean }>("/me/employee/access")
      .then((response) => setEmployeePortalAvailable(response.enabled && response.hasEmployee))
      .catch(() => setEmployeePortalAvailable(false))
      .finally(() => setEmployeePortalChecked(true));
  }, [user]);

  useEffect(() => {
    if (active === "mi-cuenta" && employeePortalChecked && !employeePortalAvailable) router.replace("/dashboard");
    if (active === "modulo-externo" && externalChecked && !externalEnabled) router.replace("/dashboard");
    if (active && ADMIN_ROUTES.includes(active) && user?.role !== "ADMIN") router.replace("/dashboard");
  }, [active, employeePortalAvailable, employeePortalChecked, externalChecked, externalEnabled, router, user?.role]);

  useEffect(() => {
    const apply = (url: string | null | undefined) => {
      let link = document.head.querySelector<HTMLLinkElement>("link[data-tgs-favicon]");
      if (!url) { link?.remove(); return; }
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        link.dataset.tgsFavicon = "true";
        document.head.appendChild(link);
      }
      link.href = url;
    };
    apply(branding?.faviconUrl);
    const changed = (event: Event) => apply((event as CustomEvent<string | null>).detail);
    window.addEventListener("tgs-favicon-changed", changed);
    return () => window.removeEventListener("tgs-favicon-changed", changed);
  }, [branding?.faviconUrl]);

  useEffect(() => {
    if (!changelogOpen) return;
    const onClick = (event: MouseEvent) => {
      if (changelogRef.current && !changelogRef.current.contains(event.target as Node)) setChangelogOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [changelogOpen]);

  useEffect(() => {
    if (!user) return;
    const latest = CHANGELOG[0]?.version;
    if (latest && window.localStorage.getItem("changelog_seen_version") !== latest) setChangelogPopupOpen(true);
  }, [user]);

  const closeChangelogPopup = useCallback(() => {
    const latest = CHANGELOG[0]?.version;
    if (latest) window.localStorage.setItem("changelog_seen_version", latest);
    setChangelogPopupOpen(false);
  }, []);

  if (!user) return null;

  return <div className="app-shell">
    {CHANGELOG[0] ? <Modal open={changelogPopupOpen} title={`Novedades v${CHANGELOG[0].version}`} onClose={closeChangelogPopup}>
      <ChangelogEntryView entry={CHANGELOG[0]} />
    </Modal> : null}
    <button type="button" className="nav-toggle btn-dark" aria-expanded={menuOpen} aria-controls="side-nav" onClick={() => setMenuOpen((value) => !value)}>
      {menuOpen ? "Cerrar menú" : "☰ Menú"}
    </button>
    <aside id="side-nav" className={menuOpen ? "side open" : "side"}>
      <div className="brand">
        {branding?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="brand-badge-img" src={branding.logoUrl} alt={branding.name || "Logo"} />
        ) : <span className="brand-badge">TGS</span>}
        <div className="brand-copy"><strong>{branding?.name?.trim() || "The Gamer Shop"}</strong><small>Suite de presupuestos</small></div>
      </div>
      {/* El CRM no entra en la nav personalizable: es otra aplicación, con su propio
          shell sin sidebar, así que se accede desde un botón aparte y destacado. */}
      <Link className="side-crm" href="/crm" onClick={() => setMenuOpen(false)}>
        <span className="side-crm-mark">💬</span>
        <span className="side-crm-copy">
          <strong>CRM</strong>
          <small>Conversaciones de WhatsApp</small>
        </span>
      </Link>
      <nav aria-label="Principal">
        <PersonalizableSidebarNav userId={user.id} groups={allowedNavGroups} onNavigated={() => setMenuOpen(false)} />
      </nav>
      <div className="side-foot">
        <div className="side-changelog" ref={changelogRef}>
          <button type="button" className="side-changelog-btn" aria-expanded={changelogOpen} onClick={() => setChangelogOpen((value) => !value)}>
            <span>Novedades</span><span className="side-changelog-ver">v{currentAppVersion()}</span>
          </button>
          {changelogOpen ? <div className="side-changelog-panel" role="dialog" aria-label="Historial de novedades">
            {CHANGELOG.map((entry) => <ChangelogEntryView key={entry.version} entry={entry} />)}
          </div> : null}
        </div>
        <div className="side-user">
          <span className="avatar">{initials(user.displayName || user.username)}</span>
          <div className="side-user-copy"><p>{user.displayName || user.username}</p><small>@{user.username}</small></div>
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void logout()}>Cerrar sesión</button>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>;
}
