# Deskmate: progress, challenges and handoff

Last updated: **2 Oct 2026 (Lagos, UTC+1)**. Session 2 is at the top; session 1 follows. Read `AGENTS.md` first for the project brief, rules and roadmap. This file records what has been done since then and what to do next.

> Secrets: API keys live only in `.env.local` (gitignored by `.env*`). Never copy them into this file, commits, logs or the UI.

---

## 0. Session 2 summary (1–2 Oct 2026)

**Live app:** https://deskmate-two.vercel.app (Vercel, Fluid compute, `iad1`, auto-deploys from `main` of https://github.com/favour123457/deskmate). The owner pushed the repo and connected Vercel via the browser (no CLI). Env vars on Vercel: `GEMINI_API_KEY`, `LLM_PROVIDERS`.

**Live `/api/health`:** Bitget REST ✅ · **Bitget MCP ✅ connected from Vercel** (tools: `guide`, `do_query`) · Finnhub not configured · LLM: gemini-3.5-flash → gemini-3.5-flash-lite. `/api/health?catalog=1` also returns the MCP tool schemas and the full data catalog.

**Bitget MCP catalog (real):** 67 free entries: equity 22 (`equity_price_quote`, `equity_calendar`, `equity_estimates_price_target`, `equity_estimates_consensus`, `equity_estimates_forward_eps`, `equity_fundamental_*`, `equity_ownership_insider_trading`, `equity_ownership_form_13f`, …), crypto 39, etf 3 (`etf_info`, `etf_holdings`, `etf_price_performance`), sentiment 2 (`sentiment_market_fear_greed`, `crypto_sentiment_crypto_fear_greed`), news 1 (`news_label_search`). Each entry has `params_summary` = a list of `{name, required, type}` (no descriptions). The prompt gets 34 entries: all equity/etf/sentiment, 8 BTC-relevant crypto entries, and not `news_label_search`.

**Changes (all built, committed and pushed; live):**
- `maxDuration` 120; `vercel.json` (fluid, iad1).
- LLM: one 1–2 s retry on 503 / per-minute 429; a daily-quota 429 parks that model until the reset time (per server instance).
- Agent: held-instrument price stats pre-loaded in the prompt (`price_stats` step); default `AGENT_MAX_STEPS` 4; the out-of-rounds nudge on the last round; never an empty card.
- `lib/mcp-catalog.ts`: catalog pre-load (6 h cache), param rendering, crypto filter; `load_bitget_catalog` trail step; few-shot examples for `equity_calendar`, `equity_price_quote`, `equity_estimates_price_target`.
- `lib/finnhub.ts`: `get_earnings_and_news` tool (source "Finnhub"), on only when `FINNHUB_API_KEY` is set.
- Hedge guard: every $ size must be simulated; % targets need a simulation; ideas must reduce risk. The prompt names `portfolioCorrelationToBtc` / `portfolioBetaToBtc` (the model used to say "BTC's correlation to BTC").
- `check.mjs`: correct rToken filter (2,810); optional Finnhub check. DeepSeek was already in the provider chain and only needs `DEEPSEEK_API_KEY`.

**Live results (book: rNVDA $400, BTC $250, rTSLA $150, rSPY $100):**
- "Should I add $200 of rNVDA before the weekend?" → 1 research round with `simulate_trade` + `bitget_do_query` (`equity_calendar`, `equity_price_quote`, `equity_estimates_price_target`) in parallel. The verdict was *proceed smaller*: rNVDA 44.4% → 54.5%, VaR $16.43 → $21.23, analyst targets (Rosenblatt $390 on 28 Sep, Cantor $350 on 30 Sep), last earnings 25 Aug. A smaller $50 add was simulated (47.4%). 11–42 s.
- "Biggest risk?" → concentration. A trim of $100 into rSPY was simulated: rNVDA 44.4% → 33.3%, VaR $16.43 → $14.31. ~6 s.

**Still open:** generic watch items sometimes ("tech sector headlines"); no ticker news until a Finnhub key is added; Gemini Flash daily quota; Qwen credits; `docs/PROGRESS.md` must keep being updated.

---

## 1. Session summary (30 Sep 2026)

### 1.1 First real-world check (`npm run check` on the owner's machine)

