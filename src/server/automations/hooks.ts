/**
 * Hook functions other modules register for automation actions (kept on globalThis so every Next
 * bundle sees them). Example: the migration module registers "create_client_workspace":
 *
 *   import { registerAutomationHook } from "@/server/automations/hooks";
 *   registerAutomationHook("create_client_workspace", async ({ actor, name, sourceItemId }) => ({ workspaceId }));
 */
import type { Actor } from "../../lib/actor";

export interface ClientWorkspaceHookInput { actor: Actor; name: string; sourceItemId: string | null; sourceBoardId: string | null; templateKey?: string }
export interface ClientWorkspaceHookResult { workspaceId: string; name?: string }

export interface AutomationHooks {
  create_client_workspace: (input: ClientWorkspaceHookInput) => Promise<ClientWorkspaceHookResult> | ClientWorkspaceHookResult;
}

const g = globalThis as unknown as { __automationHooks?: Partial<AutomationHooks> };
const store = (): Partial<AutomationHooks> => (g.__automationHooks ??= {});

export function registerAutomationHook<K extends keyof AutomationHooks>(name: K, fn: AutomationHooks[K]): void { store()[name] = fn; }
export function getAutomationHook<K extends keyof AutomationHooks>(name: K): AutomationHooks[K] | undefined { return store()[name]; }
export function hasAutomationHook(name: keyof AutomationHooks): boolean { return !!store()[name]; }
