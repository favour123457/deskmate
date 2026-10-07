# Deskmate: Bitget AI Hackathon S2 submission

- **Track:** AI Trading Desk → **Open Theme** (portfolio-aware AI copilot)
- **Live demo:** https://deskmate-two.vercel.app
- **Code:** https://github.com/favour123457/deskmate
- **Demo video:** _add link_
- **X post:** _add link_

Everything below is written to be pasted into the Google Form. Fill in the bracketed parts, and remove any line you can't stand behind.

---

## Project description (form field, 6 parts)

### 1. Thesis

Bitget rTokens (rNVDA, rTSLA, rSPY…) trade 7×24, but the US cash market doesn't. From Lagos, the US session closes at 21:00 local time and the weekend gap lasts about 65 hours. During those hours a retail trader holding rTokens has no reference price, no desk, no risk system and no analyst. Our core hypothesis: the main risk for these traders is not picking the wrong stock but not seeing what a trade does to the whole book. They concentrate into one tech name, don't notice that their "diversified" mix moves with BTC, and carry that exposure through weekends when only thin rToken order books are pricing it.

Existing tools fall short. A generic chatbot answers "should I buy NVDA?" in general terms and does its own (often wrong) arithmetic. Exchange screens show prices, not portfolio effects. Deskmate answers a different question: **"what does buying $200 of rNVDA do to my book, right now, before a weekend with no US reference price?"** The AI researches and explains, code computes every number, and the trader makes the decision. Deskmate never places orders.

### 2. Target user and product value

Crypto-native students and small retail traders in West Africa and Asia, with roughly $100–$5,000, holding 2–8 Bitget rTokens plus some BTC/ETH. They trade a few times a week, usually hold through weekends, and can't watch the US session live because it runs in their evening and night. They are price-takers with medium risk appetite and no access to the portfolio-risk tools professional desks use.

What they get:
- A live view of their book in plain English: concentration, real diversification, link to BTC, typical monthly swing, bad-day loss (1-day 95% VaR), worst Friday→Monday move, deepest fall, and which holdings move together.
- A 90-day chart of their current book against just holding BTC.
- Live analyst ratings, price targets, earnings dates and headlines for each stock they hold.
- An analyst they can ask in plain English. It returns a verdict, a risk level, an exact before→after table for the trade, evidence with sources, a sizing or hedge idea that has itself been simulated, and dated things to watch.

### 3. Validation data and key metrics

**Built-in correctness checks (observed):**
- Every number in an answer comes from the portfolio engine or a data tool; the model is instructed never to calculate. Code enforces this: if a sizing idea contains a dollar amount or % target that was not simulated, the answer is sent back to simulate that exact trade before it is shown.
- Example observed on the live app (book: rNVDA $400, BTC $250, rTSLA $150, rSPY $100). Question: "Should I add $200 of rNVDA before the weekend?" Verdict: smaller size. rNVDA weight 44.4% → 54.5%, 1-day VaR $16.43 → $21.23. A smaller $50 add was simulated (47.4%). The answer cited live analyst targets from the Bitget MCP and the last earnings date.
- Earlier, before these guards, the model suggested "trim $150 rNVDA to get below 30%", which was wrong (31.25%). We found it in testing, added the code guard, and re-tested: correct 50.0% → 31.3%.
- Confidence is capped at "medium" in code whenever a data source is unavailable.
- Typical answer time on the live app: 6–40 s.

**User testing:** [observed: N classmates tried 3 tasks each; X/N completed all three; median time Y; top feedback: …] — or, if not done yet: _targeted:_ 20 student testers in month one, ≥80% task completion on "check a trade before making it".

**How we will prove usage after the hackathon (targets):** 100 weekly active users in month one through university crypto clubs in Lagos; the share of questions that end in "proceed smaller / wait" as a proxy for avoided over-concentration; 4-week retention ≥30%.

### 4. Progress

