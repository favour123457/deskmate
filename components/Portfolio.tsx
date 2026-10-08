"use client";
// Portfolio building blocks: the Desk uses BookCard (compact) + Glance; the Portfolio page uses all of them.
import { useState } from "react";
import type { Holding, PortfolioMetrics } from "@/lib/types";
import { BookChart } from "./BookChart";

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const signed = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
const usd = (x: number | null | undefined) => (x == null ? "—" : `$${Math.round(x).toLocaleString("en-US")}`);
const price = (p: number) => (p >= 1000 ? Math.round(p).toLocaleString("en-US") : p < 1 ? p.toPrecision(3) : p.toFixed(2));
const monthly = (m: PortfolioMetrics) => (m.vol30dAnnual == null ? null : m.vol30dAnnual * Math.sqrt(30 / 365));

function dayChange(m: PortfolioMetrics | null) {
  return m && m.positions.length && m.positions.every((p) => p.change24h != null)
    ? m.positions.reduce((a, p) => a + p.weight * (p.change24h as number), 0)
    : null;
}

type BookProps = {
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  metrics: PortfolioMetrics | null;
  errors: string[];
  loading: boolean;
  onRefresh: () => void;
  compact?: boolean;
};

export function BookCard({ holdings, setHoldings, metrics: m, errors, loading, onRefresh, compact }: BookProps) {
  const [editing, setEditing] = useState(false);
  const update = (i: number, patch: Partial<Holding>) => setHoldings(holdings.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const day = dayChange(m);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Your book</h2>
        <button className="link-btn" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>{editing ? "Done" : "Edit"}</button>
      </div>
      <div className="hero">
        <span className="hero-value num">{m ? usd(m.totalUsd) : loading ? "…" : "—"}</span>
        {day != null && <span className={`hero-chg num ${day >= 0 ? "up" : "down"}`}>{signed(day, 2)} today</span>}
      </div>

      {editing && (
        <div className="editor">
          {holdings.map((h, i) => (
            <div className="holding" key={i}>
              <input className="field" value={h.symbol} placeholder="rNVDA, BTC…" aria-label="Asset" onChange={(e) => update(i, { symbol: e.target.value })} />
              <div className="usd-wrap">
                <span>$</span>
                <input className="field" inputMode="decimal" value={h.usd ? String(h.usd) : ""} placeholder="0" aria-label="Value in USD"
                  onChange={(e) => update(i, { usd: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
              </div>
              <button className="icon-btn" aria-label={`Remove ${h.symbol || "row"}`} onClick={() => setHoldings(holdings.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="row-actions">
            <button className="btn" onClick={() => setHoldings([...holdings, { symbol: "", usd: 0 }])}>Add asset</button>
            <button className="btn primary" onClick={() => { onRefresh(); setEditing(false); }} disabled={loading}>{loading ? "Updating…" : "Save and update"}</button>
          </div>
        </div>
      )}
      {errors.length > 0 && <div className="err">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}

      {m && m.positions.length > 0 && (
        <ul className={`weights${compact ? " weights-compact" : ""}`}>
          {[...m.positions].sort((a, b) => b.weight - a.weight).map((p) => (
            <li key={p.symbol}>
              <div className="w-row">
                <span className="w-name">{p.display}</span>
                {!compact && <span className="w-price num faint">{price(p.price)}</span>}
                <span className={`w-chg num ${p.change24h == null ? "faint" : p.change24h >= 0 ? "up" : "down"}`}>{p.change24h == null ? "—" : signed(p.change24h, 2)}</span>
              </div>
              <div className="w-bar" aria-hidden><i style={{ width: `${Math.max(2, p.weight * 100)}%` }} /></div>
              {!compact && <div className="w-meta faint"><span>{usd(p.usd)}</span><span>{pct(p.weight, 0)} of book, {p.bucket}</span></div>}
              {compact && <div className="w-meta faint"><span>{usd(p.usd)}</span><span>{pct(p.weight, 0)}</span></div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Three numbers that matter most, for the Desk. */
export function Glance({ metrics: m, onOpen }: { metrics: PortfolioMetrics | null; onOpen: () => void }) {
  if (!m) return null;
  const mo = monthly(m);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Risk at a glance</h2>
        <button className="link-btn" onClick={onOpen}>Full report</button>
      </div>
      <dl className="risks">
        <Risk term="Biggest holding" value={pct(m.topHolding?.weight, 0)} alert={(m.topHolding?.weight ?? 0) > 0.4} plain={m.topHolding ? `${m.topHolding.display}. Above 40%, one asset decides your week.` : ""} />
        <Risk term="Moves with BTC" value={m.btcCorrelation == null ? "—" : m.btcCorrelation.toFixed(2)} alert={(m.btcCorrelation ?? 0) > 0.7} plain={m.btcCorrelation == null ? "" : m.btcCorrelation > 0.7 ? "Strongly. Your stocks aren't hedging your crypto." : m.btcCorrelation > 0.4 ? "Partly." : "Mostly on its own."} />
        <Risk term="Bad-day loss" value={usd(m.var95OneDayUsd)} plain={mo == null ? "About 1 day in 20." : `About 1 day in 20. A normal month swings ±${(mo * 100).toFixed(0)}%.`} />
      </dl>
    </section>
  );
}

export function ChartCard({ metrics: m }: { metrics: PortfolioMetrics | null }) {
  if (!m || !m.history?.length) return null;
  return (
    <section className="card">
      <div className="card-head"><h2>Last {m.history.length} days</h2></div>
      <p className="card-sub">If you had held today&rsquo;s book at today&rsquo;s weights, compared with just holding BTC.</p>
      <BookChart data={m.history} height={240} />
    </section>
  );
}

export function RiskCard({ metrics: m }: { metrics: PortfolioMetrics | null }) {
  if (!m) return null;
  const mo = monthly(m);
  return (
    <section className="card">
      <div className="card-head"><h2>Risk, in plain words</h2></div>
      <dl className="risks">
        <Risk term="Concentration" value={pct(m.topHolding?.weight, 0)} alert={(m.topHolding?.weight ?? 0) > 0.4}
          plain={m.topHolding ? `${pct(m.topHolding.weight, 0)} of your money sits in ${m.topHolding.display}. Above 40%, one asset decides your week.` : "—"} />
        <Risk term="Diversification" value={m.effectivePositions.toFixed(1)}
          plain={`Your ${m.positions.length} positions behave like ${m.effectivePositions.toFixed(1)} truly separate ones.`} />
        <Risk term="Link to BTC" value={m.btcCorrelation == null ? "—" : m.btcCorrelation.toFixed(2)} alert={(m.btcCorrelation ?? 0) > 0.7}
          plain={m.btcCorrelation == null ? "Not enough data." : m.btcCorrelation > 0.7 ? "When BTC moves, your book usually follows. The stocks aren't hedging your crypto."
            : m.btcCorrelation > 0.4 ? "Your book partly moves with BTC." : "Your book mostly moves on its own, not with BTC."} />
        <Risk term="Volatility" value={pct(m.vol30dAnnual, 0)}
          plain={mo == null ? "Not enough data." : `A normal month swings about ±${(mo * 100).toFixed(0)}% (${usd(mo * m.totalUsd)}). Shown as a yearly figure.`} />
        <Risk term="Bad-day loss" value={usd(m.var95OneDayUsd)} plain="On a bad day (about 1 in 20) you could lose roughly this much. Also called 1-day VaR 95%." />
        <Risk term="Worst weekend" value={pct(m.weekendWorstPct)} alert={(m.weekendWorstPct ?? 0) < -0.05}
          plain="The worst Friday-to-Monday move in this window, while the US market was shut and only rTokens traded." />
        <Risk term="Deepest fall" value={pct(m.maxDrawdownPct)} alert={(m.maxDrawdownPct ?? 0) < -0.25}
          plain="The biggest drop from a high point to a later low. Also called max drawdown." />
      </dl>
    </section>
  );
}

export function PairsCard({ metrics: m }: { metrics: PortfolioMetrics | null }) {
  if (!m || !m.correlations.length) return null;
  return (
    <section className="card">
      <div className="card-head"><h2>What moves together</h2></div>
      <p className="card-sub">1.00 means they rise and fall in lockstep. Pairs near 1 give less protection than they look.</p>
      <ul className="pairs">
        {m.correlations.slice(0, 5).map((c) => (
          <li key={c.a + c.b}>
            <span>{c.a} and {c.b}</span>
            <span className="pair-bar" aria-hidden><i style={{ width: `${Math.max(0, c.rho) * 100}%` }} /></span>
            <b className="num">{c.rho.toFixed(2)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PortfolioView(props: BookProps) {
  const m = props.metrics;
  return (
    <div className="view view-portfolio">
      <header className="view-head">
        <div>
          <h2>Portfolio</h2>
          <p className="muted">{m?.window ? `Live Bitget prices. Daily closes ${m.window.from} to ${m.window.to}.` : "Live Bitget prices."}</p>
        </div>
      </header>
      <div className="pv-grid">
        <div className="pv-col">
          <BookCard {...props} />
          <PairsCard metrics={m} />
          {m && m.warnings.length > 0 && <ul className="warn-list">{m.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
        <div className="pv-col">
          <ChartCard metrics={m} />
          <RiskCard metrics={m} />
        </div>
      </div>
    </div>
  );
}

function Risk({ term, value, plain, alert }: { term: string; value: string; plain: string; alert?: boolean }) {
  return (
    <div className={`risk${alert ? " alert" : ""}`}>
      <dt>{term}</dt>
      <dd className="risk-v num">{value}</dd>
      {plain && <dd className="risk-p">{plain}</dd>}
    </div>
  );
}
