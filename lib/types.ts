export type Holding = { symbol: string; usd: number };

export type Market = "spot" | "futures";

export type Resolved = {
  input: string;
  market: Market;
  symbol: string; // exchange symbol, e.g. RNVDAUSDT
  display: string; // friendly name, e.g. rNVDA
  price: number;
  change24h: number | null; // ratio, 0.012 = +1.2%
  volumeUsd: number | null;
  bucket: Bucket;
};

export type Bucket = "US tech" | "US other" | "US index/ETF" | "Crypto" | "Other";

export type Candle = { t: number; close: number };

export type PortfolioMetrics = {
  totalUsd: number;
  positions: {
    display: string;
    symbol: string;
    usd: number;
    weight: number;
    bucket: Bucket;
    price: number;
    change24h: number | null;
  }[];
  buckets: { bucket: Bucket; weight: number }[];
  topHolding: { display: string; weight: number } | null;
  effectivePositions: number; // 1 / HHI
  vol30dAnnual: number | null; // annualised, 365-day basis (rTokens trade 7x24)
  var95OneDayUsd: number | null; // historical 1-day 95% VaR in USD
  btcCorrelation: number | null;
  btcBeta: number | null;
  weekendWorstPct: number | null; // worst Fri->Mon portfolio move in window
  weekendAvgAbsPct: number | null;
  maxDrawdownPct: number | null;
  correlations: { a: string; b: string; rho: number }[];
  window: { from: string; to: string; days: number } | null;
  warnings: string[];
  /** Value of the CURRENT book over the window if held at today's weights, indexed to 100; BTC on the same base. */
  history: { date: string; book: number; btc: number | null }[];
};

export type TrailStep = {
  id: number;
  tool: string;
  source: string; // "Bitget REST" | "Bitget MCP" | "Portfolio engine"
  args: unknown;
  ok: boolean;
  ms: number;
  summary: string;
};

export type Verdict = "proceed" | "proceed_smaller" | "wait" | "avoid" | "info";
export type Risk = "low" | "medium" | "high";

export type Insight = {
  headline: string;
  verdict: Verdict;
  risk: Risk;
  summary: string;
  findings: string[];
  impact: { metric: string; before: string; after: string }[];
  hedge: string | null;
  watch: string[];
  confidence: "low" | "medium" | "high";
  decisionNote: string;
};

export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "step"; step: TrailStep }
  | { type: "final"; insight: Insight; provider: string | null; degraded: boolean }
  | { type: "error"; message: string };
