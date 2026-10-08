"use client";
// App-wide state shared by every page (Home, Ask, Portfolio, News): the book, its live metrics, the trader
// profile, the conversation, data-source health and the news/ratings briefs. Lives in the root layout, so it
// survives navigation between pages.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DEFAULT_ANSWERS, detectPlace, loadAnswers, profileText, saveAnswers, type ProfileAnswers } from "./profile";
import { useResearch, type Research } from "./useResearch";
import type { Holding, Insight, PortfolioMetrics, StreamEvent, TrailStep } from "./types";

export type Turn = {
  question: string;
  status: string;
  steps: TrailStep[];
  insight: Insight | null;
  provider: string | null;
  degraded: boolean;
  error: string | null;
};

export type Health = {
  bitgetRest: { ok: boolean; detail: string };
  bitgetMcp: { ok: boolean; tools: string[]; error: string | null };
  finnhub?: { configured: boolean };
  llm: { id: string; model: string }[];
};

type Store = {
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  metrics: PortfolioMetrics | null;
  errors: string[];
  loadingBook: boolean;
  refresh: (h?: Holding[]) => void;
  answers: ProfileAnswers;
  setAnswers: (a: ProfileAnswers) => void;
  profile: string;
  health: Health | null;
  research: Research;
  turns: Turn[];
  busy: boolean;
  ask: (question: string) => void;
};

export const DEFAULT_HOLDINGS: Holding[] = [
  { symbol: "rNVDA", usd: 400 },
  { symbol: "rTSLA", usd: 150 },
  { symbol: "BTC", usd: 250 },
  { symbol: "rSPY", usd: 100 },
];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <StoreProvider>");
  return s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldingsState] = useState<Holding[]>(DEFAULT_HOLDINGS);
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadingBook, setLoadingBook] = useState(false);
  const [answers, setAnswersState] = useState<ProfileAnswers>(DEFAULT_ANSWERS);
  const [health, setHealth] = useState<Health | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;

  const refresh = useCallback(async (h?: Holding[]) => {
    const book = (h ?? holdingsRef.current).filter((x) => x.symbol.trim() && x.usd > 0);
    setLoadingBook(true);
    try {
      const res = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings: book }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "failed");
      setMetrics(j.metrics);
      setErrors(j.errors || []);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setLoadingBook(false);
    }
  }, []);

  useEffect(() => {
    const h = load("dm.holdings", DEFAULT_HOLDINGS);
    setHoldingsState(h);
    setAnswersState(loadAnswers() ?? { ...DEFAULT_ANSWERS, place: detectPlace() });
    refresh(h);
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  }, [refresh]);

  const setHoldings = useCallback((h: Holding[]) => {
    setHoldingsState(h);
    save("dm.holdings", h);
  }, []);

  const setAnswers = useCallback((a: ProfileAnswers) => {
    setAnswersState(a);
    saveAnswers(a);
  }, []);

  const profile = profileText(answers);
  const stockSymbols = metrics ? metrics.positions.filter((p) => p.bucket !== "Crypto" && p.bucket !== "Other").map((p) => p.display) : [];
  const research = useResearch(stockSymbols);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setBusy(true);
      const history = turns
        .filter((t) => t.insight)
        .map((t) => ({ question: t.question, answer: `${t.insight!.headline}. ${t.insight!.summary}` }));
      const idx = turns.length;
      setTurns((ts) => [...ts, { question: q, status: "Starting", steps: [], insight: null, provider: null, degraded: false, error: null }]);
      const patch = (fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t, i) => (i === idx ? fn(t) : t)));
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, holdings: holdingsRef.current, profile, history }),
        });
        if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as StreamEvent;
            if (ev.type === "status") patch((t) => ({ ...t, status: ev.text }));
            else if (ev.type === "step") patch((t) => ({ ...t, steps: [...t.steps, ev.step] }));
            else if (ev.type === "final") patch((t) => ({ ...t, insight: ev.insight, provider: ev.provider, degraded: ev.degraded }));
            else if (ev.type === "error") patch((t) => ({ ...t, error: ev.message }));
          }
        }
      } catch (e) {
        patch((t) => ({ ...t, error: (e as Error).message }));
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, profile],
  );

  return (
    <Ctx.Provider value={{ holdings, setHoldings, metrics, errors, loadingBook, refresh, answers, setAnswers, profile, health, research, turns, busy, ask }}>
      {children}
    </Ctx.Provider>
  );
}
