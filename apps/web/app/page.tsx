"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveUiMode } from "../lite/lite-mode";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    saveUiMode("full");
    router.replace("/dashboard");
  }, [router]);
  return null;
}
