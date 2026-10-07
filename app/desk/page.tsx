"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { Trail } from "@/components/Trail";
import { LiveResearch } from "@/components/LiveResearch";
import { ProfileForm } from "@/components/ProfileForm";
import { DEFAULT_ANSWERS, loadAnswers, profileSummary, profileText, saveAnswers, type ProfileAnswers } from "@/lib/profile";
import type { Holding, Insight, PortfolioMetrics, StreamEvent, TrailStep } from "@/lib/types";

type Turn = {
  question: string;
  status: string;
  steps: TrailStep[];
  insight: Insight | null;
  provider: string | null;
  degraded: boolean;
  error: string | null;
};

type Health = {
  bitgetRest: { ok: boolean; detail: string };
  bitgetMcp: { ok: boolean; tools: string[]; error: string | null };
  llm: { id: string; model: string }[];
};

const DEFAULT_HOLDINGS: Holding[] = [
  { symbol: "rNVDA", usd: 400 },
  { symbol: "rTSLA", usd: 150 },
  { symbol: "BTC", usd: 250 },
  { symbol: "rSPY", usd: 100 },
];

const SUGGESTIONS = [
  "Should I add $200 of rNVDA before the weekend?",
  "What is the biggest risk in my book right now?",
  "If BTC drops 10%, what happens to me — and how do I hedge?",
  "Is there an earnings or macro event before the next US open that hits my holdings?",
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

export default function Desk() {
  const [holdings, setHoldings] = useState<Holding[]>(DEFAULT_HOLDINGS);
  const [answers, setAnswers] = useState<ProfileAnswers>(DEFAULT_ANSWERS);
  const [editing, setEditing] = useState<ProfileAnswers | null>(null);
  const profile = profileText(answers);
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [clock, setClock] = useState<string>("");
  const [loadingBook, setLoadingBook] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // restore saved book
  useEffect(() => {
    setHoldings(load("dm.holdings", DEFAULT_HOLDINGS));
    setAnswers(loadAnswers() ?? DEFAULT_ANSWERS);
    hydrated.current = true;
  }, []);
  useEffect(() => { if (hydrated.current) save("dm.holdings", holdings); }, [holdings]);

  const refresh = useCallback(async (h: Holding[]) => {
    setLoadingBook(true);
    try {
      const res = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings: h }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "failed");
      setMetrics(j.metrics);
      setErrors(j.errors || []);
      setClock(j.clock?.label || "");
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setLoadingBook(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(load("dm.holdings", DEFAULT_HOLDINGS)), 50);
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setBusy(true);
    const history = turns
      .filter((t) => t.insight)
      .map((t) => ({ question: t.question, answer: `${t.insight!.headline}. ${t.insight!.summary}` }));
    const idx = turns.length;
    setTurns((ts) => [...ts, { question: q, status: "Starting…", steps: [], insight: null, provider: null, degraded: false, error: null }]);
    const patch = (fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t, i) => (i === idx ? fn(t) : t)));

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, holdings, profile, history }),
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
  };

  const llmOk = !!health?.llm.length;
  const stockSymbols = metrics ? metrics.positions.filter((p) => p.bucket !== "Crypto" && p.bucket !== "Other").map((p) => p.display) : [];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">D</div>
          <div style={{ minWidth: 0 }}>
            <h1>Deskmate</h1>
            <p>AI research desk for tokenized US stocks and crypto. You make the call.</p>
          </div>
        </div>
        <div className="status">
          <button className="pill pill-btn" onClick={() => setEditing(answers)} title={profile}>
            Profile: {profileSummary(answers)}
          </button>
          {clock && <span className="pill"><span className={`dot ${clock.includes("open —") ? "ok" : "wait"}`} />{clock}</span>}
          <span className="pill" title={health?.bitgetRest.detail}><span className={`dot ${health ? (health.bitgetRest.ok ? "ok" : "bad") : ""}`} />Bitget data</span>
          <span className="pill" title={health?.bitgetMcp.error || `${health?.bitgetMcp.tools.length ?? 0} tools`}><span className={`dot ${health ? (health.bitgetMcp.ok ? "ok" : "bad") : ""}`} />Bitget MCP</span>
          <span className="pill" title={health?.llm.map((l) => `${l.id}:${l.model}`).join(", ")}><span className={`dot ${health ? (llmOk ? "ok" : "bad") : ""}`} />{llmOk ? health!.llm[0].id : "No LLM key"}</span>
        </div>
      </header>

      <main className="main">
        <PortfolioPanel
          holdings={holdings}
          setHoldings={setHoldings}
          metrics={metrics}
          errors={errors}
          loading={loadingBook}
          onRefresh={() => refresh(holdings)}
        />

        <section className="chat">
          <div className="feed" ref={feedRef}>
            <div className="feed-inner">
              {turns.length === 0 ? (
                <div className="empty">
                  <h2>Ask before you trade.</h2>
                  <p>Deskmate checks live Bitget prices, fundamentals and news, then shows exactly how a trade changes the risk in your book — including the hours when the US market is shut and only rTokens are trading.</p>
                  <div className="chips">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((t, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="q">{t.question}</div>
                    {t.insight ? (
                      <InsightCard insight={t.insight} steps={t.steps} provider={t.provider} degraded={t.degraded} />
                    ) : t.error ? (
                      <div className="card err">Something went wrong: {t.error}</div>
                    ) : (
                      <div className="working">
                        <div className="status-line"><span className="spinner" />{t.status}</div>
                        <Trail steps={t.steps} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="composer">
            <div className="composer-inner">
              <textarea
                value={draft}
                rows={1}
                placeholder="Ask about a trade, e.g. “Should I trim rTSLA before Monday?”"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
              />
              <button className="btn primary" onClick={() => ask(draft)} disabled={busy || !draft.trim()}>
                {busy ? "…" : "Ask"}
              </button>
            </div>
            <p className="disclaimer">Research tool, not financial advice. Deskmate never places orders.</p>
          </div>
        </section>
        <aside className="news-col" aria-label="Live news and ratings">
          <LiveResearch symbols={stockSymbols} />
        </aside>
      </main>

      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 id="sheet-title">Your profile</h2>
              <a className="link-btn" href="/?intro=1">Replay intro</a>
            </div>
            <p className="muted sheet-sub">The analyst reads this before every answer.</p>
            <ProfileForm value={editing} onChange={setEditing} compact />
            <div className="sheet-actions">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="btn primary"
                onClick={() => {
                  saveAnswers(editing);
                  setAnswers(editing);
                  setEditing(null);
                }}
              >
                Save profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
