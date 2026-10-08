"use client";
// Home: the landing page. Live headline tied to the New York session, the globe, how it works, and the
// trader profile (saved automatically). No intro timer, no skip button.
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Globe, type OrbitTicker } from "@/components/Globe";
import { ProfileSetup } from "@/components/ProfileSetup";
import { StatusLine } from "@/components/StatusLine";
import { Arrow } from "@/components/Icons";
import { BRAND } from "@/components/Brand";
import { usMarketStatus } from "@/lib/market-clock";

const ORBIT_SYMBOLS = ["rNVDA", "BTC", "rTSLA", "ETH", "rAAPL", "rSPY"];

const STEPS = [
  { t: "Ask", d: "In plain English. “Should I add $200 of rNVDA before the weekend?”" },
  { t: "Research", d: "The agent pulls live Bitget prices, analyst targets, earnings dates and news." },
  { t: "Verify", d: "Code, not the model, computes what the trade does to your concentration and weekend risk." },
  { t: "Decide", d: `You get the evidence and a simulated size. ${BRAND} never places orders.` },
];

function nyTime(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

const span = (h: number) => {
  const m = Math.max(1, Math.round(h * 60));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const r = Math.round(h);
  return `${r} hour${r === 1 ? "" : "s"}`;
};

const rise = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

export default function Home() {
  const [now, setNow] = useState<Date | null>(null);
  const [tickers, setTickers] = useState<OrbitTicker[]>(ORBIT_SYMBOLS.map((label) => ({ label })));

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20_000);
    fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: ORBIT_SYMBOLS.map((symbol) => ({ symbol, usd: 1 })) }),
    })
      .then((r) => r.json())
      .then((j) => {
        const pos = (j?.metrics?.positions || []) as { display: string; price: number; change24h: number | null }[];
        if (pos.length) setTickers(pos.map((p) => ({ label: p.display, price: p.price, change: p.change24h })));
      })
      .catch(() => { /* labels without prices */ });
    return () => clearInterval(t);
  }, []);

  const c = now ? usMarketStatus(now) : null;
  const [l1, l2] = !c
    ? ["Wall Street sleeps.", "Your rTokens don't."]
    : c.open
      ? ["Wall Street is open.", "You can't watch it all day."]
      : c.inWeekendWindow
        ? ["Wall Street is shut for the weekend.", "Your rTokens aren't."]
        : ["Wall Street is closed.", "Your rTokens are still trading."];
  const context = !c ? " " : c.open ? `New York ${nyTime(now!)} · session closes in ${span(c.hoursUntilChange)}` : `New York ${nyTime(now!)} · session opens in ${span(c.hoursUntilChange)}`;

  return (
    <>
      <main className="home">
        <section className="hero wrap">
          <div className="hero-copy">
            <motion.p className="eyebrow" {...rise} transition={{ duration: 0.5 }}>{context}</motion.p>
            <motion.h1 {...rise} transition={{ duration: 0.6, delay: 0.05 }}>
              {l1}
              <span className="dim">{l2}</span>
            </motion.h1>
            <motion.p className="lede" {...rise} transition={{ duration: 0.6, delay: 0.12 }}>
              {BRAND} is an AI research desk for people who hold Bitget tokenized US stocks and crypto from outside US hours.
              Ask about a trade before you make it, and see exactly what it does to your book.
            </motion.p>
            <motion.div className="hero-cta" {...rise} transition={{ duration: 0.6, delay: 0.18 }}>
              <Link href="/ask" className="btn primary">Ask the analyst <Arrow /></Link>
              <Link href="/portfolio" className="btn">View portfolio</Link>
            </motion.div>
          </div>
          <motion.div className="hero-visual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}>
            <Globe className="globe" tickers={tickers} nyLabel={now ? `NEW YORK ${nyTime(now)}` : "NEW YORK"} nyOpen={!!c?.open} />
          </motion.div>
        </section>

        <section className="wrap" aria-label="How it works">
          <div className="steps">
          {STEPS.map((s, i) => (
            <motion.div key={s.t} className="step-col" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.08 }}>
              <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </motion.div>
          ))}
          </div>
        </section>

        <section className="wrap section" id="profile">
          <div className="section-head">
            <h2 className="accent">Tell the analyst about you</h2>
            <p>Every answer is sized to this: how much weekend risk is fine, how big a trade should be, what to warn you about.</p>
          </div>
          <ProfileSetup />
        </section>
      </main>
      <StatusLine />
    </>
  );
}
