"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { CHANGELOG, currentAppVersion } from "../lib/changelog";
import type { AuthUser, Branding, NavId, QuoteFromRequestSeed } from "../lib/types";
import { CollectionsView } from "./CollectionsView";
import { CombosView } from "./CombosView";
import { CustomersView } from "./CustomersView";
import { DashboardView } from "./DashboardView";
import { AcustockCatalogView } from "./AcustockCatalogView";
import { LoginView } from "./LoginView";
import { ModuloExternoView } from "./ModuloExternoView";
import { NotificationsView } from "./NotificationsView";
import { RecontactsView } from "./RecontactsView";
import { PcLinesView } from "./PcLinesView";
import { ProductsView } from "./ProductsView";
import { QuotesView } from "./QuotesView";
import { RequestsView } from "./RequestsView";
import { SettingsView } from "./SettingsView";
import { PdfLayoutEditorView } from "./PdfLayoutEditorView";
import { UsersView } from "./UsersView";
import { EmployeesView } from "./EmployeesView";
import { EmployeePortalView } from "./EmployeePortalView";
import { Alert, Loading, initials } from "./shared";
import { PersonalizableSidebarNav, type SidebarNavGroup } from "./PersonalizableSidebarNav";

const NAV_GROUPS: SidebarNavGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "▣" },
      { id: "solicitudes", label: "Solicitudes", icon: "☑" },
      { id: "presupuestos", label: "Presupuestos", icon: "▤" },
      { id: "colecciones", label: "Colecciones", icon: "◆" },
      { id: "mi-cuenta", label: "Mi cuenta", icon: "●" },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo",
    items: [
      { id: "clientes", label: "Clientes", icon: "☺" },
      { id: "productos", label: "Productos", icon: "❏" },
      { id: "catalogo-acustock", label: "Catálogo AcuStock", icon: "▦" },
      { id: "combos", label: "Combos", icon: "⊞" },
      { id: "lineas", label: "Líneas PC", icon: "▥" },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      { id: "notificaciones", label: "Notificaciones", icon: "◉" },
      { id: "recontactos", label: "Recontactos", icon: "↻" },
      { id: "editor-pdf", label: "Editor de PDF", icon: "▧" },
      { id: "usuarios", label: "Usuarios", icon: "♟" },
      { id: "empleados", label: "Empleados", icon: "♙" },
      { id: "modulo-externo", label: "Módulo Externo", icon: "◈" },
      { id: "configuracion", label: "Configuración", icon: "⚙" },
    ],
  },
];

