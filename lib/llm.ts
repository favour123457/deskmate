// One OpenAI-compatible client for every provider. Switching provider = changing env vars.
export type Provider = { id: string; baseUrl: string; model: string; apiKey: string };

const PRESETS: Record<string, { baseUrl: string; model: string; keyEnv: string }> = {
  qwen: { baseUrl: "https://hackathon.bitgetops.com/v1", model: "qwen3.8-max", keyEnv: "BITGET_QWEN_API_KEY" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash,gemini-3.5-flash-lite", keyEnv: "GEMINI_API_KEY" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyEnv: "GROQ_API_KEY" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", keyEnv: "DEEPSEEK_API_KEY" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat-v3.1:free", keyEnv: "OPENROUTER_API_KEY" },
  custom: { baseUrl: "", model: "", keyEnv: "LLM_API_KEY" },
};
const DEFAULT_ORDER = ["qwen", "gemini", "deepseek", "groq", "openrouter", "custom"];

export function providers(): Provider[] {
  const order = (process.env.LLM_PROVIDERS || DEFAULT_ORDER.join(","))
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: Provider[] = [];
  for (const id of order) {
    const p = PRESETS[id];
    if (!p) continue;
    const up = id.toUpperCase();
    const apiKey = process.env[p.keyEnv] || "";
    const baseUrl = (id === "custom" ? process.env.LLM_BASE_URL : process.env[`${up}_BASE_URL`]) || p.baseUrl;
    const model = (id === "custom" ? process.env.LLM_MODEL : process.env[`${up}_MODEL`]) || p.model;
    if (!apiKey || !baseUrl || !model) continue;
    // A comma-separated model list gives same-provider fallbacks, e.g. "gemini-3.5-flash,gemini-3.5-flash-lite".
    for (const m of model.split(",").map((s) => s.trim()).filter(Boolean)) {
      out.push({ id, baseUrl: baseUrl.replace(/\/$/, ""), model: m, apiKey });
    }
  }
  return out;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export class LlmError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Models whose daily quota is used up are skipped until the provider says the quota resets (per server instance).
const cooldown = new Map<string, number>();

function dailyQuotaReset(text: string): number | null {
  if (!/PerDay|per day|daily/i.test(text)) return null;
  const m = text.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  const ms = m ? ((Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)) * 1000 : 3600_000;
  return Date.now() + Math.min(Math.max(ms, 60_000), 24 * 3600_000);
}

export async function chat(p: Provider, messages: ChatMessage[], tools?: ToolDef[]) {
  const key = `${p.id}:${p.model}`;
  if ((cooldown.get(key) || 0) > Date.now()) throw new LlmError(`${p.id} ${p.model}: daily quota used up, skipping until it resets`, 429);
  const body: Record<string, unknown> = { model: p.model, messages, temperature: 0.2 };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const send = () =>
    fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS) || 35_000),
    });
  let res = await send();
  let text = await res.text();
  // Overloaded / per-minute rate limit: one retry after 1-2 s before the caller falls back to the next provider.
  // A used-up daily quota won't recover in seconds: skip the retry and park the model until it resets.
  if (res.status === 429 || res.status === 503) {
    const reset = res.status === 429 ? dailyQuotaReset(text) : null;
    if (reset) cooldown.set(key, reset);
    else {
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
      res = await send();
      text = await res.text();
    }
  }
  if (!res.ok) throw new LlmError(`${p.id} ${res.status}: ${text.slice(0, 300)}`, res.status);
  const json = JSON.parse(text);
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new LlmError(`${p.id}: empty response`, 500);
  return {
    content: (msg.content as string | null) ?? null,
    toolCalls: (msg.tool_calls as ToolCall[] | undefined) ?? [],
  };
}