| Check | Result |
|---|---|
| Bitget public REST (`api.bitget.com`) | ✅ Works. BTCUSDT ≈ 83.7k. |
| rToken naming | ✅ **Confirmed** `R{TICKER}USDT` on spot, e.g. `RNVDAUSDT` = 230.66; the NVDA perp `NVDAUSDT` (USDT-FUTURES) = 230.93. `candidates()` in `lib/bitget.ts` is correct. |
| rToken listing filter in `scripts/check.mjs` | ⚠️ Reports "2834 tokenized-stock-looking pairs". The `R*USDT` filter is far too loose (it matches normal crypto starting with R). Cosmetic, check script only. Still to tighten. |
| Daily candles | ✅ The snapshot loads 110 to 118 days of aligned history, so parsing works. |
| Bitget MCP (`https://agent.bitget.com/mcp`) | ❌ **Unreachable from the owner's network.** A TCP connect to Cloudflare (104.18.8.145 / 104.18.9.145 :443) times out over IPv4 and IPv6, both inside and outside the sandbox, while `api.bitget.com` works. The handbook confirms this URL is correct. Likely an ISP/regional block or a server outage. **`mcp-tools.json` has not been generated yet.** The app correctly runs in REST-only mode and says so in the trail. |
| LLM | ✅ Gemini works, including tool calling (details below). |

### 1.2 LLM provider findings

- **AgentRouter (agentrouter.org)** ❌: every request returns `401 unauthorized_client_error: "unauthorized client detected"`. AgentRouter only allows whitelisted coding-tool clients (Claude Code, Codex…), not apps. We decided **not** to spoof a client identity (it breaks their terms, and `AGENTS.md` already says AgentRouter is dev-only). Its key was removed from `.env.local`.
- **Gemini (Google AI Studio free key)** ✅ The owner's key is in `.env.local` as `GEMINI_API_KEY`. Findings:
  - `gemini-2.5-flash` and `gemini-2.5-pro`: **404, retired for new users.**
  - `gemini-3.1-pro-preview`, `gemini-pro-latest`: **429 with free-tier quota `limit: 0`**. Pro needs billing enabled. We decided Pro isn't needed (the LLM does no maths; Pro is slower).
  - Tool-call test: `gemini-3.8-flash` works but is slow (~49 s) and often returns 503 "high demand". `gemini-3.7-flash` ~23 s. **`gemini-3.5-flash` ~3 s** ✅. `gemini-3.5-flash-lite` ~3.5 s ✅. `gemini-flash-latest` returned 503.
  - `gemini-3.5-flash` still fails intermittently (503/429 on the free tier), so the fallback to `gemini-3.5-flash-lite` often answers.
- **Qwen hackathon credits** (preferred for judging): not obtained yet. From the handbook: a separate Qwen Google Form (the link is "[TBD]" in the handbook, so get it from the official Telegram group), **first 300 teams that pass Bitget KYC**, ~30U of Qwen tokens handed out by an admin in Telegram, KYC checked every 24 h. There is also a **K3 post-event subsidy** (another 30U): tick "Apply for K3 Token Subsidy" in the submission form. The owner is still to apply.

### 1.3 Code changes made (all uncommitted as of this writing)

