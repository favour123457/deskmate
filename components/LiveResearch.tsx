"use client";
import { useCallback, useEffect, useState } from "react";
import type { StockBrief } from "@/lib/research";

const REFRESH_MS = 5 * 60_000;

function ago(ts: number, now: number) {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

const money = (x: number) => `$${x >= 100 ? Math.round(x) : x.toFixed(2)}`;

/** Live news & ratings for each held stock; refreshes every 5 minutes. Crypto positions are skipped. */
export function LiveResearch({ symbols }: { symbols: string[] }) {
  const [briefs, setBriefs] = useState<StockBrief[] | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const key = symbols.join(",");

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: key.split(",") }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setBriefs(j.briefs);
      setAt(j.at);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!key) return null;

  return (
    <section className="card">
      <h2>
        Live news &amp; ratings
        <button className="link-btn" onClick={load} disabled={loading} title="Refresh now">
          {loading ? "Loading…" : at ? `⟳ ${ago(at, now)} ago` : "⟳"}
        </button>
      </h2>
      {error && <div className="err">Could not load: {error}</div>}
      {!briefs && !error && <p className="muted" style={{ margin: 0 }}>Fetching ratings and headlines…</p>}
      {briefs?.length === 0 && <p className="muted" style={{ margin: 0 }}>No US stocks in your book (crypto has no analyst coverage here).</p>}
      <div className="briefs">
        {briefs?.map((b) => <Brief key={b.symbol} b={b} now={now} />)}
      </div>
      {briefs && briefs.length > 0 && (
        <p className="faint" style={{ fontSize: 11, margin: "8px 0 0" }}>Ratings, earnings &amp; news: Finnhub · price targets: Bitget MCP · auto-refresh 5 min</p>
      )}
    </section>
  );
}

function Brief({ b, now }: { b: StockBrief; now: number }) {
  const r = b.rating;
  const bull = r ? r.strongBuy + r.buy : 0;
  const bear = r ? r.sell + r.strongSell : 0;
  return (
    <div className="brief">
      <div className="brief-head">
        <strong>{b.symbol}</strong>
        {b.earnings && (
          <span className={`er-chip${b.earnings.daysUntil <= 7 ? " hot" : ""}`} title={`${b.earnings.date}, ${b.earnings.when}${b.earnings.epsEstimate != null ? ` · EPS est. ${b.earnings.epsEstimate.toFixed(2)}` : ""}`}>
            Earnings {b.earnings.daysUntil === 0 ? "today" : `in ${b.earnings.daysUntil}d`}
          </span>
        )}
      </div>

      {r ? (
        <div className="brief-row">
          <span className="k">Analysts</span>
          <div className="rating-bar" title={`${r.period}: ${r.strongBuy} strong buy, ${r.buy} buy, ${r.hold} hold, ${r.sell} sell, ${r.strongSell} strong sell`}>
            <i className="b" style={{ flex: bull }} />
            <i className="h" style={{ flex: r.hold }} />
            <i className="s" style={{ flex: bear }} />
          </div>
          <span className="num v">{bull}<span className="up">B</span> {r.hold}<span className="faint">H</span> {bear}<span className="down">S</span></span>
        </div>
      ) : (
        <div className="brief-row faint">Analysts: no rating data</div>
      )}

      {b.targets ? (
        <div className="brief-row">
          <span className="k">Targets</span>
          <span className="num">{b.targets.low === b.targets.high ? money(b.targets.low) : `${money(b.targets.low)}–${money(b.targets.high)}`}</span>
          <span className="faint ell">{b.targets.items.slice(0, 2).map((t) => t.firm).join(", ")}</span>
        </div>
      ) : (
        <div className="brief-row faint">Targets: none available</div>
      )}

      {b.earnings && (
        <div className="brief-row">
          <span className="k">Earnings</span>
          <span className="num">{b.earnings.date}</span>
          <span className="faint">{b.earnings.when}</span>
        </div>
      )}

      {b.news.length > 0 && (
        <ul className="news">
          {b.news.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noopener noreferrer">{n.headline}</a>
              <span className="faint"> · {n.source}, {ago(n.ts, now)}</span>
            </li>
          ))}
        </ul>
      )}
      {b.errors.length > 0 && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Unavailable: {b.errors.join("; ")}</div>}
    </div>
  );
}
