// Live per-stock research brief for the left panel: analyst rating (Finnhub), price targets (Bitget MCP),
// next earnings (Finnhub) and the newest relevant headlines (Finnhub). Every part names its source and
// reports its own error instead of being filled in.
import { resolveSymbol } from "./bitget";
import { earnings, finnhubEnabled, recommendation, relevantNews, stockTicker } from "./finnhub";
import { callMcp, mcpTools } from "./mcp";

export type PriceTarget = { firm: string; target: number; date: string };

export type StockBrief = {
  symbol: string; // as the user holds it, e.g. rNVDA
  ticker: string; // underlying, e.g. NVDA
  rating: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; total: number; source: "Finnhub" } | null;
  targets: { items: PriceTarget[]; low: number; high: number; source: "Bitget MCP" } | null;
  earnings: { date: string; when: string; daysUntil: number; epsEstimate: number | null; source: "Finnhub" } | null;
  news: { headline: string; source: string; url: string; ts: number }[];
  newsSource: "Finnhub" | null;
  errors: string[];
};

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; value: StockBrief }>();

const num = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN);

/** Bitget MCP equity_estimates_price_target -> newest targets (field names checked defensively). */
async function priceTargets(ticker: string): Promise<PriceTarget[]> {
  const tools = await mcpTools();
  if (!tools.some((t) => t.name === "do_query")) throw new Error("Bitget MCP unavailable");
  const text = await callMcp("do_query", { entry_id: "equity_estimates_price_target", params: { symbol: ticker, limit: 8 } });
  if (text.startsWith("ERROR:")) throw new Error(text.slice(0, 120));
  const body = JSON.parse(text) as { data?: { results?: Record<string, unknown>[] } };
  const rows = body.data?.results || [];
  return rows
    .map((r) => ({
      firm: String(r.analyst_firm ?? r.analyst_company ?? r.firm ?? r.analyst_name ?? "—"),
      target: num(r.price_target ?? r.adj_price_target ?? r.target_price ?? r.price_target_new),
      date: String(r.published_date ?? r.date ?? "").slice(0, 10),
    }))
    .filter((t) => Number.isFinite(t.target) && t.target > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
}

export async function stockBrief(raw: string): Promise<StockBrief> {
  const key = raw.trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const ticker = stockTicker(key);
  const display = await resolveSymbol(key).then((r) => r.display).catch(() => key);
  const errors: string[] = [];
  const fh = finnhubEnabled();
  if (!fh) errors.push("Finnhub key not configured: no rating, earnings or news");

  const [rating, targets, earn, news] = await Promise.all([
    fh ? recommendation(ticker).catch((e) => (errors.push(`rating: ${e.message}`), null)) : null,
    priceTargets(ticker).catch((e) => (errors.push(`price targets: ${e.message}`), [] as PriceTarget[])),
    fh ? earnings(ticker).catch((e) => (errors.push(`earnings: ${e.message}`), null)) : null,
    fh ? relevantNews(ticker, 3).catch((e) => (errors.push(`news: ${e.message}`), [])) : [],
  ]);

  const value: StockBrief = {
    symbol: display,
    ticker,
    rating: rating && rating.total > 0 ? { ...rating, source: "Finnhub" } : null,
    targets: targets.length
      ? { items: targets, low: Math.min(...targets.map((t) => t.target)), high: Math.max(...targets.map((t) => t.target)), source: "Bitget MCP" }
      : null,
    earnings: earn?.next ? { date: earn.next.date, when: earn.next.when, daysUntil: earn.next.daysUntil, epsEstimate: earn.next.epsEstimate, source: "Finnhub" } : null,
    news: news.map((n) => ({ headline: n.headline, source: n.source, url: n.url, ts: n.ts })),
    newsSource: fh ? "Finnhub" : null,
    errors,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}
