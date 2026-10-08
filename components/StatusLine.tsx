"use client";
// The quiet footer line: US session status and which data sources answered. Plain text, no badges or dots.
import { useEffect, useState } from "react";
import { usMarketStatus } from "@/lib/market-clock";
import { useStore } from "@/lib/store";
import { BRAND } from "./Brand";

const MODEL_NAMES: Record<string, string> = { gemini: "Gemini", qwen: "Qwen", deepseek: "DeepSeek", groq: "Groq", openrouter: "OpenRouter", custom: "AI model" };

function useNow(ms = 30_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const span = (h: number) => {
  const m = Math.max(1, Math.round(h * 60));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export function StatusLine() {
  const { health } = useStore();
  const now = useNow();
  const c = now ? usMarketStatus(now) : null;
  const llm = health?.llm[0];
  const sources = health
    ? [
        { name: health.bitgetMcp.ok ? "Bitget" : "Bitget (MCP unavailable)", down: !health.bitgetRest.ok || !health.bitgetMcp.ok },
        ...(health.finnhub?.configured ? [{ name: "Finnhub", down: false }] : []),
        { name: llm ? MODEL_NAMES[llm.id] ?? llm.id : "No AI model", down: !llm },
      ]
    : [];

  return (
    <footer className="status">
      <div className="status-inner">
        <span>
          {c ? (c.open ? `New York session open · closes in ${span(c.hoursUntilChange)}` : `New York session closed · opens in ${span(c.hoursUntilChange)}`) : " "}
          <span className="status-sep">rTokens trade 24/7</span>
        </span>
        <span>
          Data{" "}
          {sources.map((s, i) => (
            <span key={s.name} className={s.down ? "down" : undefined}>{i ? " · " : ""}{s.name}</span>
          ))}
        </span>
        <span className="status-legal">Research, not advice. {BRAND} never places orders.</span>
      </div>
    </footer>
  );
}
