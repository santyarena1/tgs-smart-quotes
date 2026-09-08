"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { AuthUser } from "../lib/types";
import { LoginView } from "./LoginView";
import { Alert, Loading } from "./shared";

type SessionContextValue = {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const response = await api<{ user: AuthUser }>("/auth/me");
      setUser(response.user);
      setBootError(null);
    } catch (error) {
      setUser(null);
      if (error instanceof ApiError && error.status === 0) setBootError(error.message);
    } finally {
      setBoot(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* La sesión ya puede estar invalidada en el servidor. */
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, logout, refreshSession }),
    [logout, refreshSession, user],
  );

  if (boot) {
    return <div className="boot"><Loading label="Verificando sesión…" /></div>;
  }

  if (!user) {
    return (
      <>
        {bootError ? <div className="boot-banner"><Alert>{bootError}</Alert></div> : null}
        <LoginView onSuccess={setUser} />
      </>
    );
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession debe usarse dentro de SessionProvider");
  return context;
}
