"use client";
import type { Holding, PortfolioMetrics } from "@/lib/types";

const BUCKET_COLOR: Record<string, string> = {
  "US tech": "#5b8def",
  "US other": "#9b7bea",
  "US index/ETF": "#2ebd85",
  Crypto: "#f0b90b",
  Other: "#8b94a7",
};

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const usd = (x: number | null | undefined) => (x == null ? "—" : `$${Math.round(x).toLocaleString("en-US")}`);

type Props = {
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  profile: string;
  setProfile: (s: string) => void;
  metrics: PortfolioMetrics | null;
  errors: string[];
  loading: boolean;
  onRefresh: () => void;
};

export function PortfolioPanel({ holdings, setHoldings, profile, setProfile, metrics, errors, loading, onRefresh }: Props) {
  const update = (i: number, patch: Partial<Holding>) => setHoldings(holdings.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const m = metrics;

  return (
    <aside className="side">
      <section className="card">
        <h2>
          Your book
          <button className="link-btn" onClick={() => setHoldings([...holdings, { symbol: "", usd: 0 }])}>+ Add</button>
        </h2>
        {holdings.map((h, i) => (
          <div className="holding" key={i}>
            <input
              className="field"
              value={h.symbol}
              placeholder="rNVDA, BTC…"
              aria-label="Asset"
              onChange={(e) => update(i, { symbol: e.target.value })}
            />
            <div className="usd-wrap">
              <span>$</span>
              <input
                className="field"
                inputMode="decimal"
                value={h.usd ? String(h.usd) : ""}
                placeholder="0"
                aria-label="Value in USD"
                onChange={(e) => update(i, { usd: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })}
              />
            </div>
            <button className="icon-btn" aria-label="Remove" onClick={() => setHoldings(holdings.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div className="row-actions">
          <button className="btn primary" onClick={onRefresh} disabled={loading}>
            {loading ? "Loading…" : "Update numbers"}
          </button>
        </div>
        {errors.length > 0 && (
          <div className="err" style={{ marginTop: 8 }}>{errors.map((e, i) => <div key={i}>{e}</div>)}</div>
        )}
      </section>

      <section className="card">
        <h2>Risk right now</h2>
        {!m ? (
          <p className="muted" style={{ margin: 0 }}>{loading ? "Pulling live Bitget prices…" : "Add holdings and press Update numbers."}</p>
        ) : (
          <>
            <div className="tiles">
              <Tile label="Book value" value={usd(m.totalUsd)} hint={`${m.positions.length} positions`} />
              <Tile
                label="Largest holding"
                value={pct(m.topHolding?.weight, 0)}
                hint={m.topHolding?.display}
                alert={(m.topHolding?.weight ?? 0) > 0.4}
              />
              <Tile label="Real diversification" value={m.effectivePositions.toFixed(1)} hint="effective # of positions" />
              <Tile label="BTC correlation" value={m.btcCorrelation == null ? "—" : m.btcCorrelation.toFixed(2)} hint={m.btcBeta == null ? "" : `beta ${m.btcBeta.toFixed(2)}`} />
              <Tile label="Volatility (30d)" value={pct(m.vol30dAnnual, 0)} hint="annualised" />
              <Tile label="1-day VaR 95%" value={usd(m.var95OneDayUsd)} hint="bad-day loss" />
              <Tile
                label="Worst weekend"
                value={pct(m.weekendWorstPct)}
                hint="Fri → Mon, US closed"
                alert={(m.weekendWorstPct ?? 0) < -0.05}
              />
              <Tile label="Max drawdown" value={pct(m.maxDrawdownPct)} hint={m.window ? `${m.window.days} days` : ""} />
            </div>

            <p className="sec-title" style={{ marginTop: 14 }}>Exposure</p>
            <div className="alloc">
              {m.buckets.map((b) => (
                <div key={b.bucket} style={{ width: `${b.weight * 100}%`, background: BUCKET_COLOR[b.bucket] }} title={`${b.bucket} ${pct(b.weight)}`} />
              ))}
            </div>
            <div className="legend">
              {m.buckets.map((b) => (
                <span key={b.bucket}><i style={{ background: BUCKET_COLOR[b.bucket] }} />{b.bucket} {pct(b.weight, 0)}</span>
              ))}
            </div>
            <div className="positions">
              {m.positions.map((p) => (
                <div key={p.symbol}>
                  <span>{p.display} <span className="faint num">{p.price < 1 ? p.price.toPrecision(3) : p.price.toFixed(2)}</span></span>
                  <span className={`num ${p.change24h == null ? "faint" : p.change24h >= 0 ? "up" : "down"}`}>
                    {p.change24h == null ? "—" : `${p.change24h >= 0 ? "+" : ""}${(p.change24h * 100).toFixed(2)}%`}
                  </span>
                </div>
              ))}
            </div>
            {m.warnings.length > 0 && (
              <ul className="warn-list" style={{ marginTop: 10 }}>{m.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            )}
            {m.window && <p className="faint" style={{ fontSize: 11, margin: "10px 0 0" }}>Live Bitget data · daily closes {m.window.from} → {m.window.to}</p>}
          </>
        )}
      </section>

      <section className="card">
        <h2>About you</h2>
        <textarea
          className="field"
          rows={3}
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          placeholder="e.g. Student in Lagos, ~$800, medium risk, hold through weekends, can't watch the US session."
        />
        <p className="faint" style={{ fontSize: 11, margin: "6px 0 0" }}>The analyst tailors answers to this.</p>
      </section>
    </aside>
  );
}

function Tile({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className={`tile${alert ? " alert" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
