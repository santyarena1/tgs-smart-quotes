"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SessionProvider, useSession } from "../../components/SessionProvider";
import { initials } from "../../components/shared";
import { CrmThemeProvider, ThemeSwitch } from "../../components/crm/theme";
import "./crm.css";
import "./inbox.css";

/** Secciones del CRM. Las que todavía no existen se suman en las próximas etapas. */
const NAV = [
  { href: "/crm", label: "Bandeja", icon: "💬", match: (path: string) => path === "/crm" },
  { href: "/crm/embudo", label: "Embudo", icon: "📊", match: (path: string) => path.startsWith("/crm/embudo") },
  { href: "/crm/entrenamiento", label: "Entrenamiento", icon: "🎓", match: (path: string) => path.startsWith("/crm/entrenamiento") },
  { href: "/crm/seguimientos", label: "Seguimientos", icon: "⏰", match: (path: string) => path.startsWith("/crm/seguimientos") },
  { href: "/crm/respuestas", label: "Respuestas rápidas", icon: "⚡", match: (path: string) => path.startsWith("/crm/respuestas") },
  { href: "/crm/plantillas", label: "Plantillas", icon: "📄", match: (path: string) => path.startsWith("/crm/plantillas") },
  { href: "/configuracion?tab=chatbot", label: "Bot", icon: "🤖", match: () => false },
];

function CrmShell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  // Los hooks van antes del early return: si no, cambia su orden entre renders.
  const pathname = usePathname();
  if (!user) return null;

  return (
    <div className="cx-shell">
      <aside className="cx-rail" aria-label="Secciones del CRM">
        <Link href="/crm" className="cx-rail-brand" title="CRM · The Gamer Shop">
          <span className="cx-rail-mark">TGS</span>
        </Link>
        <nav className="cx-rail-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.match(pathname) ? "cx-rail-link active" : "cx-rail-link"}
              title={item.label}
            >
              <span className="cx-rail-icon" aria-hidden="true">{item.icon}</span>
              <span className="cx-rail-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="cx-rail-end">
          <ThemeSwitch compact />
          <span className="cx-rail-user" title={user.displayName || user.username}>
            {initials(user.displayName || user.username)}
          </span>
          <Link className="cx-rail-link" href="/dashboard" title="Volver al sistema">
            <span className="cx-rail-icon" aria-hidden="true">↩</span>
            <span className="cx-rail-label">Volver al sistema</span>
          </Link>
        </div>
      </aside>
      <div className="cx-main">{children}</div>
    </div>
  );
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CrmThemeProvider>
        <CrmShell>{children}</CrmShell>
      </CrmThemeProvider>
    </SessionProvider>
  );
}
