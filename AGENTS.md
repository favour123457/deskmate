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

## 2. The product: Quil

**Thesis:** rTokens trade 7×24 but the US cash market doesn't. From Lagos, the US session closes at 21:00 and doesn't reopen until Monday afternoon. Small traders hold rTokens + crypto through those gaps with no desk, no risk system, and no analyst, and they often concentrate into one tech name that moves together with BTC without realizing it. Generic chatbots answer "should I buy NVDA?" in general terms; Quil answers **"what does buying $200 of rNVDA do to *my* book, right now, before a weekend with no US reference price?"**

**Target user:** crypto-native students / small retail traders with ≈$100 to $5,000, holding 2 to 8 rTokens + some crypto, located outside US hours (West Africa, Asia), who trade a few times a week.

**User flow (four routes, one shared store `lib/store.tsx` in the root layout, so the book, profile and chat survive navigation):**
1. **Home `/`** (`app/page.tsx`): the landing page. A headline that follows the live New York session, the monochrome globe (`components/Globe.tsx`: dotted land lit by the real sun, wireframe graticule, the day/night line as one white great circle, a New York crosshair, live Bitget tickers orbiting as plain text), a four-step "how it works" row, and **Tell the analyst about you** (`components/ProfileSetup.tsx`): numbered rows with sliding segmented controls (book size, risk, weekend habit, place, notes), saved automatically, next to a live preview of the exact sentence the analyst reads (`lib/profile.ts`).
2. **Ask `/ask`**: the chat only. Suggested questions as a 2x2 grid of boxes; answers stream in with the research trail.
3. **Portfolio `/portfolio`**: book value + today's change, holdings editor, full-width chart (book vs BTC, indexed to 100), holdings table with real company logos, what moves together, and every risk number in plain words.
4. **News `/news`**: one block per held stock (logo, name, analyst rating counts, price targets, next earnings) next to its latest headlines; refreshes silently every 5 min.
   `/desk` (and `/desk#portfolio`, `/desk#news`) redirect to the new routes. Market status and data sources are a plain-text footer line (`components/StatusLine.tsx`), not in the nav.
4. The user asks a question in the chat. The LLM runs a tool-calling loop, the **research trail streams live** into the UI, and the final **insight card** shows: verdict, risk, confidence, headline, summary, a "what changes in your book" before→after table, evidence bullets, a sizing/hedge idea, things to watch, and **"Your call"** (the human decides).

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
  page.tsx                 Home (route /): hero + globe + how it works + profile setup
  ask/ portfolio/ news/    The three other routes (page.tsx each); desk/page.tsx redirects old /desk links
  layout.tsx, globals.css  Root layout (StoreProvider + Nav) and all styles; SUSE Mono (@fontsource-variable/suse-mono)
  api/logo/[ticker]        GET -> 302 to the company's official logo (Finnhub profile2), or 404
  api/portfolio/route.ts   POST {holdings} -> {metrics, resolved, errors, clock}
  api/ask/route.ts         POST {question, holdings, profile, history} -> NDJSON stream of StreamEvent (maxDuration 120)
  api/research/route.ts    POST {symbols} -> per-stock briefs for the live news & ratings cards (crypto skipped)
  api/health/route.ts      GET -> Bitget REST ok?, MCP tool names, Finnhub configured?, LLM providers; ?catalog=1 adds MCP schemas + catalog
components/
  Globe.tsx                Canvas globe (no map lib; land = precomputed dots in lib/geo/land-dots.json), respects reduced motion
  Brand.tsx                Quil feather mark (custom SVG) + wordmark; BRAND constant. Favicon: app/icon.svg
  Nav.tsx                  Top nav: brand (links home) + centred Home / Ask / Portfolio / News, sliding underline (motion)
  StatusLine.tsx           Footer line: New York session status, data sources, "never places orders"
  ProfileSetup.tsx         Numbered profile rows with segmented controls + live analyst-brief preview
  AssetLogo.tsx            Company logo on a white tile via /api/logo/[ticker] (Finnhub profile), monogram fallback
  Icons.tsx                Small SVG line icons (no emoji, no icon font)
  BookChart.tsx            SVG line chart, book (white) vs BTC (grey), hover tooltip
  InsightCard.tsx          Final answer card (verdict/risk badges, impact table, evidence, hedge, watch, Your call, trail)
  Trail.tsx                List of tool steps (dot, tool name, source, ms, summary)
