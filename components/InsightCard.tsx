"use client";
import type { Insight, TrailStep } from "@/lib/types";
import { Trail } from "./Trail";

const VERDICT_LABEL: Record<Insight["verdict"], string> = {
  proceed: "Looks OK",
  proceed_smaller: "Smaller size",
  wait: "Wait",
  avoid: "Avoid",
  info: "Research",
};

export function InsightCard({
  insight, steps, provider, degraded,
}: { insight: Insight; steps: TrailStep[]; provider: string | null; degraded: boolean }) {
  return (
    <article className="insight">
      <header className="insight-head">
        <div className="badges">
          <span className={`badge v-${insight.verdict}`}>{VERDICT_LABEL[insight.verdict]}</span>
          <span className={`badge r-${insight.risk}`}>{insight.risk} risk</span>
          <span className="badge conf">{insight.confidence} confidence</span>
        </div>
        <h3>{insight.headline}</h3>
        {insight.summary && <p className="summary">{insight.summary}</p>}
        {degraded && <p className="degraded">AI analyst unavailable. Showing computed numbers only.</p>}
      </header>

      <div className="insight-body">
        {insight.impact.length > 0 && (
          <section>
            <p className="sec-title">What changes in your book</p>
            <table className="impact">
              <thead>
                <tr><th>Metric</th><th className="n">Now</th><th /><th className="n">After</th></tr>
              </thead>
              <tbody>
                {insight.impact.map((r, i) => (
                  <tr key={i}>
                    <td>{r.metric}</td>
                    <td className="n muted">{r.before}</td>
                    <td className="arrow">→</td>
                    <td className="n after">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {insight.findings.length > 0 && (
          <section>
            <p className="sec-title">Evidence</p>
            <ul className="findings">{insight.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </section>
        )}

        {insight.hedge && (
          <section>
            <p className="sec-title">Sizing / hedge idea</p>
            <div className="hedge">{insight.hedge}</div>
          </section>
        )}

        {insight.watch.length > 0 && (
          <section>
            <p className="sec-title">Watch</p>
            <div className="watch">{insight.watch.map((w, i) => <span key={i}>{w}</span>)}</div>
          </section>
        )}
      </div>

      <div className="decision">
        <b>Your call</b>
        <span>{insight.decisionNote}</span>
      </div>

      {steps.length > 0 && (
        <details className="trail-box">
          <summary>
            Research trail · {steps.length} steps{provider ? ` · ${provider}` : ""}
          </summary>
          <Trail steps={steps} />
        </details>
      )}
    </article>
  );
}
