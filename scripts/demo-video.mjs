// Makes a narrated demo video of the LIVE site: AI voice + screen recording + captions -> one MP4.
//
//   npm run demo-video                      (records https://deskmate-two.vercel.app)
//   DEMO_URL=http://localhost:3000 npm run demo-video
//   DEMO_VOICE=en-GB-RyanNeural npm run demo-video
//
// Needs: npm install (playwright, ffmpeg-static, msedge-tts are devDependencies) and a browser:
// it uses your installed Google Chrome if present, otherwise run `npx playwright install chromium` once.
// Output: demo/deskmate-demo.mp4
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const BASE = (process.env.DEMO_URL || "https://deskmate-two.vercel.app").replace(/\/$/, "");
const VOICE = process.env.DEMO_VOICE || "en-US-AndrewNeural";
const OUT_DIR = path.resolve("demo");
const WORK = path.join(OUT_DIR, "work");
const W = 1440, H = 900;
const QUESTION = "Should I add $200 of rNVDA before the weekend?";

// ---------- the script: narration + what happens on screen ----------
const SCENES = [
  {
    text: "Wall Street closes at nine p.m. in Lagos. But Bitget's tokenized US stocks keep trading, all night and all weekend. Deskmate is an AI research desk for people who hold those stocks and crypto from the other side of the world.",
    act: async (p) => {
      await p.goto(BASE + "/?intro=1", { waitUntil: "networkidle" }).catch(() => {});
      await p.waitForSelector(".ob-copy", { timeout: 20000 }).catch(() => {});
      await parkOnIntroText(p);
      await pause(1500);
      await point(p, ".ob-globe");
    },
  },
  {
    text: "The globe shows where it is day and night right now, with live Bitget prices orbiting it. You ask about a trade before you make it, the agent does the research, code checks the maths, and you decide.",
    act: async (p) => { await parkOnIntroText(p); await point(p, ".ob-steps li:nth-child(1)"); await pause(2500); await point(p, ".ob-steps li:nth-child(4)"); },
  },
  {
    text: "First, you tell the analyst about yourself: how big your book is, how much risk you are comfortable with, and whether you hold through the weekend.",
    act: async (p) => {
      if (await p.locator(".ob-btn", { hasText: "Set up my desk" }).count()) await click(p, ".ob-btn >> text=Set up my desk");
      await pause(1200); await click(p, ".pf-opt >> text=Balanced");
      await pause(900); await click(p, ".pf-opt >> text=Usually hold");
    },
  },
  {
    text: "The desk loads your holdings with live Bitget prices, and shows how much of your money sits in each one.",
    act: async (p) => { await click(p, "text=Open my desk"); await p.waitForSelector(".weights", { timeout: 30000 }).catch(() => {}); await pause(800); await hover(p, ".weights li:first-child"); },
  },
  {
    text: "This chart compares your book over the last few months with simply holding Bitcoin.",
    act: async (p) => { await scrollTo(p, ".side", ".bchart"); await pause(900); await sweepChart(p); },
  },
  {
    text: "Every risk number is explained in plain words: how concentrated you are, how closely you move with Bitcoin, what a bad day could cost, and your worst weekend while the US market was shut.",
    act: async (p) => { await scrollTo(p, ".side", ".risks"); await pause(1200); await hover(p, ".risk:nth-child(3)"); await pause(1800); await scrollTo(p, ".side", ".risk:nth-child(6)"); await hover(p, ".risk:nth-child(6)"); },
  },
  {
    text: "On the right, live analyst ratings, price targets, earnings dates and headlines for every stock you hold.",
    act: async (p) => { await hover(p, ".news-col .brief"); await pause(1500); await scrollTo(p, ".news-col", ".news-col .brief:last-child"); },
  },
  {
    text: "Now, ask a question in plain English. The agent pulls Bitget market data, analyst targets and the earnings calendar, and simulates the trade on your whole portfolio. You can watch every step.",
    act: async (p) => {
      await scrollTo(p, ".side", ".hero");
      const chip = p.locator(".chip", { hasText: QUESTION });
      if (await chip.count()) await click(p, chip.first());
      else { await click(p, ".composer textarea"); await p.keyboard.type(QUESTION, { delay: 25 }); await p.keyboard.press("Enter"); }
    },
    waitFor: ".insight",
  },
  {
    text: "You get a verdict, the exact before and after numbers for your book, the evidence, and a smaller size that was also simulated. The AI never does the maths itself. Code computes every number.",
    act: async (p) => { await hover(p, ".insight-head"); await pause(1500); await scrollTo(p, ".feed", ".impact"); await hover(p, ".impact"); await pause(1500); await scrollTo(p, ".feed", ".hedge"); },
  },
  {
    text: "Every source is listed in the research trail, so you can check the work. And the final decision is always yours. Deskmate never places orders. Deskmate. Ask before you trade.",
    act: async (p) => { await scrollTo(p, ".feed", ".trail-box"); await click(p, "details.trail-box summary"); await pause(1800); await scrollTo(p, ".feed", ".decision"); await hover(p, ".decision"); },
  },
];

