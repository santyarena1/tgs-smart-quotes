"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** Decorado de fondo del tema Halloween: murciélagos que cruzan la pantalla, calabazas, calaveras y fantasmas
 *  flotando, telarañas en las esquinas y una luna. Todo es SVG + CSS (sin canvas), va detrás del contenido,
 *  no recibe eventos y se apaga con el interruptor de efectos o con "reducir movimiento". */
type Fly = { y: string; s: number; t: number; dl: number; c: string; o: number; rev?: boolean };
type Float = { icon: "pumpkin" | "skull" | "ghost" | "bat"; x: string; y: string; s: number; t: number; dl: number; r: number; c: string; o: number };

const BATS: Fly[] = [
  { y: "8vh", s: 46, t: 26, dl: 0, c: "#a43bd1", o: 0.5 },
  { y: "22vh", s: 30, t: 20, dl: -6, c: "#ff6a00", o: 0.4, rev: true },
  { y: "40vh", s: 56, t: 32, dl: -14, c: "#7a1fa2", o: 0.45 },
  { y: "58vh", s: 34, t: 22, dl: -3, c: "#a43bd1", o: 0.4, rev: true },
  { y: "72vh", s: 26, t: 18, dl: -10, c: "#ff8a1f", o: 0.35 },
  { y: "14vh", s: 22, t: 16, dl: -8, c: "#c58bff", o: 0.35, rev: true },
  { y: "86vh", s: 40, t: 28, dl: -18, c: "#7a1fa2", o: 0.4 },
];

const FLOATS: Float[] = [
  { icon: "pumpkin", x: "4vw", y: "74vh", s: 64, t: 9, dl: 0, r: -8, c: "#ff6a00", o: 0.16 },
  { icon: "skull", x: "90vw", y: "16vh", s: 54, t: 11, dl: -3, r: 10, c: "#f3efe6", o: 0.1 },
  { icon: "ghost", x: "82vw", y: "66vh", s: 60, t: 10, dl: -5, r: 6, c: "#e7dcff", o: 0.12 },
  { icon: "pumpkin", x: "46vw", y: "88vh", s: 46, t: 12, dl: -7, r: 5, c: "#ff8a1f", o: 0.12 },
  { icon: "skull", x: "9vw", y: "30vh", s: 40, t: 13, dl: -2, r: -12, c: "#f3efe6", o: 0.08 },
  { icon: "ghost", x: "30vw", y: "10vh", s: 42, t: 14, dl: -9, r: -6, c: "#e7dcff", o: 0.09 },
  { icon: "bat", x: "64vw", y: "30vh", s: 36, t: 8, dl: -4, r: 0, c: "#a43bd1", o: 0.18 },
  { icon: "pumpkin", x: "70vw", y: "48vh", s: 34, t: 15, dl: -11, r: 12, c: "#ff6a00", o: 0.09 },
];

const BAT_PATH = "M0 3Q4 0 8 4L10 1.5L12 5L14 1.5L16 4Q20 0 24 3Q22 10 17 9Q14 8 12 14Q10 8 7 9Q2 10 0 3Z";

export function HalloweenDecor() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setOn(root.dataset.skin === "halloween");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-skin"] });
    window.addEventListener("tgs-skin-change", read);
    return () => {
      observer.disconnect();
      window.removeEventListener("tgs-skin-change", read);
    };
  }, []);

  if (!on) return null;
  return (
    <div className="hw-decor" aria-hidden="true">
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <symbol id="hw-bat" viewBox="0 0 24 14"><path d={BAT_PATH} fill="currentColor" /></symbol>
          <symbol id="hw-skull" viewBox="0 0 32 32">
            <path fill="currentColor" fillRule="evenodd" d="M16 3C9.4 3 5 7.6 5 13.4c0 3.6 1.8 6 4 7.4V25c0 1.1.9 2 2 2h1v2h3v-2h2v2h3v-2h1c1.1 0 2-.9 2-2v-4.2c2.2-1.4 4-3.8 4-7.4C27 7.6 22.6 3 16 3zM8.5 14a3 3 0 1 0 6 0a3 3 0 1 0-6 0zM17.5 14a3 3 0 1 0 6 0a3 3 0 1 0-6 0zM16 17l-1.8 3.5h3.6z" />
          </symbol>
          <symbol id="hw-pumpkin" viewBox="0 0 32 32">
            <path fill="currentColor" d="M15 5h2.4l1 4h-4.4z" />
            <ellipse cx="16" cy="19" rx="12" ry="9.5" fill="currentColor" />
            <path fill="#07050a" d="M9 15l3.4 3.6L9 19zM23 15l-3.4 3.6L23 19zM16 19l-1.6 2.6h3.2zM9.5 23l2 1.6 2.5-1.8 2 1.8 2.5-1.8 2 1.6-1 1.4h-9z" />
          </symbol>
          <symbol id="hw-ghost" viewBox="0 0 32 32">
            <path fill="currentColor" d="M6 28V14a10 10 0 0 1 20 0v14l-3.3-3-3.3 3-3.4-3-3.4 3-3.3-3z" />
            <circle cx="12.5" cy="14" r="2" fill="#07050a" />
            <circle cx="19.5" cy="14" r="2" fill="#07050a" />
            <ellipse cx="16" cy="19.5" rx="2" ry="2.6" fill="#07050a" />
          </symbol>
        </defs>
      </svg>

      <svg className="hw-web tl" viewBox="0 0 120 120" width="150" height="150"><g fill="none" stroke="currentColor" strokeWidth="1"><path d="M0 0L120 0M0 0L110 50M0 0L85 85M0 0L50 110M0 0L0 120" /><path d="M30 0Q26 26 0 30M60 0Q52 52 0 60M90 0Q78 78 0 90" /></g></svg>
      <svg className="hw-web tr" viewBox="0 0 120 120" width="150" height="150"><g fill="none" stroke="currentColor" strokeWidth="1"><path d="M0 0L120 0M0 0L110 50M0 0L85 85M0 0L50 110M0 0L0 120" /><path d="M30 0Q26 26 0 30M60 0Q52 52 0 60M90 0Q78 78 0 90" /></g></svg>
      <div className="hw-moon" />

      {BATS.map((b, i) => (
        <span
          key={`b${i}`}
          className={`hw-bat${b.rev ? " rev" : ""}`}
          style={{ "--y": b.y, "--s": `${b.s}px`, "--t": `${b.t}s`, "--dl": `${b.dl}s`, "--c": b.c, "--o": b.o } as CSSProperties}
        >
          <svg viewBox="0 0 24 14" width="100%" height="100%"><use href="#hw-bat" /></svg>
        </span>
      ))}

      {FLOATS.map((f, i) => (
        <span
          key={`f${i}`}
          className="hw-i"
          style={{ "--x": f.x, "--y": f.y, "--s": `${f.s}px`, "--t": `${f.t}s`, "--dl": `${f.dl}s`, "--r": `${f.r}deg`, "--c": f.c, "--o": f.o } as CSSProperties}
        >
          <svg viewBox={f.icon === "bat" ? "0 0 24 14" : "0 0 32 32"} width="100%" height="100%"><use href={`#hw-${f.icon}`} /></svg>
        </span>
      ))}
    </div>
  );
}
