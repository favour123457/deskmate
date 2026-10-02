import { bucketFor } from "@/lib/bitget";
import { stockBrief } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST {symbols: ["rNVDA", "BTC", ...]} -> {briefs, skipped, at}. Crypto is skipped (stock data only).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { symbols?: unknown } | null;
  if (!Array.isArray(body?.symbols)) return Response.json({ error: "symbols array is required" }, { status: 400 });
  const symbols = [...new Set(body.symbols.map((s) => String(s).trim().slice(0, 20)).filter(Boolean))].slice(0, 8);
  const stocks = symbols.filter((s) => !["Crypto", "Other"].includes(bucketFor(s)));
  const briefs = await Promise.all(
    stocks.map((s) =>
      stockBrief(s).catch((e) => ({ symbol: s, ticker: s, rating: null, targets: null, earnings: null, news: [], newsSource: null, errors: [(e as Error).message] })),
    ),
  );
  return Response.json({ briefs, skipped: symbols.filter((s) => !stocks.includes(s)), at: Date.now() });
}
