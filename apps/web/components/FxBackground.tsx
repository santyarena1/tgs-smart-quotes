"use client";

import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; vx: number; vy: number; r: number; ph: number };
type Streak = { vertical: boolean; pos: number; at: number; speed: number; len: number; alt: boolean };
type Ripple = { x: number; y: number; t: number; max: number };
type Drop = { x: number; y: number; speed: number; len: number };

const GRID = 44;

/** Cada tema con efectos define aquí cómo se ve el fondo animado. Los demás no dibujan nada. */
type Profile = {
  /** Color principal (partículas, líneas) y secundario (destellos, anillos). */
  main: string;
  second: string;
  density: number;
  speed: number;
  gridAlpha: [number, number, number, number]; // [normal oscuro, normal claro, lite oscuro, lite claro]
  streaks: number; // cuántos destellos a la vez
  streakEvery: number;
  rings: boolean;
  ripples: boolean;
  rain: boolean;
  laser: boolean;
  nodes: boolean;
  glow: number;
  /** Dibujo propio en lugar de la cuadrícula con partículas. */
  kind?: "gotham";
};

const PROFILES: Record<string, Profile> = {
  tgs: { main: "255, 36, 56", second: "255, 36, 56", density: 1, speed: 1, gridAlpha: [0.035, 0.04, 0.065, 0.075], streaks: 3, streakEvery: 3200, rings: true, ripples: true, rain: false, laser: false, nodes: false, glow: 1 },
  bluered: { main: "59, 130, 246", second: "239, 68, 68", density: 1.1, speed: 1, gridAlpha: [0.04, 0.05, 0.07, 0.08], streaks: 3, streakEvery: 2800, rings: true, ripples: true, rain: false, laser: false, nodes: true, glow: 1.1 },
  darkyellow: { main: "250, 204, 21", second: "245, 158, 11", density: 1.1, speed: 1, gridAlpha: [0.04, 0.05, 0.07, 0.085], streaks: 3, streakEvery: 2800, rings: true, ripples: true, rain: false, laser: false, nodes: true, glow: 1.1 },
  gotham: { main: "142, 164, 184", second: "242, 194, 48", density: 1, speed: 1, gridAlpha: [0, 0, 0, 0], streaks: 0, streakEvery: 9999, rings: false, ripples: false, rain: false, laser: false, nodes: false, glow: 1, kind: "gotham" },
  gamer: { main: "255, 31, 61", second: "255, 90, 54", density: 1.9, speed: 1.7, gridAlpha: [0.06, 0.07, 0.09, 0.1], streaks: 6, streakEvery: 900, rings: true, ripples: true, rain: true, laser: true, nodes: true, glow: 1.6 },
};

/**
 * Fondo animado de toda la app: cuadrícula que se desplaza, partículas unidas por líneas de neón,
 * anillos que giran, destellos que recorren la cuadrícula y ondas al hacer clic. Cada tema ajusta
 * colores e intensidad (BeGamer suma lluvia de datos y un láser). Va detrás del contenido y no recibe
 * eventos. Se apaga con html[data-fx="off"] (interruptor de efectos) y no existe en los temas sin efectos.
 */