**`lib/llm.ts`**
- Gemini default model → `"gemini-3.5-flash,gemini-3.5-flash-lite"`.
- **New:** any provider's model setting (preset or `{PROVIDER}_MODEL`) can be a **comma-separated list**. `providers()` expands it into one provider entry per model, so the existing fallback loop tries the models in order.
- Per-call timeout lowered from 60 s to **35 s**, configurable with `LLM_TIMEOUT_MS`, so the fallback kicks in sooner. (This was the cause of the owner's first "AI analyst unavailable / aborted due to timeout" card.)

**`lib/portfolio.ts`**
- `simulateTrade(holdings, symbol, usdChange, intoSymbol?)`: the new optional `intoSymbol` moves the proceeds of a sell into another instrument (a rebalance, e.g. trim rNVDA → rSPY). It is built on a new helper, `applyLeg()`, which returns the dollar change actually applied (trims are clamped at 0). Zero-value holdings are dropped before the "after" snapshot. The return value now includes `into` and `usdChange` = the applied amount.

**`lib/agent.ts`**
- `simulate_trade` tool: new `into_symbol` param; the description says to use it for every sizing/hedge idea; the output now includes `weights` (every position's usd + weight), not only the top holding.
- The fallback status message now names the model: `gemini · gemini-3.5-flash failed — switching to gemini · gemini-3.5-flash-lite…`.
- System prompt "HOW TO WORK" rules added:
  - (4) Suggest sizes/hedges only after `simulate_trade`, and quote only the simulated numbers.
  - (5) Rounding: % to 1 dp, correlation/beta to 2 dp, $ whole.
  - (6) `watch` items must be concrete (a level, a date or a metric), or say that the earnings/news data is unavailable.
  - (7) Confidence is at most "medium" without the MCP.
- **Code-enforced guards** (not only prompt):
  - If the final JSON's `hedge` contains a `$<number>` and `simulate_trade` was never called, the model is sent back **once** to simulate that exact trade and re-answer. It emits the status "Checking the suggested trade with the portfolio engine…".
  - If the MCP is unavailable, `confidence: "high"` is downgraded to `"medium"` in code.

**`scripts/check.mjs`**: Gemini default → `gemini-3.5-flash`; uses only the first model when `*_MODEL` is a comma list; fetch timeout 15 s → 45 s.

**`.env.example`**: documents the comma-list model fallback and `LLM_TIMEOUT_MS`. **`AGENTS.md`**: the Gemini preset line was updated (still untracked in git).

`npx tsc --noEmit` passes. `next build` has **not** been re-run after these edits; run it before committing.

### 1.4 Live test results (dev server on :3001, question "What is the biggest risk in my book right now?")

Test book: rNVDA $400, BTC $250, rSPY $100, rTSLA $50.

- **Before fixes:** the answer's numbers were correct (50% rNVDA, 56.25% US tech, VaR $15.35, rNVDA–rSPY ρ 0.6565, all matching `/api/portfolio`). **However**, the hedge "trim $150 rNVDA → rSPY to get below 30%" was **LLM maths and wrong** (the true value is 31.25%), `simulate_trade` was never called (so there was no impact table), confidence was "high" with the MCP down, and a watch item was generic.
- **After fixes:** the model called `simulate_trade(rNVDA, -150, into rSPY)` itself. The impact table shows rNVDA weight 50.0% → 31.3%, 30d vol 21.1% → 19.4%, and VaR $15.35 → $12.39. The hedge quotes those numbers. Confidence is medium. The model states that fundamentals/earnings were unavailable. Watch items are concrete ($212.20 / $231.90 30d range, BTC level). Total time ~13 to 35 s.
- Note: the rNVDA "24h volume $12.19B" is **Bitget's own figure** (`usdtVolume` on RNVDAUSDT), passed through faithfully. It looks very high for an rToken but is not a bug.

---

## 2. Challenges (open ⛔ / worked around ⚠️ / solved ✅)

| # | Challenge | Impact | Status / what we did |
|---|---|---|---|
| 1 | **Bitget MCP server unreachable** from the owner's network (TCP timeout to Cloudflare IPs; `api.bitget.com` works fine) | Locally: no fundamentals/earnings/targets. | ✅ Solved by deploying: it works from Vercel (US). It's a local routing problem only. Locally the app still degrades honestly. |
| 2 | **AgentRouter rejects app clients** (`401 unauthorized client detected`) | The owner's first LLM key was unusable. | ✅ Dropped it. We will not spoof a client identity (it breaks their terms and could fail during judging). Switched to Gemini. |
| 3 | **Gemini 2.5 models retired for new keys** (404) | The preset defaults in the code were dead. | ✅ Tested the available models with a real tool call and switched the default to `gemini-3.5-flash`. |
| 4 | **Gemini Pro has 0 free quota** (429, `limit: 0`) | No Pro model without enabling Google billing. | ✅ Decided it isn't needed: the LLM does no maths, and Pro is slower (bad for LUI fluency). It can be enabled later with just `GEMINI_MODEL=gemini-3.1-pro-preview`. |
| 5 | **Free-tier Gemini quotas**: `gemini-3.5-flash` allows only **20 requests/day** (a question uses 2–4), plus 503s/slowness | Flash is exhausted most of the day, so Flash-Lite answers almost everything. | ⚠️ Worked around: model fallback, 35 s timeout, one 1–2 s retry on 503/per-minute 429, and a daily-quota 429 parks the model until reset. Live answers take ~6–15 s. Real fix: DeepSeek key and/or Qwen credits. |
| 6 | **LLM did its own (wrong) maths** in the sizing idea: "trim $150 rNVDA → below 30%", when the true value is 31.25%. `simulate_trade` wasn't called, so there was no impact table. | Breaks non-negotiable rule #2. A judge checking numbers would catch it. | ✅ Fixed in code: `simulate_trade` supports rebalances (`into_symbol`), and the loop sends any unsimulated `$`-sized hedge back to be simulated. Re-test showed correct 50.0% → 31.3%. |
| 7 | **Overconfident answers**: "high confidence" while news/earnings data was missing | Misleading; the handbook rewards honest claims. | ✅ Code caps confidence at "medium" when the MCP is down; prompt rule added. |
| 8 | **Generic "watch" items** ("upcoming tech earnings and macro announcements") | Lowers research quality. | ⚠️ Prompt rule added (levels/dates/metrics only, or state the data is missing). Truly fixed only once the MCP (earnings calendar) works. |
| 9 | **Qwen credits not yet obtained**: first 300 teams + Bitget KYC; the form link is "[TBD]" in the handbook (it's in Telegram); approval may take 24 h+ | The judges like Qwen usage, and the "Role of the LLM" field asks about it. Slots may already be gone (the build period started 3 Sep). | ⛔ Owner action: apply ASAP. |
| 10 | **Vercel limits vs. slow runs** | Risk of cut-off answers on the live demo. | ✅ `maxDuration = 120`, Fluid compute on (`vercel.json`). Live runs take 6–42 s. |
| 11 | **Suspiciously large rToken volume** (rNVDA 24h ≈ $12.19B) | Could look like a bug to a judge. | ✅ Verified it is Bitget's own `usdtVolume` figure, passed through faithfully. Not our bug. |
| 12 | **Loose rToken filter in `scripts/check.mjs`** | Misleading count. | ✅ Uses baseCoin `r{TICKER}` + `areaSymbol: "yes"`, giving 2,810 real rTokens (Bitget really lists that many). |
| 13 | **Keys pasted in chat**: the AgentRouter and Gemini keys appeared in the conversation transcript | Minor exposure risk. | ⚠️ Keys are only in the gitignored `.env.local`. The owner can rotate the Gemini key later if wanted (the AgentRouter key is unused). |
| 14 | **Bitget MCP is a 2-tool catalog API** (`guide`, `do_query`), not one tool per dataset; entry titles are in Chinese | The model spent 3 of its 4 rounds browsing and then returned an **empty card**. | ✅ The catalog is pre-loaded in code (`lib/mcp-catalog.ts`) and the prompt gets a compact entry list + examples. Empty answers retry once, then fall back to numbers-only. Ids called as tool names are routed to `do_query`. |
| 15 | **`news_label_search` needs an undocumented integer `label`** (a tag id, not a ticker) | No Bitget news by ticker. | ⚠️ Removed from the prompt so the model doesn't guess. Ticker news comes from the Finnhub tool once `FINNHUB_API_KEY` is set (not yet). |
| 16 | **Model quoted unsimulated sizes** ("trim to 30%", "$50–$100 instead", "trim $100") and once suggested a hedge that *increased* concentration | Breaks rule #2 / weak research. | ✅ Every $ amount in a hedge must equal a simulated trade size (or the book total), and a % target with no simulation is also sent back once. Prompt rule: the idea must reduce the identified risk. Verified live. |
| 17 | **Claude showed as a GitHub contributor** (Co-Authored-By trailers) | Unwanted attribution on the public repo. | ✅ History rewritten and force-pushed on 30 Sep; never add AI co-author lines. |

---

## 3. Current state of `.env.local` (values not shown)

- `LLM_PROVIDERS=qwen,gemini,deepseek,groq,openrouter`
- `GEMINI_API_KEY` set (so the fallback chain is effectively gemini-3.5-flash → gemini-3.5-flash-lite).
- `LLM_API_KEY` / `LLM_BASE_URL` emptied (AgentRouter removed).
- No Qwen / DeepSeek / Groq / OpenRouter keys yet.

---

## 4. Next steps (in order, as of 2 Oct)

1. **Owner: add keys** to `.env.local` **and** Vercel (Settings → Environment Variables, then redeploy):
   - `FINNHUB_API_KEY` (free, https://finnhub.io/register): ticker news + an earnings backup.
   - `DEEPSEEK_API_KEY` (cheap): a reliable second provider; free Gemini Flash only allows 20 requests/day. Verify the `deepseek-chat` model with `npm run check`.
   - `BITGET_QWEN_API_KEY` if the Qwen credits come through (Telegram → Qwen form + KYC); verify `qwen3.8-max`.
2. **Test the other suggestion-chip questions + follow-ups on the live URL** ("what about rTSLA instead?"); fix generic watch items.
3. **P1 signature feature: weekend/closure-risk tool** (hourly candles over the last N weekends for held rTokens → Fri-close→Mon-open gap, reversal at the US open), computed in code; be honest if the edge is weak. Then the **scenario tool** (BTC −10% / NASDAQ −3% via beta).
4. Optional depth: `equity_calendar`-based earnings badge on positions; `sentiment_market_fear_greed` / `crypto_etf_flows` in answers.
5. P2 LUI polish, P3 usage logging + classmate testing + `docs/SUBMISSION.md` + demo video (see AGENTS.md §6).
6. Update AGENTS.md §4/§5 to describe the catalog-style MCP and the 4-step loop (it still says 7 steps and "one tool per dataset").

## 5. Deadline reminder

The submission deadline is **8 Oct 2026, 23:59 UTC+8 = 16:59 Lagos**. Target finish: **7 Oct**.
