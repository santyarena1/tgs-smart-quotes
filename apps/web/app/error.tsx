"use client";

/** Pantalla de error de la app: muestra el motivo real en vez del genérico "Application error". */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ maxWidth: 640, margin: "12vh auto", padding: "0 1.2rem", display: "grid", gap: "0.9rem" }}>
      <h1>Algo falló al cargar la pantalla</h1>
      <p className="muted">Sacale una foto a este mensaje o copialo y pasalo a soporte. Mientras tanto podés reintentar.</p>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "0.8rem", border: "1px solid var(--line-2)", borderRadius: 10, fontSize: "0.8rem", maxHeight: "40vh", overflow: "auto" }}>
        {error.message || "Error sin mensaje"}
        {error.digest ? `\nDigest: ${error.digest}` : ""}
        {error.stack ? `\n\n${error.stack.split("\n").slice(0, 8).join("\n")}` : ""}
      </pre>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={reset}>Reintentar</button>
        <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>Recargar la página</button>
      </div>
    </main>
  );
}
