import { bitgetReachable } from "@/lib/bitget";
import { finnhubEnabled } from "@/lib/finnhub";
import { providers } from "@/lib/llm";
import { mcpLastError, mcpTools } from "@/lib/mcp";
import { loadCatalog } from "@/lib/mcp-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // ?catalog=1 also lists the Bitget MCP data entries (public metadata, no secrets).
  const wantCatalog = new URL(req.url).searchParams.get("catalog") === "1";
  const [bitget, tools] = await Promise.all([bitgetReachable(), mcpTools()]);
  return Response.json({
    bitgetRest: bitget,
    bitgetMcp: { ok: tools.length > 0, tools: tools.map((t) => t.name), error: mcpLastError() },
    finnhub: { configured: finnhubEnabled() },
    llm: providers().map((p) => ({ id: p.id, model: p.model })),
    ...(wantCatalog && tools.length
      ? { toolSchemas: tools, catalog: await loadCatalog().catch((e) => ({ error: (e as Error).message })) }
      : {}),
  });
}
