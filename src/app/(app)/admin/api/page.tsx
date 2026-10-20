import { headers } from "next/headers";
import { requireUser, userToActor } from "@/lib/auth";
import { ApiPage } from "@/modules/platform/ui/api-page";
import { isReadOnlyTool } from "@/server/mcp/util";
import { listMcpTools } from "@/server/mcp/tools/registry";
import { limits } from "@/server/platform/rate-limit";
import { apiTokens, boards, workspaces } from "@/server/services";
import { usageForTokens } from "@/server/services/api-tokens";
import { listGrants } from "@/server/services/oauth";

export const dynamic = "force-dynamic";

/** API tokens, GraphQL explorer, MCP connection instructions and webhooks. */
export default async function Page() {
  const actor = userToActor(await requireUser());
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3058";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = (process.env.PUBLIC_URL ?? `${proto}://${host}`).replace(/\/$/, "");
  const tokens = apiTokens.list(actor);
  const usage = usageForTokens(tokens.map((t) => t.id));
  const ws = workspaces.list(actor);
  const bs = boards.list(actor);
  const props = {
    baseUrl, isAdmin: actor.role === "admin",
    tokens: tokens.map((t) => ({ ...t, usedToday: usage[t.id]?.used ?? 0, callsToday: usage[t.id]?.calls ?? 0 })),
    workspaces: ws.map((w) => ({ id: w.id, name: w.name })),
    boards: bs.map((b) => ({ id: b.id, name: b.name })),
    tools: listMcpTools().map((t) => ({ name: t.name, description: t.description, readOnly: isReadOnlyTool(t) })),
    defaultBudget: limits().daily,
    firstBoardId: bs[0]?.id ?? null,
    connectedApps: listGrants(actor),
  };
  return <ApiPage {...JSON.parse(JSON.stringify(props))} />;
}
