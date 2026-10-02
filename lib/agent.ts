// The research loop: question -> LLM picks tools -> tools return real data/maths -> structured insight.
// The LLM never places orders and never does arithmetic itself; the human makes the call.
import { chat, providers, type ChatMessage, type Provider, type ToolCall, type ToolDef } from "./llm";
import { earningsAndNews, finnhubEnabled } from "./finnhub";
import { callMcp, mcpLastError, mcpTools, type McpTool } from "./mcp";
import { catalogForPrompt, loadCatalog } from "./mcp-catalog";
import { usMarketStatus } from "./market-clock";
import { priceHistorySummary, simulateTrade, snapshot, type Snapshot } from "./portfolio";
import type { Holding, Insight, PortfolioMetrics, Risk, StreamEvent, TrailStep, Verdict } from "./types";

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS || 4);
const MCP_DIRECT_MAX = Number(process.env.MCP_DIRECT_MAX || 20);
const RESULT_CHARS = Number(process.env.TOOL_RESULT_CHARS || 3500);

export type AskInput = {
  question: string;
  holdings: Holding[];
  profile?: string;
  history?: { question: string; answer: string }[];
};

type Emit = (e: StreamEvent) => void;

// ---------- helpers ----------
const pct = (x: number | null | undefined, d = 1) => (x == null ? "n/a" : `${(x * 100).toFixed(d)}%`);
const usd = (x: number | null | undefined) => (x == null ? "n/a" : `$${Math.round(x).toLocaleString("en-US")}`);
const num = (x: number | null | undefined, d = 2) => (x == null ? "n/a" : x.toFixed(d));

function round(v: unknown): unknown {
  if (typeof v === "number") return Number.isInteger(v) ? v : Number(v.toPrecision(4));
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]));
  return v;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
}

function stripSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(stripSchema);
  if (s && typeof s === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (k !== "$schema") out[k] = stripSchema(v);
    return out;
  }
  return s;
}

