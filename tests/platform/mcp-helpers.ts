import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Actor } from "../../src/lib/actor";
import { createMcpServer } from "../../src/server/mcp/server";
import * as apiTokens from "../../src/server/services/api-tokens";
import { resetRateLimits } from "../../src/server/platform/rate-limit";

/** In-process MCP client bound to an actor (token actor when `tokenInput` is given). */
export async function mcpClient(actor: Actor, tokenInput?: Record<string, unknown>) {
  resetRateLimits();
  let bound = actor;
  if (tokenInput) {
    const { token } = apiTokens.create(actor, { name: "mcp-test", ...tokenInput });
    bound = apiTokens.authenticate(token)!;
  }
  const server = createMcpServer(bound);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text: string }[])[0]?.text ?? "";
    let json: any = undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { /* plain text */ }
    return { isError: !!r.isError, text, json };
  };
  return { client, call, close: async () => { await client.close(); await server.close(); } };
}
