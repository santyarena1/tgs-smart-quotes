"use client";

import { useEffect, useRef, useState } from "react";

/** Archivo de video opcional: si existe en /public/fx/gamer-showcase.mp4 se usa de fondo del tema BeGamer. */
const VIDEO_SRC = "/fx/gamer-showcase.mp4";

type Build = { name: string; specs: string[]; c1: string; c2: string; towers: number; style: number };

const BUILDS: Build[] = [
  { name: "BUILD 01 // CRIMSON TITAN", specs: ["RYZEN 9 9950X · 16C/32T", "RTX 5090 · 32GB GDDR7", "DDR5 64GB 6400 · RGB", "AIO 360MM · LCD PUMP"], c1: "255, 31, 61", c2: "255, 150, 160", towers: 3, style: 0 },
  { name: "BUILD 02 // RED DRAGON", specs: ["CORE ULTRA 9 285K", "RX 9070 XT · 16GB", "DDR5 32GB 7200", "CUSTOM LOOP · RED COOLANT"], c1: "255, 60, 31", c2: "255, 190, 120", towers: 2, style: 1 },
  { name: "BUILD 03 // BLACKOUT", specs: ["RYZEN 7 9800X3D", "RTX 5080 · 16GB", "DDR5 32GB 6000", "FULL TEMPERED GLASS"], c1: "255, 20, 90", c2: "255, 140, 190", towers: 3, style: 2 },
  { name: "BUILD 04 // VOLT STRIKE", specs: ["RYZEN 9 7950X3D", "RTX 4090 · 24GB", "DDR5 64GB 6000", "DUAL 280MM RADIATOR"], c1: "230, 0, 35", c2: "255, 255, 255", towers: 2, style: 0 },
  { name: "BUILD 05 // OVERCLOCK", specs: ["CORE i9-14900KS · 6.2GHZ", "RTX 4080 SUPER", "DDR5 48GB 8000", "LN2 READY"], c1: "255, 45, 45", c2: "255, 170, 90", towers: 3, style: 1 },
  { name: "BUILD 06 // PHANTOM", specs: ["RYZEN 5 9600X", "RTX 5070 Ti · 16GB", "DDR5 32GB 6000", "ARGB 12 FANS"], c1: "255, 0, 70", c2: "255, 120, 170", towers: 2, style: 2 },
];

const SCENE_MS = 8200;
const CUT_MS = 650;
/** El glitch solo se dispara al cambiar de pestaña, al aplicar un filtro o al abrirse una ventana. */
const TAB_TRIGGERS = '.tab, .lt-tab, [role="tab"], .nav-link';
const FILTER_TRIGGERS = '.qkind, .qkindchip, .lt-kind, .lt-chip, .lt-states button, .lt-more-row button, .lt-colls button, .lt-active button, .lt-list-filters button, .lt-quick select, .lt-pager button, .filters button, .chips button'

type Part = { kind: number; x: number; y: number; s: number; rot: number; spin: number; ph: number; bob: number };
type Puff = { x: number; y: number; r: number; vx: number; vy: number; a: number };
type Bolt = { pts: Array<[number, number]>; branch: Array<Array<[number, number]>>; at: number };

/**
 * Tema BeGamer, en dos capas:
 *  - Fondo: un "reel" de PCs gamer dibujado en vivo (torres con ventiladores RGB, GPU, refrigeración líquida), suelo de
 *    neón en perspectiva, láseres, rayos eléctricos, componentes de PC flotando en neón, humo y un HUD de grabación.
 *    Funciona en modo claro y oscuro. Si hay un video propio en /public/fx/gamer-showcase.mp4 se usa de fondo.
 *  - Capa de glitch por ENCIMA de toda la interfaz: franjas que invierten los colores de lo que hay debajo, ruido y cortes.
 *    Se dispara SOLO al cambiar de pestaña, al aplicar un filtro o al abrirse una ventana.
 * Solo existe con el tema BeGamer y con los efectos encendidos.
 */