lib/
  types.ts                 Shared types: Holding, Resolved, PortfolioMetrics, TrailStep, Insight, StreamEvent
  bitget.ts                Bitget public REST: symbol resolution, tickers, daily candles, sector buckets
  stats.ts                 PURE math: returns alignment, std, corr, beta, percentile, drawdown, weekend returns, computeMetrics()
  portfolio.ts             snapshot(), simulateTrade() (before/after, optional into_symbol rebalance), priceHistorySummary()
  mcp.ts                   Bitget MCP client (streamable HTTP), tool list cache, callMcp() with reconnect
  mcp-catalog.ts           Loads the Bitget MCP catalog (guide/do_query) once, 6 h cache, compact list for the prompt
  finnhub.ts               Finnhub: earnings calendar, analyst recommendation counts, filtered company news
  research.ts              stockBrief(): rating + earnings + news (Finnhub) and price targets (Bitget MCP), 5 min cache
  profile.ts               Profile answers -> analyst sentence; localStorage helpers
  llm.ts                   OpenAI-compatible client, provider presets, comma-list model fallback, 503/429 retry, daily-quota cooldown
  agent.ts                 System prompt, tool registry, tool-calling loop, provider fallback, hedge guard, JSON extraction, normalize()
  market-clock.ts          US market open/closed status in ET (ignores holidays)
scripts/demo-video.mjs     `npm run demo-video`: narrated walkthrough of the live site -> demo/lamplight-demo.mp4
scripts/check.mjs          `npm run check`: Bitget REST + rToken count, MCP tools (writes mcp-tools.json), Finnhub, each LLM key incl. tool-calling
vercel.json                Fluid compute on, region iad1 (US). Live: https://deskmate-two.vercel.app (auto-deploys from main)
.env.example               All env vars, documented
```

### Data sources
| Source | Used for | Auth |
|---|---|---|
| Bitget public REST `https://api.bitget.com` | tickers + daily candles for rTokens (spot `R{TICKER}USDT`), US stock perps (`{TICKER}USDT`, `USDT-FUTURES`), crypto (`BTCUSDT`) | none |
| Bitget MCP `https://agent.bitget.com/mcp` (streamable HTTP) | a **catalog API** with 2 tools: `guide({category?, subcategory?, keyword?})` lists entries, `do_query({entry_id, params})` runs one. 67 free entries (equity 22, crypto 39, etf 3, sentiment 2, news 1), e.g. `equity_calendar`, `equity_price_quote`, `equity_estimates_price_target`, `equity_fundamental_*`, `equity_ownership_*`, `crypto_etf_flows`. Titles are in Chinese; `params_summary` = `[{name, required, type}]`. `news_label_search` needs an undocumented integer tag, so it's left out of the prompt. Unreachable from the owner's local network, works from Vercel. | none |
| Finnhub `https://finnhub.io/api/v1` | company news (filtered to headlines naming the company), monthly analyst recommendation counts, earnings calendar. Free tier has **no** price targets / upgrades (403) | `FINNHUB_API_KEY` |
| LLM (OpenAI-compatible) | planning, tool calls, writing the insight | key in `.env.local` |

**Symbol resolution** (`lib/bitget.ts → candidates()`): the user types `rNVDA`, `NVDA`, `RNVDA` or `BTC`. The code tries, in order, crypto spot `BTCUSDT`, rToken spot `RNVDAUSDT`, raw spot `{INPUT}USDT`, then futures `NVDAUSDT`, and uses the first one that returns a ticker.

### Agent loop (`lib/agent.ts → runAgent`)
1. Emit `portfolio_snapshot` (REST + math), `price_stats` (stats for every held instrument go straight into the prompt), `connect_bitget_mcp` and, if the MCP has `guide`/`do_query`, `load_bitget_catalog` (a compact entry list + `do_query` examples go into the prompt, so the model fetches data in round 1 instead of browsing).
2. Tools: `simulate_trade(symbol, usd_change, into_symbol?)`, `get_price_history(symbol)` (only for instruments not held), `get_earnings_and_news(symbol)` (Finnhub, if keyed), plus the MCP tools (`bitget_guide`, `bitget_do_query` in direct mode; catalog meta-tools if there were > `MCP_DIRECT_MAX`). A catalog entry id called as if it were a tool is routed to `do_query`.
3. The loop runs up to `AGENT_MAX_STEPS` (default **4**). Tool calls run in parallel, results are truncated to `TOOL_RESULT_CHARS`, and each call is streamed as a `step` event. On the last round the model is told it is out of rounds.
4. The final answer must be a JSON object (the schema is in the system prompt), parsed with `extractJson()`. An empty answer gets one repair retry, then falls back to numbers-only. **Hedge guard:** any `$` amount in `hedge` that isn't a simulated trade size (or the book total), or a `%` target with no simulation at all, sends the model back once to run `simulate_trade` (the step budget is extended for it). Confidence is capped at "medium" unless MCP or Finnhub event data came back.
5. Provider fallback: on any error, move to the next provider/model in `LLM_PROVIDERS` and keep the same messages. If every provider fails, the result is `numbersOnly()`.

