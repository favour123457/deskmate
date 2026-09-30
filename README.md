# Deskmate: an AI research desk for tokenized US stocks

**Bitget AI Base Camp Hackathon S2 · 🟧 AI Trading Desk · Open Theme (portfolio-aware copilot)**

> Ask before you trade. Deskmate researches your question with live Bitget data and shows you exactly how the trade changes the risk in *your* book. You make the call.

## The problem (thesis)

Bitget rTokens (rNVDA, rTSLA, rSPY…) trade 7×24, but the US cash market doesn't. From Lagos, the US session closes at 21:00 local time and doesn't reopen until Monday afternoon. Small traders hold rTokens and crypto through those hours without a desk, a risk system or an analyst. They pile into one tech name without noticing that their "diversified" book is one big bet on the same thing as BTC.

Chatbots answer "should I buy NVDA?" in general terms. Deskmate answers **"what does buying $200 of rNVDA do to *my* portfolio, right now, before a weekend with no US reference price?"**

## Target user

Crypto-native students and small retail traders (≈ $100 to $5,000) holding 2 to 8 rTokens plus some crypto. They are based outside US hours (West Africa, Asia), trade a few times a week, and can't watch the US session live.

## What it does

1. **Your book.** You enter holdings as `rNVDA $400`, `BTC $250` and so on.
2. **Live risk tiles, computed in code from Bitget data:** largest holding, real diversification (1/HHI), BTC correlation and beta, 30-day volatility, 1-day 95% VaR, worst Friday→Monday weekend move, and max drawdown.
3. **Ask in plain English.** An LLM analyst plans the research and calls tools:
   - `simulate_trade`: exact before/after risk for a proposed trade (the portfolio engine does the math, not the LLM)
   - `get_price_history`: live Bitget price, returns and volatility for any rToken, perp or crypto
   - **Bitget MCP data server** tools: fundamentals, earnings calendar, analyst targets, 13F, insider trades, news, sentiment
4. **Insight card:** verdict, risk level, a "what changes in your book" table, evidence, a sizing or hedge idea, and what to watch. It closes with **"Your call"**; Deskmate never places orders.
5. **Research trail:** every tool call, its data source and its timing are shown, so the analysis can be checked.

## Design principles

- **LLM for reasoning, code for numbers.** Every statistic comes from `lib/stats.ts`. The model is told never to calculate.
- **No fake data.** If Bitget or MCP is unreachable, the UI says so and the analyst reports what is missing.
- **Keeps working when a provider fails.** It falls back across LLM providers, and if all of them fail it shows a numbers-only card.

## Run it

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
# put at least one LLM key in .env.local (Gemini / Groq free tiers work)
npm run check                   # verifies Bitget REST, Bitget MCP and your LLM key
npm run dev                     # open http://localhost:3000
```

### Deploy (public demo link for judges)

Push to GitHub, go to vercel.com, then **New Project**, import the repo, add the same env vars, and deploy.

## Architecture

```
Browser (app/page.tsx)
  ├─ POST /api/portfolio ──► lib/portfolio.ts ──► lib/bitget.ts (Bitget public REST) ──► lib/stats.ts (math)
  └─ POST /api/ask (NDJSON stream)
        └─ lib/agent.ts  — tool-calling loop
              ├─ lib/llm.ts   OpenAI-compatible client: Qwen · Gemini · DeepSeek · Groq · OpenRouter · custom (auto-fallback)
              ├─ simulate_trade / get_price_history  (Bitget REST + portfolio engine)
              └─ lib/mcp.ts   Bitget MCP server https://agent.bitget.com/mcp (direct tools, or catalog mode if many)
```

## Role of the LLM

The LLM plans which data to fetch, calls the tools, reads the results, and writes the structured insight tied to the user's portfolio and profile. It does **not** do arithmetic and does **not** execute trades. The default provider order is Bitget-hosted Qwen (`qwen3.8-max`), then Gemini, DeepSeek, Groq and OpenRouter, configurable in `.env.local`.

## Limitations (honest)

- Daily candles only. The weekend metric uses UTC daily closes (Fri→Mon), not exact US close/open timestamps.
- The market clock ignores US exchange holidays.
- Buckets (US tech / index / crypto) use a static ticker map.
- This is a research tool, not financial advice.

## License

MIT