export function FxBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const root = document.documentElement;

    let w = 0;
    let h = 0;
    let raf = 0;
    let parts: Particle[] = [];
    let drops: Drop[] = [];
    const streaks: Streak[] = [];
    const ripples: Ripple[] = [];
    let lite = false;
    let lastProbe = 0;
    let nextStreak = 0;
    let nextRipple = 0;
    let last = 0;
    let appliedSkin = "";

    const profile = (): Profile | null => PROFILES[root.dataset.skin ?? "tgs"] ?? null;
    const enabled = () => root.dataset.fx !== "off" && !document.hidden && profile() !== null;

    function resize() {
      const p = profile() ?? PROFILES.tgs!;
      appliedSkin = root.dataset.skin ?? "";
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(160, Math.max(22, (w * h) / 20000)) * p.density);
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28 * p.speed,
        vy: (Math.random() - 0.5) * 0.28 * p.speed,
        r: 0.8 + Math.random() * 1.7,
        ph: Math.random() * Math.PI * 2,
      }));
      if (p.kind === "gotham") buildGotham();
      drops = p.rain
        ? Array.from({ length: Math.round(w / 38) }, () => ({ x: Math.round((Math.random() * w) / GRID) * GRID + 0.5, y: Math.random() * h, speed: 120 + Math.random() * 240, len: 40 + Math.random() * 90 }))
        : [];
    }


    // ---------- Gotham: ciudad nocturna con lluvia, relámpagos, niebla, skyline y reflector ----------
    type Building = { x: number; w: number; h: number; wins: Array<{ x: number; y: number; ph: number }>; layer: number };
    let city: Building[] = [];
    let rain: Array<{ x: number; y: number; v: number; l: number; a: number }> = [];
    let fogBlobs: Array<{ x: number; y: number; r: number; v: number; a: number }> = [];
    let nextBolt = 6000;
    let boltAt = 0;
    let bolt: Array<[number, number]> = [];

    function buildGotham() {
      city = [];
      for (const layer of [0, 1]) {
        let x = -30;
        while (x < w + 40) {
          const bw = (layer ? 46 : 30) + Math.random() * (layer ? 90 : 60);
          const bh = h * (layer ? 0.13 + Math.random() * 0.3 : 0.08 + Math.random() * 0.2);
          const wins: Building["wins"] = [];
          for (let wy = 12; wy < bh - 6; wy += 10) for (let wx = 6; wx < bw - 8; wx += 9) if (Math.random() < (layer ? 0.2 : 0.12)) wins.push({ x: wx, y: wy, ph: Math.random() * 6.28 });
          city.push({ x, w: bw, h: bh, wins, layer });
          x += bw * (0.55 + Math.random() * 0.5);
        }
      }
      rain = Array.from({ length: Math.round(Math.min(420, (w * h) / 5200)) }, () => ({ x: Math.random() * (w + 200), y: Math.random() * h, v: 650 + Math.random() * 450, l: 10 + Math.random() * 16, a: 0.12 + Math.random() * 0.25 }));
      fogBlobs = Array.from({ length: 7 }, () => ({ x: Math.random() * w, y: h * (0.35 + Math.random() * 0.6), r: 160 + Math.random() * 260, v: (Math.random() - 0.3) * 14, a: 0.05 + Math.random() * 0.06 }));
    }

    /** Silueta genérica de murciélago (alas con picos) centrada en (0,0), ancho aprox. 2*s. */
    function batShape(s: number) {
      ctx!.beginPath();
      ctx!.moveTo(0, -s * 0.34);
      ctx!.lineTo(s * 0.1, -s * 0.5); ctx!.lineTo(s * 0.16, -s * 0.28);
      ctx!.quadraticCurveTo(s * 0.5, -s * 0.5, s * 1.0, -s * 0.12);
      ctx!.quadraticCurveTo(s * 0.88, 0.0, s * 0.8, s * 0.12);
      ctx!.quadraticCurveTo(s * 0.64, s * 0.02, s * 0.5, s * 0.16);
      ctx!.quadraticCurveTo(s * 0.36, s * 0.06, s * 0.22, s * 0.2);
      ctx!.lineTo(0, s * 0.42);
      ctx!.lineTo(-s * 0.22, s * 0.2);
      ctx!.quadraticCurveTo(-s * 0.36, s * 0.06, -s * 0.5, s * 0.16);
      ctx!.quadraticCurveTo(-s * 0.64, s * 0.02, -s * 0.8, s * 0.12);
      ctx!.quadraticCurveTo(-s * 0.88, 0.0, -s * 1.0, -s * 0.12);
      ctx!.quadraticCurveTo(-s * 0.5, -s * 0.5, -s * 0.16, -s * 0.28);
      ctx!.lineTo(-s * 0.1, -s * 0.5);
      ctx!.closePath();
    }

    function drawGotham(now: number, dt: number, isDark: boolean) {
      const t = now / 1000;
      ctx!.clearRect(0, 0, w, h);
      const k = isDark ? 1 : 0.55; // en modo claro todo se suaviza
      // cielo
      const sky = ctx!.createLinearGradient(0, 0, 0, h);
      if (isDark) { sky.addColorStop(0, "rgba(4, 6, 9, 0.92)"); sky.addColorStop(0.65, "rgba(14, 22, 30, 0.8)"); sky.addColorStop(1, "rgba(24, 34, 44, 0.75)"); }
      else { sky.addColorStop(0, "rgba(160, 172, 184, 0.55)"); sky.addColorStop(1, "rgba(226, 231, 236, 0.35)"); }
      ctx!.fillStyle = sky; ctx!.fillRect(0, 0, w, h);

      // nubes / niebla que derivan
      for (const f of fogBlobs) {
        f.x += (f.v * dt) / 1000;
        if (f.x < -f.r) f.x = w + f.r; else if (f.x > w + f.r) f.x = -f.r;
        const g = ctx!.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(${isDark ? "150, 170, 190" : "120, 132, 144"}, ${f.a * k})`); g.addColorStop(1, "rgba(150, 170, 190, 0)");
        ctx!.fillStyle = g; ctx!.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
      }

      // reflector: aparece 11 s de cada 24 s y barre el cielo; la silueta se ve al final del haz
      const cyc = (t % 24) / 24;
      const on = cyc < 0.46 ? Math.sin((cyc / 0.46) * Math.PI) : 0;
      if (on > 0.02) {
        const bx = w * 0.14;
        const by = h + 10;
        const ang = -Math.PI / 2 + 0.55 + Math.sin(t * 0.22) * 0.18;
        const len = h * 1.15;
        const tx = bx + Math.cos(ang) * len;
        const ty = by + Math.sin(ang) * len;
        const half = 0.075;
        const beam = ctx!.createLinearGradient(bx, by, tx, ty);
        beam.addColorStop(0, `rgba(255, 244, 190, ${0.34 * on * k})`); beam.addColorStop(1, `rgba(255, 244, 190, ${0.03 * on * k})`);
        ctx!.fillStyle = beam;
        ctx!.beginPath(); ctx!.moveTo(bx - 6, by); ctx!.lineTo(bx + 6, by);
        ctx!.lineTo(tx + Math.cos(ang + Math.PI / 2) * len * half * 1.3, ty + Math.sin(ang + Math.PI / 2) * len * half * 1.3);
        ctx!.lineTo(tx + Math.cos(ang - Math.PI / 2) * len * half * 1.3, ty + Math.sin(ang - Math.PI / 2) * len * half * 1.3);
        ctx!.closePath(); ctx!.fill();
        // círculo de luz sobre las nubes con la silueta
        const sr = Math.min(w, h) * 0.17;
        const sg = ctx!.createRadialGradient(tx, ty, 0, tx, ty, sr);
        sg.addColorStop(0, `rgba(255, 246, 205, ${0.55 * on * k})`); sg.addColorStop(0.75, `rgba(255, 240, 180, ${0.3 * on * k})`); sg.addColorStop(1, "rgba(255, 240, 180, 0)");
        ctx!.fillStyle = sg; ctx!.beginPath(); ctx!.arc(tx, ty, sr, 0, Math.PI * 2); ctx!.fill();
        ctx!.save(); ctx!.translate(tx, ty); ctx!.fillStyle = `rgba(6, 8, 10, ${0.88 * on})`; batShape(sr * 0.42); ctx!.fill(); ctx!.restore();
      }

      // skyline: dos capas, la de atrás más clara
      for (const b of city) {
        const baseY = h;
        const top = baseY - b.h;
        ctx!.fillStyle = b.layer ? (isDark ? "rgba(5, 7, 10, 0.95)" : "rgba(40, 50, 60, 0.55)") : (isDark ? "rgba(18, 26, 34, 0.9)" : "rgba(90, 104, 116, 0.35)");
        ctx!.fillRect(b.x, top, b.w, b.h);
        // antena en algunos edificios
        if (b.w > 70 && ((b.x * 7) | 0) % 3 === 0) { ctx!.fillRect(b.x + b.w * 0.5 - 1, top - 16, 2, 16); ctx!.fillStyle = `rgba(255, 60, 60, ${0.4 + 0.5 * Math.sin(t * 2 + b.x)})`; ctx!.fillRect(b.x + b.w * 0.5 - 2, top - 18, 4, 3); }
        for (const wd of b.wins) {
          const tw = 0.5 + 0.5 * Math.sin(t * 0.5 + wd.ph * 3);
          if (tw < 0.25) continue;
          ctx!.fillStyle = `rgba(255, 214, 120, ${(b.layer ? 0.5 : 0.28) * tw * k})`;
          ctx!.fillRect(b.x + wd.x, top + wd.y, 3, 4);
        }
      }
      // bruma sobre las calles
      const mist = ctx!.createLinearGradient(0, h * 0.7, 0, h);
      mist.addColorStop(0, "rgba(120, 140, 160, 0)"); mist.addColorStop(1, `rgba(120, 140, 160, ${0.22 * k})`);
      ctx!.fillStyle = mist; ctx!.fillRect(0, h * 0.7, w, h * 0.3);

      // lluvia
      ctx!.lineWidth = 1;
      for (const r of rain) {
        r.y += (r.v * dt) / 1000; r.x -= (r.v * 0.16 * dt) / 1000;
        if (r.y > h) { r.y = -r.l; r.x = Math.random() * (w + 200); }
        ctx!.strokeStyle = `rgba(${isDark ? "180, 200, 220" : "70, 84, 98"}, ${r.a * (isDark ? 1 : 0.7)})`;
        ctx!.beginPath(); ctx!.moveTo(r.x, r.y); ctx!.lineTo(r.x + r.l * 0.16, r.y - r.l); ctx!.stroke();
      }

      // relámpago: destello + rayo ramificado
      if (now > nextBolt) {
        boltAt = now; nextBolt = now + 9000 + Math.random() * 9000;
        bolt = []; let bx2 = w * (0.25 + Math.random() * 0.6); let by2 = 0; bolt.push([bx2, by2]);
        while (by2 < h * 0.62) { bx2 += (Math.random() - 0.5) * 70; by2 += 22 + Math.random() * 38; bolt.push([bx2, by2]); }
      }
      const since = now - boltAt;
      if (since < 700) {
        const flick = since < 120 ? 1 : since < 200 ? 0.15 : since < 330 ? 0.8 : Math.max(0, 1 - (since - 330) / 370) * 0.5;
        ctx!.fillStyle = `rgba(210, 225, 255, ${0.2 * flick * k})`; ctx!.fillRect(0, 0, w, h);
        if (since < 340 && bolt.length) {
          ctx!.beginPath(); ctx!.moveTo(bolt[0]![0], bolt[0]![1]);
          for (const [px, py] of bolt) ctx!.lineTo(px, py);
          ctx!.strokeStyle = `rgba(190, 215, 255, ${0.25 * flick})`; ctx!.lineWidth = 7; ctx!.stroke();
          ctx!.strokeStyle = `rgba(255, 255, 255, ${0.95 * flick})`; ctx!.lineWidth = 1.6; ctx!.stroke();
        }
      }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!enabled()) { last = 0; return; }
      const p = profile()!;
      if (appliedSkin !== (root.dataset.skin ?? "")) resize();
      const dt = Math.min(48, now - (last || now));
      last = now;
      const isDark = root.dataset.theme === "dark";
      if (now - lastProbe > 600) { lite = Boolean(document.querySelector(".lite")); lastProbe = now; }
      const M = p.main;
      const S = p.second;
      if (p.kind === "gotham") { drawGotham(now, dt, isDark); return; }

      ctx!.clearRect(0, 0, w, h);

      // Resplandores que derivan despacio
      const gx = w * (0.18 + 0.1 * Math.sin(now / 9000));
      const gy = h * (0.1 + 0.08 * Math.cos(now / 11000));
      const g1 = ctx!.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.55);
      g1.addColorStop(0, `rgba(${M}, ${(isDark ? 0.09 : 0.025) * p.glow})`);
      g1.addColorStop(1, `rgba(${M}, 0)`);
      ctx!.fillStyle = g1;
      ctx!.fillRect(0, 0, w, h);
      const hx = w * (0.9 + 0.06 * Math.cos(now / 8000));
      const hy = h * (0.95 + 0.05 * Math.sin(now / 10000));
      const g2 = ctx!.createRadialGradient(hx, hy, 0, hx, hy, Math.max(w, h) * 0.45);
      g2.addColorStop(0, `rgba(${S}, ${(isDark ? 0.06 : 0.015) * p.glow})`);
      g2.addColorStop(1, `rgba(${S}, 0)`);
      ctx!.fillStyle = g2;
      ctx!.fillRect(0, 0, w, h);

      // Cuadrícula que se desplaza
      const off = (now * 0.006 * p.speed) % GRID;
      const ga = p.gridAlpha[(lite ? 2 : 0) + (isDark ? 0 : 1)]!;
      ctx!.strokeStyle = isDark ? `rgba(255, 255, 255, ${ga})` : `rgba(13, 13, 16, ${ga})`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let x = -off; x < w; x += GRID) { ctx!.moveTo(Math.round(x) + 0.5, 0); ctx!.lineTo(Math.round(x) + 0.5, h); }
      for (let y = -off; y < h; y += GRID) { ctx!.moveTo(0, Math.round(y) + 0.5); ctx!.lineTo(w, Math.round(y) + 0.5); }
      ctx!.stroke();

      // Nodos que titilan en las intersecciones de la cuadrícula
      if (p.nodes) {
        for (let gxn = -off; gxn < w; gxn += GRID * 3) {
          for (let gyn = -off; gyn < h; gyn += GRID * 3) {
            const tw = 0.5 + 0.5 * Math.sin(now / 700 + gxn * 0.013 + gyn * 0.017);
            if (tw < 0.55) continue;
            ctx!.fillStyle = `rgba(${M}, ${(tw - 0.5) * 0.5 * p.glow})`;
            ctx!.fillRect(Math.round(gxn) - 1, Math.round(gyn) - 1, 3, 3);
          }
        }
      }

      // Lluvia de datos (solo BeGamer): trazos verticales que caen por las líneas de la cuadrícula
      for (const d of drops) {
        d.y += (d.speed * dt) / 1000;
        if (d.y - d.len > h) { d.y = -20; d.x = Math.round((Math.random() * w) / GRID) * GRID + 0.5; d.speed = 120 + Math.random() * 240; }
        const lg = ctx!.createLinearGradient(d.x, d.y, d.x, d.y - d.len);
        lg.addColorStop(0, `rgba(${M}, 0.7)`);
        lg.addColorStop(1, `rgba(${M}, 0)`);
        ctx!.strokeStyle = lg;
        ctx!.lineWidth = 1.2;
        ctx!.beginPath(); ctx!.moveTo(d.x, d.y); ctx!.lineTo(d.x, d.y - d.len); ctx!.stroke();
      }

      // Rayo láser que barre la pantalla (solo BeGamer)
      if (p.laser) {
        const ly = ((now * 0.05) % (h + 160)) - 80;
        const lg = ctx!.createLinearGradient(0, ly - 60, 0, ly + 4);
        lg.addColorStop(0, `rgba(${M}, 0)`);
        lg.addColorStop(1, `rgba(${M}, ${isDark ? 0.16 : 0.1})`);
        ctx!.fillStyle = lg;
        ctx!.fillRect(0, ly - 60, w, 64);
        ctx!.fillStyle = `rgba(${M}, ${isDark ? 0.55 : 0.4})`;
        ctx!.fillRect(0, ly + 3, w, 1.2);
      }

      // Anillos de neón que giran en las esquinas
      if (p.rings) {
        const rings: Array<[number, number, number, number, string]> = [
          [w * 0.95, h * 0.16, 90, 1, M],
          [w * 0.04, h * 0.9, 120, -1, S],
          [w * 0.95, h * 0.16, 150, -1, S],
        ];
        ctx!.lineWidth = 1.2;
        for (const [cx, cy, r, dir, col] of rings) {
          ctx!.strokeStyle = `rgba(${col}, ${(isDark ? 0.4 : 0.3) * Math.min(1.4, p.glow)})`;
          ctx!.setLineDash([r * 0.9, r * 0.5, 6, r * 0.4]);
          ctx!.lineDashOffset = dir * now * 0.03 * p.speed;
          ctx!.beginPath();
          ctx!.arc(cx, cy, r, 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.setLineDash([]);
      }

      // Partículas y líneas entre las cercanas
      for (const q of parts) {
        q.x += q.vx * (dt / 16);
        q.y += q.vy * (dt / 16);
        if (q.x < -10) q.x = w + 10; else if (q.x > w + 10) q.x = -10;
        if (q.y < -10) q.y = h + 10; else if (q.y > h + 10) q.y = -10;
      }
      ctx!.lineWidth = 1;
      const reach = 135 * (p.density > 1.5 ? 0.85 : 1);
      for (let i = 0; i < parts.length; i++) {
        const a = parts[i]!;
        for (let j = i + 1; j < parts.length; j++) {
          const b = parts[j]!;
          const dx = a.x - b.x;
          if (dx > reach || dx < -reach) continue;
          const d = Math.hypot(dx, a.y - b.y);
          if (d < reach) {
            ctx!.strokeStyle = `rgba(${M}, ${(1 - d / reach) * (isDark ? 0.34 : 0.26) * Math.min(1.3, p.glow)})`;
            ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y); ctx!.stroke();
          }
        }
      }
      for (const q of parts) {
        const tw = 0.55 + 0.45 * Math.sin(now / 900 + q.ph);
        ctx!.fillStyle = `rgba(${M}, ${(isDark ? 0.85 : 0.65) * tw})`;
        ctx!.beginPath(); ctx!.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx!.fill();
      }

      // Destellos que recorren la cuadrícula
      if (now > nextStreak && streaks.length < p.streaks) {
        const vertical = Math.random() < 0.5;
        const lines = Math.max(2, Math.floor((vertical ? w : h) / GRID));
        streaks.push({ vertical, pos: (1 + Math.floor(Math.random() * (lines - 1))) * GRID + 0.5, at: -200, speed: (380 + Math.random() * 320) * p.speed, len: 140 + Math.random() * 140, alt: Math.random() < 0.4 });
        nextStreak = now + p.streakEvery * (0.55 + Math.random() * 0.9);
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i]!;
        s.at += (s.speed * dt) / 1000;
        if (s.at > (s.vertical ? h : w) + s.len + 220) { streaks.splice(i, 1); continue; }
        const x0 = s.vertical ? s.pos : s.at;
        const y0 = s.vertical ? s.at : s.pos;
        const x1 = s.vertical ? s.pos : s.at - s.len;
        const y1 = s.vertical ? s.at - s.len : s.pos;
        const col = s.alt ? S : M;
        const lg = ctx!.createLinearGradient(x0, y0, x1, y1);
        lg.addColorStop(0, `rgba(${col}, 0.95)`);
        lg.addColorStop(1, `rgba(${col}, 0)`);
        ctx!.strokeStyle = lg;
        ctx!.lineWidth = 5; ctx!.globalAlpha = 0.18 * Math.min(1.5, p.glow); ctx!.beginPath(); ctx!.moveTo(x0, y0); ctx!.lineTo(x1, y1); ctx!.stroke();
        ctx!.lineWidth = 1.6; ctx!.globalAlpha = 1; ctx!.beginPath(); ctx!.moveTo(x0, y0); ctx!.lineTo(x1, y1); ctx!.stroke();
      }

      // Ondas: aleatorias y al hacer clic
      if (p.ripples && now > nextRipple && ripples.length < 4) {
        ripples.push({ x: Math.random() * w, y: Math.random() * h, t: now, max: 120 + Math.random() * 120 });
        nextRipple = now + (p.density > 1.5 ? 2600 : 5200) + Math.random() * 4000;
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]!;
        const k = Math.max(0, (now - rp.t) / 1500);
        if (k >= 1) { ripples.splice(i, 1); continue; }
        ctx!.strokeStyle = `rgba(${S}, ${(1 - k) * 0.5})`;
        ctx!.lineWidth = 1.4;
        ctx!.beginPath(); ctx!.arc(rp.x, rp.y, rp.max * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); ctx!.stroke();
      }
    }

    const onDown = (e: PointerEvent) => {
      if (root.dataset.fx === "off" || !profile()?.ripples) return;
      ripples.push({ x: e.clientX, y: e.clientY, t: performance.now(), max: root.dataset.skin === "gamer" ? 150 : 90 });
      if (ripples.length > 6) ripples.shift();
    };
    const onSkin = () => { resize(); };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("tgs-skin-change", onSkin);
    const mo = new MutationObserver(() => { if (!enabled()) ctx.clearRect(0, 0, w, h); });
    mo.observe(root, { attributes: true, attributeFilter: ["data-fx", "data-skin"] });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("tgs-skin-change", onSkin);
    };
  }, []);

  return <canvas ref={ref} className="fx-canvas" aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }} />;
}
