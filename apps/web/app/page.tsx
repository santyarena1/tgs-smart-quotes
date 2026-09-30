"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readUiMode } from "../lite/lite-mode";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace(readUiMode() === "lite" ? "/lite" : "/dashboard");
  }, [router]);
  return null;
}
