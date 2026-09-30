# Deskmate: progress, challenges and handoff

Last updated: **30 Sep 2026, ~21:05 Lagos (UTC+1)**. Read `AGENTS.md` first for the project brief, rules and roadmap. This file records what has been done since then and what to do next.

> Secrets: API keys live only in `.env.local` (gitignored by `.env*`). Never copy them into this file, commits, logs or the UI.

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
| 1 | **Bitget MCP server unreachable** from the owner's network (TCP timeout to Cloudflare IPs; `api.bitget.com` works fine) | No fundamentals, earnings dates, analyst targets, news or sentiment, which hurts the "feature depth" and "research quality" scores. Watch items stay thin. Real MCP tool names are still unknown, so the P0 prompt rewrite is blocked. | ⛔ Open. The app degrades honestly (REST-only, says so in the trail, confidence capped at medium). Next: owner tests a browser/hotspot/VPN; deploy to Vercel (US servers) and read `/api/health` there. |
| 2 | **AgentRouter rejects app clients** (`401 unauthorized client detected`) | The owner's first LLM key was unusable. | ✅ Dropped it. We will not spoof a client identity (it breaks their terms and could fail during judging). Switched to Gemini. |
| 3 | **Gemini 2.5 models retired for new keys** (404) | The preset defaults in the code were dead. | ✅ Tested the available models with a real tool call and switched the default to `gemini-3.5-flash`. |
| 4 | **Gemini Pro has 0 free quota** (429, `limit: 0`) | No Pro model without enabling Google billing. | ✅ Decided it isn't needed: the LLM does no maths, and Pro is slower (bad for LUI fluency). It can be enabled later with just `GEMINI_MODEL=gemini-3.1-pro-preview`. |
| 5 | **Free-tier Gemini is slow/unreliable**: 3.8-flash took ~49 s and returned 503s; 3.5-flash intermittently fails; there are per-minute request limits | The owner's first real question returned "AI analyst unavailable (aborted due to timeout)", a numbers-only card. | ⚠️ Worked around: comma-list model fallback (3.5-flash → 3.5-flash-lite), 35 s per-call timeout. Now answers in ~13 to 35 s. Still fragile under rapid testing. Real fix: Qwen credits and/or a paid DeepSeek key as more providers. |
| 6 | **LLM did its own (wrong) maths** in the sizing idea: "trim $150 rNVDA → below 30%", when the true value is 31.25%. `simulate_trade` wasn't called, so there was no impact table. | Breaks non-negotiable rule #2. A judge checking numbers would catch it. | ✅ Fixed in code: `simulate_trade` supports rebalances (`into_symbol`), and the loop sends any unsimulated `$`-sized hedge back to be simulated. Re-test showed correct 50.0% → 31.3%. |
| 7 | **Overconfident answers**: "high confidence" while news/earnings data was missing | Misleading; the handbook rewards honest claims. | ✅ Code caps confidence at "medium" when the MCP is down; prompt rule added. |
| 8 | **Generic "watch" items** ("upcoming tech earnings and macro announcements") | Lowers research quality. | ⚠️ Prompt rule added (levels/dates/metrics only, or state the data is missing). Truly fixed only once the MCP (earnings calendar) works. |
| 9 | **Qwen credits not yet obtained**: first 300 teams + Bitget KYC; the form link is "[TBD]" in the handbook (it's in Telegram); approval may take 24 h+ | The judges like Qwen usage, and the "Role of the LLM" field asks about it. Slots may already be gone (the build period started 3 Sep). | ⛔ Owner action: apply ASAP. |
| 10 | **Vercel limits vs. slow runs**: `app/api/ask/route.ts` has `maxDuration = 60`, and agent runs take 13 to 35 s+ (more with fallbacks) | Risk of cut-off answers on the live demo. | ⛔ Not yet tested; verify on deploy and check the plan limits. |
| 11 | **Suspiciously large rToken volume** (rNVDA 24h ≈ $12.19B) | Could look like a bug to a judge. | ✅ Verified it is Bitget's own `usdtVolume` figure, passed through faithfully. Not our bug. |
| 12 | **Loose rToken filter in `scripts/check.mjs`** (counts 2834 "rToken-looking" pairs) | Check-script output only; misleading count. | ⛔ Small fix pending. |
| 13 | **Keys pasted in chat**: the AgentRouter and Gemini keys appeared in the conversation transcript | Minor exposure risk. | ⚠️ Keys are only in the gitignored `.env.local`. The owner can rotate the Gemini key later if wanted (the AgentRouter key is unused). |

---

## 3. Current state of `.env.local` (values not shown)

- `LLM_PROVIDERS=qwen,gemini,deepseek,groq,openrouter`
- `GEMINI_API_KEY` set (so the fallback chain is effectively gemini-3.5-flash → gemini-3.5-flash-lite).
- `LLM_API_KEY` / `LLM_BASE_URL` emptied (AgentRouter removed).
- No Qwen / DeepSeek / Groq / OpenRouter keys yet.

---

## 4. Next steps (in order)

1. **Run `npm run build`, then commit** the current changes (small, focused commit; use the attribution rules in AGENTS/system). Decide whether to commit `AGENTS.md` and `docs/PROGRESS.md` (the owner hasn't said; ask).
2. **Test the other suggestion-chip questions** in `app/page.tsx` against live data, plus a follow-up ("what about rTSLA instead?"). Check the JSON, units (fractions vs %), invented numbers and whether `simulate_trade` gets used.
3. **Owner actions:**
   - Apply for **Qwen credits** (Telegram → Qwen form + Bitget KYC). Then put `BITGET_QWEN_API_KEY` in `.env.local`, run `npm run check`, and verify that the `qwen3.8-max` model name at `hackathon.bitgetops.com/v1` works.
   - Check whether `https://agent.bitget.com` opens in a browser / on a phone hotspot / on a VPN, to confirm it's a local network block.
   - Optionally get a **DeepSeek** key (cheap) as a more reliable second provider than free-tier Gemini.
4. **Deploy to Vercel early** (needs the owner's Vercel account). Vercel runs in the US, so it will probably reach the MCP. Then open `/api/health` on the live URL to get the real MCP tool list, and rewrite the prompt's tool guidance with the real tool names + few-shot hints (the P0 task in AGENTS.md). Note that `app/api/ask/route.ts` has `maxDuration = 60`, and runs can take 13 to 35 s+. Check the Vercel plan limits.
5. Tighten the rToken filter in `scripts/check.mjs` (the 2834-pairs count).
6. Then continue the AGENTS.md roadmap: P1 weekend/closure-risk tool (signature feature) and scenario tool; P2 LUI polish; P3 usage logging, user testing, submission docs, video.

## 5. Deadline reminder

The submission deadline is **8 Oct 2026, 23:59 UTC+8 = 16:59 Lagos**. Target finish: **7 Oct**.
