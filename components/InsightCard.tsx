"use client";
// The analyst's answer. Flat: a meta line, headline, summary, then hairline-separated sections.
// Colour only where it carries meaning (verdict, before/after direction).
import type { Insight, TrailStep } from "@/lib/types";
import { Trail } from "./Trail";
import { Chevron } from "./Icons";

const VERDICT: Record<Insight["verdict"], { label: string; tone: string }> = {
  proceed: { label: "Looks OK", tone: "up" },
  proceed_smaller: { label: "Smaller size", tone: "fg" },
  wait: { label: "Wait", tone: "fg" },
  avoid: { label: "Avoid", tone: "down" },
  info: { label: "Research", tone: "fg" },
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function InsightCard({ insight, steps, provider, degraded }: { insight: Insight; steps: TrailStep[]; provider: string | null; degraded: boolean }) {
  const v = VERDICT[insight.verdict];
  return (
    <article className="answer">
      <p className="answer-meta">
        <span className={v.tone}>{v.label}</span>
        <span>{cap(insight.risk)} risk</span>
        <span>{cap(insight.confidence)} confidence</span>
      </p>
      <h2 className="answer-h">{insight.headline}</h2>
      {insight.summary && <p className="answer-sum">{insight.summary}</p>}
      {degraded && <p className="answer-warn">The AI analyst was unavailable, so these are the computed numbers only.</p>}

      {insight.impact.length > 0 && (
        <section className="answer-sec">
          <h3>What changes in your book</h3>
          <table className="impact">
            <thead><tr><th /><th className="n">Now</th><th className="n">After</th></tr></thead>
            <tbody>
              {insight.impact.map((r, i) => (
                <tr key={i}>
                  <td>{r.metric}</td>
                  <td className="n faint">{r.before}</td>
                  <td className="n">{r.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {insight.findings.length > 0 && (
        <section className="answer-sec">
          <h3>Evidence</h3>
          <ul className="findings">{insight.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </section>
      )}

      {insight.hedge && (
        <section className="answer-sec">
          <h3>Sizing idea</h3>
          <p className="hedge">{insight.hedge}</p>
        </section>
      )}

      {insight.watch.length > 0 && (
        <section className="answer-sec">
          <h3>Watch</h3>
          <ul className="findings">{insight.watch.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </section>
      )}

      <section className="answer-sec decision">
        <h3>Your call</h3>
        <p>{insight.decisionNote}</p>
      </section>

      {steps.length > 0 && (
        <details className="trail-box">
          <summary>
            <Chevron /> Research trail, {steps.length} steps{provider ? `, ${provider}` : ""}
          </summary>
          <Trail steps={steps} />
        </details>
      )}
    </article>
  );
}
