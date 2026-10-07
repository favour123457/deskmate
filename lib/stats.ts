// Pure maths — no network. Unit-tested in scripts/test-math.mjs.
import type { Bucket, Candle, PortfolioMetrics } from "./types";

export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function std(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function corr(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return NaN;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

export function beta(asset: number[], bench: number[]) {
  const n = Math.min(asset.length, bench.length);
  if (n < 5) return NaN;
  const x = bench.slice(-n), y = asset.slice(-n);
  const mx = mean(x), my = mean(y);
  let cov = 0, vx = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
  }
  return vx ? cov / vx : NaN;
}

export function percentile(xs: number[], p: number) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export function maxDrawdown(returns: number[]) {
  let peak = 1, v = 1, mdd = 0;
  for (const r of returns) {
    v *= 1 + r;
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd;
}

/** Align several daily close series on common UTC dates and return simple returns. */
export function alignedReturns(series: Record<string, Candle[]>) {
  const maps = Object.entries(series).map(([k, cs]) => [k, new Map(cs.map((c) => [dayKey(c.t), c.close]))] as const);
  if (!maps.length) return { dates: [] as string[], returns: {} as Record<string, number[]> };
  let common = [...maps[0][1].keys()];
  for (const [, m] of maps.slice(1)) common = common.filter((d) => m.has(d));
  common.sort();
  const returns: Record<string, number[]> = {};
  for (const [k, m] of maps) {
    const closes = common.map((d) => m.get(d)!);
    returns[k] = closes.slice(1).map((c, i) => c / closes[i] - 1);
  }
  return { dates: common.slice(1), returns };
}

/** Friday-close -> Monday-close compounded returns (the US-market-closed window). */
export function weekendReturns(dates: string[], port: number[]) {
  const out: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const dow = new Date(dates[i] + "T00:00:00Z").getUTCDay();
    if (dow === 1 && i >= 2) {
      const d1 = new Date(dates[i - 1] + "T00:00:00Z").getUTCDay();
      const d2 = new Date(dates[i - 2] + "T00:00:00Z").getUTCDay();
      if (d1 === 0 && d2 === 6) out.push((1 + port[i - 2]) * (1 + port[i - 1]) * (1 + port[i]) - 1);
    }
  }
  return out;
}

export type PositionInput = {
  key: string; // unique key into series
  display: string;
  symbol: string;
  usd: number;
  bucket: Bucket;
  price: number;
  change24h: number | null;
};

const fin = (x: number) => (Number.isFinite(x) ? x : null);

export function computeMetrics(
  positions: PositionInput[],
  series: Record<string, Candle[]>,
  btcKey: string | null,
): PortfolioMetrics {
  const warnings: string[] = [];
  const live = positions.filter((p) => p.usd > 0);
  const totalUsd = live.reduce((a, p) => a + p.usd, 0);
  const weights = live.map((p) => (totalUsd ? p.usd / totalUsd : 0));

  const bucketMap = new Map<Bucket, number>();
  live.forEach((p, i) => bucketMap.set(p.bucket, (bucketMap.get(p.bucket) || 0) + weights[i]));
  const hhi = weights.reduce((a, w) => a + w * w, 0);

  const top = live.length ? live.map((p, i) => ({ display: p.display, weight: weights[i] })).sort((a, b) => b.weight - a.weight)[0] : null;

  const keys = live.map((p) => p.key);
  const needed: Record<string, Candle[]> = {};
  for (const k of keys) if (series[k]) needed[k] = series[k];
  if (btcKey && series[btcKey]) needed[btcKey] = series[btcKey];
  const missing = keys.filter((k) => !series[k]?.length);
  if (missing.length) warnings.push(`No price history for: ${missing.join(", ")}`);

  const { dates, returns } = alignedReturns(needed);
  let port: number[] = [];
  if (dates.length && live.length && !missing.length) {
    port = dates.map((_, t) => live.reduce((a, p, i) => a + weights[i] * returns[p.key][t], 0));
  }
  if (dates.length < 20) warnings.push(`Only ${dates.length} overlapping days of history — statistics are rough.`);

  const last30 = port.slice(-30);
  const vol = fin(std(last30) * Math.sqrt(365));
  const var95 = port.length >= 20 ? fin(-percentile(port, 0.05) * totalUsd) : null;
  const btcR = btcKey ? returns[btcKey] : undefined;
  const btcCorrelation = btcR && port.length ? fin(corr(port, btcR)) : null;
  const btcBeta = btcR && port.length ? fin(beta(port, btcR)) : null;
  const wk = weekendReturns(dates, port);
  const weekendWorstPct = wk.length ? Math.min(...wk) : null;
  const weekendAvgAbsPct = wk.length ? mean(wk.map(Math.abs)) : null;

  const correlations: PortfolioMetrics["correlations"] = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = returns[live[i].key], b = returns[live[j].key];
      if (a && b) {
        const rho = corr(a, b);
        if (Number.isFinite(rho)) correlations.push({ a: live[i].display, b: live[j].display, rho });
      }
    }
  correlations.sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho));

  if (top && top.weight > 0.4) warnings.push(`${top.display} is ${(top.weight * 100).toFixed(0)}% of the portfolio.`);

  return {
    totalUsd,
    positions: live.map((p, i) => ({
      display: p.display, symbol: p.symbol, usd: p.usd, weight: weights[i], bucket: p.bucket, price: p.price, change24h: p.change24h,
    })),
    buckets: [...bucketMap.entries()].map(([bucket, weight]) => ({ bucket, weight })).sort((a, b) => b.weight - a.weight),
    topHolding: top,
    effectivePositions: hhi ? 1 / hhi : 0,
    vol30dAnnual: vol,
    var95OneDayUsd: var95,
    btcCorrelation,
    btcBeta,
    weekendWorstPct,
    weekendAvgAbsPct,
    maxDrawdownPct: port.length ? maxDrawdown(port) : null,
    correlations: correlations.slice(0, 6),
    window: dates.length ? { from: dates[0], to: dates[dates.length - 1], days: dates.length } : null,
    warnings,
    history: indexHistory(dates, port, btcR),
  };
}

function indexHistory(dates: string[], port: number[], btc: number[] | undefined) {
  if (!port.length) return [];
  let b = 100, c = 100;
  const out: { date: string; book: number; btc: number | null }[] = [];
  for (let i = 0; i < port.length; i++) {
    b *= 1 + port[i];
    if (btc && Number.isFinite(btc[i])) c *= 1 + btc[i];
    out.push({ date: dates[i], book: Number(b.toFixed(2)), btc: btc ? Number(c.toFixed(2)) : null });
  }
  return out;
}
