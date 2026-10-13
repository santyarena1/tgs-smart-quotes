"use client";

import { SessionProvider } from "../../components/SessionProvider";
import { LiteShell } from "../../lite/LiteShell";
import "../../lite/lite.css";
import "../../lite/lite-clean.css";

export default function LiteLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider><LiteShell>{children}</LiteShell></SessionProvider>;
}
