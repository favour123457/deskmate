// Finnhub (https://finnhub.io) — backup source for earnings dates + company news when the Bitget MCP is unavailable.
// Needs FINNHUB_API_KEY (free tier). US stocks only; the key is sent as a header, never in the URL.
import { bucketFor, underlying } from "./bitget";

const BASE = "https://finnhub.io/api/v1";
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

/** Next + most recent earnings date and the last 7 days of company news for the stock behind e.g. "rNVDA". */
export async function earningsAndNews(raw: string) {
  const ticker = underlying(raw);
  const bucket = bucketFor(raw);
  if (bucket === "Crypto" || bucket === "Other") throw new Error(`Finnhub covers US stocks only, not ${raw}.`);
  const now = Date.now();
  const [cal, news] = await Promise.all([
    get<{ earningsCalendar?: EarningsRow[] }>(`/calendar/earnings?symbol=${ticker}&from=${ymd(now - 120 * DAY)}&to=${ymd(now + 120 * DAY)}`),
    get<NewsRow[]>(`/company-news?symbol=${ticker}&from=${ymd(now - 7 * DAY)}&to=${ymd(now)}`),
  ]);
  const rows = (cal.earningsCalendar || []).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
  const today = ymd(now);
  const next = rows.find((r) => r.date >= today) || null;
  const last = [...rows].reverse().find((r) => r.date < today) || null;
  const hour = (h?: string) => (h === "bmo" ? "before US open" : h === "amc" ? "after US close" : h || "time n/a");
  return {
    ticker,
    nextEarnings: next
      ? { date: next.date, when: hour(next.hour), daysUntil: Math.round((Date.parse(next.date) - Date.parse(today)) / DAY), fiscal: `Q${next.quarter} ${next.year}`, epsEstimate: next.epsEstimate ?? null, revenueEstimate: next.revenueEstimate ?? null }
      : null,
    lastEarnings: last
      ? { date: last.date, epsEstimate: last.epsEstimate ?? null, epsActual: last.epsActual ?? null, revenueEstimate: last.revenueEstimate ?? null, revenueActual: last.revenueActual ?? null }
      : null,
    news: (Array.isArray(news) ? news : [])
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 6)
      .map((n) => ({ date: ymd(n.datetime * 1000), source: n.source, headline: n.headline, summary: (n.summary || "").slice(0, 200), url: n.url })),
  };
}
