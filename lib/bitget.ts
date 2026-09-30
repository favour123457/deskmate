// Bitget public REST (no API key needed). Docs: https://www.bitget.com/api-doc
import type { Bucket, Candle, Market, Resolved } from "./types";

const BASE = process.env.BITGET_API_BASE || "https://api.bitget.com";

const CRYPTO = new Set([
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "TON", "AVAX", "LINK", "DOT", "TRX",
  "LTC", "BCH", "SUI", "PEPE", "SHIB", "ARB", "OP", "BGB", "NEAR", "APT", "HYPE", "USDC",
]);
const US_TECH = new Set([
  "NVDA", "AMD", "AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "TSLA", "NFLX", "AVGO",
  "ORCL", "CRM", "ADBE", "INTC", "QCOM", "TSM", "PLTR", "COIN", "MSTR", "SMCI", "ARM", "MU",
  "SOXL", "SOXS", "TQQQ", "HOOD", "SHOP", "UBER",
]);
const US_INDEX = new Set(["SPY", "QQQ", "IWM", "DIA", "VOO", "GLD", "SLV", "TLT", "XLE", "XLF"]);

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { cache: "no-store", signal: AbortSignal.timeout(9000) });
  const json = (await res.json().catch(() => null)) as { code?: string; msg?: string; data?: T } | null;
  if (!json || json.code !== "00000") {
    throw new Error(`Bitget ${path.split("?")[0]} -> ${json?.msg || res.status}`);
  }
  return json.data as T;
}

function clean(raw: string) {
  return raw.trim().replace(/[\s/_-]/g, "").replace(/USDT$/i, "");
}

function underlying(raw: string): string {
  const c = clean(raw);
  // "rNVDA" (lower-case r prefix) means tokenized stock
  if (/^r[A-Z0-9]{1,8}$/.test(c)) return c.slice(1);
  return c.toUpperCase();
}

export function bucketFor(raw: string): Bucket {
  const u = underlying(raw);
  const u2 = u.startsWith("R") && !CRYPTO.has(u) ? u.slice(1) : u;
  if (CRYPTO.has(u)) return "Crypto";
  if (US_TECH.has(u) || US_TECH.has(u2)) return "US tech";
  if (US_INDEX.has(u) || US_INDEX.has(u2)) return "US index/ETF";
  if (/^[A-Z]{1,5}$/.test(u2)) return "US other";
  return "Other";
}

function candidates(raw: string): { market: Market; symbol: string; display: string }[] {
  const c = clean(raw);
  const u = underlying(raw);
  const list: { market: Market; symbol: string; display: string }[] = [];
  if (CRYPTO.has(u)) list.push({ market: "spot", symbol: `${u}USDT`, display: u });
  // tokenized US stock on spot, e.g. RNVDAUSDT
  list.push({ market: "spot", symbol: `R${u}USDT`, display: `r${u}` });
  // user may have typed the full exchange base already, e.g. RNVDA
  list.push({ market: "spot", symbol: `${c.toUpperCase()}USDT`, display: c });
  // US stock perpetual futures, e.g. NVDAUSDT
  list.push({ market: "futures", symbol: `${u}USDT`, display: `${u}-PERP` });
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x.market + x.symbol) ? false : (seen.add(x.market + x.symbol), true)));
}

type TickerRow = { symbol: string; lastPr: string; change24h?: string; usdtVolume?: string };

async function ticker(market: Market, symbol: string): Promise<TickerRow | null> {
  const path =
    market === "spot"
      ? `/api/v2/spot/market/tickers?symbol=${symbol}`
      : `/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`;
  try {
    const data = await get<TickerRow[]>(path);
    const row = Array.isArray(data) ? data[0] : null;
    return row && Number(row.lastPr) > 0 ? row : null;
  } catch {
    return null;
  }
}

const resolveCache = new Map<string, { at: number; value: Resolved }>();

export async function resolveSymbol(raw: string): Promise<Resolved> {
  const key = raw.trim();
  const hit = resolveCache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.value;
  for (const cand of candidates(key)) {
    const row = await ticker(cand.market, cand.symbol);
    if (row) {
      const value: Resolved = {
        input: key,
        market: cand.market,
        symbol: cand.symbol,
        display: cand.display,
        price: Number(row.lastPr),
        change24h: row.change24h != null ? Number(row.change24h) : null,
        volumeUsd: row.usdtVolume != null ? Number(row.usdtVolume) : null,
        bucket: bucketFor(key),
      };
      resolveCache.set(key, { at: Date.now(), value });
      return value;
    }
  }
  throw new Error(`Could not find "${raw}" on Bitget (tried ${candidates(key).map((c) => c.symbol).join(", ")})`);
}

const candleCache = new Map<string, { at: number; value: Candle[] }>();

export async function dailyCandles(r: Pick<Resolved, "market" | "symbol">, limit = 120): Promise<Candle[]> {
  const key = `${r.market}:${r.symbol}:${limit}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const path =
    r.market === "spot"
      ? `/api/v2/spot/market/candles?symbol=${r.symbol}&granularity=1day&limit=${limit}`
      : `/api/v2/mix/market/candles?symbol=${r.symbol}&productType=USDT-FUTURES&granularity=1D&limit=${limit}`;
  const rows = await get<string[][]>(path);
  const value = rows
    .map((row) => ({ t: Number(row[0]), close: Number(row[4]) }))
    .filter((c) => Number.isFinite(c.t) && c.close > 0)
    .sort((a, b) => a.t - b.t);
  candleCache.set(key, { at: Date.now(), value });
  return value;
}

export async function bitgetReachable(): Promise<{ ok: boolean; detail: string }> {
  try {
    const row = await ticker("spot", "BTCUSDT");
    return row ? { ok: true, detail: `BTC ${Number(row.lastPr).toFixed(0)}` } : { ok: false, detail: "empty ticker" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
