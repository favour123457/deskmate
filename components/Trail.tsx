"use client";
// Every tool call the agent made: tool, data source, time, and what came back. Failed steps are marked in red text.
import type { TrailStep } from "@/lib/types";

export function Trail({ steps }: { steps: TrailStep[] }) {
  return (
    <ol className="trail">
      {steps.map((s) => (
        <li key={s.id} className={s.ok ? undefined : "failed"}>
          <span className="trail-tool">{s.tool}</span>
          <span className="trail-src">{s.source}{s.ok ? "" : " · failed"}</span>
          <span className="trail-ms">{s.ms ? `${(s.ms / 1000).toFixed(1)}s` : ""}</span>
          <span className="trail-sum">{s.summary}</span>
        </li>
      ))}
    </ol>
  );
}