// ---------- helpers ----------
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function cursorTo(p, loc, visualOnly = false) {
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return null;
  const x = box.x + Math.min(box.width / 2, 120), y = box.y + box.height / 2;
  await p.evaluate(({ x, y }) => window.__cursor?.(x, y), { x, y });
  if (!visualOnly) await p.mouse.move(x, y, { steps: 12 });
  await pause(450);
  return { x, y };
}
const L = (p, s) => (typeof s === "string" ? p.locator(s).first() : s);
async function hover(p, s) { await cursorTo(p, L(p, s)); }
// On the intro, the real mouse rests on the text (which pauses the 12 s auto-advance); only the drawn cursor moves.
async function point(p, s) { await cursorTo(p, L(p, s), true); }
async function parkOnIntroText(p) {
  const box = await p.locator(".ob-copy").first().boundingBox().catch(() => null);
  if (box) await p.mouse.move(box.x + 40, box.y + 40);
}
async function click(p, s) {
  const loc = L(p, s);
  await loc.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await cursorTo(p, loc);
  await p.evaluate(() => window.__click?.());
  await loc.click({ timeout: 10000 }).catch((e) => console.warn("  click failed:", String(e).split("\n")[0]));
}
async function scrollTo(p, container, target) {
  await p.evaluate(({ container, target }) => {
    const c = document.querySelector(container), t = document.querySelector(target);
    if (!c || !t) return;
    const top = t.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 24;
    c.scrollTo({ top, behavior: "smooth" });
  }, { container, target });
  await pause(900);
}
async function sweepChart(p) {
  const box = await p.locator(".bchart svg").first().boundingBox().catch(() => null);
  if (!box) return;
  for (let i = 0; i <= 30; i++) {
    const x = box.x + 40 + ((box.width - 55) * i) / 30, y = box.y + box.height / 2;
    await p.evaluate(({ x, y }) => window.__cursor?.(x, y), { x, y });
    await p.mouse.move(x, y);
    await pause(70);
  }
}

// visible cursor, click ripple and caption bar (headless recordings have no cursor)
const OVERLAY = () => {
  const add = () => {
    if (document.getElementById("__demo_cursor")) return;
    const st = document.createElement("style");
    st.textContent = `#__demo_cursor{position:fixed;z-index:99999;width:22px;height:22px;margin:-4px 0 0 -4px;pointer-events:none;transition:left .35s ease,top .35s ease}
#__demo_cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}
#__demo_ring{position:fixed;z-index:99998;width:36px;height:36px;margin:-18px 0 0 -18px;border:2px solid #f0b90b;border-radius:50%;pointer-events:none;opacity:0}
#__demo_cap{position:fixed;z-index:99997;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(980px,86vw);padding:10px 18px;border-radius:10px;
background:rgba(7,13,26,.88);color:#f3f5fa;font:500 19px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s}`;
    document.head.appendChild(st);
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8-6.5 1.6L8.5 18z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    c.style.left = "60%"; c.style.top = "55%";
    const r = document.createElement("div"); r.id = "__demo_ring";
    const cap = document.createElement("div"); cap.id = "__demo_cap";
    document.body.append(c, r, cap);
    window.__cursor = (x, y) => { c.style.left = x + "px"; c.style.top = y + "px"; r.style.left = x + "px"; r.style.top = y + "px"; };
    window.__click = () => r.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.4)" }], { duration: 450 });
    window.__caption = (t) => { cap.textContent = t; cap.style.opacity = t ? "1" : "0"; };
    if (window.__lastCaption) window.__caption(window.__lastCaption);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
};

