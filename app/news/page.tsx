"use client";
// News: one block per held stock, flat on the background. Left: logo, name, analyst view, targets, earnings.
// Right: the latest headlines. Refreshes silently every 5 minutes (lib/useResearch).
import { motion } from "motion/react";
import { AssetLogo } from "@/components/AssetLogo";
import { StatusLine } from "@/components/StatusLine";
import { ArrowUpRight } from "@/components/Icons";
import { useStore } from "@/lib/store";
import { ago } from "@/lib/useResearch";
import type { StockBrief } from "@/lib/research";

const money = (x: number) => `$${x >= 100 ? Math.round(x) : x.toFixed(2)}`;
const fmtDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function Block({ b, now, i }: { b: StockBrief; now: number; i: number }) {
  const r = b.rating;
  const bull = r ? r.strongBuy + r.buy : 0;
  const bear = r ? r.sell + r.strongSell : 0;
  return (
    <motion.article className="nb" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.06 }}>
      <div className="nb-meta">
        <div className="nb-id">
          <AssetLogo symbol={b.symbol} size={40} />
          <div>
            <h2>{b.symbol}</h2>
            <p className="faint small">{b.name ?? b.ticker}</p>
          </div>
        </div>
        <dl className="nb-facts">
          <div>
            <dt>Analysts</dt>
            <dd>
              {r ? (
                <>
                  <span><span className="up">{bull} buy</span> · {r.hold} hold · <span className="down">{bear} sell</span></span>
                  <span className="tri" aria-hidden><i className="b" style={{ flex: bull }} /><i className="h" style={{ flex: r.hold }} /><i className="s" style={{ flex: bear || 0.0001 }} /></span>
                </>
              ) : <span className="faint">No coverage</span>}
            </dd>
          </div>
          <div>
            <dt>Targets</dt>
            <dd>
              {b.targets ? (
                <>
                  <span className="num">{b.targets.low === b.targets.high ? money(b.targets.low) : `${money(b.targets.low)} – ${money(b.targets.high)}`}</span>
                  <span className="faint small">{b.targets.items.slice(0, 3).map((t) => t.firm).join(", ")}</span>
                </>
              ) : <span className="faint">Not available</span>}
            </dd>
          </div>
          <div>
            <dt>Earnings</dt>
            <dd>
              {b.earnings ? (
                <span>{fmtDate(b.earnings.date)} · {b.earnings.when} · <span className={`nowrap ${b.earnings.daysUntil <= 7 ? "hot" : "faint"}`}>{b.earnings.daysUntil === 0 ? "today" : `in ${b.earnings.daysUntil} days`}</span></span>
              ) : <span className="faint">No date</span>}
            </dd>
          </div>
        </dl>
        {b.errors.length > 0 && <p className="faint small nb-err">Unavailable right now: {b.errors.map((e) => e.split(":")[0]).join(", ")}.</p>}
      </div>

      <ol className="nb-news">
        {b.news.length === 0 && <li className="faint">No headlines in the last week.</li>}
        {b.news.map((n) => (
          <li key={n.url}>
            <a href={n.url} target="_blank" rel="noopener noreferrer">
              <span className="nb-h">{n.headline}</span>
              <ArrowUpRight />
            </a>
            <span className="faint small">{n.source} · {ago(n.ts, now)} ago</span>
          </li>
        ))}
      </ol>
    </motion.article>
  );
}

export default function News() {
  const { research } = useStore();
  const { briefs, error, empty, now } = research;
  return (
    <>
      <main className="wrap page news">
        <header className="page-head">
          <h1>News</h1>
          <p className="faint">Analyst views, price targets, earnings dates and headlines for the stocks you hold.</p>
        </header>
        {empty && <p className="faint">No US stocks in your book yet. Add some on the Portfolio page.</p>}
        {error && !briefs && <p className="down">Couldn&rsquo;t load news: {error}</p>}
        {!briefs && !error && !empty && <p className="faint">Loading…</p>}
        {briefs?.map((b, i) => <Block key={b.symbol} b={b} now={now} i={i} />)}
        {briefs && briefs.length > 0 && <p className="faint small src-note">Ratings, earnings and headlines from Finnhub. Price targets from the Bitget MCP.</p>}
      </main>
      <StatusLine />
    </>
  );
}
