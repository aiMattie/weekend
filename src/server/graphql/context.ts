import type { Actor } from "@/lib/actor";
import { NotFoundError } from "@/lib/errors";
import { formatContext, type ColumnRow } from "@/server/services/_shared";
import type { FormatContext } from "@/server/columns/types";
import * as columnsService from "@/server/services/columns";
import * as usersService from "@/server/services/users";
import type { ComplexityReport } from "@/server/platform/rate-limit";

export interface GqlContext {
  actor: Actor;
  /** filled by the complexity plugin before execution */
  report?: ComplexityReport;
  /** shared by reference with the HTTP layer (the yoga context object is copied), carries `report` */
  holder: { report?: ComplexityReport };
  requestId: string;
  cache: Map<string, unknown>;
}

export function newContext(actor: Actor): GqlContext {
  return { actor, holder: {}, requestId: crypto.randomUUID(), cache: new Map() };
}

export function memo<T>(ctx: GqlContext, key: string, fn: () => T): T {
  if (ctx.cache.has(key)) return ctx.cache.get(key) as T;
  const v = fn();
  ctx.cache.set(key, v);
  return v;
}

export const boardColumns = (ctx: GqlContext, boardId: string): ColumnRow[] => memo(ctx, `cols:${boardId}`, () => columnsService.list(ctx.actor, boardId));
export const fmtCtx = (ctx: GqlContext): FormatContext => memo(ctx, "fmt", () => formatContext(ctx.actor.accountId));

export function userById(ctx: GqlContext, id: string | null | undefined): usersService.User | null {
  if (!id) return null;
  return memo(ctx, `user:${id}`, () => {
    try { return usersService.get(ctx.actor, id); } catch (e) { if (e instanceof NotFoundError) return null; throw e; }
  });
}
