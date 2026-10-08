// Finnhub (https://finnhub.io): company news, analyst rating trends and earnings dates for US stocks.
// Needs FINNHUB_API_KEY (free tier). The key is sent as a header, never in the URL.
// (Price targets / upgrades are paid on Finnhub; those come from the Bitget MCP instead.)
import { bucketFor, underlying } from "./bitget";

const BASE = process.env.FINNHUB_API_BASE || "https://finnhub.io/api/v1";
const DAY = 86_400_000;

export const finnhubEnabled = () => Boolean(process.env.FINNHUB_API_KEY);

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "X-Finnhub-Token": process.env.FINNHUB_API_KEY || "" },
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`Finnhub ${path.split("?")[0]} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

type EarningsRow = { date: string; hour?: string; quarter?: number; year?: number; epsEstimate?: number | null; epsActual?: number | null; revenueEstimate?: number | null; revenueActual?: number | null };
type NewsRow = { datetime: number; headline: string; source: string; summary?: string; url: string };
type RecRow = { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };

/** "rNVDA" -> "NVDA"; throws for crypto, which Finnhub's stock endpoints don't cover. */
export function stockTicker(raw: string) {
  const bucket = bucketFor(raw);
  if (bucket === "Crypto" || bucket === "Other") throw new Error(`Finnhub covers US stocks only, not ${raw}.`);
  return underlying(raw);
}

const hourLabel = (h?: string) => (h === "bmo" ? "before US open" : h === "amc" ? "after US close" : h || "time n/a");

export async function earnings(ticker: string) {
  const now = Date.now();
  const today = ymd(now);
  const cal = await get<{ earningsCalendar?: EarningsRow[] }>(`/calendar/earnings?symbol=${ticker}&from=${ymd(now - 120 * DAY)}&to=${ymd(now + 120 * DAY)}`);
  const rows = (cal.earningsCalendar || []).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
  const next = rows.find((r) => r.date >= today) || null;
  const last = [...rows].reverse().find((r) => r.date < today) || null;
  return {
    next: next
      ? { date: next.date, when: hourLabel(next.hour), daysUntil: Math.round((Date.parse(next.date) - Date.parse(today)) / DAY), fiscal: `Q${next.quarter} ${next.year}`, epsEstimate: next.epsEstimate ?? null, revenueEstimate: next.revenueEstimate ?? null }
      : null,
    last: last
      ? { date: last.date, epsEstimate: last.epsEstimate ?? null, epsActual: last.epsActual ?? null, revenueEstimate: last.revenueEstimate ?? null, revenueActual: last.revenueActual ?? null }
      : null,
  };
}

/** Latest monthly analyst recommendation counts. */
export async function recommendation(ticker: string) {
  const rows = await get<RecRow[]>(`/stock/recommendation?symbol=${ticker}`);
  const r = (Array.isArray(rows) ? rows : []).sort((a, b) => b.period.localeCompare(a.period))[0];
  if (!r) return null;
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  return { period: r.period, strongBuy: r.strongBuy, buy: r.buy, hold: r.hold, sell: r.sell, strongSell: r.strongSell, total };
}

const nameCache = new Map<string, { at: number; name: string | null }>();

async function companyName(ticker: string) {
  const hit = nameCache.get(ticker);
  if (hit && Date.now() - hit.at < DAY) return hit.name;
  const p = await get<{ name?: string }>(`/stock/profile2?symbol=${ticker}`).catch(() => ({}) as { name?: string });
  const name = p.name || null;
  nameCache.set(ticker, { at: Date.now(), name });
  return name;
}

/**
 * Newest company news that actually mentions the company. Finnhub's "related" feed for big names is
 * noisy (e.g. "Why SpaceX Stock Popped" tagged NVDA), so headlines must contain the ticker or the
 * first word of the company name; falls back to the raw feed if too few match.
 */
export async function relevantNews(ticker: string, n = 3, days = 7) {
  const now = Date.now();
  const [rows, name] = await Promise.all([
    get<NewsRow[]>(`/company-news?symbol=${ticker}&from=${ymd(now - days * DAY)}&to=${ymd(now)}`),
    companyName(ticker),
  ]);
  const word = (name || "").split(/[\s,.]+/)[0]?.toLowerCase();
  const tickerRe = new RegExp(`\\b${ticker}\\b`, "i");
  const all = (Array.isArray(rows) ? rows : []).filter((r) => r.headline).sort((a, b) => b.datetime - a.datetime);
  const hits = all.filter((r) => tickerRe.test(r.headline) || (word && word.length > 2 && r.headline.toLowerCase().includes(word)));
  const pick = (hits.length >= Math.min(n, 2) ? hits : all).slice(0, n);
  return pick.map((r) => ({ date: ymd(r.datetime * 1000), ts: r.datetime * 1000, source: r.source, headline: r.headline, summary: (r.summary || "").slice(0, 200), url: r.url }));
}

/** Agent tool: earnings dates, analyst rating trend and recent relevant news for the stock behind e.g. "rNVDA". */
export async function earningsAndNews(raw: string) {
  const ticker = stockTicker(raw);
  const [e, rating, news] = await Promise.all([
    earnings(ticker),
    recommendation(ticker).catch(() => null),
    relevantNews(ticker, 6),
  ]);
  return {
    ticker,
    nextEarnings: e.next,
    lastEarnings: e.last,
    analystRating: rating,
    news: news.map(({ ts: _ts, ...rest }) => rest),
  };
}
