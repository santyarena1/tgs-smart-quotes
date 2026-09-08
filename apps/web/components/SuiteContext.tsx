"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { QuoteFromRequestSeed } from "../lib/types";

type SuiteContextValue = {
  quoteSeed: QuoteFromRequestSeed | null;
  setQuoteSeed: React.Dispatch<React.SetStateAction<QuoteFromRequestSeed | null>>;
  consumeQuoteSeed: () => void;
};

const SuiteContext = createContext<SuiteContextValue | null>(null);

export function SuiteProvider({ children }: { children: React.ReactNode }) {
  const [quoteSeed, setQuoteSeed] = useState<QuoteFromRequestSeed | null>(null);
  const consumeQuoteSeed = useCallback(() => setQuoteSeed(null), []);
  const value = useMemo(
    () => ({ quoteSeed, setQuoteSeed, consumeQuoteSeed }),
    [consumeQuoteSeed, quoteSeed],
  );

  return <SuiteContext.Provider value={value}>{children}</SuiteContext.Provider>;
}

export function useSuite() {
  const context = useContext(SuiteContext);
  if (!context) throw new Error("useSuite debe usarse dentro de SuiteProvider");
  return context;
}
