/**
 * MCP server factory: one `Server` per request/session bound to an Actor. Tools come from the
 * registry (src/server/mcp/tools/registry.ts); resources = boards; prompts = canned reports.
 * Every call is rate-limited per token, scope-checked and written to the audit trail.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema,
  ReadResourceRequestSchema, ErrorCode, McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Actor } from "@/lib/actor";
import { ServiceError } from "@/lib/errors";
import { ApiLimitError, chargeCall } from "@/server/platform/rate-limit";
import { assertWrite } from "@/server/platform/scope";
import { recordCall } from "@/server/services/api-tokens";
import { recordAudit } from "@/server/services/audit";
import { getMcpTool, listMcpTools } from "./tools/registry";
import { guardInputScope, isReadOnlyTool, normalizeArgs, NotAvailableError, toolAnnotations } from "./util";
import { getPrompt, listPrompts } from "./prompts";
import { listBoardResources, readBoardResource } from "./resources";

export const MCP_SERVER_INFO = { name: "weekend", version: "1.0.0" };

function toolJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    delete js.$schema;
    return js.type === "object" ? js : { type: "object", properties: {}, ...js };
  } catch {
    return { type: "object", additionalProperties: true };
  }
}

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return "Invalid arguments: " + err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  if (err instanceof ApiLimitError) return `${err.code}: ${err.message}`;
  if (err instanceof NotAvailableError) return err.message;
  if (err instanceof ServiceError) return `${err.code}: ${err.message}`;
  console.error("[mcp] unexpected tool error", err);
  return "Internal error while running the tool";
}

export interface McpOptions { /** audit channel name, default "mcp" */ channel?: "mcp" }

export function createMcpServer(actorIn: Actor): Server {
  const actor: Actor = { ...actorIn, source: "mcp" };
  const server = new Server(MCP_SERVER_INFO, {
    capabilities: { tools: {}, resources: {}, prompts: {} },
    instructions: "Weekend platform MCP server: boards, items, columns, workspaces, docs, dashboards, forms, automations, sprints and the GraphQL API. Use get_user_context first. To report a bug or request a feature for this app itself, use request_change.",
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMcpTools().map((t) => {
      const annotations = toolAnnotations(t);
      return { name: t.name, title: annotations.title, description: t.description, inputSchema: toolJsonSchema(t.inputSchema) as { type: "object" }, annotations };
    }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const def = getMcpTool(name);
    if (!def) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    const started = Date.now();
    const audit = (ok: boolean, error?: string, detail?: Record<string, unknown>) =>
      recordCall(actor, { channel: "mcp", name, ok, error, durationMs: Date.now() - started, detail });
    try {
      if (!isReadOnlyTool(def)) assertWrite(actor, `Tool ${name}`);
      chargeCall(actor, def.cost ?? 50);
      const args = normalizeArgs(req.params.arguments);
      const input = def.inputSchema.parse(args) as Record<string, unknown>;
      guardInputScope(actor, input);
      const result = await def.handler(actor, input);
      audit(true, undefined, { args: summarize(args) });
      if (!isReadOnlyTool(def)) recordAudit(actor, "mcp.call", { targetType: "mcp_tool", targetName: name, tool: name, tokenId: actor.token?.id, args: summarize(args) });
      return text(typeof result === "string" ? result : JSON.stringify(result ?? { ok: true }, null, 2));
    } catch (err) {
      const msg = errorMessage(err);
      audit(false, msg, { args: summarize(normalizeArgs(req.params.arguments)) });
      return text(msg, true);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listBoardResources(actor) }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => ({ contents: [readBoardResource(actor, req.params.uri)] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: listPrompts() }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => getPrompt(actor, req.params.name, (req.params.arguments ?? {}) as Record<string, string>));
  return server;
}

/** Audit detail without huge payloads. */
function summarize(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    out[k] = s && s.length > 200 ? `${s.slice(0, 200)}...` : v;
  }
  return out;
}
