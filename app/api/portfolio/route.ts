import { snapshot } from "@/lib/portfolio";
import { usMarketStatus } from "@/lib/market-clock";
import type { Holding } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { holdings?: Holding[] } | null;
  const holdings = (body?.holdings || []).slice(0, 20).map((h) => ({ symbol: String(h.symbol), usd: Number(h.usd) || 0 }));
  try {
    const snap = await snapshot(holdings);
    return Response.json({ ...snap, clock: usMarketStatus() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
