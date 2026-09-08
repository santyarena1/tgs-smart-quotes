"use client";

import { SessionProvider } from "../../components/SessionProvider";
import { SuiteProvider } from "../../components/SuiteContext";
import { SuiteShell } from "../../components/SuiteShell";

export default function SuiteLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider><SuiteProvider><SuiteShell>{children}</SuiteShell></SuiteProvider></SessionProvider>;
}
