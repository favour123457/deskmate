// Setup check: run `npm run check` on your laptop. Verifies Bitget REST, Bitget MCP and your LLM key(s).
import fs from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// --- load .env.local (no dependency needed)
for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ok = (s) => console.log(`  \x1b[32m✔\x1b[0m ${s}`);
const bad = (s) => console.log(`  \x1b[31m✘\x1b[0m ${s}`);
const info = (s) => console.log(`    ${s}`);
const BITGET = process.env.BITGET_API_BASE || "https://api.bitget.com";
const MCP = process.env.BITGET_MCP_URL || "https://agent.bitget.com/mcp";
let failures = 0;

async function j(url, opts = {}) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(45000) });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
}

console.log("\n1) Bitget public market data (REST)");
try {
  const btc = await j(`${BITGET}/api/v2/spot/market/tickers?symbol=BTCUSDT`);
  if (btc.body?.code === "00000") ok(`BTCUSDT = ${btc.body.data[0].lastPr}`);
  else { bad(`BTC ticker: ${JSON.stringify(btc.body).slice(0, 200)}`); failures++; }

  const syms = await j(`${BITGET}/api/v2/spot/public/symbols`);
  const rtokens = (syms.body?.data || [])
    .filter((s) => /^R[A-Z]{1,6}USDT$/.test(s.symbol) && s.status === "online")
    .map((s) => "r" + s.symbol.slice(1, -4));
  if (rtokens.length) {
    ok(`${rtokens.length} tokenized-stock-looking spot pairs online`);
    info(rtokens.slice(0, 60).join(", "));
  } else bad("No R*USDT spot pairs found — check the symbol naming on bitget.com");

  const nvda = await j(`${BITGET}/api/v2/spot/market/tickers?symbol=RNVDAUSDT`);
  if (nvda.body?.code === "00000" && nvda.body.data?.length) ok(`rNVDA (RNVDAUSDT) = ${nvda.body.data[0].lastPr}`);
  else bad(`rNVDA spot not found: ${JSON.stringify(nvda.body).slice(0, 160)}`);
  const perp = await j(`${BITGET}/api/v2/mix/market/ticker?symbol=NVDAUSDT&productType=USDT-FUTURES`);
  if (perp.body?.code === "00000" && perp.body.data?.length) ok(`NVDA perp (NVDAUSDT futures) = ${perp.body.data[0].lastPr}`);
  else info(`NVDA perp not found (fine if you only use rTokens)`);
} catch (e) {
  bad(`Bitget REST unreachable: ${e.message}`);
  failures++;
}

console.log(`\n2) Bitget MCP data server (${MCP})`);
try {
  const client = new Client({ name: "deskmate-check", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP)));
  const { tools } = await client.listTools();
  ok(`connected — ${tools.length} tools`);
  for (const t of tools) info(`${t.name}: ${(t.description || "").split("\n")[0].slice(0, 90)}`);
  fs.writeFileSync("mcp-tools.json", JSON.stringify(tools, null, 2));
  info("full schemas saved to mcp-tools.json");
  await client.close();
} catch (e) {
  bad(`MCP connect failed: ${e.message}`);
  info("The app still works without it (prices + maths), but loses fundamentals/news.");
}

console.log("\n3) LLM providers");
const PRESETS = {
  qwen: ["BITGET_QWEN_API_KEY", "https://hackathon.bitgetops.com/v1", "qwen3.8-max"],
  gemini: ["GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3.5-flash"],
  groq: ["GROQ_API_KEY", "https://api.groq.com/openai/v1", "openai/gpt-oss-120b"],
  deepseek: ["DEEPSEEK_API_KEY", "https://api.deepseek.com/v1", "deepseek-chat"],
  openrouter: ["OPENROUTER_API_KEY", "https://openrouter.ai/api/v1", "deepseek/deepseek-chat-v3.1:free"],
  custom: ["LLM_API_KEY", process.env.LLM_BASE_URL || "", process.env.LLM_MODEL || ""],
};
let anyLlm = false;
for (const [id, [keyEnv, base0, model0]] of Object.entries(PRESETS)) {
  const key = process.env[keyEnv];
  if (!key) continue;
  const up = id.toUpperCase();
  const base = (id === "custom" ? base0 : process.env[`${up}_BASE_URL`] || base0).replace(/\/$/, "");
  const model = id === "custom" ? model0 : (process.env[`${up}_MODEL`] || model0).split(",")[0].trim();
  console.log(`  - ${id} (${model})`);
  try {
    let names = [];
    try {
      const models = await j(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
      names = (models.body?.data || []).map((m) => m.id);
    } catch { /* some providers don't list models */ }
    if (names.length) info(`${names.length} models available, e.g. ${names.slice(0, 8).join(", ")}`);
    const r = await j(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "What is the BTC price? Use the tool." }],
        tools: [{ type: "function", function: { name: "get_price", description: "price", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } }],
      }),
    });
    const msg = r.body?.choices?.[0]?.message;
    if (msg?.tool_calls?.length) { ok(`works, and tool-calling works (called ${msg.tool_calls[0].function.name})`); anyLlm = true; }
    else if (msg) { bad(`answered but did NOT call the tool — pick a model with tool/function calling`); anyLlm = true; }
    else { bad(`HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 220)}`); if (names.length && !names.includes(model)) info(`model "${model}" not in list — set ${up}_MODEL in .env.local`); }
  } catch (e) {
    bad(`${id}: ${e.message}`);
  }
}
if (!anyLlm) { bad("No working LLM key. Add one to .env.local (see .env.example)."); failures++; }

console.log(failures ? `\n${failures} blocking problem(s) above.\n` : "\nAll good — run `npm run dev` and open http://localhost:3000\n");
process.exit(failures ? 1 : 0);
