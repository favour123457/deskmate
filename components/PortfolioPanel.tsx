"use client";
import { useState } from "react";
import type { Holding, PortfolioMetrics } from "@/lib/types";
import { BookChart } from "./BookChart";

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const signed = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
const usd = (x: number | null | undefined) => (x == null ? "—" : `$${Math.round(x).toLocaleString("en-US")}`);
const price = (p: number) => (p >= 1000 ? Math.round(p).toLocaleString("en-US") : p < 1 ? p.toPrecision(3) : p.toFixed(2));

type Props = {
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  metrics: PortfolioMetrics | null;
  errors: string[];
  loading: boolean;
  onRefresh: () => void;
};

export function PortfolioPanel({ holdings, setHoldings, metrics, errors, loading, onRefresh }: Props) {
  const [editingBook, setEditingBook] = useState(false);
  const update = (i: number, patch: Partial<Holding>) => setHoldings(holdings.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const m = metrics;

  const day = m && m.positions.every((p) => p.change24h != null)
    ? m.positions.reduce((a, p) => a + p.weight * (p.change24h as number), 0)
    : null;

  return (
    <aside className="side">
      {/* ---- book value + editor ---- */}
      <section className="card">
        <div className="card-head">
          <h2>Your book</h2>
          <button className="link-btn" onClick={() => setEditingBook((v) => !v)} aria-expanded={editingBook}>
            {editingBook ? "Done" : "Edit holdings"}
          </button>
        </div>
        <div className="hero">
          <span className="hero-value num">{m ? usd(m.totalUsd) : loading ? "…" : "—"}</span>
          {day != null && (
            <span className={`hero-chg num ${day >= 0 ? "up" : "down"}`}>{signed(day, 2)} today</span>
          )}
        </div>

        {editingBook && (
          <div className="editor">
            {holdings.map((h, i) => (
              <div className="holding" key={i}>
                <input className="field" value={h.symbol} placeholder="rNVDA, BTC…" aria-label="Asset" onChange={(e) => update(i, { symbol: e.target.value })} />
                <div className="usd-wrap">
                  <span>$</span>
                  <input
                    className="field" inputMode="decimal" value={h.usd ? String(h.usd) : ""} placeholder="0" aria-label="Value in USD"
                    onChange={(e) => update(i, { usd: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })}
                  />
                </div>
                <button className="icon-btn" aria-label={`Remove ${h.symbol || "row"}`} onClick={() => setHoldings(holdings.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <div className="row-actions">
              <button className="btn" onClick={() => setHoldings([...holdings, { symbol: "", usd: 0 }])}>Add asset</button>
              <button className="btn primary" onClick={onRefresh} disabled={loading}>{loading ? "Updating…" : "Update numbers"}</button>
            </div>
          </div>
        )}
        {errors.length > 0 && <div className="err">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}

        {m && m.positions.length > 0 && (
          <ul className="weights">
            {[...m.positions].sort((a, b) => b.weight - a.weight).map((p) => (
              <li key={p.symbol}>
                <div className="w-row">
                  <span className="w-name">{p.display}</span>
                  <span className="w-price num faint">{price(p.price)}</span>
                  <span className={`w-chg num ${p.change24h == null ? "faint" : p.change24h >= 0 ? "up" : "down"}`}>
                    {p.change24h == null ? "—" : signed(p.change24h, 2)}
                  </span>
                </div>
                <div className="w-bar" aria-hidden><i style={{ width: `${Math.max(2, p.weight * 100)}%` }} /></div>
                <div className="w-meta faint"><span>{usd(p.usd)}</span><span>{pct(p.weight, 0)} of book, {p.bucket}</span></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- chart ---- */}
      {m && m.history?.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Last {m.history.length} days</h2>
          </div>
          <p className="card-sub">If you had held today&rsquo;s book at today&rsquo;s weights, compared with just holding BTC.</p>
          <BookChart data={m.history} />
        </section>
      )}

      {/* ---- risk, in plain words ---- */}
      <section className="card">
        <div className="card-head"><h2>Risk, in plain words</h2></div>
        {!m ? (
          <p className="muted" style={{ margin: 0 }}>{loading ? "Pulling live Bitget prices…" : "Add holdings and press Update numbers."}</p>
        ) : (
          <dl className="risks">
            <Risk
              term="Concentration" value={pct(m.topHolding?.weight, 0)} alert={(m.topHolding?.weight ?? 0) > 0.4}
              plain={m.topHolding ? `${pct(m.topHolding.weight, 0)} of your money sits in ${m.topHolding.display}. Above 40%, one asset decides your week.` : "—"}
            />
            <Risk
              term="Diversification" value={m.effectivePositions.toFixed(1)}
              plain={`Your ${m.positions.length} positions behave like ${m.effectivePositions.toFixed(1)} truly separate ones.`}
            />
            <Risk
              term="Link to BTC" value={m.btcCorrelation == null ? "—" : m.btcCorrelation.toFixed(2)} alert={(m.btcCorrelation ?? 0) > 0.7}
              plain={m.btcCorrelation == null ? "Not enough data." : m.btcCorrelation > 0.7
                ? "When BTC moves, your book usually follows. The stocks aren't hedging your crypto."
                : m.btcCorrelation > 0.4 ? "Your book partly moves with BTC." : "Your book mostly moves on its own, not with BTC."}
            />
            <Risk
              term="Volatility" value={pct(m.vol30dAnnual, 0)}
              plain={m.vol30dAnnual == null ? "Not enough data." : `A normal month swings about ±${(m.vol30dAnnual * Math.sqrt(30 / 365) * 100).toFixed(0)}% (${usd((m.vol30dAnnual * Math.sqrt(30 / 365)) * m.totalUsd)}).`}
            />
            <Risk
              term="Bad-day loss" value={usd(m.var95OneDayUsd)}
              plain="On a bad day (about 1 in 20) you could lose roughly this much. Also called 1-day VaR 95%."
            />
            <Risk
              term="Worst weekend" value={pct(m.weekendWorstPct)} alert={(m.weekendWorstPct ?? 0) < -0.05}
              plain="The worst Friday-to-Monday move in this window, while the US market was shut and only rTokens traded."
            />
            <Risk
              term="Deepest fall" value={pct(m.maxDrawdownPct)} alert={(m.maxDrawdownPct ?? 0) < -0.25}
              plain="The biggest drop from a high point to a later low. Also called max drawdown."
            />
          </dl>
        )}
      </section>

      {/* ---- moves together ---- */}
      {m && m.correlations.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>What moves together</h2></div>
          <p className="card-sub">1.00 means they rise and fall in lockstep. Pairs near 1 give less protection than they look.</p>
          <ul className="pairs">
            {m.correlations.slice(0, 4).map((c) => (
              <li key={c.a + c.b}>
                <span>{c.a} and {c.b}</span>
                <span className="pair-bar" aria-hidden><i style={{ width: `${Math.max(0, c.rho) * 100}%` }} /></span>
                <b className="num">{c.rho.toFixed(2)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m && m.warnings.length > 0 && (
        <ul className="warn-list">{m.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}
      {m?.window && <p className="foot faint">Live Bitget prices. Daily closes {m.window.from} to {m.window.to}.</p>}
    </aside>
  );
}

function Risk({ term, value, plain, alert }: { term: string; value: string; plain: string; alert?: boolean }) {
  return (
    <div className={`risk${alert ? " alert" : ""}`}>
      <dt>{term}</dt>
      <dd className="risk-v num">{value}</dd>
      <dd className="risk-p">{plain}</dd>
    </div>
  );
}
