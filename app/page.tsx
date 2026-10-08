"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, type OrbitTicker } from "@/components/Globe";
import { ProfileForm } from "@/components/ProfileForm";
import { Logo } from "@/components/Logo";
import { usMarketStatus } from "@/lib/market-clock";
import { DEFAULT_ANSWERS, detectPlace, loadAnswers, saveAnswers, type ProfileAnswers } from "@/lib/profile";

const INTRO_SECONDS = 12;
const ORBIT_SYMBOLS = ["rNVDA", "BTC", "rTSLA", "ETH", "rAAPL", "rSPY"];

function timeIn(tz: string, d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function hoursText(h: number) {
  if (h < 1) {
    const m = Math.max(1, Math.round(h * 60));
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  const r = Math.round(h);
  return `${r} hour${r === 1 ? "" : "s"}`;
}

export default function Onboarding() {
  const router = useRouter();
  const now = useClock();
  const [step, setStep] = useState<"intro" | "setup">("intro");
  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState<ProfileAnswers>(DEFAULT_ANSWERS);
  const [tickers, setTickers] = useState<OrbitTicker[]>(ORBIT_SYMBOLS.map((label) => ({ label })));
  const [left, setLeft] = useState(INTRO_SECONDS);
  const [paused, setPaused] = useState(false);
  const setupHeading = useRef<HTMLHeadingElement>(null);

  // Returning visitors go straight to the desk (unless they asked to replay the intro).
  useEffect(() => {
    let onboarded = false;
    try {
      onboarded = localStorage.getItem("dm.onboarded") === "1";
    } catch {
      /* storage unavailable */
    }
    if (onboarded && !new URLSearchParams(window.location.search).has("intro")) {
      router.replace("/desk");
      return;
    }
    setAnswers(loadAnswers() ?? { ...DEFAULT_ANSWERS, place: detectPlace() });
    setReady(true);
  }, [router]);

  // Live prices for the orbiting chips.
  useEffect(() => {
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
      .catch(() => { /* chips keep their names only */ });
  }, []);

  // Intro moves on by itself unless the visitor is reading (hover/focus pauses it).
  useEffect(() => {
    if (!ready || step !== "intro" || paused) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 0.1)), 100);
    return () => clearInterval(t);
  }, [ready, step, paused]);
  useEffect(() => {
    if (step === "intro" && left <= 0) goSetup();
  }, [left, step]); // eslint-disable-line react-hooks/exhaustive-deps

  function goSetup() {
    setStep("setup");
    setTimeout(() => setupHeading.current?.focus(), 50);
  }
  function openDesk(a: ProfileAnswers) {
    saveAnswers(a);
    router.push("/desk");
  }

  const clock = now ? usMarketStatus(now) : null;
  const lagos = now ? timeIn("Africa/Lagos", now) : "--:--";
  const ny = now ? timeIn("America/New_York", now) : "--:--";
  const headline = !clock
    ? "Your rTokens trade while Wall Street sleeps."
    : clock.open
      ? "Wall Street is open. You can't watch it all day."
      : clock.inWeekendWindow
        ? "Wall Street is shut for the weekend. Your rTokens aren't."
        : "Wall Street is closed. Your rTokens are still trading.";
  const context = !clock
    ? " "
    : clock.open
      ? `It's ${lagos} in Lagos. The New York session closes in ${hoursText(clock.hoursUntilChange)}.`
      : `It's ${lagos} in Lagos. New York opens again in ${hoursText(clock.hoursUntilChange)}.`;

  if (!ready) return <div className="ob" aria-busy="true" />;

  return (
    <div className="ob">
      <header className="ob-top">
        <Logo size={30} />
        <button className="ob-skip" onClick={() => openDesk(answers)}>Skip to the desk</button>
      </header>

      <main className="ob-main">
        <section
          className="ob-copy"
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {step === "intro" ? (
            <div className="ob-panel" key="intro">
              <p className="ob-context"><span className={`ob-live${clock?.open ? " open" : ""}`} aria-hidden />{context}</p>
              <h1 className="ob-h1">{headline}</h1>
              <p className="ob-lede">
                Lamplight is an AI research desk for people who hold tokenized US stocks and crypto on Bitget from
                the other side of the world. Ask about a trade before you make it.
              </p>
              <ol className="ob-steps">
                <li><b>Ask in plain English.</b> “Should I add $200 of rNVDA before the weekend?”</li>
                <li><b>The agent researches.</b> Live Bitget prices, analyst targets, earnings dates and news.</li>
                <li><b>It checks the maths in code.</b> What the trade does to your concentration, volatility and weekend risk.</li>
                <li><b>You decide.</b> You get the evidence and a sizing idea. Lamplight never places orders.</li>
              </ol>
              <div className="ob-cta">
                <button className="ob-btn" onClick={goSetup}>Set up my desk</button>
                <div className="ob-timer" aria-live="off">
                  <span>{paused ? "Paused while you read" : `Continuing in ${Math.ceil(left)}s`}</span>
                  <i style={{ transform: `scaleX(${1 - left / INTRO_SECONDS})` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="ob-panel" key="setup">
              <h1 className="ob-h2" tabIndex={-1} ref={setupHeading}>Tell the analyst about you</h1>
              <p className="ob-lede ob-lede-sm">
                This shapes every answer: position sizes, how much weekend risk is fine, and what to warn you about.
                You can change it any time from Profile on the desk.
              </p>
              <ProfileForm value={answers} onChange={setAnswers} />
              <div className="ob-cta">
                <button className="ob-btn" onClick={() => openDesk(answers)}>Open my desk</button>
                <button className="ob-ghost" onClick={() => setStep("intro")}>Back</button>
              </div>
            </div>
          )}
        </section>

        <section className="ob-visual" aria-label="Markets right now">
          <Globe className="ob-globe" tickers={tickers} nyLabel={`New York ${ny}`} homeLabel={`Lagos ${lagos}`} />
          <p className="ob-caption">
            Day and night as they are right now. Chips show live Bitget prices and 24-hour change.
          </p>
        </section>
      </main>
    </div>
  );
}
