import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import type { GroupRow } from "@/server/services/_shared";
import { assertBoardInScope, assertItemInScope, assertWrite } from "@/server/platform/scope";
import type { Actor } from "@/lib/actor";
import { guard, type ErrorHint } from "../errors";
import type { GqlContext } from "../context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Args = Record<string, any>;
export type Ctx = GqlContext;

/** Resolve a group by id, or by title (case-insensitive) as a convenience for scripts. */
export function resolveGroup(actor: Actor, boardId: string, ref: string | null | undefined): GroupRow | null {
  if (ref === null || ref === undefined || ref === "") return null;
  const groups = services.groups.list(actor, boardId);
  const hit = groups.find((g) => g.id === String(ref)) ?? groups.find((g) => g.title.toLowerCase() === String(ref).toLowerCase());
  if (!hit) throw new ValidationError(`Group "${ref}" not found on board ${boardId}`);
  return hit;
}

/** A mutation: requires write scope; `boardArg`/`itemArg` name the args that must be inside the token's workspace scope. */
export function mutation<R>(fn: (a: Args, ctx: Ctx) => R, opts: { boardArg?: string; itemArg?: string; hint?: ErrorHint } = {}) {
  return guard((_root: unknown, a: Args, ctx: Ctx): R => {
    assertWrite(ctx.actor);
    if (opts.boardArg && a[opts.boardArg] !== undefined && a[opts.boardArg] !== null) assertBoardInScope(ctx.actor, String(a[opts.boardArg]));
    if (opts.itemArg && a[opts.itemArg] !== undefined && a[opts.itemArg] !== null) assertItemInScope(ctx.actor, String(a[opts.itemArg]));
    return fn(a, ctx);
  }, opts.hint);
}

/** Item that must belong to `board_id` when both are given. */
export function itemOnBoard(ctx: Ctx, itemId: string | null | undefined, boardId: string | null | undefined) {
  if (!itemId) throw new ValidationError("item_id is required");
  const it = services.items.get(ctx.actor, String(itemId));
  if (boardId && it.boardId !== String(boardId)) throw new ValidationError(`Item ${itemId} is not on board ${boardId}`);
  return it;
}