export function GamerShowcase() {
  const ref = useRef<HTMLCanvasElement>(null);
  const glitchRef = useRef<HTMLCanvasElement>(null);
  const [video, setVideo] = useState(false);

  // Video propio (opcional): solo se busca cuando el tema BeGamer está activo, y el resultado se recuerda en la sesión.
  useEffect(() => {
    let alive = true;
    let done = false;
    const check = () => {
      if (done || document.documentElement.dataset.skin !== "gamer") return;
      done = true;
      let cached: string | null = null;
      try { cached = window.sessionStorage.getItem("tgs.gm.video"); } catch { /* sin storage */ }
      if (cached !== null) { setVideo(cached === "1"); return; }
      void fetch(VIDEO_SRC, { method: "HEAD" })
        .then((res) => {
          const ok = res.ok && (res.headers.get("content-type") ?? "").startsWith("video");
          try { window.sessionStorage.setItem("tgs.gm.video", ok ? "1" : "0"); } catch { /* sin storage */ }
          if (alive) setVideo(ok);
        })
        .catch(() => undefined);
    };
    check();
    window.addEventListener("tgs-skin-change", check);
    return () => { alive = false; window.removeEventListener("tgs-skin-change", check); };
  }, []);

  // ---------------------------------------------------------------- fondo
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const root = document.documentElement;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let sceneStart = 0;
    let sceneIndex = 0;
    let nextBolt = 1500;
    let fontFamily = "monospace";
    let parts: Part[] = [];
    let puffs: Puff[] = [];
    const bolts: Bolt[] = [];
    let hasVideo = false;
    const t0 = performance.now();

    const active = () => root.dataset.skin === "gamer" && root.dataset.fx !== "off" && !document.hidden;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = getComputedStyle(root).getPropertyValue("--font-orbitron").trim();
      fontFamily = f ? `${f}, monospace` : "monospace";
      // componentes flotando, repartidos por toda la pantalla
      const n = Math.max(7, Math.min(14, Math.round((w * h) / 120000)));
      parts = Array.from({ length: n }, (_, i) => ({
        kind: i % 6,
        x: Math.random() * w,
        y: h * (0.08 + Math.random() * 0.78),
        s: 16 + Math.random() * 26,
        rot: (Math.random() - 0.5) * 1.2,
        spin: (Math.random() - 0.5) * 0.35,
        ph: Math.random() * 6.28,
        bob: 10 + Math.random() * 22,
      }));
      puffs = Array.from({ length: 16 }, () => ({ x: Math.random() * w, y: h * (0.4 + Math.random() * 0.7), r: 130 + Math.random() * 190, vx: (Math.random() - 0.5) * 14, vy: -(6 + Math.random() * 12), a: 0.05 + Math.random() * 0.08 }));
    }

    const rgba = (c: string, a: number) => `rgba(${c}, ${a})`;
    /** Trazo de neón: un pasaje ancho y tenue + uno fino y brillante. */
    function neon(c: string, width: number, alpha = 1) {
      ctx!.lineWidth = width * 4; ctx!.strokeStyle = rgba(c, 0.13 * alpha); ctx!.stroke();
      ctx!.lineWidth = width; ctx!.strokeStyle = rgba(c, 0.85 * alpha); ctx!.stroke();
    }
    function rr(x: number, y: number, ww: number, hh: number, r: number) {
      ctx!.beginPath();
      ctx!.moveTo(x + r, y); ctx!.arcTo(x + ww, y, x + ww, y + hh, r); ctx!.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx!.arcTo(x, y + hh, x, y, r); ctx!.arcTo(x, y, x + ww, y, r); ctx!.closePath();
    }

    /** Ventilador con aro RGB que gira. */
    function fan(cx: number, cy: number, r: number, t: number, c1: string, c2: string, dir = 1) {
      ctx!.beginPath(); ctx!.arc(cx, cy, r, 0, Math.PI * 2); neon(c1, 1.2, 0.8);
      ctx!.beginPath(); ctx!.arc(cx, cy, r * 0.72, 0, Math.PI * 2); neon(c2, 1, 0.45);
      for (let i = 0; i < 4; i++) {
        const a = dir * t * 2.2 + (i * Math.PI) / 2;
        ctx!.beginPath(); ctx!.arc(cx, cy, r * 0.86, a, a + 0.9); neon(i % 2 ? c2 : c1, 2.2, 0.95);
      }
      ctx!.strokeStyle = rgba(c1, 0.5); ctx!.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const a = dir * t * 5 + (i * Math.PI * 2) / 7;
        ctx!.beginPath();
        ctx!.moveTo(cx + Math.cos(a) * r * 0.14, cy + Math.sin(a) * r * 0.14);
        ctx!.quadraticCurveTo(cx + Math.cos(a + 0.5) * r * 0.5, cy + Math.sin(a + 0.5) * r * 0.5, cx + Math.cos(a + 0.95) * r * 0.66, cy + Math.sin(a + 0.95) * r * 0.66);
        ctx!.stroke();
      }
      ctx!.beginPath(); ctx!.arc(cx, cy, r * 0.13, 0, Math.PI * 2); ctx!.fillStyle = rgba(c1, 0.7); ctx!.fill();
    }

    /** Una torre completa, de pie sobre el suelo (baseY). */
    function tower(cx: number, baseY: number, hh: number, t: number, b: Build, k: number, dark: boolean) {
      const ww = hh * 0.5;
      const x = cx - ww / 2;
      const y = baseY - hh;
      const c1 = b.c1;
      const c2 = b.c2;
      const g = ctx!.createRadialGradient(cx, baseY, 0, cx, baseY, ww * 1.1);
      g.addColorStop(0, rgba(c1, dark ? 0.32 : 0.22)); g.addColorStop(1, rgba(c1, 0));
      ctx!.fillStyle = g; ctx!.fillRect(cx - ww * 1.2, baseY - ww * 0.4, ww * 2.4, ww * 0.8);
      rr(x, y, ww, hh, hh * 0.03);
      const gl = ctx!.createLinearGradient(x, y, x + ww, y + hh);
      if (dark) { gl.addColorStop(0, "rgba(255,255,255,0.07)"); gl.addColorStop(0.5, "rgba(10,10,14,0.55)"); gl.addColorStop(1, rgba(c1, 0.1)); }
      else { gl.addColorStop(0, "rgba(255,255,255,0.7)"); gl.addColorStop(0.5, "rgba(240,240,246,0.55)"); gl.addColorStop(1, rgba(c1, 0.12)); }
      ctx!.fillStyle = gl; ctx!.fill();
      neon(c1, 1.6);
      ctx!.save(); rr(x, y, ww, hh, hh * 0.03); ctx!.clip();
      const sx = x + ((t * 60 + k * 90) % (ww * 3)) - ww;
      ctx!.fillStyle = dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.5)";
      ctx!.beginPath(); ctx!.moveTo(sx, y); ctx!.lineTo(sx + ww * 0.18, y); ctx!.lineTo(sx - ww * 0.3, y + hh); ctx!.lineTo(sx - ww * 0.48, y + hh); ctx!.fill();
      ctx!.restore();
      const fr = ww * 0.17;
      for (let i = 0; i < 3; i++) fan(x + ww * 0.2, y + hh * (0.22 + i * 0.26), fr, t + k, c1, c2, 1);
      ctx!.beginPath(); rr(x + ww * 0.42, y + hh * 0.07, ww * 0.5, hh * 0.1, 4); neon(c2, 1, 0.7);
      fan(x + ww * 0.55, y + hh * 0.12, ww * 0.05, t, c2, c1, -1); fan(x + ww * 0.7, y + hh * 0.12, ww * 0.05, t, c2, c1, -1); fan(x + ww * 0.85, y + hh * 0.12, ww * 0.05, t, c2, c1, -1);
      ctx!.beginPath(); ctx!.moveTo(x + ww * 0.5, y + hh * 0.17); ctx!.bezierCurveTo(x + ww * 0.5, y + hh * 0.3, x + ww * 0.62, y + hh * 0.26, x + ww * 0.64, y + hh * 0.34); neon(c1, 1.2, 0.8);
      ctx!.beginPath(); ctx!.moveTo(x + ww * 0.8, y + hh * 0.17); ctx!.bezierCurveTo(x + ww * 0.82, y + hh * 0.28, x + ww * 0.72, y + hh * 0.26, x + ww * 0.7, y + hh * 0.34); neon(c1, 1.2, 0.8);
      ctx!.beginPath(); ctx!.arc(x + ww * 0.67, y + hh * 0.36, ww * 0.07, 0, Math.PI * 2); neon(c2, 1.4, 0.9);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + k);
      ctx!.fillStyle = rgba(c1, 0.25 + pulse * 0.4); ctx!.beginPath(); ctx!.arc(x + ww * 0.67, y + hh * 0.36, ww * 0.035, 0, Math.PI * 2); ctx!.fill();
      for (let i = 0; i < 4; i++) {
        const rx = x + ww * (0.82 + i * 0.035);
        const ry = y + hh * 0.28;
        const rh = hh * 0.16;
        ctx!.strokeStyle = rgba(c1, 0.55); ctx!.lineWidth = 1; ctx!.strokeRect(rx, ry, ww * 0.022, rh);
        const p = (t * 1.6 + i * 0.25 + k) % 1;
        ctx!.fillStyle = rgba(c2, 0.85); ctx!.fillRect(rx, ry + rh * p * 0.9, ww * 0.022, rh * 0.1);
      }
      ctx!.strokeStyle = rgba(c1, 0.13); ctx!.lineWidth = 1;
      for (let i = 0; i < 6; i++) { ctx!.beginPath(); ctx!.moveTo(x + ww * 0.42, y + hh * (0.45 + i * 0.03)); ctx!.lineTo(x + ww * 0.95, y + hh * (0.45 + i * 0.03)); ctx!.stroke(); }
      const gy = y + hh * (b.style === 1 ? 0.68 : 0.62);
      rr(x + ww * 0.36, gy, ww * 0.6, hh * 0.15, 6); ctx!.fillStyle = dark ? "rgba(0,0,0,0.5)" : "rgba(30,30,40,0.12)"; ctx!.fill(); neon(c1, 1.6);
      for (let i = 0; i < 3; i++) fan(x + ww * (0.5 + i * 0.19), gy + hh * 0.075, hh * 0.06, t * 1.1 + i, c1, c2, i % 2 ? -1 : 1);
      ctx!.beginPath(); ctx!.moveTo(x + ww * 0.36, gy + hh * 0.158); ctx!.lineTo(x + ww * 0.96, gy + hh * 0.158); neon(c2, 2, 0.8 + 0.2 * Math.sin(t * 4));
      ctx!.beginPath(); ctx!.moveTo(x + ww * 0.04, y + hh * 0.9); ctx!.lineTo(x + ww * 0.96, y + hh * 0.9); neon(c1, 1, 0.5);
      ctx!.fillStyle = rgba(c1, 0.2 + 0.2 * Math.sin(t * 2 + k)); ctx!.fillRect(x + ww * 0.1, y + hh * 0.93, ww * 0.8, hh * 0.012);
      ctx!.strokeStyle = rgba(c1, 0.6); ctx!.lineWidth = 2;
      ctx!.beginPath(); ctx!.moveTo(x + ww * 0.08, y + hh); ctx!.lineTo(x + ww * 0.04, y + hh + hh * 0.025); ctx!.moveTo(x + ww * 0.92, y + hh); ctx!.lineTo(x + ww * 0.96, y + hh + hh * 0.025); ctx!.stroke();
    }

    /** Componentes de PC flotando: tarjeta gráfica, procesador, memoria, SSD, ventilador y fuente. Todo en neón. */
    function floating(t: number, c1: string, c2: string, dark: boolean) {
      for (const p of parts) {
        const px = p.x + Math.sin(t * 0.18 + p.ph) * 26;
        const py = p.y + Math.sin(t * 0.5 + p.ph) * p.bob;
        const rot = p.rot + Math.sin(t * 0.2 + p.ph) * 0.35 + p.spin * t * 0.4;
        const s = p.s * (1 + 0.06 * Math.sin(t * 0.7 + p.ph));
        ctx!.save();
        ctx!.translate(px, py);
        ctx!.rotate(rot);
        const col = p.kind % 2 ? c2 : c1;
        ctx!.globalAlpha = dark ? 0.55 : 0.5;
        switch (p.kind) {
          case 0: // tarjeta gráfica
            rr(-s * 1.7, -s * 0.6, s * 3.4, s * 1.2, 4); neon(col, 1.4);
            for (let i = 0; i < 3; i++) fan(-s * 1.0 + i * s * 1.0, 0, s * 0.42, t + i, c1, c2, i % 2 ? -1 : 1);
            ctx!.beginPath(); ctx!.moveTo(-s * 1.7, s * 0.7); ctx!.lineTo(s * 1.7, s * 0.7); neon(c2, 1.4, 0.8);
            break;
          case 1: // procesador
            rr(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6, 3); neon(col, 1.4);
            ctx!.strokeStyle = rgba(c1, 0.8); ctx!.lineWidth = 1; ctx!.strokeRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
            for (let i = -3; i <= 3; i++) { ctx!.fillStyle = rgba(c2, 0.7); ctx!.fillRect(-s * 0.84, i * s * 0.2 - 1, s * 0.07, 2); ctx!.fillRect(s * 0.77, i * s * 0.2 - 1, s * 0.07, 2); ctx!.fillRect(i * s * 0.2 - 1, -s * 0.84, 2, s * 0.07); ctx!.fillRect(i * s * 0.2 - 1, s * 0.77, 2, s * 0.07); }
            ctx!.fillStyle = rgba(c1, 0.35 + 0.3 * Math.sin(t * 2 + p.ph)); ctx!.fillRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.4);
            break;
          case 2: // memoria RAM
            rr(-s * 1.8, -s * 0.28, s * 3.6, s * 0.56, 2); neon(col, 1.3);
            for (let i = 0; i < 6; i++) { ctx!.strokeStyle = rgba(c1, 0.7); ctx!.lineWidth = 1; ctx!.strokeRect(-s * 1.55 + i * s * 0.52, -s * 0.16, s * 0.36, s * 0.32); }
            ctx!.fillStyle = rgba(c2, 0.85); ctx!.fillRect(-s * 1.8 + ((t * 0.9 + p.ph) % 1) * s * 3.2, s * 0.22, s * 0.4, s * 0.05);
            break;
          case 3: // SSD M.2
            rr(-s * 1.2, -s * 0.4, s * 2.4, s * 0.8, 3); neon(col, 1.3);
            for (let i = 0; i < 3; i++) { ctx!.strokeStyle = rgba(c1, 0.75); ctx!.lineWidth = 1; ctx!.strokeRect(-s * 0.85 + i * s * 0.6, -s * 0.2, s * 0.42, s * 0.4); }
            ctx!.fillStyle = rgba(c2, 0.7); ctx!.fillRect(s * 1.0, -s * 0.3, s * 0.18, s * 0.6);
            break;
          case 4: // ventilador
            fan(0, 0, s * 0.9, t, c1, c2, 1);
            break;
          default: // fuente
            rr(-s * 1.0, -s * 0.7, s * 2.0, s * 1.4, 3); neon(col, 1.3);
            fan(-s * 0.2, 0, s * 0.5, t, c2, c1, -1);
            ctx!.strokeStyle = rgba(c1, 0.6); ctx!.lineWidth = 1;
            for (let i = 0; i < 4; i++) { ctx!.beginPath(); ctx!.moveTo(s * 0.55, -s * 0.45 + i * s * 0.3); ctx!.lineTo(s * 0.9, -s * 0.45 + i * s * 0.3); ctx!.stroke(); }
        }
        ctx!.restore();
      }
      ctx!.globalAlpha = 1;
    }

    /** Humo rojizo que sube y se desplaza. */
    function smoke(dt: number, c1: string, dark: boolean) {
      for (const p of puffs) {
        p.x += (p.vx * dt) / 1000; p.y += (p.vy * dt) / 1000;
        if (p.y < -p.r) { p.y = h + p.r * 0.6; p.x = Math.random() * w; }
        const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, dark ? rgba(c1, p.a * 1.1) : rgba("110, 110, 125", p.a * 0.9));
        g.addColorStop(0.5, dark ? rgba("90, 8, 22", p.a * 0.5) : rgba("140, 140, 150", p.a * 0.4));
        g.addColorStop(1, dark ? "rgba(90, 8, 22, 0)" : "rgba(140, 140, 150, 0)");
        ctx!.fillStyle = g; ctx!.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }

    /** Rayo eléctrico ramificado. */
    function makeBolt(now: number) {
      const sx = Math.random() * w;
      const ex = sx + (Math.random() - 0.5) * w * 0.5;
      const ey = h * (0.4 + Math.random() * 0.5);
      const pts: Array<[number, number]> = [[sx, 0]];
      const branch: Array<Array<[number, number]>> = [];
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const px = sx + (ex - sx) * f + (Math.random() - 0.5) * 70 * (1 - f * 0.4);
        const py = ey * f;
        pts.push([px, py]);
        if (i % 4 === 0 && Math.random() < 0.8) {
          const br: Array<[number, number]> = [[px, py]];
          let bx = px, by = py;
          for (let j = 0; j < 4; j++) { bx += (Math.random() - 0.3) * 60; by += 18 + Math.random() * 28; br.push([bx, by]); }
          branch.push(br);
        }
      }
      bolts.push({ pts, branch, at: now });
    }
    function drawBolts(now: number, c1: string, dark: boolean) {
      ctx!.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i]!;
        const age = now - b.at;
        if (age > 520) { bolts.splice(i, 1); continue; }
        const fl = age < 90 ? 1 : age < 160 ? 0.2 : age < 260 ? 0.85 : Math.max(0, 1 - (age - 260) / 260) * 0.6;
        const path = (pts: Array<[number, number]>) => { ctx!.beginPath(); ctx!.moveTo(pts[0]![0], pts[0]![1]); for (const [px, py] of pts) ctx!.lineTo(px, py); };
        for (const arr of [b.pts, ...b.branch]) {
          path(arr);
          ctx!.strokeStyle = rgba(c1, 0.3 * fl); ctx!.lineWidth = 9; ctx!.stroke();
          ctx!.strokeStyle = dark ? `rgba(255, 255, 255, ${0.95 * fl})` : rgba(c1, 0.95 * fl); ctx!.lineWidth = 1.6; ctx!.stroke();
        }
        if (age < 120) { ctx!.fillStyle = rgba(c1, (dark ? 0.1 : 0.06) * fl); ctx!.fillRect(0, 0, w, h); }
      }
      ctx!.globalCompositeOperation = "source-over";
    }

    /** Suelo de neón en perspectiva. */
    function floor(t: number, c1: string) {
      const hor = h * 0.66;
      const vp = w / 2;
      const g = ctx!.createLinearGradient(0, hor, 0, h);
      g.addColorStop(0, rgba(c1, 0.0)); g.addColorStop(1, rgba(c1, 0.22));
      ctx!.fillStyle = g; ctx!.fillRect(0, hor, w, h - hor);
      ctx!.lineWidth = 1;
      for (let i = -24; i <= 24; i++) {
        ctx!.strokeStyle = rgba(c1, 0.22);
        ctx!.beginPath(); ctx!.moveTo(vp + i * 14, hor); ctx!.lineTo(vp + i * 110, h); ctx!.stroke();
      }
      const f = (t * 0.45) % 1;
      for (let i = 0; i < 12; i++) {
        const p = (i + f) / 12;
        const yy = hor + (h - hor) * p * p;
        ctx!.strokeStyle = rgba(c1, 0.1 + p * 0.3);
        ctx!.beginPath(); ctx!.moveTo(0, yy); ctx!.lineTo(w, yy); ctx!.stroke();
      }
      ctx!.beginPath(); ctx!.moveTo(0, hor); ctx!.lineTo(w, hor); neon(c1, 1.2, 0.8);
    }

    /** Láseres desde el techo que barren la escena. */
    function lasers(t: number, c1: string, c2: string, dark: boolean) {
      ctx!.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (let i = 0; i < 6; i++) {
        const ox = (w * (i + 0.5)) / 6;
        const ang = Math.PI / 2 + Math.sin(t * 0.7 + i * 1.3) * 0.75;
        const len = h * 1.3;
        const ex = ox + Math.cos(ang) * len;
        const ey = Math.sin(ang) * len;
        const col = i % 3 === 0 ? c2 : c1;
        const lg = ctx!.createLinearGradient(ox, 0, ex, ey);
        lg.addColorStop(0, rgba(col, 0.9)); lg.addColorStop(1, rgba(col, 0));
        ctx!.strokeStyle = lg;
        ctx!.lineWidth = 7; ctx!.globalAlpha = 0.12; ctx!.beginPath(); ctx!.moveTo(ox, 0); ctx!.lineTo(ex, ey); ctx!.stroke();
        ctx!.lineWidth = 1.4; ctx!.globalAlpha = dark ? 0.85 : 0.6; ctx!.beginPath(); ctx!.moveTo(ox, 0); ctx!.lineTo(ex, ey); ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";
    }

    function hud(now: number, sceneT: number, b: Build, c1: string, dark: boolean) {
      const total = (now - t0) / 1000;
      const ff = Math.floor((total * 30) % 30);
      const ss = Math.floor(total % 60);
      const mm = Math.floor((total / 60) % 60);
      const tc = `00:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
      const fg = dark ? "rgba(255,255,255," : "rgba(20,20,28,";
      ctx!.font = `600 12px ${fontFamily}`;
      ctx!.textBaseline = "top";
      const blink = Math.floor(total * 1.6) % 2 === 0;
      ctx!.fillStyle = blink ? "rgba(255,31,61,0.95)" : "rgba(255,31,61,0.25)";
      ctx!.beginPath(); ctx!.arc(w - 150, 31, 5, 0, Math.PI * 2); ctx!.fill();
      ctx!.fillStyle = fg + "0.8)"; ctx!.textAlign = "right"; ctx!.fillText(`REC  ${tc}`, w - 24, 24);
      ctx!.fillStyle = rgba(c1, 0.95); ctx!.fillText(`SHOWCASE // ${String(sceneIndex + 1).padStart(2, "0")}/${String(BUILDS.length).padStart(2, "0")}`, w - 24, 44);
      ctx!.textAlign = "left";
      ctx!.font = `800 15px ${fontFamily}`; ctx!.fillStyle = fg + "0.92)";
      const title = b.name.slice(0, Math.min(b.name.length, Math.floor(sceneT / 45)));
      ctx!.fillText(title + (sceneT % 600 < 300 ? "▌" : ""), 24, h - 118);
      ctx!.font = `600 12px ${fontFamily}`; ctx!.fillStyle = rgba(c1, 0.95);
      b.specs.forEach((line, i) => {
        const startAt = 700 + i * 380;
        const n = Math.max(0, Math.min(line.length, Math.floor((sceneT - startAt) / 28)));
        ctx!.fillText("> " + line.slice(0, n), 24, h - 92 + i * 18);
      });
      ctx!.strokeStyle = fg + "0.55)"; ctx!.lineWidth = 2;
      const m = 14; const L = 26;
      for (const [px, py, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as const) {
        ctx!.beginPath(); ctx!.moveTo(px, py + sy * L); ctx!.lineTo(px, py); ctx!.lineTo(px + sx * L, py); ctx!.stroke();
      }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!active()) { if (last) ctx!.clearRect(0, 0, w, h); last = 0; return; }
      if (!last) { sceneStart = now; }
      const dt = Math.min(48, last ? now - last : 16);
      last = now;
      const dark = root.dataset.theme === "dark";
      const t = (now - t0) / 1000;
      if (now - sceneStart > SCENE_MS) { sceneStart = now; sceneIndex = (sceneIndex + 1) % BUILDS.length; }
      const b = BUILDS[sceneIndex]!;
      const sceneT = now - sceneStart;
      const cut = sceneT < CUT_MS ? 1 - sceneT / CUT_MS : 0;
      hasVideo = Boolean(document.querySelector(".gm-video"));

      ctx!.clearRect(0, 0, w, h);
      if (!hasVideo) {
        const bg = ctx!.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.7);
        if (dark) { bg.addColorStop(0, rgba(b.c1, 0.2)); bg.addColorStop(0.6, "rgba(6,0,2,0.55)"); bg.addColorStop(1, "rgba(0,0,0,0.85)"); }
        else { bg.addColorStop(0, rgba(b.c1, 0.1)); bg.addColorStop(0.6, "rgba(235,236,242,0.35)"); bg.addColorStop(1, "rgba(225,226,234,0.55)"); }
        ctx!.fillStyle = bg; ctx!.fillRect(0, 0, w, h);
        floor(t, b.c1);
      }
      smoke(dt, b.c1, dark);
      lasers(t, b.c1, b.c2, dark);
      if (!hasVideo) {
        const zoom = 1.04 + 0.03 * Math.sin(t * 0.25) + cut * 0.12;
        ctx!.save();
        ctx!.translate(w / 2 + Math.sin(t * 0.2) * 18, h * 0.66);
        ctx!.scale(zoom, zoom);
        ctx!.translate(-w / 2, -h * 0.66);
        const base = h * 0.8;
        const big = Math.min(h * 0.62, w * 0.5);
        if (b.towers >= 3) {
          tower(w * 0.2, base - 8, big * 0.62, t, b, 1, dark);
          tower(w * 0.8, base - 8, big * 0.62, t, b, 2, dark);
        } else {
          tower(w * 0.27, base - 8, big * 0.72, t, b, 1, dark);
          tower(w * 0.73, base - 8, big * 0.72, t, b, 2, dark);
        }
        tower(w * 0.5, base + 20, big, t, b, 0, dark);
        ctx!.restore();
      }
      floating(t, b.c1, b.c2, dark);
      if (now > nextBolt) { makeBolt(now); nextBolt = now + 2200 + Math.random() * 3800; }
      drawBolts(now, b.c1, dark);
      hud(now, sceneT, b, b.c1, dark);
      if (cut > 0) { ctx!.fillStyle = dark ? `rgba(255, 255, 255, ${cut * 0.18})` : `rgba(255, 31, 61, ${cut * 0.1})`; ctx!.fillRect(0, 0, w, h); }
    }

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ------------------------------------------------ capa de glitch por encima de TODO
  useEffect(() => {
    const canvas = glitchRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const root = document.documentElement;
    let w = 0;
    let h = 0;
    let raf = 0;
    let until = 0;
    let duration = 1;
    let power = 0;
    let lastDraw = 0;
    let cleared = true;

    const active = () => root.dataset.skin === "gamer" && root.dataset.fx !== "off" && !document.hidden;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const pulse = (p: number) => {
      if (!active()) return;
      const now = performance.now();
      power = Math.max(power * (until > now ? 0.6 : 0), Math.min(1, p));
      duration = 170 + 330 * Math.min(1, p);
      until = now + duration;
    };

    function paint(now: number) {
      const remain = Math.max(0, (until - now) / duration);
      const k = Math.max(0.15, remain) * power;
      ctx!.clearRect(0, 0, w, h);
      const COLORS = ["255, 31, 61", "255, 255, 255", "255, 31, 61", "0, 0, 0", "255, 90, 70"];
      // franjas que invierten (mix-blend-mode: difference) los colores de lo que hay debajo
      const bands = 3 + Math.floor(k * 12);
      for (let i = 0; i < bands; i++) {
        const y = Math.random() * h;
        const bh = 1 + Math.random() * (6 + 46 * k);
        const bx = Math.random() < 0.5 ? 0 : Math.random() * w * 0.6;
        const bw = Math.random() < 0.6 ? w - bx : 80 + Math.random() * w * 0.5;
        ctx!.fillStyle = `rgba(${COLORS[(Math.random() * COLORS.length) | 0]}, ${0.35 + Math.random() * 0.6})`;
        ctx!.fillRect(bx, y, bw, bh);
      }
      // bloques de ruido digital
      const blocks = Math.floor(k * 22);
      for (let i = 0; i < blocks; i++) {
        const bs = 6 + Math.random() * 46;
        ctx!.fillStyle = `rgba(${COLORS[(Math.random() * 2) | 0]}, ${0.3 + Math.random() * 0.5})`;
        ctx!.fillRect(Math.random() * w, Math.random() * h, bs * (1 + Math.random() * 3), bs * 0.4);
      }
      // líneas finas de barrido
      ctx!.fillStyle = "rgba(255, 255, 255, 0.55)";
      for (let i = 0; i < 2 + k * 6; i++) ctx!.fillRect(0, Math.random() * h, w, 1);
      // desgarro: una banda ancha con el color de la marca
      if (k > 0.45) { ctx!.fillStyle = `rgba(255, 31, 61, ${0.1 * k})`; ctx!.fillRect(0, Math.random() * h, w, 20 + Math.random() * 80); }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!active()) { if (!cleared) { ctx!.clearRect(0, 0, w, h); cleared = true; } return; }
      if (now < until) {
        // se redibuja a saltos (cada ~50 ms) para que se sienta entrecortado
        if (now - lastDraw > 50) { paint(now); lastDraw = now; cleared = false; }
      } else if (!cleared) { ctx!.clearRect(0, 0, w, h); cleared = true; }
    }

    const onGlitch = (e: Event) => pulse(((e as CustomEvent<number>).detail ?? 0.8) as number);
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest(TAB_TRIGGERS)) pulse(0.7);
      else if (target.closest(FILTER_TRIGGERS)) pulse(0.5);
    };
    // aplicar un filtro con un selector o una fecha
    const onChange = (e: Event) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el && (el.matches("select, input[type='date'], input[type='month']")) && !el.closest(".modal, .lt-modal, .overlay")) pulse(0.5);
    };
    // ventanas y paneles que aparecen
    const mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of Array.from(m.addedNodes)) {
        if (n instanceof HTMLElement && n.matches(".overlay, .lt-modal, .rcw-backdrop, .drawer, .tgs-toast")) { pulse(0.95); return; }
      }
    });
    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("tgs-glitch", onGlitch);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("change", onChange, true);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("tgs-glitch", onGlitch);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  return (
    <>
      <div className="gm-showcase" aria-hidden="true">
        {video ? <video className="gm-video" src={VIDEO_SRC} autoPlay muted loop playsInline /> : null}
        <canvas ref={ref} className="gm-canvas" />
      </div>
      <canvas ref={glitchRef} className="gm-glitch-layer" aria-hidden="true" />
    </>
  );
}
