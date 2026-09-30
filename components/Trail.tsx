"use client";
import type { TrailStep } from "@/lib/types";

export function Trail({ steps }: { steps: TrailStep[] }) {
  return (
    <div className="trail">
      {steps.map((s) => (
        <div className="step" key={s.id}>
          <span className={`dot ${s.ok ? "ok" : "bad"}`} style={{ marginTop: 5 }} />
          <div>
            <span className="tool">{s.tool}</span>
            <span className="src">{s.source}</span>
          </div>
          <span className="ms">{s.ms ? `${(s.ms / 1000).toFixed(1)}s` : ""}</span>
          <div className="sum">{s.summary}</div>
        </div>
      ))}
    </div>
  );
}
