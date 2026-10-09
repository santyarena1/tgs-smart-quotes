"use client";

/** Último recurso si falla incluso el layout raíz: muestra el error real en vez de "Application error". */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#070708", color: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "12vh auto", padding: "0 1.2rem" }}>
          <h1 style={{ color: "#ff2438" }}>Algo falló al cargar la aplicación</h1>
          <p>Sacale una foto a este mensaje o copialo y pasalo a soporte.</p>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 12, border: "1px solid #333", borderRadius: 10, fontSize: 13 }}>
            {error.message || "Error sin mensaje"}
            {error.digest ? `\nDigest: ${error.digest}` : ""}
            {error.stack ? `\n\n${error.stack.split("\n").slice(0, 8).join("\n")}` : ""}
          </pre>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 16px", background: "#ff2438", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700 }}>
            Recargar la página
          </button>
        </main>
      </body>
    </html>
  );
}
