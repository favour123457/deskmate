"use client";
// "Tell the analyst about you": numbered settings rows with sliding segmented controls, saved automatically,
// next to a live preview of the exact sentence the analyst reads before every answer.
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { RISK_OPTIONS, SIZE_OPTIONS, WEEKEND_OPTIONS, type ProfileAnswers } from "@/lib/profile";
import { useStore } from "@/lib/store";
import { Arrow } from "./Icons";

type Opt = { value: string; hint?: string };

function Segmented({ name, options, value, onChange }: { name: string; options: Opt[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={name}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={`seg-opt${on ? " on" : ""}`} onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId={`seg-${name}`} className="seg-fill" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
            <span className="seg-label">{o.value}</span>
            {o.hint && <span className="seg-hint">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

const ROWS: { key: keyof ProfileAnswers; label: string; options: Opt[] }[] = [
  { key: "size", label: "Book size", options: SIZE_OPTIONS.map((v) => ({ value: v })) },
  { key: "risk", label: "Risk appetite", options: RISK_OPTIONS },
  { key: "weekends", label: "Over the weekend", options: WEEKEND_OPTIONS.map((v) => ({ value: v })) },
];

export function ProfileSetup() {
  const { answers, setAnswers, profile } = useStore();
  const set = (patch: Partial<ProfileAnswers>) => setAnswers({ ...answers, ...patch });

  return (
    <div className="profile">
      <ol className="pq-list">
        {ROWS.map((r, i) => (
          <motion.li key={r.key} className="pq" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.4, delay: i * 0.06 }}>
            <span className="pq-n">{String(i + 1).padStart(2, "0")}</span>
            <div className="pq-body">
              <span className="pq-label">{r.label}</span>
              <Segmented name={r.key} options={r.options} value={answers[r.key]} onChange={(v) => set({ [r.key]: v })} />
            </div>
          </motion.li>
        ))}
        <motion.li className="pq" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.4, delay: 0.18 }}>
          <span className="pq-n">04</span>
          <div className="pq-body pq-fields">
            <label className="field">
              <span className="pq-label">Trading from</span>
              <input value={answers.place} onChange={(e) => set({ place: e.target.value })} placeholder="City" />
            </label>
            <label className="field grow">
              <span className="pq-label">Anything else <em>optional</em></span>
              <input value={answers.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="I check prices after lectures and mostly trade tech." />
            </label>
          </div>
        </motion.li>
      </ol>

      <aside className="brief" aria-live="polite">
        <span className="eyebrow">What the analyst reads</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={profile} className="brief-text" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            {profile}
          </motion.p>
        </AnimatePresence>
        <span className="brief-note">Saved on this device as you go.</span>
        <Link href="/ask" className="btn primary">Ask the analyst <Arrow /></Link>
      </aside>
    </div>
  );
}
