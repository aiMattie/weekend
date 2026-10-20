/**
 * MCP tool registry. The MCP server (src/app/api/mcp, owned by `platform`) exposes everything in
 * this list. ADD A TOOL: create `src/server/mcp/tools/<module>.ts` exporting `McpToolDefinition[]`
 * and spread it into `tools` below (one import + one line).
 */
import type { McpToolDefinition } from "./types";
import { boardTools } from "./platform-boards";
import { workspaceTools } from "./platform-workspaces";
import { extraTools } from "./platform-extra";
import { apiTools } from "./platform-api";
import { dataTools } from "./platform-data";
import { moreTools } from "./platform-more";
import { devRequestTools } from "./dev-requests";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tools: McpToolDefinition<any>[] = [
  ...boardTools,
  ...workspaceTools,
  ...extraTools,
  ...apiTools,
  ...dataTools,
  ...moreTools,
  ...devRequestTools,
  // ...boardTools,   <- add `...<module>Tools` above this line
];

export const listMcpTools = () => [...tools];
export const getMcpTool = (name: string) => tools.find((t) => t.name === name);
export type { McpToolDefinition } from "./types";
