"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QuotesView } from "../../../components/QuotesView";

function PresupuestosContent() {
  const searchParams = useSearchParams();
  const [initialSelectedId, setInitialSelectedId] = useState<string | null>(null);

  // `?quote=<id>` abre un presupuesto puntual (lo usan los links de notificaciones y del PDF).
  // Se consume una sola vez y se limpia de la URL para que un refresh no vuelva a forzar la selección.
  useEffect(() => {
    const quoteId = searchParams.get("quote")?.trim();
    if (!quoteId) return;
    setInitialSelectedId(quoteId);
    const params = new URLSearchParams(window.location.search);
    params.delete("quote");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [searchParams]);

  return (
    <QuotesView
      initialSelectedId={initialSelectedId}
      onInitialSelectedConsumed={() => setInitialSelectedId(null)}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PresupuestosContent />
    </Suspense>
  );
}
