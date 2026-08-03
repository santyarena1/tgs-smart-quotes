"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { CHANGELOG, currentAppVersion } from "../lib/changelog";
import type { AuthUser, Branding, NavId, QuoteFromRequestSeed } from "../lib/types";
import { CollectionsView } from "./CollectionsView";
import { CombosView } from "./CombosView";
import { CustomersView } from "./CustomersView";
import { DashboardView } from "./DashboardView";
import { AcustockCatalogView } from "./AcustockCatalogView";
import { LoginView } from "./LoginView";
import { NotificationsView } from "./NotificationsView";
import { RecontactsView } from "./RecontactsView";
import { PcLinesView } from "./PcLinesView";
import { ProductsView } from "./ProductsView";
import { QuotesView } from "./QuotesView";
import { RequestsView } from "./RequestsView";
import { SettingsView } from "./SettingsView";
import { PdfLayoutEditorView } from "./PdfLayoutEditorView";
import { UsersView } from "./UsersView";
import { Alert, Loading, initials } from "./shared";

const NAV_GROUPS: { label: string; items: { id: NavId; label: string; icon: string }[] }[] = [
  {
    label: "Operación",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "▣" },
      { id: "solicitudes", label: "Solicitudes", icon: "☑" },
      { id: "presupuestos", label: "Presupuestos", icon: "▤" },
      { id: "colecciones", label: "Colecciones", icon: "◆" },
    ],
  },
  {
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
    label: "Sistema",
    items: [
      { id: "notificaciones", label: "Notificaciones", icon: "◉" },
      { id: "recontactos", label: "Recontactos", icon: "↻" },
      { id: "editor-pdf", label: "Editor de PDF", icon: "▧" },
      { id: "usuarios", label: "Usuarios", icon: "♟" },
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
  const [changelogOpen, setChangelogOpen] = useState(false);
  const changelogRef = useRef<HTMLDivElement>(null);
  const consumeQuoteSeed = useCallback(() => setQuoteSeed(null), []);

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
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              <div className="nav-group-links">
                {group.items.filter((item) => item.id !== "usuarios" || user.role === "ADMIN").map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={nav === item.id ? "nav-link active" : "nav-link"}
                    onClick={() => {
                      setNav(item.id);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="ico" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
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
        {nav === "configuracion" ? <SettingsView /> : null}
      </main>
    </div>
  );
}
