/**
 * Token scoping shared by GraphQL and MCP: read/write scopes and the optional workspace
 * restriction of an API token. Session users (no `actor.token`) are never restricted here;
 * the permission rules of the services still apply to everybody.
 */
import type { Actor } from "@/lib/actor";
import { ForbiddenError } from "@/lib/errors";
import { getBoardRow, getItemRow } from "@/server/services/_shared";

export function canRead(actor: Actor): boolean {
  return !actor.token || actor.token.scopes.includes("read") || actor.token.scopes.includes("write");
}

export function canWrite(actor: Actor): boolean {
  return !actor.token || actor.token.scopes.includes("write");
}

export function assertWrite(actor: Actor, what = "This operation"): void {
  if (!canWrite(actor)) throw new ForbiddenError(`${what} needs a token with write scope`);
}

export function assertRead(actor: Actor): void {
  if (!canRead(actor)) throw new ForbiddenError("This token has no read scope");
}

export const hasWorkspaceLimit = (actor: Actor): boolean => !!actor.token?.workspaceIds;

export function inWorkspaceScope(actor: Actor, workspaceId: string | null | undefined): boolean {
  const limit = actor.token?.workspaceIds;
  if (!limit) return true;
  return !!workspaceId && limit.includes(workspaceId);
}

export function assertWorkspaceInScope(actor: Actor, workspaceId: string | null | undefined): void {
  if (!inWorkspaceScope(actor, workspaceId)) throw new ForbiddenError("This token is restricted to other workspaces");
}

export function assertBoardInScope(actor: Actor, boardId: string): void {
  if (!actor.token?.workspaceIds) return;
  assertWorkspaceInScope(actor, getBoardRow(boardId).workspaceId);
}

export function assertItemInScope(actor: Actor, itemId: string): void {
  if (!actor.token?.workspaceIds) return;
  assertBoardInScope(actor, getItemRow(itemId).boardId);
}

export const filterByWorkspace = <T extends { workspaceId?: string | null; id?: string }>(actor: Actor, rows: T[], key: "workspaceId" | "id" = "workspaceId"): T[] =>
  actor.token?.workspaceIds ? rows.filter((r) => inWorkspaceScope(actor, key === "id" ? r.id : r.workspaceId)) : rows;
