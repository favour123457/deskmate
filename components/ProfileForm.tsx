"use client";
import { RISK_OPTIONS, SIZE_OPTIONS, WEEKEND_OPTIONS, type ProfileAnswers } from "@/lib/profile";

type Props = { value: ProfileAnswers; onChange: (a: ProfileAnswers) => void; compact?: boolean };

export function ProfileForm({ value, onChange, compact }: Props) {
  const set = (patch: Partial<ProfileAnswers>) => onChange({ ...value, ...patch });
  return (
    <div className={`pf${compact ? " pf-compact" : ""}`}>
      <fieldset className="pf-q">
        <legend>How big is your book?</legend>
        <div className="pf-opts">
          {SIZE_OPTIONS.map((o) => (
            <button type="button" key={o} className="pf-opt" aria-pressed={value.size === o} onClick={() => set({ size: o })}>{o}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pf-q">
        <legend>How much risk is comfortable?</legend>
        <div className="pf-opts">
          {RISK_OPTIONS.map((o) => (
            <button type="button" key={o.value} className="pf-opt pf-opt-tall" aria-pressed={value.risk === o.value} onClick={() => set({ risk: o.value })}>
              <span>{o.value}</span>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pf-q">
        <legend>Over the weekend, when the US market is shut, do you…</legend>
        <div className="pf-opts">
          {WEEKEND_OPTIONS.map((o) => (
            <button type="button" key={o} className="pf-opt" aria-pressed={value.weekends === o} onClick={() => set({ weekends: o })}>{o}</button>
          ))}
        </div>
      </fieldset>

      <div className="pf-row">
        <label className="pf-q">
          <span className="pf-label">Where do you trade from?</span>
          <input className="pf-input" value={value.place} onChange={(e) => set({ place: e.target.value })} placeholder="Lagos" />
        </label>
        <label className="pf-q pf-grow">
          <span className="pf-label">Anything else the analyst should know? <em>Optional</em></span>
          <input
            className="pf-input"
            value={value.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="I check prices after lectures and mostly trade tech."
          />
        </label>
      </div>
    </div>
  );
}
