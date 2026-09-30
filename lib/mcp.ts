// Client for Bitget's read-only US stock / ETF data MCP server (no key needed).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.BITGET_MCP_URL || "https://agent.bitget.com/mcp";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

let conn: { client: Client; tools: McpTool[]; at: number } | null = null;
let lastError: string | null = null;

async function connect() {
  const client = new Client({ name: "deskmate", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await Promise.race([
    client.connect(transport),
    new Promise((_, rej) => setTimeout(() => rej(new Error("MCP connect timeout")), 10_000)),
  ]);
  const { tools } = await client.listTools();
  conn = {
    client,
    at: Date.now(),
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: (t.inputSchema as Record<string, unknown>) || { type: "object", properties: {} },
    })),
  };
  lastError = null;
  return conn;
}

export async function mcpTools(): Promise<McpTool[]> {
  if (process.env.BITGET_MCP_DISABLED === "1") return [];
  try {
    if (!conn || Date.now() - conn.at > 10 * 60_000) await connect();
    return conn!.tools;
  } catch (e) {
    conn = null;
    lastError = (e as Error).message;
    return [];
  }
}

export function mcpLastError() {
  return lastError;
}

function textOf(result: unknown): string {
  const r = result as { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };
  const text = (r.content || []).filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
  const body = text || (r.structuredContent ? JSON.stringify(r.structuredContent) : JSON.stringify(result));
  return r.isError ? `ERROR: ${body}` : body;
}

export async function callMcp(name: string, args: Record<string, unknown>): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!conn) await connect();
      const res = await conn!.client.callTool({ name, arguments: args });
      return textOf(res);
    } catch (e) {
      conn = null; // stale session (common on serverless) -> reconnect once
      if (attempt === 1) throw e;
    }
  }
  throw new Error("unreachable");
}
