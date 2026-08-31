"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../lib/api";
import { Alert, Loading, errorMessage } from "./shared";

/**
 * Vista previa de la ficha de producto.
 *
 * No es una maqueta: consume `GET /external-module/quotes/:id/publish-preview`,
 * que devuelve el mismo payload que se le manda a WordPress al publicar. Lo que
 * se ve acá (títulos, precios, imágenes, descripción, componentes, cuotas) es
 * exactamente el contenido que va a viajar a la tienda.
 *
 * Lo que esta pantalla NO puede anticipar es el diseño final: la paleta y qué
 * secciones se muestran salen de la variante configurada en WordPress, que el
 * plugin resuelve de su lado (ignora el `layout` del payload). Por eso acá se
 * usa la paleta por defecto de la marca y se listan todas las secciones que
 * tengan contenido.
 */

type PreviewItem = {
  name: string;
  imageUrl: string | null;
  description: string | null;
  specs: { quantity?: number; line?: string | null };
};

type PreviewPayload = {
  title: string;
  priceListCents: string;
  priceCashCents: string;
  priceTransferCents: string;
  installments: Array<{ bank: string | null; installments: number; installmentCents: string }>;
  items: PreviewItem[];

  model3dUrl: string | null;
  thumbnailUrl: string | null;
  descriptionHtml: string | null;
  games: unknown[];
  compatibility: unknown[];
  layout: {
    tokens: { accent: string; bg: string; text: string; radius: number; font?: string };
    blocks: Array<{ type: string; visible: boolean }>;
  };
};

/** Los montos viajan como string de centavos para no perder precisión en bigint. */
function formatCents(value: string | null | undefined): string {
  if (!value) return "—";
  const cents = BigInt(value);
  const whole = cents / 100n;
  return `$ ${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : null;
    const detail = typeof row.tier === "string" ? row.tier : typeof row.note === "string" ? row.note : null;
    if (name && detail) return `${name} · ${detail}`;
    return name ?? detail;
  }
  return null;
}

export function QuotePreview({ versionId }: { versionId: string }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await api<PreviewPayload>(`/external-module/quotes/${versionId}/publish-preview`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading label="Armando la vista previa…" />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!payload) return null;

  // Ojo: el plugin ignora el `layout` que viaja en el payload — la paleta y qué
  // secciones se muestran las define la variante de diseño configurada en
  // WordPress. Por eso acá se usa la paleta por defecto de la marca y se
  // muestran todas las secciones que tengan contenido, en vez de fingir que
  // conocemos los toggles de la variante.
  const accent = "#E31B23";
  const bg = "#080B12";
  const text = "#F8FAFC";
  const radius = 18;
  const heroImage = payload.thumbnailUrl ?? payload.items.find((item) => item.imageUrl)?.imageUrl ?? null;
  const games = payload.games.map(textOf).filter((value): value is string => Boolean(value));
  const compatibility = payload.compatibility.map(textOf).filter((value): value is string => Boolean(value));

  const card: CSSProperties = {
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.10)",
    borderRadius: Math.min(radius, 18),
    padding: 18,
  };
  const sectionTitle: CSSProperties = {
    margin: "0 0 12px",
    fontSize: 15,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,.65)",
  };

  return (
    <div className="preview-frame" style={{ background: bg, color: text, borderRadius: 14, padding: 22, display: "grid", gap: 16 }}>
      {/* Hero: foto/3D + precio + compra, igual que la ficha del plugin */}
      <section style={{ ...card, display: "grid", gap: 18, gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", alignItems: "center" }}>
        <div
          style={{
            background: "rgba(255,255,255,.05)",
            borderRadius: Math.min(radius, 18),
            minHeight: 200,
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
          }}
        >
          {heroImage ? (
            <img src={heroImage} alt={payload.title} style={{ width: "100%", height: 220, objectFit: "contain" }} />
          ) : (
            <span style={{ color: "rgba(255,255,255,.4)", fontSize: 13, padding: 20, textAlign: "center" }}>
              Sin imagen destacada — subí una miniatura para que la ficha no salga vacía.
            </span>
          )}
          {payload.model3dUrl ? (
            <span style={{ fontSize: 12, color: accent, paddingBottom: 10 }}>Incluye modelo 3D interactivo</span>
          ) : null}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: ".18em", color: accent, fontWeight: 700 }}>THE GAMER SHOP</span>
          <h2 style={{ margin: 0, fontSize: 26, lineHeight: 1.15 }}>{payload.title}</h2>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>Transferencia</div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-.02em" }}>
              {formatCents(payload.priceTransferCents)}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>
              Efectivo {formatCents(payload.priceCashCents)} · Lista {formatCents(payload.priceListCents)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: accent, color: "#fff", padding: "10px 18px", borderRadius: 999, fontWeight: 700, fontSize: 14 }}>
              Agregar al carrito
            </span>
            <span style={{ background: "#25D366", color: "#0b141a", padding: "10px 18px", borderRadius: 999, fontWeight: 700, fontSize: 14 }}>
              Consultar por WhatsApp
            </span>
          </div>
        </div>
      </section>

      {payload.descriptionHtml ? (
        <section style={card}>
          <h3 style={sectionTitle}>Descripción</h3>
          <div style={{ fontSize: 14, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: payload.descriptionHtml }} />
        </section>
      ) : null}

      {payload.items.length ? (
        <section style={card}>
          <h3 style={sectionTitle}>Componentes</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {payload.items.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 12 }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    flex: "0 0 auto",
                    borderRadius: 10,
                    background: item.imageUrl ? "#fff" : "rgba(255,255,255,.06)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.45)", textAlign: "center" }}>sin foto</span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  {item.specs?.line ? (
                    <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: accent }}>
                      {item.specs.line}
                    </span>
                  ) : null}
                  <strong style={{ fontSize: 14 }}>{item.name}</strong>
                  {item.description ? (
                    <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", lineHeight: 1.45 }}>{item.description}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}


      {games.length ? (
        <section style={card}>
          <h3 style={sectionTitle}>Juegos</h3>
          <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            {games.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>
      ) : null}

      {compatibility.length ? (
        <section style={card}>
          <h3 style={sectionTitle}>Compatibilidad</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13.5 }}>
            {compatibility.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {payload.installments.length ? (
        <section style={card}>
          <h3 style={sectionTitle}>Formas de pago</h3>
          <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            {payload.installments.slice(0, 6).map((plan, index) => (
              <div key={`${plan.bank ?? "plan"}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "rgba(255,255,255,.7)" }}>{plan.bank ?? "Cuotas"}</span>
                <span>
                  {plan.installments} × {formatCents(plan.installmentCents)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