**Built and live:** onboarding with a live day/night globe and a profile setup; the desk (live Bitget prices and daily candles for rTokens, perps and crypto); a portfolio engine (weights, effective positions, 30-day volatility, historical VaR, BTC correlation/beta, weekend returns, drawdown, pairwise correlation, trade and rebalance simulation); an LLM agent with tool calling; live news and ratings panel; a research trail that shows every tool call and source.

**Integrations:** Bitget public REST API; Bitget US-stock MCP server (`agent.bitget.com/mcp`, catalog with 67 datasets: quotes, earnings calendar, price targets, estimates, fundamentals, 13F, insider trades); Finnhub (ratings, earnings, company news); Google Gemini (OpenAI-compatible API).

**Problems we solved:** the Bitget MCP was unreachable from our local network in Nigeria, so we deployed to Vercel (US), where it works. The MCP is a 2-tool catalog API, which at first made the model spend its steps browsing; we pre-load the catalog in code with examples. Free Gemini Flash allows ~20 requests/day, so we added model fallback, retry with backoff, and a numbers-only fallback card. AgentRouter rejected app clients, so we dropped it rather than spoof a client.

**Not built yet / next:** a dedicated weekend-gap tool from hourly candles (Fri close → Mon open, and how much reverses at the US open); "what if BTC −10%" scenarios; a paid/second LLM provider for reliability; usage logging.

**Stack:** Next.js 15, React 19, TypeScript, Vercel, @modelcontextprotocol/sdk.

### 5. Deliverables (what's in "Submission Materials Link")

- Live demo: https://deskmate-two.vercel.app (no login; try a suggested question)
- Source code: https://github.com/favour123457/deskmate (README, AGENTS.md architecture brief, docs/PROGRESS.md build log with every problem and fix)
- Demo video: [link], one complete research task from question to decision
- Health check: https://deskmate-two.vercel.app/api/health (shows the live data sources)

### 6. Our take on AI trading (optional)

LLMs are good researchers and bad calculators. In our testing the model's reasoning about *what* to check was useful, but its own arithmetic was wrong often enough to matter. The pattern that worked was simple: let the model choose and explain, let code compute, and let code reject any number it didn't compute. For Bitget's tools, the MCP catalog is powerful but would be easier for agents with short English descriptions per dataset and a ticker-based news search.

---

## Role of the LLM in your project (form field)

The LLM is the research analyst. Given the trader's question, profile and live portfolio numbers, it decides which data to fetch and calls tools: `simulate_trade` (our portfolio engine), `get_price_history` (Bitget REST), Bitget MCP datasets via `do_query` (earnings calendar, price targets, quotes, estimates), and Finnhub (earnings and news). It reads the results and writes a structured answer: verdict, risk, summary, evidence, before/after impact, a sizing/hedge idea, and things to watch. It does **not** do arithmetic (code computes and validates every number) and it never places orders.

**Models:** Google Gemini `gemini-3.5-flash` with automatic fallback to `gemini-3.5-flash-lite`, through an OpenAI-compatible client that also supports Qwen, DeepSeek, Groq and OpenRouter by configuration. We did not receive Qwen credits; the code has a ready Qwen preset for Bitget's hackathon endpoint (`qwen3.8-max`).

---

## Other form fields

- University name: [full name of your university]
- Apply for Demo Day: Yes
- Apply for K3 Token Subsidy: Yes
- S1 participant: No

---

## X post (must quote the official post)

Quote this post: https://x.com/Bitget_AI/status/2100519318824055159

> Wall Street closes at 21:00 in Lagos. My rTokens don't.
>
> So I built Deskmate for #BitgetHackathon: an AI research desk for tokenized US stocks + crypto. Ask "should I add $200 of rNVDA before the weekend?" and it pulls live Bitget data, simulates the trade on your whole book, and shows the risk. You make the call.
>
> @Bitget_AI
> https://deskmate-two.vercel.app

Attach a 20–40 s screen recording: ask a suggested question and let the answer card fill in.
