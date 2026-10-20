import type { AccountRole } from "../db/schema/core";

/**
 * Who is performing an action. Every service function takes an Actor as first argument.
 * - Humans: built from the session (getCurrentUser) or an API token (bearer hook).
 * - `systemActor()` is used by automations, importers, seed and scripts; it bypasses permissions.
 */
export interface Actor {
  id: string;
  accountId: string;
  role: AccountRole;
  name?: string;
  email?: string;
  /** true for automations/importers: skips permission checks, activity rows get userId = null */
  isSystem?: boolean;
  /** where the change came from, stored in activity data (ui | api | mcp | automation | import) */
  source?: "ui" | "api" | "graphql" | "mcp" | "automation" | "import" | "system" | "ai" | "agent";
  /** set when the actor authenticated with an API token (platform module): scopes + workspace limits */
  /** ai module: set for AI agent runs; `decide()` limits the actor to the granted boards (see agent-permissions.ts) */
  agent?: { id: string; grants: { kind: "board" | "doc"; id: string; access: "read" | "write" }[] };
  token?: { id: string; scopes: ("read" | "write")[]; workspaceIds: string[] | null; dailyBudget: number | null };
}

export function systemActor(accountId: string, source: Actor["source"] = "system"): Actor {
  return { id: "system", accountId, role: "admin", isSystem: true, source, name: "System" };
}
