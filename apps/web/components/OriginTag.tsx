import type { CSSProperties } from "react";

/** De dónde salió un ítem del presupuesto en armado (un distribuidor o la web). Solo se ve mientras se crea: no se guarda ni va al PDF. */
export type ItemSource = { label: string; color: string };

export function OriginTag({ source }: { source: ItemSource }) {
  return (
    <span className="origin-tag" style={{ "--nc": source.color } as CSSProperties} title="De dónde salió este producto. Solo se ve mientras armás el presupuesto: no aparece en el PDF.">
      <span className="origin-dot" aria-hidden="true" />
      {source.label}
    </span>
  );
}
