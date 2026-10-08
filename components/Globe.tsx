"use client";
// Monochrome canvas globe: dotted land lit by the real sun, a wireframe graticule, the live day/night line
// as a single white great circle, a New York crosshair, and live tickers orbiting as plain text.
// No map library (land = precomputed dots in lib/geo/land-dots.json), no gradients, no glow.
import { useEffect, useRef } from "react";
import LAND from "@/lib/geo/land-dots.json";

export type OrbitTicker = { label: string; price?: number | null; change?: number | null };

type Props = { tickers: OrbitTicker[]; nyLabel: string; nyOpen: boolean; className?: string };

const RAD = Math.PI / 180;
const NY = { lat: 40.71, lon: -74.01 };
type V3 = [number, number, number];
const toVec = (lat: number, lon: number): V3 => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Approximate subsolar point (good to ~1°, enough for a terminator). */
function subsolar(now: Date) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const doy = (now.getTime() - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return { lat: decl, lon: -15 * (utcH - 12) };
}

export function Globe({ tickers, nyLabel, nyOpen, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ tickers, nyLabel, nyOpen });
  propsRef.current = { tickers, nyLabel, nyOpen };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const FONT = '"SUSE Mono Variable", ui-monospace, Menlo, monospace';

    const n = LAND.length / 2;
    const lon = new Float32Array(n), cosLat = new Float32Array(n), sinLat = new Float32Array(n), day = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lon[i] = LAND[2 * i] * RAD;
      const la = LAND[2 * i + 1] * RAD;
      cosLat[i] = Math.cos(la);
      sinLat[i] = Math.sin(la);
    }
    let sunV: V3 = [0, 0, 1];
    let sunAt = 0;
    const updateSun = () => {
      const s = subsolar(new Date());
      sunV = toVec(s.lat, s.lon);
      for (let i = 0; i < n; i++) day[i] = cosLat[i] * Math.sin(lon[i]) * sunV[0] + sinLat[i] * sunV[1] + cosLat[i] * Math.cos(lon[i]) * sunV[2];
      sunAt = Date.now();
    };
    updateSun();

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(performance.now()); });
    ro.observe(canvas);

    const nyV = toVec(NY.lat, NY.lon);
    const t0 = performance.now();
    let raf = 0;

    function draw(now: number) {
      if (Date.now() - sunAt > 60_000) updateSun();
      const el = now - t0;
      const small = w < 520;
      const R = Math.min(w, h) * (small ? 0.3 : 0.34);
      const cx = w / 2, cy = h / 2;
      const lon0 = (reduce ? -52 : -52 + 18 * Math.sin(el / 11000)) * RAD; // sway around New York
      const tilt = 18 * RAD;
      const ct = Math.cos(tilt), st = Math.sin(tilt), cl = Math.cos(lon0), sl = Math.sin(lon0);
      const view = (v: V3, r = 1): V3 => {
        const x1 = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl;
        return [x1 * r, (v[1] * ct - z1 * st) * r, (v[1] * st + z1 * ct) * r];
      };
      const sx = (p: V3) => cx + R * p[0], sy = (p: V3) => cy - R * p[1];

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // outline
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // graticule (front side only)
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      const polyline = (pts: V3[]) => {
        let pen = false;
        ctx.beginPath();
        for (const v of pts) {
          const p = view(v);
          if (p[2] <= 0) { pen = false; continue; }
          if (pen) ctx.lineTo(sx(p), sy(p)); else { ctx.moveTo(sx(p), sy(p)); pen = true; }
        }
        ctx.stroke();
      };
      for (let lo = -180; lo < 180; lo += 30) polyline(Array.from({ length: 61 }, (_, k) => toVec(-90 + k * 3, lo)));
      for (let la = -60; la <= 60; la += 30) polyline(Array.from({ length: 121 }, (_, k) => toVec(la, -180 + k * 3)));

      // land dots: bright on the day side, dim at night
      const dot = Math.max(1.1, R / 160);
      for (let i = 0; i < n; i++) {
        const v0 = cosLat[i] * Math.sin(lon[i]), v2 = cosLat[i] * Math.cos(lon[i]), v1 = sinLat[i];
        const x1 = v0 * cl - v2 * sl, z1 = v0 * sl + v2 * cl;
        const z = v1 * st + z1 * ct;
        if (z <= 0.03) continue;
        const y = v1 * ct - z1 * st;
        const lit = day[i] > 0.04 ? 1 : day[i] > -0.06 ? 0.6 : 0.28;
        ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.75 * z) * lit * 0.85})`;
        const s = dot * (0.7 + 0.5 * z);
        ctx.fillRect(cx + R * x1 - s / 2, cy - R * y - s / 2, s, s);
      }

      // day/night line: the great circle perpendicular to the sun
      const u = norm(cross(sunV, Math.abs(sunV[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      const wv = cross(sunV, u);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      polyline(Array.from({ length: 181 }, (_, k) => {
        const a = (k / 180) * Math.PI * 2;
        return [u[0] * Math.cos(a) + wv[0] * Math.sin(a), u[1] * Math.cos(a) + wv[1] * Math.sin(a), u[2] * Math.cos(a) + wv[2] * Math.sin(a)] as V3;
      }));

      // orbit: a thin tilted ring with tickers riding it as plain text
      const { tickers: all, nyLabel: nyL, nyOpen: open } = propsRef.current;
      const tk = small ? all.slice(0, 4) : all;
      const orbitR = 1.32, orbitTilt = 0.28;
      const ringPt = (a: number): V3 => { const z0 = orbitR * Math.sin(a); return [orbitR * Math.cos(a), -z0 * Math.sin(orbitTilt), z0 * Math.cos(orbitTilt)]; };
      const hiddenByGlobe = (p: V3) => p[2] < 0 && p[0] * p[0] + p[1] * p[1] < 1;
      ctx.lineWidth = 1;
      for (let k = 0; k < 160; k++) {
        const a = (k / 160) * Math.PI * 2, b = ((k + 1) / 160) * Math.PI * 2;
        const p = ringPt(a), q = ringPt(b);
        if (hiddenByGlobe(p)) continue;
        ctx.strokeStyle = p[2] >= 0 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.moveTo(sx(p), sy(p));
        ctx.lineTo(sx(q), sy(q));
        ctx.stroke();
      }
      ctx.textBaseline = "middle";
      tk.forEach((t, i) => {
        const a = (reduce ? 0 : el / 26000) * Math.PI * 2 + (i / Math.max(1, tk.length)) * Math.PI * 2;
        const p = ringPt(a);
        if (hiddenByGlobe(p)) return;
        const front = p[2] >= 0;
        const px = sx(p), py = sy(p);
        const price = t.price != null ? (t.price >= 1000 ? Math.round(t.price).toLocaleString("en-US") : t.price.toFixed(2)) : "";
        const chg = t.change != null ? `${t.change >= 0 ? "+" : "−"}${Math.abs(t.change * 100).toFixed(1)}%` : "";
        ctx.font = `600 11px ${FONT}`;
        const lw = ctx.measureText(t.label).width;
        ctx.font = `400 11px ${FONT}`;
        const rest = [price, chg].filter(Boolean).join("  ");
        const rw = rest ? ctx.measureText(rest).width + 8 : 0;
        const W = lw + rw;
        // point on the ring, label just to its right (to its left near the right edge)
        const right = px + 10 + W < w - 4;
        const x = right ? px + 10 : Math.max(4, px - 10 - W);
        ctx.globalAlpha = front ? 1 : 0.32;
        ctx.fillStyle = "#000";
        ctx.fillRect(x - 4, py - 9, W + 8, 18);
        ctx.fillStyle = "#fff";
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        ctx.font = `600 11px ${FONT}`;
        ctx.fillText(t.label, x, py - 0.5);
        if (rest) {
          ctx.font = `400 11px ${FONT}`;
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fillText(rest, x + lw + 8, py - 0.5);
        }
        ctx.globalAlpha = 1;
      });

      // New York: crosshair + label; a slow ring while the session is open
      const p = view(nyV);
      if (p[2] > 0.05) {
        const x = sx(p), y = sy(p);
        if (open && !reduce) {
          const k = (el / 2400) % 1;
          ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(x, y, 5 + 16 * k, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 9, y); ctx.lineTo(x - 3, y);
        ctx.moveTo(x + 3, y); ctx.lineTo(x + 9, y);
        ctx.moveTo(x, y - 9); ctx.lineTo(x, y - 3);
        ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 9);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.font = `600 12px ${FONT}`;
        ctx.textAlign = "right";
        const tw = ctx.measureText(nyL).width;
        ctx.fillStyle = "#000";
        ctx.fillRect(x - 16 - tw - 4, y - 21, tw + 8, 18);
        ctx.fillStyle = "#fff";
        ctx.fillText(nyL, x - 16, y - 12);
        ctx.textAlign = "left";
      }

      if (!reduce) raf = requestAnimationFrame(draw);
    }

    if (reduce) draw(performance.now());
    else raf = requestAnimationFrame(draw);
    const redrawStatic = reduce ? setInterval(() => draw(performance.now()), 5000) : null;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (redrawStatic) clearInterval(redrawStatic);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} role="img" aria-label="Globe showing where it is day and night right now, with New York marked and live prices orbiting" />;
}
