"use client";

import { PageHeader, Pill } from "./shared";

export function ModuloExternoView() {
  return (
    <div>
      <PageHeader
        eyebrow="Módulo Externo"
        title="Módulo Externo"
        subtitle="Espacio de trabajo del módulo externo. En construcción."
        actions={<Pill tone="warn">Beta</Pill>}
      />

      <div className="card card-pad" style={{ maxWidth: 820 }}>
        <h3 className="panel-title">En construcción</h3>
        <p className="section-note" style={{ margin: 0 }}>
          Este módulo está activo y visible en el menú. Todavía no tiene funcionalidad: acá vamos a
          empezar a construirlo. Podés desactivarlo desde{" "}
          <strong>Configuración → Módulo Externo</strong> con la clave.
        </p>
      </div>
    </div>
  );
}