function truncate(s: string, n = RESULT_CHARS) {
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

function extractJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{"), end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

const VERDICTS: Verdict[] = ["proceed", "proceed_smaller", "wait", "avoid", "info"];
const RISKS: Risk[] = ["low", "medium", "high"];

function normalize(raw: Record<string, unknown>): Insight {
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  const impact = Array.isArray(raw.impact)
    ? (raw.impact as Record<string, unknown>[])
        .filter((r) => r && r.metric)
        .map((r) => ({ metric: String(r.metric), before: String(r.before ?? ""), after: String(r.after ?? "") }))
    : [];
  return {
    headline: String(raw.headline || "Analysis"),
    verdict: VERDICTS.includes(raw.verdict as Verdict) ? (raw.verdict as Verdict) : "info",
    risk: RISKS.includes(raw.risk as Risk) ? (raw.risk as Risk) : "medium",
    summary: String(raw.summary || ""),
    findings: arr(raw.findings).slice(0, 8),
    impact: impact.slice(0, 8),
    hedge: raw.hedge ? String(raw.hedge) : null,
    watch: arr(raw.watch).slice(0, 5),
    confidence: (["low", "medium", "high"].includes(raw.confidence as string) ? raw.confidence : "medium") as Insight["confidence"],
    decisionNote: String(raw.decisionNote || "This is research, not advice. The decision is yours."),
  };
}

function metricsForPrompt(m: PortfolioMetrics) {
  return round({
    totalUsd: m.totalUsd,
    positions: m.positions.map((p) => ({ name: p.display, usd: p.usd, weight: p.weight, bucket: p.bucket, price: p.price, change24h: p.change24h })),
    buckets: m.buckets,
    effectivePositions: m.effectivePositions,
    vol30dAnnual: m.vol30dAnnual,
    var95OneDayUsd: m.var95OneDayUsd,
    portfolioCorrelationToBtc: m.btcCorrelation,
    portfolioBetaToBtc: m.btcBeta,
    weekendWorstPct: m.weekendWorstPct,
    weekendAvgAbsPct: m.weekendAvgAbsPct,
    maxDrawdownPct: m.maxDrawdownPct,
    topCorrelations: m.correlations,
    window: m.window,
    warnings: m.warnings,
  });
}

// ---------- tools ----------
type ToolImpl = { def: ToolDef; source: string; run: (args: Record<string, unknown>) => Promise<unknown> };

function internalTools(holdings: Holding[]): ToolImpl[] {
  return [
    {
      source: "Portfolio engine",
      def: {
        type: "function",
        function: {
          name: "simulate_trade",
          description:
            "Compute exactly how a proposed trade changes the user's portfolio risk (weights, concentration, 30d volatility, 1-day VaR, BTC correlation/beta, worst weekend move). ALWAYS use this for any buy/sell/add/trim question, and for any sizing or hedge idea you suggest, instead of estimating. usd_change > 0 adds, < 0 trims. For a rebalance (trim one position and put the money into another), set into_symbol; without it, sold dollars leave the book.",
          parameters: {
            type: "object",
            properties: {
              symbol: { type: "string", description: "e.g. rNVDA, NVDA, BTC, ETH, SPY" },
              usd_change: { type: "number", description: "Dollar amount; positive = buy/add, negative = sell/trim" },
              into_symbol: { type: "string", description: "Optional, only with a negative usd_change: instrument that receives the proceeds, e.g. rSPY" },
            },
            required: ["symbol", "usd_change"],
          },
        },
      },
      run: async (a) => {
        const r = await simulateTrade(holdings, String(a.symbol), Number(a.usd_change), a.into_symbol ? String(a.into_symbol) : undefined);
        const pick = (m: PortfolioMetrics) => ({
          totalUsd: m.totalUsd,
          weights: m.positions.map((p) => ({ name: p.display, usd: p.usd, weight: p.weight })),
          topHolding: m.topHolding,
          buckets: m.buckets,
          effectivePositions: m.effectivePositions,
          vol30dAnnual: m.vol30dAnnual,
          var95OneDayUsd: m.var95OneDayUsd,
          portfolioCorrelationToBtc: m.btcCorrelation,
          portfolioBetaToBtc: m.btcBeta,
          weekendWorstPct: m.weekendWorstPct,
          maxDrawdownPct: m.maxDrawdownPct,
        });
        return round({ instrument: r.instrument.display, price: r.instrument.price, usdChange: r.usdChange, into: r.into, before: pick(r.before), after: pick(r.after) });
      },
    },
    {
      source: "Bitget REST",
      def: {
        type: "function",
        function: {
          name: "get_price_history",
          description:
            "Live Bitget price + recent history stats for one instrument (tokenized US stock like rNVDA, a US stock perp, or crypto): last price, 24h change, 7/30/90-day returns, 30d high/low, 30d volatility, 24h volume.",
          parameters: {
            type: "object",
            properties: { symbol: { type: "string", description: "e.g. rNVDA, TSLA, BTC" } },
            required: ["symbol"],
          },
        },
      },
      run: async (a) => round(await priceHistorySummary(String(a.symbol))),
    },
    ...(finnhubEnabled() ? [finnhubTool()] : []),
  ];
}

function finnhubTool(): ToolImpl {
  return {
    source: "Finnhub",
    def: {
      type: "function",
      function: {
        name: "get_earnings_and_news",
        description:
          "Finnhub (backup, non-Bitget source): next and most recent earnings date (with EPS/revenue estimates) and the last 7 days of company news headlines for a US stock or rToken (e.g. rNVDA -> NVDA). US stocks only. Prefer Bitget MCP data tools when they are connected.",
        parameters: {
          type: "object",
          properties: { symbol: { type: "string", description: "e.g. rNVDA, TSLA" } },
          required: ["symbol"],
        },
      },
    },
    run: async (a) => round(await earningsAndNews(String(a.symbol))),
  };
}

async function mcpToolImpls(tools: McpTool[]): Promise<{ impls: ToolImpl[]; catalog: string | null }> {
  if (!tools.length) return { impls: [], catalog: null };
  if (tools.length <= MCP_DIRECT_MAX) {
    return {
      catalog: null,
      impls: tools.map((t) => ({
        source: "Bitget MCP",
        def: {
          type: "function",
          function: {
            name: safeName(`bitget_${t.name}`),
            description: truncate(t.description || t.name, 300),
            parameters: stripSchema(t.inputSchema) as Record<string, unknown>,
          },
        },
        run: async (a) => callMcp(t.name, a),
      })),
    };
  }
  // Many tools: expose a catalog + two meta tools to keep the prompt small (discover -> drill down -> call).
  const byName = new Map(tools.map((t) => [t.name, t]));
  const catalog = tools.map((t) => `- ${t.name}: ${(t.description || "").split("\n")[0].slice(0, 110)}`).join("\n");
  return {
    catalog,
    impls: [
      {
        source: "Bitget MCP",
        def: {
          type: "function",
          function: {
            name: "bitget_tool_schema",
            description: "Get the argument schema of a Bitget US-stock data tool from the catalog before calling it.",
            parameters: { type: "object", properties: { tool: { type: "string" } }, required: ["tool"] },
          },
        },
        run: async (a) => {
          const t = byName.get(String(a.tool));
          return t ? { name: t.name, description: t.description, inputSchema: t.inputSchema } : { error: "unknown tool" };
        },
      },
      {
        source: "Bitget MCP",
        def: {
          type: "function",
          function: {
            name: "bitget_data",
            description:
              "Call a Bitget US-stock/ETF data tool from the catalog (quotes, fundamentals, earnings calendar, analyst targets, 13F, insider trades, news, sentiment).",
            parameters: {
              type: "object",
              properties: { tool: { type: "string" }, arguments: { type: "object" } },
              required: ["tool"],
            },
          },
        },
        run: async (a) => {
          const name = String(a.tool);
          if (!byName.has(name)) return { error: `unknown tool ${name}` };
          return callMcp(name, (a.arguments as Record<string, unknown>) || {});
        },
      },
    ],
  };
}

function summarize(result: unknown): string {
  const s = typeof result === "string" ? result : JSON.stringify(result);
  return s.replace(/\s+/g, " ").slice(0, 160);
}

// ---------- prompt ----------
function systemPrompt(snap: Snapshot, profile: string | undefined, mcpCatalog: string | null, mcpNote: string, priceStats: unknown[], entries: { text: string; ids: Set<string> } | null) {
  const has = (id: string) => entries?.ids.has(id);
  const clock = usMarketStatus();
  return `You are Deskmate, an AI research analyst on a trading desk for small retail traders who hold Bitget tokenized US stocks (rTokens such as rNVDA, which trade 7x24) alongside crypto.
You RESEARCH and EXPLAIN. The human trader makes the final decision. You never place orders.

CONTEXT
- Now: ${new Date().toISOString()} (UTC). ${clock.label} (${clock.nyTime}).${clock.inWeekendWindow ? " We are in the weekend closure window: rTokens are priced only by thin on-chain/exchange flow, with no US cash-market reference." : ""}
- Trader profile: ${profile?.trim() || "student / small retail trader, a few hundred to a few thousand USD, cannot watch the US session live (e.g. based in Lagos, UTC+1)."}
- Current portfolio (computed in code from live Bitget data, trust these numbers):
${JSON.stringify(metricsForPrompt(snap.metrics))}
- Price stats for each held instrument (computed in code from Bitget daily candles; same units as above):
${JSON.stringify(priceStats)}
${snap.errors.length ? `- Data problems: ${snap.errors.join("; ")}` : ""}
- ${mcpNote}
- ${finnhubEnabled() ? "Finnhub backup is available via get_earnings_and_news (earnings dates + company news for US stocks). Name Finnhub as the source when you use it." : "No Finnhub backup configured."}
${mcpCatalog ? `\nBITGET US-STOCK DATA CATALOG (use bitget_tool_schema then bitget_data):\n${mcpCatalog}\n` : ""}${entries ? `
BITGET DATA ENTRIES (already discovered for you — call bitget_do_query directly with {"entry_id": "<id>", "params": {...}} built from the params hint; titles are in Chinese; call bitget_guide only if nothing below fits):
${entries.text}
Examples:${has("equity_calendar") ? `\n- Earnings date / event risk for NVDA: bitget_do_query {"entry_id":"equity_calendar","params":{"symbol":"NVDA"}}` : ""}${has("equity_price_quote") ? `\n- Underlying US stock quote (compare with the rToken price): bitget_do_query {"entry_id":"equity_price_quote","params":{"symbol":"NVDA"}}` : ""}${has("news_label_search") ? `\n- Recent news: bitget_do_query {"entry_id":"news_label_search","params":{...per its params hint, e.g. the ticker}}` : ""}
Use the underlying ticker (rNVDA -> NVDA) for US-stock entries.
` : ""}
HOW TO WORK
1. Plan which facts you need. Use tools to get them: simulate_trade for ANY proposed buy/sell/size question; Bitget MCP data tools for fundamentals, earnings dates, analyst targets, news and sentiment${finnhubEnabled() ? " (get_earnings_and_news from Finnhub if the MCP is down or lacks the data)" : ""}. Price stats for held instruments are already above — call get_price_history only for instruments the trader does NOT hold. You have at most ${MAX_STEPS} rounds, so request all the tools you need in parallel in one round.
2. Never do arithmetic or statistics yourself — quote numbers returned by tools or given above. Weights, returns, volatility and drawdowns in the data are fractions (0.44 = 44%); always present them to the trader as percentages, and money as $ amounts. If data is missing, say so plainly; never invent numbers, dates or news.
3. Tie everything to THIS trader's portfolio: concentration, overlap/correlation with what they hold, weekend/overnight exposure, event risk (e.g. earnings before the next US open).
4. Be specific and short. Suggest a size or hedge only when the data supports it, and only after checking it with simulate_trade (use into_symbol for "trim X, move into Y"). Quote the simulated after-numbers in "hedge" and "impact"; never state a target weight you did not simulate.
5. Round for the reader: percentages to 1 decimal, correlations and beta to 2 decimals, dollars to whole $ (VaR to cents is fine).
6. "watch" items must be concrete: a price level, a date, or a metric from the tools. If earnings dates or news could not be fetched, say that in "watch" instead of writing generic items.
7. Confidence: "high" only when the key facts for the question came back from tools. If neither the Bitget MCP data server nor Finnhub returned earnings/news data, confidence is at most "medium".

FINAL ANSWER — reply with ONLY one JSON object, no prose outside it:
{
  "headline": "one line, max 90 chars",
  "verdict": "proceed" | "proceed_smaller" | "wait" | "avoid" | "info",
  "risk": "low" | "medium" | "high",
  "summary": "2-3 sentences answering the question directly",
  "findings": ["3-6 evidence bullets, each with a concrete number or fact and its source"],
  "impact": [{"metric": "e.g. Top holding", "before": "31%", "after": "46%"}],
  "hedge": "one concrete hedge / sizing idea, or null",
  "watch": ["upcoming events or levels to monitor"],
  "confidence": "low" | "medium" | "high",
  "decisionNote": "one sentence reminding the trader what the decision hinges on — the call is theirs"
}
Use "info" verdict for questions that are not about a specific trade. "impact" may be [] if no trade was simulated.`;
}

// ---------- fallback (no LLM available) ----------
function numbersOnly(snap: Snapshot, reason: string): Insight {
  const m = snap.metrics;
  return {
    headline: "Portfolio numbers (AI analyst unavailable)",
    verdict: "info",
    risk: (m.topHolding?.weight ?? 0) > 0.5 || (m.weekendWorstPct ?? 0) < -0.08 ? "high" : "medium",
    summary: `The language model could not be reached (${reason}), so here are the computed portfolio numbers only.`,
    findings: [
      `Total ${usd(m.totalUsd)}; largest holding ${m.topHolding?.display ?? "-"} at ${pct(m.topHolding?.weight)}.`,
      `Effective number of positions: ${num(m.effectivePositions, 1)}.`,
      `30-day volatility (annualised): ${pct(m.vol30dAnnual)}; 1-day 95% VaR: ${usd(m.var95OneDayUsd)}.`,
      `Correlation to BTC: ${num(m.btcCorrelation)} (beta ${num(m.btcBeta)}).`,
      `Worst Fri→Mon move in window: ${pct(m.weekendWorstPct)}.`,
    ],
    impact: [],
    hedge: null,
    watch: [],
    confidence: "low",
    decisionNote: "Numbers only — no AI interpretation was produced.",
  };
}

// ---------- main loop ----------
export async function runAgent(input: AskInput, emit: Emit) {
  let stepId = 0;
  const step = (s: Omit<TrailStep, "id">) => emit({ type: "step", step: { id: ++stepId, ...s } });

  emit({ type: "status", text: "Loading live portfolio data from Bitget…" });
  const t0 = Date.now();
  const [snap, mcpList] = await Promise.all([snapshot(input.holdings), mcpTools()]);
  step({
    tool: "portfolio_snapshot",
    source: "Bitget REST + Portfolio engine",
    args: { holdings: input.holdings.length },
    ok: snap.errors.length === 0,
    ms: Date.now() - t0,
    summary: `${snap.metrics.positions.length} positions, ${usd(snap.metrics.totalUsd)}, ${snap.metrics.window?.days ?? 0} days of history${snap.errors.length ? ` — ${snap.errors.length} issue(s)` : ""}`,
  });

  const t1 = Date.now();
  const priceStats = (
    await Promise.all(snap.metrics.positions.map((p) => priceHistorySummary(p.display).then(round).catch(() => null)))
  ).filter(Boolean);
  step({
    tool: "price_stats",
    source: "Bitget REST",
    args: { instruments: snap.metrics.positions.map((p) => p.display) },
    ok: priceStats.length === snap.metrics.positions.length,
    ms: Date.now() - t1,
    summary: `returns, 30d range and volatility for ${priceStats.length}/${snap.metrics.positions.length} held instruments`,
  });

  const { impls: mcpImpls, catalog } = await mcpToolImpls(mcpList);
  let entries: { text: string; ids: Set<string> } | null = null;
  if (mcpList.some((t) => t.name === "guide") && mcpList.some((t) => t.name === "do_query")) {
    const t2 = Date.now();
    try {
      const list = await loadCatalog();
      const text = catalogForPrompt(list);
      entries = { text, ids: new Set(list.map((e) => e.id)) };
      step({ tool: "load_bitget_catalog", source: "Bitget MCP", args: {}, ok: true, ms: Date.now() - t2, summary: `${text.split("\n").length} data entries available (${[...new Set(list.map((e) => e.category))].join(", ")})` });
    } catch (e) {
      step({ tool: "load_bitget_catalog", source: "Bitget MCP", args: {}, ok: false, ms: Date.now() - t2, summary: `catalog not loaded (${(e as Error).message}); the analyst can still browse it with bitget_guide` });
    }
  }
  const mcpNote = mcpList.length
    ? `Bitget MCP data server connected (${mcpList.length} tools).`
    : `Bitget MCP data server unavailable${mcpLastError() ? ` (${mcpLastError()})` : ""} — rely on Bitget REST tools and say fundamentals/news could not be fetched.`;
  step({ tool: "connect_bitget_mcp", source: "Bitget MCP", args: {}, ok: mcpList.length > 0, ms: 0, summary: mcpNote });

  const tools = [...internalTools(input.holdings), ...mcpImpls];
  const byName = new Map(tools.map((t) => [t.def.function.name, t]));
  const defs = tools.map((t) => t.def);

  const provs = providers();
  if (!provs.length) {
    emit({ type: "final", insight: numbersOnly(snap, "no LLM API key configured in .env.local"), provider: null, degraded: true });
    return;
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(snap, input.profile, catalog, mcpNote, priceStats, entries) }];
  for (const h of (input.history || []).slice(-4)) {
    messages.push({ role: "user", content: h.question });
    messages.push({ role: "assistant", content: h.answer });
  }
  messages.push({ role: "user", content: input.question });

  let pi = 0;
  let simulated = false;
  // Dollar amounts the model may quote without simulating: simulated trade sizes, current positions, book total.
  const knownUsd = new Set<number>([...input.holdings.map((h) => Math.round(Math.abs(h.usd))), Math.round(snap.metrics.totalUsd)]);
  let hedgeChecked = false;
  let eventDataOk = false; // earnings/news came back from Bitget MCP or Finnhub
  let limit = MAX_STEPS;
  const call = async (withTools: boolean) => {
    let lastErr: Error | null = null;
    while (pi < provs.length) {
      const p: Provider = provs[pi];
      try {
        return { res: await chat(p, messages, withTools ? defs : undefined), provider: p };
      } catch (e) {
        lastErr = e as Error;
        pi++;
        if (pi < provs.length) emit({ type: "status", text: `${p.id} · ${p.model} failed — switching to ${provs[pi].id} · ${provs[pi].model}…` });
      }
    }
    throw lastErr || new Error("no provider");
  };

  try {
    for (let i = 0; i < limit; i++) {
      emit({ type: "status", text: i === 0 ? "Analyst is planning the research…" : "Analyst is reading the results…" });
      const last = i === limit - 1;
      if (last && i > 0) messages.push({ role: "user", content: "You are out of research rounds. Using only the data gathered above, return the final answer now as ONLY the JSON object described in the instructions." });
      const { res, provider } = await call(!last);

      if (res.toolCalls.length && !last) {
        messages.push({ role: "assistant", content: res.content, tool_calls: res.toolCalls });
        const outputs = await Promise.all(
          res.toolCalls.map(async (tc: ToolCall) => {
            const impl = byName.get(tc.function.name);
            let args: Record<string, unknown> = {};
            try {
              args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
            } catch {
              /* keep {} */
            }
            const started = Date.now();
            let out: unknown;
            let ok = true;
            try {
              if (!impl) throw new Error(`unknown tool ${tc.function.name}`);
              out = await impl.run(args);
              if (tc.function.name === "simulate_trade") {
                simulated = true;
                knownUsd.add(Math.round(Math.abs(Number(args.usd_change) || 0)));
              }
              if (impl.source === "Finnhub" || (impl.source === "Bitget MCP" && !["bitget_tool_schema", "bitget_guide"].includes(tc.function.name))) eventDataOk = true;
            } catch (e) {
              ok = false;
              out = { error: (e as Error).message };
            }
            step({
              tool: tc.function.name,
              source: impl?.source || "unknown",
              args,
              ok,
              ms: Date.now() - started,
              summary: summarize(out),
            });
            return { id: tc.id, content: truncate(typeof out === "string" ? out : JSON.stringify(out)) };
          }),
        );
        for (const o of outputs) messages.push({ role: "tool", tool_call_id: o.id, content: o.content });
        continue;
      }

      const full = (x: Record<string, unknown> | null): x is Record<string, unknown> =>
        !!x && (!!String(x.summary || "").trim() || (Array.isArray(x.findings) && x.findings.length > 0));
      let parsed = extractJson(res.content);
      if (!full(parsed)) {
        messages.push({ role: "assistant", content: res.content || "" });
        messages.push({ role: "user", content: "Return the final answer now as ONLY the JSON object described in the instructions." });
        const retry = await call(false);
        parsed = extractJson(retry.res.content);
        if (!full(parsed)) {
          const text = (retry.res.content || res.content || "").trim();
          if (!text) throw new Error("the model returned an empty answer");
          parsed = { headline: "Analysis", verdict: "info", summary: text };
        }
      }
      // A dollar-sized idea that was never simulated means the model did its own maths: send it back once to check.
      const hedge = typeof parsed.hedge === "string" ? parsed.hedge : "";
      // Every $ size in the idea must be a simulated trade; a % target with no simulation at all is also unverified.
      const unsimulated = [...hedge.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)]
        .map((m) => Math.round(Number(m[1].replace(/,/g, ""))))
        .filter((x) => x > 0 && !knownUsd.has(x));
      if (!hedgeChecked && (unsimulated.length > 0 || (!simulated && /\d\s?%/.test(hedge)))) {
        hedgeChecked = true;
        limit = Math.max(limit, i + 3); // room for one simulate_trade round + the final answer
        messages.push({ role: "assistant", content: res.content || JSON.stringify(parsed) });
        messages.push({
          role: "user",
          content: `Your "hedge" suggests a specific trade ("${hedge.slice(0, 200)}") but ${unsimulated.length ? `you did not simulate ${unsimulated.map((x) => "$" + x).join(", ")}` : "you did not run simulate_trade"}, so its numbers are unverified. Pick ONE concrete dollar amount and call simulate_trade for that trade now (use into_symbol if the money moves into another holding), then return the final JSON again with "hedge" quoting only that simulated result (keep "impact" for the trade the trader asked about, if any).`,
        });
        emit({ type: "status", text: "Checking the suggested trade with the portfolio engine…" });
        continue;
      }
      const insight = normalize(parsed);
      if (!eventDataOk && insight.confidence === "high") insight.confidence = "medium";
      emit({ type: "final", insight, provider: `${provider.id} · ${provider.model}`, degraded: false });
      return;
    }
  } catch (e) {
    emit({ type: "final", insight: numbersOnly(snap, (e as Error).message.slice(0, 120)), provider: null, degraded: true });
  }
}