// ---------- 1. voice ----------
async function synth(text, i) {
  const base = path.join(WORK, `line${String(i).padStart(2, "0")}`);
  // a) Microsoft Edge neural voice (free, needs internet)
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const dir = base + "_edge";
    fs.mkdirSync(dir, { recursive: true });
    const { audioFilePath } = await Promise.race([
      tts.toFile(dir, text, { rate: "-4%" }),
      pause(30000).then(() => { throw new Error("timeout"); }),
    ]);
    tts.close?.();
    if (fs.statSync(audioFilePath).size > 2000) return { file: audioFilePath, engine: `Edge ${VOICE}` };
  } catch (e) {
    console.warn(`  Edge voice failed (${String(e.message || e).slice(0, 80)}), trying your computer's built-in voice`);
  }
  // b) the operating system's own voice
  const wav = base + ".wav";
  try {
    if (process.platform === "win32") {
      const txt = base + ".txt";
      fs.writeFileSync(txt, text, "utf8");
      const ps = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=0; $s.SetOutputToWaveFile('${wav}'); $s.Speak([IO.File]::ReadAllText('${txt}')); $s.Dispose()`;
      await run("powershell", ["-NoProfile", "-Command", ps]);
      return { file: wav, engine: "Windows voice" };
    }
    if (process.platform === "darwin") {
      const aiff = base + ".aiff";
      await run("say", ["-o", aiff, text]);
      return { file: aiff, engine: "macOS voice" };
    }
    await run("espeak-ng", ["-w", wav, text]);
    return { file: wav, engine: "espeak" };
  } catch {
    // c) silence of a reading-speed length; captions still carry the words
    const secs = Math.max(3, text.split(/\s+/).length / 2.6);
    await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(secs), wav]);
    return { file: wav, engine: "silent (captions only)" };
  }
}

async function durationOf(file) {
  const { stderr } = await run(ffmpegPath, ["-i", file], { maxBuffer: 1 << 20 }).catch((e) => e);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr || "");
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 : 6000;
}

// ---------- main ----------
async function main() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  console.log("1/3 Generating the voice-over…");
  const lines = [];
  for (let i = 0; i < SCENES.length; i++) {
    const a = await synth(SCENES[i].text, i);
    lines.push({ ...a, ms: await durationOf(a.file) });
    console.log(`  scene ${i + 1}: ${(lines[i].ms / 1000).toFixed(1)}s (${a.engine})`);
  }

  console.log(`2/3 Recording ${BASE} …`);
  let browser;
  if (process.env.DEMO_BROWSER) browser = await chromium.launch({ executablePath: process.env.DEMO_BROWSER });
  else {
    try { browser = await chromium.launch({ channel: "chrome" }); }
    catch { browser = await chromium.launch(); }
  }
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: WORK, size: { width: W, height: H } }, deviceScaleFactor: 1 });
  const t0 = Date.now();
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const starts = [];
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    starts.push(Date.now() - t0);
    const sceneStart = Date.now();
    const setCap = (t) => page.evaluate((t) => { window.__lastCaption = t; window.__caption?.(t); }, t).catch(() => {});
    const action = s.act(page).catch((e) => console.warn(`  scene ${i + 1}:`, String(e).split("\n")[0]));
    await pause(300);
    await setCap(s.text);
    await action;
    await setCap(s.text); // re-apply after a navigation
    if (s.waitFor) {
      console.log("  waiting for the AI answer…");
      await page.waitForSelector(s.waitFor, { timeout: 90000 }).catch(() => console.warn("  no answer within 90s; continuing"));
    }
    const left = lines[i].ms + 500 - (Date.now() - sceneStart);
    if (left > 0) await pause(left);
  }
  await page.evaluate(() => window.__caption?.("")).catch(() => {});
  await pause(1200);
  const total = Date.now() - t0;
  const video = page.video();
  await ctx.close();
  await browser.close();
  const webm = await video.path();

  console.log("3/3 Mixing voice and video…");
  const args = ["-y", "-i", webm];
  lines.forEach((l) => args.push("-i", l.file));
  const delays = lines.map((l, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${starts[i] + 300}|${starts[i] + 300}[a${i}]`);
  const mix = `${delays.join(";")};${lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad[aout]`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "deskmate-demo.mp4");
  args.push("-filter_complex", mix, "-map", "0:v", "-map", "[aout]", "-t", String(total / 1000),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out);
  await run(ffmpegPath, args, { maxBuffer: 1 << 24 });
  console.log(`\nDone: ${out}  (${(total / 1000).toFixed(0)}s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
