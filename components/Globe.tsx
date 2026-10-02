"use client";
// A canvas globe that shows the real day/night line right now, New York and Lagos, an arc between them,
// and live ticker chips in orbit. No map library: land is a precomputed dot grid (lib/geo/land-dots.json).
import { useEffect, useRef } from "react";
import LAND from "@/lib/geo/land-dots.json";

export type OrbitTicker = { label: string; price?: number | null; change?: number | null };

type Props = {
  tickers: OrbitTicker[];
  nyLabel: string;
  homeLabel: string;
  className?: string;
};

const RAD = Math.PI / 180;
const NY = { lat: 40.71, lon: -74.01 };
const LAGOS = { lat: 6.52, lon: 3.38 };

type V3 = [number, number, number];
const toVec = (lat: number, lon: number): V3 => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];

/** Approximate subsolar point (good to ~1°, enough for a terminator). */
function subsolar(now: Date) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const doy = (now.getTime() - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return { lat: decl, lon: -15 * (utcH - 12) };
}

function slerp(a: V3, b: V3, t: number): V3 {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const om = Math.acos(d);
  if (om < 1e-6) return a;
  const s = Math.sin(om);
  const k1 = Math.sin((1 - t) * om) / s, k2 = Math.sin(t * om) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function Globe({ tickers, nyLabel, homeLabel, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ tickers, nyLabel, homeLabel });
  propsRef.current = { tickers, nyLabel, homeLabel };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // precompute land dots
    const n = LAND.length / 2;
    const lat = new Float32Array(n), cosLat = new Float32Array(n), sinLat = new Float32Array(n), lon = new Float32Array(n);
    const day = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lon[i] = LAND[2 * i] * RAD;
      lat[i] = LAND[2 * i + 1] * RAD;
      cosLat[i] = Math.cos(lat[i]);
      sinLat[i] = Math.sin(lat[i]);
    }
    let sunAt = 0;
    const updateSun = () => {
      const s = subsolar(new Date());
      const sv = toVec(s.lat, s.lon);
      for (let i = 0; i < n; i++) {
        const v0 = cosLat[i] * Math.sin(lon[i]), v1 = sinLat[i], v2 = cosLat[i] * Math.cos(lon[i]);
        day[i] = v0 * sv[0] + v1 * sv[1] + v2 * sv[2];
      }
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
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(performance.now());
    });
    ro.observe(canvas);

    const nyV = toVec(NY.lat, NY.lon), homeV = toVec(LAGOS.lat, LAGOS.lon);
    const t0 = performance.now();
    let raf = 0;

    function draw(now: number) {
      if (Date.now() - sunAt > 60_000) updateSun();
      const el = now - t0;
      const R = Math.min(w, h) * 0.31;
      const cx = w / 2, cy = h / 2;
      const lon0 = (reduce ? -32 : -32 + 20 * Math.sin(el / 9000)) * RAD;
      const tilt = 16 * RAD;
      const ct = Math.cos(tilt), st = Math.sin(tilt);

      // world vector -> view (x right, y up, z toward viewer)
      const view = (v: V3, r = 1): V3 => {
        const cl = Math.cos(lon0), sl = Math.sin(lon0);
        const x1 = v[0] * cl - v[2] * sl;
        const z1 = v[0] * sl + v[2] * cl;
        const y1 = v[1];
        return [x1 * r, (y1 * ct - z1 * st) * r, (y1 * st + z1 * ct) * r];
      };
      const hidden = (p: V3) => p[2] < 0 && p[0] * p[0] + p[1] * p[1] < 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // orbit tickers (computed in view space, independent of earth rotation)
      const { tickers: tk, nyLabel: nyL, homeLabel: homeL } = propsRef.current;
      const orbitR = 1.3, orbitTilt = 0.32;
      const chips = tk.map((t, i) => {
        const a = (reduce ? 0 : el / 16000) * Math.PI * 2 + (i / Math.max(1, tk.length)) * Math.PI * 2;
        const x = orbitR * Math.cos(a), z0 = orbitR * Math.sin(a);
        const p: V3 = [x, -z0 * Math.sin(orbitTilt), z0 * Math.cos(orbitTilt)];
        return { t, p };
      });
      const drawOrbitLine = (front: boolean) => {
        ctx.beginPath();
        for (let k = 0; k <= 120; k++) {
          const a = (k / 120) * Math.PI * 2;
          const z0 = orbitR * Math.sin(a);
          const z = z0 * Math.cos(orbitTilt);
          if ((z >= 0) !== front) { ctx.moveTo(cx + R * orbitR * Math.cos(a), cy + R * z0 * Math.sin(orbitTilt)); continue; }
          ctx.lineTo(cx + R * orbitR * Math.cos(a), cy + R * z0 * Math.sin(orbitTilt));
        }
        ctx.strokeStyle = front ? "rgba(242,223,166,0.16)" : "rgba(242,223,166,0.07)";
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      const drawChip = (c: { t: OrbitTicker; p: V3 }) => {
        const behind = c.p[2] < 0;
        if (hidden(c.p)) return;
        const sx = cx + R * c.p[0], sy = cy - R * c.p[1];
        const scale = 0.86 + 0.14 * (c.p[2] / orbitR);
        const price = c.t.price != null ? (c.t.price >= 1000 ? Math.round(c.t.price).toLocaleString("en-US") : c.t.price.toFixed(2)) : "";
        const chg = c.t.change != null ? `${c.t.change >= 0 ? "+" : ""}${(c.t.change * 100).toFixed(1)}%` : "";
        ctx.save();
        ctx.globalAlpha = behind ? 0.35 : 1;
        ctx.font = '600 12px "Bricolage Grotesque Variable", system-ui, sans-serif';
        const approxW = (ctx.measureText(c.t.label).width + 110) * scale;
        ctx.translate(Math.max(approxW / 2 + 4, Math.min(w - approxW / 2 - 4, sx)), sy);
        ctx.scale(scale, scale);
        ctx.font = '600 12px "Bricolage Grotesque Variable", system-ui, sans-serif';
        const lw = ctx.measureText(c.t.label).width;
        ctx.font = "500 11px ui-monospace, Menlo, monospace";
        const pw = price ? ctx.measureText(price).width + 6 : 0;
        const cw = chg ? ctx.measureText(chg).width + 6 : 0;
        const W = lw + pw + cw + 18, H = 24;
        ctx.beginPath();
        ctx.roundRect(-W / 2, -H / 2, W, H, 12);
        ctx.fillStyle = "rgba(14,24,44,0.92)";
        ctx.fill();
        ctx.strokeStyle = "rgba(242,223,166,0.22)";
        ctx.stroke();
        let x = -W / 2 + 9;
        ctx.textBaseline = "middle";
        ctx.font = '600 12px "Bricolage Grotesque Variable", system-ui, sans-serif';
        ctx.fillStyle = "#e9edf5";
        ctx.fillText(c.t.label, x, 0.5);
        x += lw + 6;
        ctx.font = "500 11px ui-monospace, Menlo, monospace";
        if (price) { ctx.fillStyle = "#9aa6bd"; ctx.fillText(price, x, 0.5); x += pw; }
        if (chg) { ctx.fillStyle = (c.t.change ?? 0) >= 0 ? "#3fcf95" : "#ff6b7d"; ctx.fillText(chg, x, 0.5); }
        ctx.restore();
      };

      drawOrbitLine(false);
      chips.filter((c) => c.p[2] < 0).forEach(drawChip);

      // atmosphere + disc
      const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.28);
      halo.addColorStop(0, "rgba(122,167,255,0.18)");
      halo.addColorStop(1, "rgba(122,167,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2);
      ctx.fill();
      const disc = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      disc.addColorStop(0, "#182a4d");
      disc.addColorStop(1, "#0a1428");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // warm glow where the sun is overhead (if on the visible side)
      const sun = subsolar(new Date());
      const sp = view(toVec(sun.lat, sun.lon));
      if (sp[2] > -0.3) {
        const gx = cx + R * sp[0], gy = cy - R * sp[1];
        const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 1.1);
        glow.addColorStop(0, `rgba(242,223,166,${0.16 * Math.max(0, sp[2] + 0.3)})`);
        glow.addColorStop(1, "rgba(242,223,166,0)");
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = glow;
        ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
        ctx.restore();
      }

      // land dots, lit by the real sun
      const cl = Math.cos(lon0), sl = Math.sin(lon0);
      const dot = Math.max(1.1, R / 170);
      for (let i = 0; i < n; i++) {
        const v0 = cosLat[i] * Math.sin(lon[i]), v2 = cosLat[i] * Math.cos(lon[i]), v1 = sinLat[i];
        const x1 = v0 * cl - v2 * sl, z1 = v0 * sl + v2 * cl;
        const z = v1 * st + z1 * ct;
        if (z <= 0.02) continue;
        const y = v1 * ct - z1 * st;
        const d = smooth(-0.1, 0.12, day[i]);
        const r = Math.round(74 + (242 - 74) * d), g = Math.round(108 + (223 - 108) * d), b = Math.round(170 + (166 - 170) * d);
        ctx.fillStyle = `rgba(${r},${g},${b},${(0.3 + 0.7 * z) * (0.62 + 0.38 * d)})`;
        const s = dot * (0.75 + 0.5 * z);
        ctx.fillRect(cx + R * x1 - s / 2, cy - R * y - s / 2, s, s);
      }

      // arc New York -> home, with a pulse travelling toward you
      const draw01 = reduce ? 1 : smooth(400, 2200, el);
      const pts: { p: V3; t: number }[] = [];
      for (let k = 0; k <= 64; k++) {
        const t = k / 64;
        if (t > draw01) break;
        pts.push({ p: view(slerp(nyV, homeV, t), 1 + 0.22 * Math.sin(Math.PI * t)), t });
      }
      ctx.lineWidth = 1.6;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1].p, b = pts[k].p;
        if (hidden(a) || hidden(b)) continue;
        ctx.strokeStyle = `rgba(${Math.round(122 + (240 - 122) * pts[k].t)},${Math.round(167 + (185 - 167) * pts[k].t)},${Math.round(255 + (11 - 255) * pts[k].t)},0.85)`;
        ctx.beginPath();
        ctx.moveTo(cx + R * a[0], cy - R * a[1]);
        ctx.lineTo(cx + R * b[0], cy - R * b[1]);
        ctx.stroke();
      }
      if (draw01 >= 1) {
        const pt = reduce ? 0.62 : (el / 2600) % 1;
        const p = view(slerp(nyV, homeV, pt), 1 + 0.22 * Math.sin(Math.PI * pt));
        if (!hidden(p)) {
          ctx.fillStyle = "#fff4cf";
          ctx.shadowColor = "#f0b90b";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(cx + R * p[0], cy - R * p[1], 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // markers
      const marker = (v: V3, color: string, label: string, side: 1 | -1, pulse: boolean) => {
        const p = view(v);
        if (p[2] < 0.05) return;
        const sx = cx + R * p[0], sy = cy - R * p[1];
        if (pulse && !reduce) {
          const k = (el / 1800) % 1;
          ctx.strokeStyle = color;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 4 + 14 * k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#070d1a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '600 12px "Bricolage Grotesque Variable", system-ui, sans-serif';
        ctx.textBaseline = "middle";
        ctx.textAlign = side === 1 ? "left" : "right";
        ctx.fillStyle = "rgba(7,13,26,0.85)";
        const tw = ctx.measureText(label).width;
        ctx.fillRect(side === 1 ? sx + 9 : sx - 13 - tw, sy - 10, tw + 8, 20);
        ctx.fillStyle = "#e9edf5";
        ctx.fillText(label, sx + side * 13, sy);
        ctx.textAlign = "left";
      };
      marker(nyV, "#7aa7ff", nyL, -1, false);
      marker(homeV, "#f0b90b", homeL, 1, true);

      drawOrbitLine(true);
      chips.filter((c) => c.p[2] >= 0).forEach(drawChip);

      if (!reduce) raf = requestAnimationFrame(draw);
    }

    if (reduce) draw(performance.now());
    else raf = requestAnimationFrame(draw);
    const redrawStatic = reduce ? setInterval(() => draw(performance.now()), 2000) : null;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (redrawStatic) clearInterval(redrawStatic);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} role="img" aria-label="Globe showing where it is day and night right now, with New York and Lagos marked" />;
}
