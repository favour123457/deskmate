"use client";
// Ask: the analyst chat on its own. Suggested questions as a 2x2 grid of boxes; the conversation persists
// across pages (it lives in the store).
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { InsightCard } from "@/components/InsightCard";
import { Trail } from "@/components/Trail";
import { Arrow, Send } from "@/components/Icons";
import { BRAND } from "@/components/Brand";
import { useStore } from "@/lib/store";

const SUGGESTIONS = [
  "Should I add $200 of rNVDA before the weekend?",
  "What is the biggest risk in my book right now?",
  "If BTC drops 10%, what happens to me, and how do I hedge?",
  "Is there an earnings event before the next US open that hits my holdings?",
];

export default function Ask() {
  const { turns, busy, ask } = useStore();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // grow the composer with its content (up to 6 lines)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const submit = (q: string) => {
    if (!q.trim() || busy) return;
    setDraft("");
    ask(q);
  };

  return (
    <main className="ask">
      <div className="ask-feed wrap-narrow">
        {turns.length === 0 ? (
          <div className="ask-empty">
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>Ask before you trade.</motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}>
              {BRAND} checks live Bitget prices, analyst targets and earnings, then shows exactly how a trade changes the risk in your book.
            </motion.p>
            <div className="suggest">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s}
                  className="suggest-box"
                  onClick={() => submit(s)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.12 + i * 0.06 }}
                >
                  <span className="suggest-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="suggest-q">{s}</span>
                  <span className="suggest-go"><Arrow /></span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className="turn">
              <p className="turn-q"><span className="eyebrow">You</span>{t.question}</p>
              {t.insight ? (
                <InsightCard insight={t.insight} steps={t.steps} provider={t.provider} degraded={t.degraded} />
              ) : t.error ? (
                <p className="turn-err">Something went wrong: {t.error}</p>
              ) : (
                <div className="working">
                  <p className="working-status"><span className="spin" aria-hidden />{t.status}</p>
                  <Trail steps={t.steps} />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <form
          className="composer-inner wrap-narrow"
          onSubmit={(e) => { e.preventDefault(); submit(draft); }}
        >
          <textarea
            ref={boxRef}
            value={draft}
            rows={1}
            aria-label="Ask about a trade"
            placeholder="Should I trim rTSLA before Monday?"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
          />
          <button className="send" type="submit" disabled={busy || !draft.trim()} aria-label="Ask">
            {busy ? <span className="spin" aria-hidden /> : <Send />}
          </button>
        </form>
        <p className="composer-note wrap-narrow">Research, not advice. {BRAND} never places orders.</p>
      </div>
    </main>
  );
}
