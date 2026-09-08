"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SessionProvider, useSession } from "../../components/SessionProvider";
import { initials } from "../../components/shared";
import "./crm.css";

function CrmShell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  // Los hooks van antes del early return: si no, cambia su orden entre renders.
  const pathname = usePathname();
  if (!user) return null;

  return (
    <div className="crm-shell">
      <header className="crm-topbar">
        <div className="crm-topbar-brand">
          <span className="crm-mark">CRM</span>
          <span className="crm-topbar-sub">The Gamer Shop</span>
        </div>
        <nav className="crm-topbar-nav" aria-label="Secciones del CRM">
          <Link className={pathname === "/crm" ? "crm-navlink active" : "crm-navlink"} href="/crm">
            Conversaciones
          </Link>
          <Link
            className={pathname.startsWith("/crm/plantillas") ? "crm-navlink active" : "crm-navlink"}
            href="/crm/plantillas"
          >
            Plantillas
          </Link>
        </nav>
        <div className="crm-topbar-end">
          <span className="crm-user" title={user.displayName || user.username}>
            <span className="avatar">{initials(user.displayName || user.username)}</span>
          </span>
          <Link className="crm-exit" href="/dashboard">
            ← Volver al sistema
          </Link>
        </div>
      </header>
      <div className="crm-body">{children}</div>
    </div>
  );
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CrmShell>{children}</CrmShell>
    </SessionProvider>
  );
}
