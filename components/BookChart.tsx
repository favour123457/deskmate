"use client";
// 90-day line chart: today's book held at today's weights vs BTC, both indexed to 100 (one axis).
import { useEffect, useMemo, useRef, useState } from "react";

type Point = { date: string; book: number; btc: number | null };

const BOOK = "#b98a00";
const BTC = "#5f8fe8";
const PAD = { l: 34, r: 12, t: 10, b: 22 };

const fmtDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const chg = (v: number) => `${v >= 100 ? "+" : ""}${(v - 100).toFixed(1)}%`;

export function BookChart({ data, height = 168 }: { data: Point[]; height?: number }) {
  const H = height;
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasBtc = data.some((d) => d.btc != null);
  const { x, y, ticks, bookPath, btcPath } = useMemo(() => {
    const vals = data.flatMap((d) => (d.btc != null ? [d.book, d.btc] : [d.book]));
    let lo = Math.min(100, ...vals), hi = Math.max(100, ...vals);
    const pad = (hi - lo) * 0.08 || 2;
    lo -= pad;
    hi += pad;
    const x = (i: number) => PAD.l + (i / Math.max(1, data.length - 1)) * (w - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const step = niceStep((hi - lo) / 4);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(Number(v.toFixed(4)));
    const path = (key: "book" | "btc") =>
      data.map((d, i) => (d[key] == null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key] as number).toFixed(1)}`)).join("");
    return { x, y, ticks, bookPath: path("book"), btcPath: hasBtc ? path("btc") : "" };
  }, [data, w, hasBtc, H]);

  if (data.length < 5) return <p className="muted small">Not enough price history for a chart yet.</p>;

  const last = data[data.length - 1];
  const h = hover != null ? data[hover] : null;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px) / r.width) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <figure className="bchart" ref={wrap}>
      <figcaption className="bchart-legend">
        <span><i style={{ background: BOOK }} />Your book <b className="num">{chg(last.book)}</b></span>
        {hasBtc && last.btc != null && <span><i style={{ background: BTC }} />BTC <b className="num">{chg(last.btc)}</b></span>}
      </figcaption>
      <svg width={w} height={H} role="img" aria-label={`Your book ${chg(last.book)} vs BTC ${last.btc != null ? chg(last.btc) : "n/a"} since ${fmtDate(data[0].date)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} className={t === 100 ? "bchart-base" : "bchart-grid"} />
            <text x={PAD.l - 6} y={y(t)} className="bchart-axis" textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 4} className="bchart-axis">{fmtDate(data[0].date)}</text>
        <text x={w - PAD.r} y={H - 4} className="bchart-axis" textAnchor="end">{fmtDate(last.date)}</text>
        {btcPath && <path d={btcPath} fill="none" stroke={BTC} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        <path d={bookPath} fill="none" stroke={BOOK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="bchart-cross" />
            {h.btc != null && <circle cx={x(hover)} cy={y(h.btc)} r={4} fill={BTC} className="bchart-dot" />}
            <circle cx={x(hover)} cy={y(h.book)} r={4} fill={BOOK} className="bchart-dot" />
          </g>
        )}
        <rect
          x={PAD.l} y={PAD.t} width={w - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && hover != null && (
        <div className="bchart-tip" style={{ left: Math.min(w - 150, Math.max(0, x(hover) - 70)) }}>
          <div className="faint">{fmtDate(h.date)}</div>
          <div><i style={{ background: BOOK }} />Book <b className="num">{chg(h.book)}</b></div>
          {h.btc != null && <div><i style={{ background: BTC }} />BTC <b className="num">{chg(h.btc)}</b></div>}
        </div>
      )}
    </figure>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}
