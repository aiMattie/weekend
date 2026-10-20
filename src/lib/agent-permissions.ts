/**
 * Permission limit for AI agent actors (module ai). An agent actor (`actor.agent`) can only touch the
 * boards it was granted ("knowledge": read or write). `decide()` calls `agentAllows()` first and then
 * continues with the normal rules, so an agent never gets more than a member could, only less.
 * Pure (no I/O): covered by tests/ai/agents.test.ts.
 */
import type { Actor } from "./actor";
import type { Action, DecideCtx } from "./permissions";

export function agentAllows(actor: Actor, action: Action, ctx: DecideCtx): boolean {
  const scope = actor.agent;
  if (!scope) return true;
  if (action.startsWith("account:")) return false;
  if (action.startsWith("workspace:")) return action === "workspace:view";
  const boardId = ctx.board?.id;
  if (!boardId) return false;
  const grant = scope.grants.find((g) => g.kind === "board" && g.id === boardId);
  if (!grant) return false;
  if (action === "board:view" || action === "column:view") return true;
  // write = items, values and updates; agents never change board structure, delete boards or manage members
  return grant.access === "write" && (action === "board:edit_items" || action === "board:comment" || action === "column:edit");
}