export function App() {
  const [boot, setBoot] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [nav, setNav] = useState<NavId>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [quoteSeed, setQuoteSeed] = useState<QuoteFromRequestSeed | null>(null);
  const [initialSelectedQuoteId, setInitialSelectedQuoteId] = useState<string | null>(null);
  const [externalEnabled, setExternalEnabled] = useState(false);
  const [employeePortalAvailable, setEmployeePortalAvailable] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const changelogRef = useRef<HTMLDivElement>(null);
  const consumeQuoteSeed = useCallback(() => setQuoteSeed(null), []);
  const allowedNavGroups = useMemo(() => NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !["usuarios", "empleados"].includes(item.id) || user?.role === "ADMIN")
      .filter((item) => item.id !== "mi-cuenta" || employeePortalAvailable)
      .filter((item) => item.id !== "modulo-externo" || externalEnabled),
  })), [employeePortalAvailable, externalEnabled, user?.role]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await api<{ user: AuthUser }>("/auth/me");
      setUser(res.user);
      setBootError(null);
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.status === 0) setBootError(err.message);
    } finally {
      setBoot(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const quoteId = params.get("quote")?.trim();
    if (!quoteId) return;
    setInitialSelectedQuoteId(quoteId);
    setNav("presupuestos");
    params.delete("quote");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    void api<Branding>("/settings/branding")
      .then(setBranding)
      .catch(() => setBranding(null));
  }, [user, nav]);

  useEffect(() => {
    if (!user) return;
    void api<{ enabled: boolean }>("/settings/external-module")
      .then((res) => setExternalEnabled(res.enabled))
      .catch(() => setExternalEnabled(false));
    const changed = (event: Event) =>
      setExternalEnabled((event as CustomEvent<boolean>).detail);
    window.addEventListener("tgs-external-module-changed", changed);
    return () => window.removeEventListener("tgs-external-module-changed", changed);
  }, [user]);

  useEffect(() => {
    if (!user) { setEmployeePortalAvailable(false); return; }
    void api<{enabled:boolean;hasEmployee:boolean}>("/me/employee/access")
      .then((res)=>setEmployeePortalAvailable(res.enabled&&res.hasEmployee))
      .catch(()=>setEmployeePortalAvailable(false));
  }, [user]);

  useEffect(() => {
    if (nav === "mi-cuenta" && !employeePortalAvailable) setNav("dashboard");
  }, [nav, employeePortalAvailable]);

  useEffect(() => {
    if (nav === "modulo-externo" && !externalEnabled) setNav("dashboard");
  }, [nav, externalEnabled]);

  useEffect(()=>{
    const apply=(url:string|null|undefined)=>{
      let link=document.head.querySelector<HTMLLinkElement>("link[data-tgs-favicon]");
      if(!url){link?.remove();return}
      if(!link){link=document.createElement("link");link.rel="icon";link.dataset.tgsFavicon="true";document.head.appendChild(link)}
      link.href=url;
    };
    apply(branding?.faviconUrl);
    const changed=(event:Event)=>apply((event as CustomEvent<string|null>).detail);
    window.addEventListener("tgs-favicon-changed",changed);
    return()=>window.removeEventListener("tgs-favicon-changed",changed);
  },[branding?.faviconUrl]);

  useEffect(() => {
    if (!changelogOpen) return;
    const onClick = (e: MouseEvent) => {
      if (changelogRef.current && !changelogRef.current.contains(e.target as Node)) {
        setChangelogOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [changelogOpen]);

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* sesión ya inválida */
    }
    setUser(null);
  }

  if (boot) {
    return (
      <div className="boot">
        <Loading label="Verificando sesión…" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {bootError ? (
          <div className="boot-banner">
            <Alert>{bootError}</Alert>
          </div>
        ) : null}
        <LoginView onSuccess={setUser} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className="nav-toggle btn-dark"
        aria-expanded={menuOpen}
        aria-controls="side-nav"
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? "Cerrar menú" : "☰ Menú"}
      </button>

      <aside id="side-nav" className={menuOpen ? "side open" : "side"}>
        <div className="brand">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="brand-badge-img"
              src={branding.logoUrl}
              alt={branding.name || "Logo"}
            />
          ) : (
            <span className="brand-badge">TGS</span>
          )}
          <div className="brand-copy">
            <strong>{branding?.name?.trim() || "The Gamer Shop"}</strong>
            <small>Suite de presupuestos</small>
          </div>
        </div>
        <nav aria-label="Principal">
          <PersonalizableSidebarNav
            userId={user.id}
            groups={allowedNavGroups}
            active={nav}
            onNavigate={(item) => {setNav(item); setMenuOpen(false);}}
          />
        </nav>
        <div className="side-foot">
          <div className="side-changelog" ref={changelogRef}>
            <button
              type="button"
              className="side-changelog-btn"
              aria-expanded={changelogOpen}
              onClick={() => setChangelogOpen((v) => !v)}
            >
              <span>Novedades</span>
              <span className="side-changelog-ver">v{currentAppVersion()}</span>
            </button>
            {changelogOpen ? (
              <div className="side-changelog-panel" role="dialog" aria-label="Historial de novedades">
                {CHANGELOG.map((entry) => (
                  <article key={entry.version} className="side-changelog-entry">
                    <header>
                      <strong>v{entry.version}</strong>
                      <time dateTime={entry.date}>{entry.date}</time>
                    </header>
                    <p>{entry.title}</p>
                    <ul>
                      {entry.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          <div className="side-user">
            <span className="avatar">{initials(user.displayName || user.username)}</span>
            <div className="side-user-copy">
              <p>{user.displayName || user.username}</p>
              <small>@{user.username}</small>
            </div>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main">
        {nav === "dashboard" ? <DashboardView /> : null}
        {nav === "presupuestos" ? (
          <QuotesView
            seedFromRequest={quoteSeed}
            onSeedConsumed={consumeQuoteSeed}
            initialSelectedId={initialSelectedQuoteId}
            onInitialSelectedConsumed={() => setInitialSelectedQuoteId(null)}
          />) : null}
        {nav === "solicitudes" ? (
          <RequestsView
            onCreateAndAssociateQuote={(seed) => {
              setQuoteSeed(seed);
              setNav("presupuestos");
              setMenuOpen(false);
            }}
          />
        ) : null}
        {nav === "productos" ? <ProductsView /> : null}
        {nav === "catalogo-acustock" ? <AcustockCatalogView /> : null}
        {nav === "combos" ? <CombosView /> : null}
        {nav === "clientes" ? <CustomersView /> : null}
        {nav === "lineas" ? <PcLinesView /> : null}
        {nav === "colecciones" ? <CollectionsView /> : null}
        {nav === "notificaciones" ? <NotificationsView /> : null}
        {nav === "recontactos" ? <RecontactsView /> : null}
        {nav === "editor-pdf" ? <PdfLayoutEditorView /> : null}
        {nav === "usuarios" && user.role === "ADMIN" ? <UsersView /> : null}
        {nav === "empleados" && user.role === "ADMIN" ? <EmployeesView /> : null}
        {nav === "mi-cuenta" && employeePortalAvailable ? <EmployeePortalView /> : null}
        {nav === "modulo-externo" && externalEnabled ? <ModuloExternoView /> : null}
        {nav === "configuracion" ? <SettingsView /> : null}
      </main>
    </div>
  );
}
