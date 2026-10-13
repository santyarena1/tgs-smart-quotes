"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSession } from "../components/SessionProvider";

export type LiteBranch = { id: string; name: string };

type LiteContextValue = {
  branches: LiteBranch[];
  branchId: string | null;
  branchName: string;
  setBranchId: (id: string) => void;
  /** El vendedor queda fijo en su local; el admin puede mirar otro. */
  locked: boolean;
  /** Los presupuestos nuevos se guardan siempre en el local del usuario. */
  writesElsewhere: boolean;
  /** Preferencia por usuario: la columna de financiación está tapada (ojito). */
  hideFinancing: boolean;
  setHideFinancing: (hidden: boolean) => void;
};

const LiteContext = createContext<LiteContextValue | null>(null);
const BRANCH_KEY = "tgs.lite.branch";
// Copia local solo para que no parpadee al cargar; la que manda es la de la cuenta del usuario.
const HIDE_FIN_KEY = "tgs.lite.hideFinancing";

export function LiteProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [branches, setBranches] = useState<LiteBranch[]>([]);
  const [branchId, setBranchState] = useState<string | null>(user?.branchId ?? null);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: LiteBranch[] }>("/branches")
      .then((res) => {
        if (cancelled) return;
        setBranches(res.items);
        setBranchState((current) => {
          if (user?.role !== "ADMIN" && user?.branchId) return user.branchId;
          let saved: string | null = null;
          try { saved = window.localStorage.getItem(BRANCH_KEY); } catch { /* sin storage */ }
          const pick = [saved, current, user?.branchId].find((id) => id && res.items.some((b) => b.id === id));
          return pick ?? res.items[0]?.id ?? null;
        });
      })
      .catch(() => { if (!cancelled) setBranches([]); });
    return () => { cancelled = true; };
  }, [user?.branchId, user?.role]);

  const [hideFinancing, setHideFinancingState] = useState(false);
  useEffect(() => {
    try { setHideFinancingState(window.localStorage.getItem(HIDE_FIN_KEY) === "1"); } catch { /* sin storage */ }
    let cancelled = false;
    void api<{ hideFinancing?: boolean }>("/me/lite-preferences")
      .then((res) => {
        if (cancelled) return;
        const hidden = res.hideFinancing === true;
        setHideFinancingState(hidden);
        try { window.localStorage.setItem(HIDE_FIN_KEY, hidden ? "1" : "0"); } catch { /* sin storage */ }
      })
      .catch(() => { /* queda la copia local */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  const setHideFinancing = useCallback((hidden: boolean) => {
    setHideFinancingState(hidden);
    try { window.localStorage.setItem(HIDE_FIN_KEY, hidden ? "1" : "0"); } catch { /* sin storage */ }
    void api("/me/lite-preferences", { method: "PUT", body: { hideFinancing: hidden } }).catch(() => { /* sigue valiendo en este navegador */ });
  }, []);

  const setBranchId = useCallback((id: string) => {
    setBranchState(id);
    try { window.localStorage.setItem(BRANCH_KEY, id); } catch { /* sin storage */ }
  }, []);

  const value = useMemo<LiteContextValue>(() => ({
    branches,
    branchId,
    branchName: branches.find((b) => b.id === branchId)?.name ?? "",
    setBranchId,
    locked: user?.role !== "ADMIN",
    writesElsewhere: Boolean(branchId && user?.branchId !== branchId),
    hideFinancing,
    setHideFinancing,
  }), [branchId, branches, setBranchId, user?.branchId, user?.role, hideFinancing, setHideFinancing]);

  return <LiteContext.Provider value={value}>{children}</LiteContext.Provider>;
}

export function useLite() {
  const ctx = useContext(LiteContext);
  if (!ctx) throw new Error("useLite debe usarse dentro de LiteProvider");
  return ctx;
}
