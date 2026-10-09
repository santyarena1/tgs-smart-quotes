"use client";

import { useEffect } from "react";

const SELECTOR = ".overlay, .lt-modal, .rcw-backdrop";
const EXIT_MS = 230;

/**
 * Animación de cierre para todos los modales y paneles: cuando React quita uno de la pantalla, se deja
 * una copia que se desvanece y se achica antes de desaparecer. No toca ningún modal en particular.
 * Se omite con los efectos apagados o si el sistema pide reducir movimiento.
 */
export function ModalExit() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const observer = new MutationObserver((mutations) => {
      if (root.dataset.fx === "off") return;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.removedNodes)) {
          if (!(node instanceof HTMLElement) || !node.matches(SELECTOR)) continue;
          // Los estilos de LITE dependen de tener a .lite como ancestro: se conserva en la copia.
          const insideLite = mutation.target instanceof Element && mutation.target.closest(".lite");
          const wrap = document.createElement("div");
          wrap.className = `tgs-exit${insideLite ? " lite lite-embed" : ""}`;
          wrap.setAttribute("aria-hidden", "true");
          wrap.appendChild(node);
          document.body.appendChild(wrap);
          window.setTimeout(() => wrap.remove(), EXIT_MS + 60);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
