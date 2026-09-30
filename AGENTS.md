# AGENTS.md: project brief for coding agents

Read this whole file before changing anything. It explains what we are building, why, what already works, what is unverified, and what to do next.

---

## 1. Context: what this is for

- **Competition:** Bitget AI Base Camp Hackathon **S2** (theme: AI × US stock trading, including Bitget *tokenized US stocks*, called "rTokens", which trade 7×24).
  - Handbook: https://bitget-ai.gitbook.io/bitgetai_hackathons2
  - Submission form: https://forms.gle/GyWZCMCPocgJdJon6
- **Track:** 🟧 **AI Trading Desk**, an AI research workbench. **AI researches and explains; the human makes the final decision.** The app must never place orders.
- **Sub-theme:** **Open Theme**, as a portfolio-aware AI copilot. The handbook's own Open Theme example is an AI tool that shows how a proposed trade changes the beta, sector exposure, correlation and concentration of an existing portfolio, with stress tests or hedge suggestions. That is what we are building.
- **Owner:** a university student in Lagos, Nigeria (UTC+1), who is also eligible for the University Special Prize.
- **Deadline:** extended to **8 Oct 2026** (announced on Bitget AI's X account). Earlier deadlines were in **UTC+8**, which would make the cutoff **8 Oct 23:59 UTC+8 = 16:59 Lagos**. Plan to finish on **7 Oct**.

### How judges score this track (pure judge scoring, no P&L)
1. **Feature depth:** number of real data sources / Skill integrations and how well they work.
2. **Research quality:** specific, correct, evidence-backed insight (not generic advice).
3. **LUI fluency:** a smooth natural-language interface, follow-up questions, clean presentation.
4. **Personalized thesis:** a clear, specific user and problem. ("All traders" is explicitly rejected.)

The project description in the form weighs parts 1 to 3 most: **thesis**, **specific target user**, and **validation data** (test users, task completion; targets are allowed if labeled as targets).

### Submission requirements (all must exist or the entry is invalid)
- An **accessible demo** (public URL, planned on Vercel) + a demo of **one complete research task (question → actionable insight)**, ideally a 2 to 3 minute screen recording.
- A long **project description** in the form (6 parts: thesis, target user, validation data, progress, deliverables, optional opinion).
- A **"Role of the LLM"** field describing which models were used and what they do.
- An **X post** with `#BitgetHackathon` + `@Bitget_AI` that quotes https://x.com/Bitget_AI/status/2100519318824055159 and introduces the project.
- Optional fields to fill in: University Name, Apply for Demo Day, K3 subsidy.

---

## 2. The product: Deskmate

**Thesis:** rTokens trade 7×24 but the US cash market doesn't. From Lagos, the US session closes at 21:00 and doesn't reopen until Monday afternoon. Small traders hold rTokens + crypto through those gaps with no desk, no risk system, and no analyst, and they often concentrate into one tech name that moves together with BTC without realizing it. Generic chatbots answer "should I buy NVDA?" in general terms; Deskmate answers **"what does buying $200 of rNVDA do to *my* book, right now, before a weekend with no US reference price?"**

**Target user:** crypto-native students / small retail traders with ≈$100 to $5,000, holding 2 to 8 rTokens + some crypto, located outside US hours (West Africa, Asia), who trade a few times a week.

**User flow:**
1. The user enters holdings in the left panel (`rNVDA $400`, `BTC $250`…), saved in localStorage.
2. The left panel shows **risk tiles computed in code** from live Bitget data: book value, largest holding, effective # of positions (1/HHI), BTC correlation + beta, 30-day annualized volatility, 1-day 95% historical VaR, worst Friday→Monday move, max drawdown, sector/bucket exposure bar, and a per-position 24h change.
3. The user asks a question in the chat. The LLM runs a tool-calling loop, the **research trail streams live** into the UI, and the final **insight card** shows: verdict, risk, confidence, headline, summary, a "what changes in your book" before→after table, evidence bullets, a sizing/hedge idea, things to watch, and **"Your call"** (the human decides).

---

## 3. Non-negotiable rules

1. **Never place orders.** No write/trading endpoints. If Agent Hub is ever added, use `--read-only` only.
2. **The LLM never does math.** All numbers come from `lib/stats.ts` / `lib/portfolio.ts` and are passed to the model through tools or the system prompt. The prompt already tells the model this; keep it that way.
3. **No fake data in the demo.** If a source fails, say so in the UI and the trail. Do not add hardcoded "demo" prices, news or metrics that pretend to be live. (The judges and the handbook both reward honest, verifiable claims; several strong S2 entries report negative findings openly.)
4. **Never commit secrets.** Keys go in `.env.local` (gitignored). Never print keys in logs or the UI.
5. **Do not set `ANTHROPIC_API_KEY`** in the owner's shell environment. It would make Claude Code bill the API instead of the owner's Pro plan. The app doesn't use Anthropic anyway.
6. Keep the app working in three degraded modes: no MCP → REST-only; one LLM fails → next provider; all LLMs fail → numbers-only card.

---

## 4. Tech stack & layout

Next.js 15 (App Router) · React 19 · TypeScript (strict) · plain CSS (`app/globals.css`, CSS variables, dark theme) · `@modelcontextprotocol/sdk` · no UI library, no database.

```
app/
  page.tsx                 Client UI: state, NDJSON stream reader, layout, suggestion chips
  layout.tsx, globals.css  Shell + all styles (responsive at 900px)
  api/portfolio/route.ts   POST {holdings} -> {metrics, resolved, errors, clock}
  api/ask/route.ts         POST {question, holdings, profile, history} -> NDJSON stream of StreamEvent
  api/health/route.ts      GET -> Bitget REST ok?, MCP tool names, configured LLM providers
components/
  PortfolioPanel.tsx       Holdings editor, risk tiles, exposure bar, "About you" profile
  InsightCard.tsx          Final answer card (verdict/risk badges, impact table, evidence, hedge, watch, Your call, trail)
  Trail.tsx                List of tool steps (dot, tool name, source, ms, summary)
lib/
  types.ts                 Shared types: Holding, Resolved, PortfolioMetrics, TrailStep, Insight, StreamEvent
  bitget.ts                Bitget public REST: symbol resolution, tickers, daily candles, sector buckets
  stats.ts                 PURE math: returns alignment, std, corr, beta, percentile, drawdown, weekend returns, computeMetrics()
  portfolio.ts             snapshot(), simulateTrade() (before/after), priceHistorySummary()
  mcp.ts                   Bitget MCP client (streamable HTTP), tool list cache, callMcp() with reconnect
  llm.ts                   OpenAI-compatible /chat/completions client + provider presets + ordering
  agent.ts                 System prompt, tool registry, tool-calling loop, provider fallback, JSON extraction, normalize()
  market-clock.ts          US market open/closed status in ET (ignores holidays)
scripts/check.mjs          `npm run check`: tests Bitget REST, lists rTokens, lists MCP tools (writes mcp-tools.json), tests each LLM key incl. tool-calling
.env.example               All env vars, documented
```

### Data sources
| Source | Used for | Auth |
|---|---|---|
| Bitget public REST `https://api.bitget.com` | tickers + daily candles for rTokens (spot `R{TICKER}USDT`), US stock perps (`{TICKER}USDT`, `USDT-FUTURES`), crypto (`BTCUSDT`) | none |
| Bitget MCP `https://agent.bitget.com/mcp` (streamable HTTP) | US stock/ETF fundamentals, earnings calendar, analyst targets, 13F, insider trades, news, sentiment | none |
| LLM (OpenAI-compatible) | planning, tool calls, writing the insight | key in `.env.local` |

**Symbol resolution** (`lib/bitget.ts → candidates()`): the user types `rNVDA`, `NVDA`, `RNVDA` or `BTC`. The code tries, in order, crypto spot `BTCUSDT`, rToken spot `RNVDAUSDT`, raw spot `{INPUT}USDT`, then futures `NVDAUSDT`, and uses the first one that returns a ticker.

### Agent loop (`lib/agent.ts → runAgent`)
1. Emit `portfolio_snapshot` (REST + math) and `connect_bitget_mcp` steps.
2. Tools: `simulate_trade(symbol, usd_change)`, `get_price_history(symbol)`, plus the MCP tools. If there are ≤ `MCP_DIRECT_MAX` (20) MCP tools, each one is exposed directly as `bitget_<name>`. Otherwise the app uses **catalog mode**: the catalog goes in the system prompt, and the model calls `bitget_tool_schema(tool)` and `bitget_data(tool, arguments)`.
3. The loop runs up to `AGENT_MAX_STEPS` (7). Tool calls run in parallel, results are truncated to `TOOL_RESULT_CHARS`, and each call is streamed as a `step` event.
4. The final answer must be a JSON object (the schema is in the system prompt). It is parsed with `extractJson()`, with one repair retry, then passed through `normalize()` into `Insight`.
5. Provider fallback: on any error, move to the next provider in `LLM_PROVIDERS` and keep the same messages. If every provider fails, the result is `numbersOnly()`.

### LLM providers (`lib/llm.ts`)
Default order: `qwen, gemini, deepseek, groq, openrouter, custom`, and only providers with a key set are used. Presets:
- qwen → `https://hackathon.bitgetops.com/v1`, `qwen3.8-max`, key `BITGET_QWEN_API_KEY` (Bitget hackathon credits; judges like seeing Qwen used)
- gemini → `https://generativelanguage.googleapis.com/v1beta/openai`, `gemini-3.5-flash,gemini-3.5-flash-lite` (comma list = same-provider fallbacks; 2.5 models are retired for new keys, Pro has 0 free quota), `GEMINI_API_KEY`
- deepseek → `https://api.deepseek.com/v1`, `deepseek-chat`
- groq → `https://api.groq.com/openai/v1`, `openai/gpt-oss-120b` (the free tier has low tokens-per-minute limits; the prompt + tools may hit them)
- openrouter, custom (`LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY`, e.g. AgentRouter for development only; not for the judged demo, because it's an unofficial reseller and may go down)

Each preset's model can be overridden with `{PROVIDER}_MODEL`. The default model names are best guesses and **must be verified** with `npm run check`.

---

## 5. Current status (as of 30 Sep 2026)

**Done and verified against local mocks** (mock Bitget REST, a mock MCP server built with the SDK, and a mock LLM):
- `next build` passes (strict TS).
- Portfolio math is correct (e.g. adding $200 to a $400/$900 position gives a 44.4% → 54.5% weight).
- The agent loop works: parallel tools, MCP direct mode **and** catalog mode, provider fallback (a bad Groq endpoint switched to the next provider), JSON extraction, and the numbers-only degraded mode.
- The UI renders correctly at 1440px and 390px (mobile).

**NOT yet verified against the real services.** The build machine could not reach Bitget. Before anything else:
1. **rToken symbol names:** are they really `RNVDAUSDT` etc. on spot? `npm run check` lists every `R*USDT` online spot pair. Adjust `candidates()` if the naming differs.
2. **Candle format/order:** we assume `/api/v2/spot/market/candles` returns `[ts, o, h, l, c, …]` strings. The code sorts by timestamp anyway, but confirm `close` is index 4 and `granularity=1day` is valid.
3. **Real MCP tool names and schemas:** check the `mcp-tools.json` written by `npm run check`. Then tune the system prompt's "HOW TO WORK" section to name the actual tools (e.g. which one gives the earnings calendar). Confirm that direct vs. catalog mode behaves well given the real tool count.
4. **LLM model names and tool-calling:** `npm run check` tests each key with a tool call. Update the default model names in `lib/llm.ts` and `scripts/check.mjs` if needed.
5. **Serverless MCP sessions on Vercel:** the client caches a connection per instance and reconnects once on failure. Verify on the deployed app.

---

## 6. Next tasks (priority order)

**P0: make it real (30 Sep to 2 Oct)**
- [ ] Run `npm run check` on a machine with internet access and fix symbol resolution, candle parsing and model names based on its output.
- [ ] Rewrite the system prompt's tool guidance using the real MCP tool names. Add 2 or 3 few-shot hints (e.g. "for earnings risk call X with {symbol}").
- [ ] Ask the 4 suggestion-chip questions against live data; fix any bad JSON, wrong units (fractions vs %), or hallucinated numbers.

**P1: research depth (3 to 4 Oct)**
- [ ] Add a **"weekend / closure risk" tool**: hourly candles over the last N weekends for the held rTokens → typical Fri-close→Mon-open gap, and how much of the weekend move reversed at the US open. This is the product's signature insight. Use code, not the LLM, and be honest if the edge is weak.
- [ ] Add a **"scenario" tool**: "if BTC −10% / NASDAQ −3%", using beta-based estimated P&L per position (computed from `stats.ts`).
- [ ] Optionally add `bitget-signal` Skills (macro-analyst, sentiment-analyst, news-briefing) from Bitget Agent Hub as extra data sources. This helps the "feature depth" score. See https://github.com/Bitget-AI/agent_hub. Read-only only.
- [ ] Add an earnings-date badge on positions if the MCP provides it.

**P2: LUI and polish (5 Oct)**
- [ ] Stream the final text too, or show a "drafting answer" state.
- [ ] Follow-ups already send the last 4 turns as history; test "what about rTSLA instead?".
- [ ] Allow editing a holding by typing, e.g. "I just sold half my rTSLA".
- [ ] Add export/share of an insight card (copy as text or image) for X posts.
- [ ] Add an empty/error state polish and a loading skeleton for the tiles.

**P3: validation + submission (6 to 7 Oct)**
- [ ] Add lightweight anonymous usage logging (questions asked, tools used, completed vs. failed, latency) to a JSON file or a free KV store, so the form's "validation data" section has real numbers. **No personal data.**
- [ ] Test with 5 to 10 classmates; record task completion rate and feedback.
- [ ] Deploy to Vercel with env vars, and confirm `/api/health` is all green on the live URL.
- [ ] Write `docs/SUBMISSION.md` containing the 6-part description draft + the "Role of the LLM" text + a deliverables list. Record the 2 to 3 minute demo video.

---

## 7. How to work on this repo

```bash
npm install
cp .env.example .env.local   # add at least one LLM key
npm run check                # connectivity + model check
npm run dev                  # http://localhost:3000
npm run build                # must pass before any commit
```

- Keep `lib/stats.ts` pure (no network), so it stays easy to unit-test. If you add tests, test against known numbers there.
- To test offline, set `BITGET_API_BASE`, `BITGET_MCP_URL` and `LLM_BASE_URL` to local mock servers (this is how v0.1 was tested).
- The UI uses plain CSS with the variables in `app/globals.css` (`--accent` is Bitget-style yellow `#f0b90b`, `--up`/`--down` are green/red). Keep it dark, dense and readable, like a trading desk, and check it at mobile width.
- Small, focused commits. Do not rename the project without asking the owner. "Deskmate" is a working name.
- When unsure about a product/scope decision, ask the owner rather than guessing. When unsure about an API, run it and look at the real response.
