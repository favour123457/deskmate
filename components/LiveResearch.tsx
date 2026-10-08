"use client";
// The News page: one card per held stock with analyst ratings, price targets, earnings and headlines.
import type { StockBrief } from "@/lib/research";
import { ago, type Research } from "@/lib/useResearch";

const money = (x: number) => `$${x >= 100 ? Math.round(x) : x.toFixed(2)}`;

export function NewsView({ research }: { research: Research }) {
  const { briefs, at, error, loading, now, reload, empty } = research;
  return (
    <div className="view view-news">
      <header className="view-head">
        <div>
          <h2>News and ratings</h2>
          <p className="muted">For every stock in your book. Refreshes every 5 minutes.</p>
        </div>
        <button className="btn" onClick={reload} disabled={loading}>{loading ? "Refreshing…" : at ? `Refresh (updated ${ago(at, now)} ago)` : "Refresh"}</button>
      </header>
      {empty && <p className="muted">No US stocks in your book yet. Crypto has no analyst coverage here.</p>}
      {error && <p className="err">Couldn&rsquo;t load news: {error}</p>}
      {!briefs && !error && !empty && <p className="muted">Fetching ratings and headlines…</p>}
      <div className="news-grid">{briefs?.map((b) => <Brief key={b.symbol} b={b} now={now} />)}</div>
      {briefs && briefs.length > 0 && <p className="foot faint">Ratings, earnings and news from Finnhub. Price targets from the Bitget MCP.</p>}
    </div>
  );
}

export function Brief({ b, now }: { b: StockBrief; now: number }) {
  const r = b.rating;
  const bull = r ? r.strongBuy + r.buy : 0;
  const bear = r ? r.sell + r.strongSell : 0;
  return (
    <article className="brief">
      <div className="brief-head">
        <strong>{b.symbol}</strong>
        {b.earnings && (
          <span className={`er-chip${b.earnings.daysUntil <= 7 ? " hot" : ""}`} title={`${b.earnings.date}, ${b.earnings.when}${b.earnings.epsEstimate != null ? `. EPS estimate ${b.earnings.epsEstimate.toFixed(2)}` : ""}`}>
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
          <span className="num v">{bull} buy, {r.hold} hold, {bear} sell</span>
        </div>
      ) : (
        <div className="brief-row faint">Analysts: no rating data</div>
      )}

      {b.targets ? (
        <div className="brief-row">
          <span className="k">Targets</span>
          <span className="num">{b.targets.low === b.targets.high ? money(b.targets.low) : `${money(b.targets.low)} to ${money(b.targets.high)}`}</span>
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
              <span className="faint"> {n.source}, {ago(n.ts, now)} ago</span>
            </li>
          ))}
        </ul>
      )}
      {b.errors.length > 0 && <div className="faint small">Unavailable: {b.errors.join("; ")}</div>}
    </article>
  );
}
