// The Bitget MCP is a catalog API: guide() lists categories, guide({category}) lists data entries,
// do_query({entry_id, params}) fetches one. Browsing it costs the model several rounds, so we load the
// catalog once in code (cached) and hand the model a compact entry list up front.
import { callMcp } from "./mcp";

export type CatalogEntry = { id: string; category: string; title: string; summary: string; params: string; tier: string; paramsRaw: unknown };

const TTL = 6 * 60 * 60_000;
let cache: { at: number; entries: CatalogEntry[] } | null = null;

// Crypto entries relevant to a BTC position in a stock book; the other ~30 crypto entries are left out of the prompt.
const CRYPTO_KEEP = new Set([
  "crypto_etf_flows", "crypto_sentiment_crypto_fear_greed", "crypto_futures_funding_rate", "crypto_futures_open_interest",
  "crypto_futures_liquidations", "crypto_futures_long_short_ratio", "crypto_onchain_exchange_flows", "crypto_onchain_stablecoin_flow",
]);

/** params_summary comes as a list of param objects; render it as "name*:type description e.g. example". */
function paramsText(p: unknown): string {
  if (typeof p === "string") return p;
  if (!Array.isArray(p)) return p && typeof p === "object" ? JSON.stringify(p) : "";
  return p
    .map((x) => {
      if (!x || typeof x !== "object") return String(x);
      const o = x as Record<string, unknown>;
      const name = o.name ?? o.key ?? o.param;
      if (name == null) return JSON.stringify(o);
      const desc = String(o.description ?? o.desc ?? "").slice(0, 40);
      const ex = o.example ?? o.default;
      return `${name}${o.required ? "*" : ""}${o.type ? `:${o.type}` : ""}${desc ? ` ${desc}` : ""}${ex != null && ex !== "" ? ` e.g. ${JSON.stringify(ex)}` : ""}`;
    })
    .join("; ");
}

function parse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text.replace(/^ERROR:\s*/, ""));
  } catch {
    return null;
  }
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.entries;
  const root = parse(await callMcp("guide", {}));
  let cats = ((root?.categories as { key?: string }[]) || []).map((c) => String(c.key || "")).filter(Boolean);
  // Seen working on the live server; used if guide() without arguments doesn't list categories.
  if (!cats.length) cats = ["equity", "news"];
  const lists = await Promise.all(
    cats.map(async (category) => {
      const r = parse(await callMcp("guide", { category }).catch(() => ""));
      return ((r?.entries as Record<string, unknown>[]) || []).map((e) => ({
        id: String(e.id || ""),
        category,
        title: String(e.title || ""),
        summary: String(e.summary || ""),
        params: paramsText(e.params_summary),
        paramsRaw: e.params_summary ?? null,
        tier: String(e.data_tier || ""),
      }));
    }),
  );
  const entries = lists.flat().filter((e) => e.id);
  if (!entries.length) throw new Error("Bitget MCP guide returned no data entries");
  cache = { at: Date.now(), entries };
  return entries;
}

// news_label_search needs an undocumented integer "label" (tag id, not a ticker); the model can only guess it.
const SKIP = new Set(["news_label_search"]);

/** One line per entry, free tier only when tiers are given. */
export function catalogForPrompt(entries: CatalogEntry[]): string {
  const usable = entries.filter((e) => (!e.tier || e.tier === "free") && (e.category !== "crypto" || CRYPTO_KEEP.has(e.id)) && !SKIP.has(e.id));
  return usable
    .map((e) => `- ${e.id} [${e.category}] ${e.title}${e.params ? ` | params: ${e.params.slice(0, 220)}` : ""}`)
    .join("\n");
}
