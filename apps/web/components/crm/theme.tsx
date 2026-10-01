"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getCrmPreferences, setCrmTheme, type ThemeChoice } from "../../lib/crm";

/**
 * Tema del CRM: claro, oscuro o automático (sigue al sistema operativo).
 *
 * La elección se guarda en el servidor por usuario, así se mantiene en cualquier
 * computadora. Además se deja el tema resuelto en localStorage (`tgs.theme`) para
 * que el resto del sistema y la primera pintada de la página no parpadeen.
 */
type ThemeContextValue = { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (choice: ThemeChoice) => void };

const ThemeContext = createContext<ThemeContextValue>({ choice: "system", resolved: "light", setChoice: () => undefined });

function systemTheme(): "light" | "dark" {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem("tgs.theme", resolved);
  } catch {
    // sin almacenamiento: el tema igual se aplica en esta pestaña
  }
}

export function CrmThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");

  useEffect(() => {
    void getCrmPreferences().then((prefs) => setChoiceState(prefs.theme)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const update = () => {
      const next = choice === "system" ? systemTheme() : choice;
      setResolved(next);
      applyTheme(next);
    };
    update();
    if (choice !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    void setCrmTheme(next).catch(() => undefined);
  }, []);

  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}

export function useCrmTheme() {
  return useContext(ThemeContext);
}

const OPTIONS: Array<{ id: ThemeChoice; label: string; icon: string }> = [
  { id: "light", label: "Claro", icon: "☀" },
  { id: "dark", label: "Oscuro", icon: "☾" },
  { id: "system", label: "Automático", icon: "◐" },
];

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { choice, setChoice } = useCrmTheme();
  return (
    <div className="cx-theme" role="radiogroup" aria-label="Tema">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={choice === option.id}
          className={choice === option.id ? "active" : ""}
          title={option.label}
          onClick={() => setChoice(option.id)}
        >
          <span aria-hidden="true">{option.icon}</span>
          {compact ? null : <span>{option.label}</span>}
        </button>
      ))}
    </div>
  );
}
