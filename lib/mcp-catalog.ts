// The Bitget MCP is a catalog API: guide() lists categories, guide({category}) lists data entries,
// do_query({entry_id, params}) fetches one. Browsing it costs the model several rounds, so we load the
// catalog once in code (cached) and hand the model a compact entry list up front.
import { callMcp } from "./mcp";

export type CatalogEntry = { id: string; category: string; title: string; summary: string; params: string; tier: string };

const TTL = 6 * 60 * 60_000;
let cache: { at: number; entries: CatalogEntry[] } | null = null;

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
        params: String(e.params_summary || ""),
        tier: String(e.data_tier || ""),
      }));
    }),
  );
  const entries = lists.flat().filter((e) => e.id);
  if (!entries.length) throw new Error("Bitget MCP guide returned no data entries");
  cache = { at: Date.now(), entries };
  return entries;
}

/** One line per entry, free tier only when tiers are given. */
export function catalogForPrompt(entries: CatalogEntry[]): string {
  const usable = entries.filter((e) => !e.tier || e.tier === "free");
  return usable.map((e) => `- ${e.id} [${e.category}] ${e.title}${e.params ? ` | params: ${e.params}` : ""}`).join("\n");
}