### LLM providers (`lib/llm.ts`)
Default order: `qwen, gemini, deepseek, groq, openrouter, custom`, and only providers with a key set are used. Presets:
- qwen → `https://hackathon.bitgetops.com/v1`, `qwen3.8-max`, key `BITGET_QWEN_API_KEY` (Bitget hackathon credits; judges like seeing Qwen used)
- gemini → `https://generativelanguage.googleapis.com/v1beta/openai`, `gemini-3.5-flash,gemini-3.5-flash-lite` (comma list = same-provider fallbacks; 2.5 models are retired for new keys, Pro has 0 free quota), `GEMINI_API_KEY`
- deepseek → `https://api.deepseek.com/v1`, `deepseek-chat`
- groq → `https://api.groq.com/openai/v1`, `openai/gpt-oss-120b` (the free tier has low tokens-per-minute limits; the prompt + tools may hit them)
- openrouter, custom (`LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY`, e.g. AgentRouter for development only; not for the judged demo, because it's an unofficial reseller and may go down)

Each preset's model can be overridden with `{PROVIDER}_MODEL`. The default model names are best guesses and **must be verified** with `npm run check`.

---

## 5. Current status (as of 2 Oct 2026)

Verified against the **real services** and live on Vercel (https://deskmate-two.vercel.app). Details, test results and the challenge log are in `docs/PROGRESS.md`; keep that file updated.
- rToken symbols are `R{TICKER}USDT` on spot (base coin `rNVDA`, `areaSymbol: "yes"`, 2,810 online). Candles parse correctly.
- Bitget MCP works from Vercel (catalog API, see Data sources). Finnhub is keyed locally and on Vercel.
- LLM: only Gemini is keyed (`gemini-3.5-flash` → `gemini-3.5-flash-lite`). Free-tier Flash allows **20 requests/day**, so Flash-Lite answers most questions. DeepSeek / Qwen keys still to add.
- Live answers take ~6–42 s in 1–2 research rounds, with real earnings dates, quotes and analyst targets, and every sizing idea simulated.
- UI: onboarding at `/`, desk at `/desk`; checked at 1440px and 390px.

---

## 6. Next tasks (priority order)

**P0: make it real (30 Sep to 2 Oct)**
- [x] Run `npm run check` on a machine with internet access and fix symbol resolution, candle parsing and model names based on its output.
- [x] Rewrite the system prompt's tool guidance using the real MCP tool names. Add 2 or 3 few-shot hints (e.g. "for earnings risk call X with {symbol}").
- [ ] Ask the 4 suggestion-chip questions against live data; fix any bad JSON, wrong units (fractions vs %), or hallucinated numbers.

**P1: research depth (3 to 4 Oct)**
- [ ] Add a **"weekend / closure risk" tool**: hourly candles over the last N weekends for the held rTokens → typical Fri-close→Mon-open gap, and how much of the weekend move reversed at the US open. This is the product's signature insight. Use code, not the LLM, and be honest if the edge is weak.
- [ ] Add a **"scenario" tool**: "if BTC −10% / NASDAQ −3%", using beta-based estimated P&L per position (computed from `stats.ts`).
- [ ] Optionally add `bitget-signal` Skills (macro-analyst, sentiment-analyst, news-briefing) from Bitget Agent Hub as extra data sources. This helps the "feature depth" score. See https://github.com/Bitget-AI/agent_hub. Read-only only.
- [x] Earnings date per held stock (Live news & ratings card, Finnhub).

**P2: LUI and polish (5 Oct)**
- [ ] Stream the final text too, or show a "drafting answer" state.
- [ ] Follow-ups already send the last 4 turns as history; test "what about rTSLA instead?".
- [ ] Allow editing a holding by typing, e.g. "I just sold half my rTSLA".
- [ ] Add export/share of an insight card (copy as text or image) for X posts.
- [ ] Add an empty/error state polish and a loading skeleton for the tiles.

**P3: validation + submission (6 to 7 Oct)**
- [ ] Add lightweight anonymous usage logging (questions asked, tools used, completed vs. failed, latency) to a JSON file or a free KV store, so the form's "validation data" section has real numbers. **No personal data.**
- [ ] Test with 5 to 10 classmates; record task completion rate and feedback.
- [x] Deploy to Vercel with env vars, and confirm `/api/health` is all green on the live URL.
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
- The UI uses plain CSS in `app/globals.css`: pitch black `#000`, text `#ededed`, greys, hairlines `#1a1a1a`/`#2b2b2b`; one accent `--accent` `#d0f25a` for key headings only; `--up`/`--down` green/red only on numbers that move. Font: SUSE Mono everywhere. **No gradients, shadows, glows, pills, coloured dots or emoji**; hover/active states are white; corners 2px. Animations with `motion` (Framer Motion). Check every page at 1440px and 390px (Playwright full-page screenshots work well).
- Small, focused commits. Do not rename the project without asking the owner. The name is **Quil** (Deskmate → Lamplight → Quil on 8 Oct; the repo and Vercel URL still say deskmate).
- When unsure about a product/scope decision, ask the owner rather than guessing. When unsure about an API, run it and look at the real response.
