// Portfolio engine: fetches live Bitget data, then does all the maths in code (never in the LLM).
import { dailyCandles, resolveSymbol } from "./bitget";
import { computeMetrics, type PositionInput } from "./stats";
import type { Candle, Holding, PortfolioMetrics, Resolved } from "./types";

export type Snapshot = {
  metrics: PortfolioMetrics;
  resolved: Resolved[];
  errors: string[];
};

async function loadPositions(holdings: Holding[]) {
  const errors: string[] = [];
  const clean = holdings.filter((h) => h.symbol?.trim() && Number(h.usd) > 0);
  const results = await Promise.all(
    clean.map(async (h) => {
      try {
        const r = await resolveSymbol(h.symbol);
        const candles = await dailyCandles(r).catch((e) => {
          errors.push(`${r.display}: ${(e as Error).message}`);
          return [] as Candle[];
        });
        return { h, r, candles };
      } catch (e) {
        errors.push((e as Error).message);
        return null;
      }
    }),
  );
  return { rows: results.filter((x): x is NonNullable<typeof x> => !!x), errors };
}

async function btcSeries(): Promise<Candle[]> {
  try {
    return await dailyCandles({ market: "spot", symbol: "BTCUSDT" });
  } catch {
    return [];
  }
}

function build(rows: { h: Holding; r: Resolved; candles: Candle[] }[], btc: Candle[]) {
  // merge duplicates of the same instrument
  const byKey = new Map<string, PositionInput>();
  const series: Record<string, Candle[]> = {};
  for (const { h, r, candles } of rows) {
    const key = `${r.market}:${r.symbol}`;
    const prev = byKey.get(key);
    if (prev) prev.usd += Number(h.usd);
    else
      byKey.set(key, {
        key, display: r.display, symbol: r.symbol, usd: Number(h.usd), bucket: r.bucket, price: r.price, change24h: r.change24h,
      });
    series[key] = candles;
  }
  series["__BTC"] = btc;
  return { positions: [...byKey.values()], series };
}

export async function snapshot(holdings: Holding[]): Promise<Snapshot> {
  const [{ rows, errors }, btc] = await Promise.all([loadPositions(holdings), btcSeries()]);
  const { positions, series } = build(rows, btc);
  const metrics = computeMetrics(positions, series, btc.length ? "__BTC" : null);
  return { metrics, resolved: rows.map((r) => r.r), errors };
}

/** Before/after comparison for a proposed trade. usdChange > 0 = buy/add, < 0 = sell/trim. */
export async function simulateTrade(holdings: Holding[], symbol: string, usdChange: number) {
  const target = await resolveSymbol(symbol);
  const before = await snapshot(holdings);
  const after: Holding[] = holdings.map((h) => ({ ...h }));
  let applied = false;
  for (const h of after) {
    try {
      const r = await resolveSymbol(h.symbol);
      if (r.symbol === target.symbol && r.market === target.market && !applied) {
        h.usd = Math.max(0, Number(h.usd) + usdChange);
        applied = true;
      }
    } catch {
      /* ignore unresolvable */
    }
  }
  if (!applied) {
    if (usdChange <= 0) throw new Error(`You don't hold ${target.display}, so there is nothing to sell.`);
    after.push({ symbol, usd: usdChange });
  }
  const afterSnap = await snapshot(after);
  return { instrument: target, usdChange, before: before.metrics, after: afterSnap.metrics };
}

/** Compact, LLM-friendly summary of one instrument's recent history (numbers computed here). */
export async function priceHistorySummary(symbol: string) {
  const r = await resolveSymbol(symbol);
  const c = await dailyCandles(r);
  const closes = c.map((x) => x.close);
  const last = closes[closes.length - 1];
  const ret = (n: number) => (closes.length > n ? last / closes[closes.length - 1 - n] - 1 : null);
  const rets = closes.slice(1).map((x, i) => x / closes[i] - 1);
  const std = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
  };
  const last30 = closes.slice(-30);
  return {
    instrument: r.display,
    exchangeSymbol: r.symbol,
    market: r.market,
    lastPrice: last,
    change24h: r.change24h,
    return7d: ret(7),
    return30d: ret(30),
    return90d: ret(90),
    high30d: Math.max(...last30),
    low30d: Math.min(...last30),
    vol30dAnnual: rets.length > 5 ? std(rets.slice(-30)) * Math.sqrt(365) : null,
    volume24hUsd: r.volumeUsd,
    days: closes.length,
  };
}
