"use client";
// Portfolio: value, chart, holdings, risk in plain words and what moves together. Flat on the background,
// separated by hairlines. Green/red only on numbers that go up or down.
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookChart } from "@/components/BookChart";
import { AssetLogo } from "@/components/AssetLogo";
import { StatusLine } from "@/components/StatusLine";
import { Close, Plus } from "@/components/Icons";
import { useStore } from "@/lib/store";
import type { Holding, PortfolioMetrics } from "@/lib/types";

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const signed = (x: number, d = 2) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
const usd = (x: number | null | undefined) => (x == null ? "—" : `$${Math.round(x).toLocaleString("en-US")}`);
const price = (p: number) => (p >= 1000 ? Math.round(p).toLocaleString("en-US") : p < 1 ? p.toPrecision(3) : p.toFixed(2));
const tone = (x: number | null | undefined) => (x == null ? "faint" : x >= 0 ? "up" : "down");

function dayChange(m: PortfolioMetrics) {
  return m.positions.length && m.positions.every((p) => p.change24h != null)
    ? m.positions.reduce((a, p) => a + p.weight * (p.change24h as number), 0)
    : null;
}

function Editor({ holdings, onSave, onCancel, loading }: { holdings: Holding[]; onSave: (h: Holding[]) => void; onCancel: () => void; loading: boolean }) {
  const [rows, setRows] = useState<Holding[]>(holdings);
  const upd = (i: number, p: Partial<Holding>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <motion.div className="editor" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className="editor-inner">
        {rows.map((r, i) => (
          <div className="edit-row" key={i}>
            <input value={r.symbol} placeholder="rNVDA, BTC" aria-label="Asset" onChange={(e) => upd(i, { symbol: e.target.value })} />
            <span className="edit-usd">
              <span>$</span>
              <input inputMode="decimal" value={r.usd ? String(r.usd) : ""} placeholder="0" aria-label="Value in USD" onChange={(e) => upd(i, { usd: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
            </span>
            <button className="icon-btn" aria-label={`Remove ${r.symbol || "row"}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Close /></button>
          </div>
        ))}
        <div className="edit-actions">
          <button className="btn ghost" onClick={() => setRows([...rows, { symbol: "", usd: 0 }])}><Plus /> Add asset</button>
          <span className="grow" />
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={loading} onClick={() => onSave(rows.filter((r) => r.symbol.trim()))}>{loading ? "Updating" : "Save"}</button>
        </div>
      </div>
    </motion.div>
  );
}

export default function Portfolio() {
  const { holdings, setHoldings, metrics: m, errors, loadingBook, refresh } = useStore();
  const [editing, setEditing] = useState(false);
  const day = m ? dayChange(m) : null;
  const mo = m?.vol30dAnnual != null ? m.vol30dAnnual * Math.sqrt(30 / 365) : null;
  const last = m?.history?.length ? m.history[m.history.length - 1] : null;

  const risks = m
    ? [
        { term: "Concentration", value: pct(m.topHolding?.weight, 0), alert: (m.topHolding?.weight ?? 0) > 0.4, plain: m.topHolding ? `${pct(m.topHolding.weight, 0)} of your money sits in ${m.topHolding.display}. Above 40%, one asset decides your week.` : "" },
        { term: "Diversification", value: m.effectivePositions.toFixed(1), alert: false, plain: `Your ${m.positions.length} positions behave like ${m.effectivePositions.toFixed(1)} truly separate ones.` },
        { term: "Link to BTC", value: m.btcCorrelation == null ? "—" : m.btcCorrelation.toFixed(2), alert: (m.btcCorrelation ?? 0) > 0.7, plain: m.btcCorrelation == null ? "Not enough data." : m.btcCorrelation > 0.7 ? "When BTC moves, your book usually follows. The stocks aren't hedging your crypto." : m.btcCorrelation > 0.4 ? "Your book partly moves with BTC." : "Your book mostly moves on its own." },
        { term: "Volatility", value: pct(m.vol30dAnnual, 0), alert: false, plain: mo == null ? "Not enough data." : `Yearly figure. A normal month swings about ±${(mo * 100).toFixed(0)}% (${usd(mo * m.totalUsd)}).` },
        { term: "Bad-day loss", value: usd(m.var95OneDayUsd), alert: false, plain: "What you could lose on a bad day, about 1 in 20. Also called 1-day VaR 95%." },
        { term: "Worst weekend", value: pct(m.weekendWorstPct), alert: (m.weekendWorstPct ?? 0) < -0.05, plain: "The worst Friday-to-Monday move, while the US market was shut and only rTokens traded." },
        { term: "Deepest fall", value: pct(m.maxDrawdownPct), alert: (m.maxDrawdownPct ?? 0) < -0.25, plain: "The biggest drop from a high to a later low. Also called max drawdown." },
      ]
    : [];

  return (
    <>
      <main className="wrap page portfolio">
        <header className="pf-head">
          <div>
            <p className="eyebrow">Portfolio value</p>
            <p className="pf-value">
              <span className="pf-big num">{m ? usd(m.totalUsd) : loadingBook ? "…" : "—"}</span>
              {day != null && <span className={`pf-day num ${tone(day)}`}>{signed(day)} today</span>}
            </p>
            {m?.window && <p className="faint small">{m.positions.length} positions · live Bitget prices · daily closes {m.window.from} to {m.window.to}</p>}
          </div>
          <button className="btn" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>{editing ? "Close editor" : "Edit holdings"}</button>
        </header>

        <AnimatePresence initial={false}>
          {editing && (
            <Editor
              holdings={holdings}
              loading={loadingBook}
              onCancel={() => setEditing(false)}
              onSave={(h) => { setHoldings(h); refresh(h); setEditing(false); }}
            />
          )}
        </AnimatePresence>
        {errors.length > 0 && <div className="errors">{errors.map((e, i) => <p key={i}>{e}</p>)}</div>}

        {m && m.history?.length > 0 && last && (
          <section className="pf-chart">
            <div className="pf-chart-head">
              <h2 className="label">Last {m.history.length} days</h2>
              <p className="faint small">Today&rsquo;s book held at today&rsquo;s weights, against just holding BTC. Both start at 100.</p>
            </div>
            <BookChart data={m.history} height={300} />
          </section>
        )}

        {m && (
          <div className="pf-grid">
            <section>
              <h2 className="label">Holdings</h2>
              <table className="holdings">
                <thead>
                  <tr><th>Asset</th><th className="n hide-sm">Price</th><th className="n">24h</th><th className="n">Value</th><th className="n">Weight</th></tr>
                </thead>
                <tbody>
                  {[...m.positions].sort((a, b) => b.weight - a.weight).map((p) => (
                    <tr key={p.symbol}>
                      <td>
                        <span className="asset">
                          <AssetLogo symbol={p.display} size={26} />
                          <span><b>{p.display}</b><span className="faint hide-sm">{p.bucket}</span></span>
                        </span>
                      </td>
                      <td className="n num hide-sm">{price(p.price)}</td>
                      <td className={`n num ${tone(p.change24h)}`}>{p.change24h == null ? "—" : signed(p.change24h)}</td>
                      <td className="n num">{usd(p.usd)}</td>
                      <td className="n num">
                        {pct(p.weight, 0)}
                        <span className="wbar" aria-hidden><i style={{ width: `${Math.max(2, p.weight * 100)}%` }} /></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {m.correlations.length > 0 && (
                <>
                  <h2 className="label spaced">What moves together</h2>
                  <p className="faint small">1.00 means they rise and fall in lockstep. Pairs near 1 protect you less than they look.</p>
                  <ul className="pairs">
                    {m.correlations.slice(0, 5).map((c) => (
                      <li key={c.a + c.b}>
                        <span>{c.a} <span className="faint">/</span> {c.b}</span>
                        <span className="pair-bar" aria-hidden><i style={{ width: `${Math.max(0, c.rho) * 100}%` }} /></span>
                        <b className="num">{c.rho.toFixed(2)}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section>
              <h2 className="label">Risk, in plain words</h2>
              <dl className="risks">
                {risks.map((r) => (
                  <div key={r.term} className="risk">
                    <dt>{r.term}</dt>
                    <dd className={`risk-v num${r.alert ? " down" : ""}`}>{r.value}</dd>
                    {r.plain && <dd className="risk-p">{r.plain}</dd>}
                  </div>
                ))}
              </dl>
            </section>
          </div>
        )}
        {!m && !loadingBook && <p className="faint">Add holdings with Edit holdings to see your numbers.</p>}
      </main>
      <StatusLine />
    </>
  );
}
