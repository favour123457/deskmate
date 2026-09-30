import { runAgent, type AskInput } from "@/lib/agent";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AskInput | null;
  if (!body?.question?.trim() || !Array.isArray(body.holdings)) {
    return Response.json({ error: "question and holdings are required" }, { status: 400 });
  }
  const input: AskInput = {
    question: body.question.slice(0, 1000),
    holdings: body.holdings.slice(0, 20).map((h) => ({ symbol: String(h.symbol).slice(0, 20), usd: Number(h.usd) || 0 })),
    profile: body.profile?.slice(0, 400),
    history: (body.history || []).slice(-4).map((h) => ({ question: String(h.question).slice(0, 600), answer: String(h.answer).slice(0, 800) })),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(input, emit);
      } catch (e) {
        emit({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
