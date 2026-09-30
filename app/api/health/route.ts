import { bitgetReachable } from "@/lib/bitget";
import { providers } from "@/lib/llm";
import { mcpLastError, mcpTools } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [bitget, tools] = await Promise.all([bitgetReachable(), mcpTools()]);
  return Response.json({
    bitgetRest: bitget,
    bitgetMcp: { ok: tools.length > 0, tools: tools.map((t) => t.name), error: mcpLastError() },
    llm: providers().map((p) => ({ id: p.id, model: p.model })),
  });
}
