import { ForbiddenError, NotFoundError } from "@/lib/errors";
import * as services from "@/server/services";
import * as webhooksService from "@/server/services/webhooks";
import { assertBoardInScope, assertRead, assertWorkspaceInScope, filterByWorkspace, inWorkspaceScope } from "@/server/platform/scope";
import { limits } from "@/server/platform/rate-limit";
import { type GqlContext, userById } from "../context";
import { guard } from "../errors";
import { decodeCursor, pageItems } from "../items-query";

type Ctx = GqlContext;
const page = (limit?: number | null, pg?: number | null, def = 25) => {
  const l = Math.max(1, Math.min(limit ?? def, 500));
  return { l, off: (Math.max(1, pg ?? 1) - 1) * l };
};
const skipMissing = <T>(ids: string[], fn: (id: string) => T): NonNullable<T>[] => {
  const out: NonNullable<T>[] = [];
  for (const id of ids) {
    try { const v = fn(id); if (v) out.push(v as NonNullable<T>); } catch (e) { if (!(e instanceof NotFoundError || e instanceof ForbiddenError)) throw e; }
  }
  return out;
};

type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const Query = {
  me: guard((_r: unknown, _a: Args, ctx: Ctx) => { assertRead(ctx.actor); return userById(ctx, ctx.actor.id); }),
  account: guard((_r: unknown, _a: Args, ctx: Ctx) => ({ id: ctx.actor.accountId })),
  users: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    let rows = services.users.list(ctx.actor, { includeInactive: false });
    if (a.ids?.length) rows = rows.filter((u) => a.ids.map(String).includes(u.id));
    if (a.emails?.length) rows = rows.filter((u) => a.emails.map((e: string) => e.toLowerCase()).includes(u.email.toLowerCase()));
    if (a.name) rows = rows.filter((u) => u.name.toLowerCase().includes(String(a.name).toLowerCase()));
    if (a.kind === "guests") rows = rows.filter((u) => u.role === "guest");
    if (a.kind === "non_guests") rows = rows.filter((u) => u.role !== "guest");
    if (a.newest_first) rows = [...rows].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    if (a.limit) { const { l, off } = page(a.limit, a.page, 500); rows = rows.slice(off, off + l); }
    return rows;
  }),
  teams: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const rows = services.users.listTeams(ctx.actor);
    return a.ids?.length ? rows.filter((t) => a.ids.map(String).includes(t.id)) : rows;
  }),
  workspaces: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    let rows = filterByWorkspace(ctx.actor, services.workspaces.list(ctx.actor).map((w) => ({ ...w, workspaceId: w.id })), "id");
    if (a.ids?.length) rows = rows.filter((w) => a.ids.map(String).includes(w.id));
    if (a.kind) rows = rows.filter((w) => w.kind === a.kind);
    if (a.state && a.state !== "active" && a.state !== "all") rows = [];
    if (a.order_by === "created_at") rows = [...rows].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    const { l, off } = page(a.limit, a.page);
    return rows.slice(off, off + l);
  }),
  folders: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const wsIds = a.workspace_ids?.length ? a.workspace_ids.map(String) : services.workspaces.list(ctx.actor).map((w) => w.id);
    let rows: ReturnType<typeof services.folders.list> = [];
    for (const id of wsIds as string[]) if (inWorkspaceScope(ctx.actor, id)) rows = rows.concat(skipMissing([id], (x) => services.folders.list(ctx.actor, x)).flat());
    if (a.ids?.length) rows = rows.filter((f) => a.ids.map(String).includes(f.id));
    const { l, off } = page(a.limit, a.page);
    return rows.slice(off, off + l);
  }),
  boards: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const state = a.state === "archived" ? "archived" : "active";
    let rows: ReturnType<typeof services.boards.list>;
    if (a.ids?.length) {
      // explicit ids: unknown or forbidden ids are skipped, `state` still filters
      rows = skipMissing((a.ids as unknown[]).map(String), (id) => { const b = services.boards.get(ctx.actor, id); assertWorkspaceInScope(ctx.actor, b.workspaceId); return b; });
      if (a.state !== "all") rows = rows.filter((b) => b.state === (a.state ?? "active"));
    } else {
      rows = a.state === "all"
        ? [...services.boards.list(ctx.actor, { state: "active" }), ...services.boards.list(ctx.actor, { state: "archived" })]
        : a.state === "deleted" ? [] : services.boards.list(ctx.actor, { state });
      rows = filterByWorkspace(ctx.actor, rows);
    }
    if (a.workspace_ids?.length) rows = rows.filter((b) => a.workspace_ids.map(String).includes(b.workspaceId));
    if (a.board_kind) rows = rows.filter((b) => b.visibility === a.board_kind);
    if (a.order_by === "created_at" || a.newest_first) rows = [...rows].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    if (a.order_by === "used_at") rows = [...rows].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    const { l, off } = page(a.limit, a.page);
    return rows.slice(off, off + l);
  }),
  items: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const ids = (a.ids ?? []).map(String) as string[];
    let rows = skipMissing(ids, (id) => {
      const it = services.items.get(ctx.actor, id);
      assertBoardInScope(ctx.actor, it.boardId);
      return it;
    });
    if (a.exclude_nonactive) rows = rows.filter((r) => r.state === "active");
    if (a.newest_first) rows = [...rows].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    const { l, off } = page(a.limit, a.page, 25);
    return rows.slice(off, off + l);
  }),
  items_page_by_column_values: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    if (a.cursor) return pageItems(ctx.actor, decodeCursor(a.cursor), a.limit ?? 25);
    assertBoardInScope(ctx.actor, String(a.board_id));
    services.boards.get(ctx.actor, String(a.board_id));
    return pageItems(ctx.actor, { boardId: String(a.board_id), offset: 0, params: null, byValues: a.columns ?? [] }, a.limit ?? 25);
  }),
  next_items_page: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const st = decodeCursor(a.cursor);
    assertBoardInScope(ctx.actor, st.boardId);
    return pageItems(ctx.actor, st, a.limit ?? 25);
  }),
  updates: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const boards = filterByWorkspace(ctx.actor, services.boards.list(ctx.actor));
    const { l, off } = page(a.limit, a.page);
    let out = boards.flatMap((b) => services.items.list(ctx.actor, { boardId: b.id, limit: 5000 })).flatMap((i) => services.updates.list(ctx.actor, i.id));
    out = out.flatMap((u) => [u, ...u.replies]);
    if (a.ids?.length) out = out.filter((u) => a.ids.map(String).includes(u.id));
    if (a.from_date) out = out.filter((u) => u.createdAt >= a.from_date);
    if (a.to_date) out = out.filter((u) => u.createdAt <= a.to_date);
    return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(off, off + l);
  }),
  assets: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    return skipMissing(a.ids.map(String), (id) => services.assets.get(ctx.actor, id));
  }),
  docs: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const wsIds: string[] = a.workspace_ids?.length ? a.workspace_ids.map(String) : services.workspaces.list(ctx.actor).map((w) => w.id);
    let rows = wsIds.filter((id) => inWorkspaceScope(ctx.actor, id)).flatMap((id) => services.docs.list(ctx.actor, { workspaceId: id }));
    const ids = (a.ids ?? a.object_ids)?.map(String);
    if (ids?.length) rows = rows.filter((d) => ids.includes(d.id));
    const { l, off } = page(a.limit, a.page);
    return rows.slice(off, off + l);
  }),
  webhooks: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    assertBoardInScope(ctx.actor, String(a.board_id));
    return webhooksService.list(ctx.actor, { boardId: String(a.board_id) });
  }),
  tags: guard((_r: unknown, a: Args, ctx: Ctx) => {
    assertRead(ctx.actor);
    const rows = services.tags.list(ctx.actor);
    return a.ids?.length ? rows.filter((t) => a.ids.map(String).includes(t.id)) : rows;
  }),
  complexity: (_r: unknown, _a: Args, ctx: Ctx) => ctx.report ? { query: ctx.report.query, before: ctx.report.before, after: ctx.report.after, reset_in_x_seconds: ctx.report.reset_in_x_seconds } : { query: 0, before: limits().perMinute, after: limits().perMinute, reset_in_x_seconds: 60 },
  version: () => ({ display_name: "2025-10", kind: "current", value: "2025-10" }),
  versions: () => [
    { display_name: "2025-10", kind: "current", value: "2025-10" },
    { display_name: "2025-07", kind: "maintenance", value: "2025-07" },
    { display_name: "2025-04", kind: "maintenance", value: "2025-04" },
  ],
};
