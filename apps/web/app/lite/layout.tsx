"use client";

import { SessionProvider } from "../../components/SessionProvider";
import { LiteShell } from "../../lite/LiteShell";
import "../../lite/lite.css";

export default function LiteLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider><LiteShell>{children}</LiteShell></SessionProvider>;
}
