"use client";
// One headline at a time on the Desk. Rotates every 7 s, pauses on hover/focus, arrows to step through.
import { useEffect, useMemo, useState } from "react";
import { ago, type Research } from "@/lib/useResearch";

type Item = { symbol: string; text: string; meta: string; url?: string };

export function NewsTicker({ research, onOpenAll }: { research: Research; onOpenAll: () => void }) {
  const { briefs, now, error, empty } = research;
  const items = useMemo<Item[]>(() => {
    if (!briefs) return [];
    const news = briefs
      .flatMap((b) => b.news.map((n) => ({ symbol: b.symbol, text: n.headline, meta: `${n.source}, ${ago(n.ts, now)} ago`, url: n.url, ts: n.ts })))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
    const events = briefs
      .filter((b) => b.earnings)
      .map((b) => ({ symbol: b.symbol, text: `Earnings ${b.earnings!.daysUntil === 0 ? "today" : `in ${b.earnings!.daysUntil} days`} (${b.earnings!.date})`, meta: "Finnhub calendar" }));
    return [...events.filter((_, i) => i < 2), ...news];
  }, [briefs, now]);

  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold || items.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [hold, items.length]);
  useEffect(() => { if (i >= items.length) setI(0); }, [i, items.length]);

  if (empty) return null;
  const it = items[i];

  return (
    <section className="strip" onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)} onFocusCapture={() => setHold(true)} onBlurCapture={() => setHold(false)} aria-roledescription="carousel" aria-label="Latest news for your stocks">
      <span className="strip-label">Latest</span>
      <div className="strip-body">
        {error && <span className="faint">Couldn&rsquo;t load news.</span>}
        {!briefs && !error && <span className="faint">Fetching headlines for your stocks…</span>}
        {briefs && !items.length && <span className="faint">No recent headlines for your stocks.</span>}
        {it && (
          <span className="strip-item" key={i} aria-live="polite">
            <b className="ticker-sym">{it.symbol}</b>
            {it.url ? <a href={it.url} target="_blank" rel="noopener noreferrer">{it.text}</a> : <span className="strip-text">{it.text}</span>}
            <span className="faint strip-meta">{it.meta}</span>
          </span>
        )}
      </div>
      {items.length > 1 && (
        <span className="strip-nav">
          <button className="icon-btn nav" aria-label="Previous headline" onClick={() => setI((x) => (x - 1 + items.length) % items.length)}>‹</button>
          <span className="faint small num">{i + 1}/{items.length}</span>
          <button className="icon-btn nav" aria-label="Next headline" onClick={() => setI((x) => (x + 1) % items.length)}>›</button>
        </span>
      )}
      <button className="link-btn strip-all" onClick={onOpenAll}>All news</button>
    </section>
  );
}
