/** Importer steps for structure: users, teams, workspaces, folders, boards (groups, columns, views). */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { boardMembers, boards, columns, folders, groups, teamMembers, teams, users, views, workspaces } from "../../../db/schema/core";
import { getColumnLogic } from "../../columns/registry";
import { insertColumnRow } from "../columns";
import { insertViewRow } from "../views";
import { getViewType } from "../../views/registry";
import { hashOf, type Tracker } from "./refs";
import type { MBoard, MondaySnapshot } from "./monday-types";
import { planColumn, translateFormula, type PlanColumn } from "./monday-values";

export interface ImportEnv { accountId: string; tracker: Tracker; snap: MondaySnapshot; adoptBoards: boolean }
/** per clone board: item-scope + subitem-scope plans */
export type BoardPlans = Map<string, { board: MBoard; plans: PlanColumn[] }>;

const roleOf = (u: MondaySnapshot["users"][number]) => (u.is_admin ? "admin" : u.is_guest ? "guest" : u.is_view_only ? "viewer" : "member") as "admin" | "guest" | "viewer" | "member";
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function importUsers(env: ImportEnv): void {
  const { tracker, accountId } = env;
  for (const u of env.snap.users) {
    const email = u.email.trim().toLowerCase();
    tracker.upsert("user", u.id, hashOf([u.name, email, u.title, u.phone, u.enabled, roleOf(u)]), u.name, {
      adopt: () => (db.select().from(users).where(and(eq(users.accountId, accountId), sql`lower(${users.email}) = ${email}`)).get()
        ?? db.select().from(users).where(and(eq(users.accountId, accountId), sql`lower(${users.name}) = ${u.name.trim().toLowerCase()}`)).get())?.id,
      exists: (id) => !!db.select().from(users).where(eq(users.id, id)).get(),
      create: () => db.insert(users).values({ accountId, name: u.name, email, title: u.title, phone: u.phone ?? null, role: roleOf(u), isActive: u.enabled, timeZone: u.time_zone_identifier || "Europe/Amsterdam" }).returning().get().id,
      update: (id) => {
        const patch: Partial<typeof users.$inferInsert> = { name: u.name, title: u.title ?? undefined, phone: u.phone ?? undefined };
        const clash = db.select().from(users).where(sql`lower(${users.email}) = ${email}`).get();
        if (!clash || clash.id === id) patch.email = email;
        else tracker.warn(`user ${u.name}: e-mail already used by another clone user, kept`);
        db.update(users).set(patch).where(eq(users.id, id)).run();
      },
    });
  }
}

export function importTeams(env: ImportEnv): void {
  const { tracker, accountId } = env;
  for (const t of env.snap.teams) {
    const members = (t.users ?? []).map((m) => tracker.lookup("user", m.id)).filter((x): x is string => !!x && !tracker.isPlaceholder(x));
    const setMembers = (teamId: string) => {
      db.delete(teamMembers).where(eq(teamMembers.teamId, teamId)).run();
      const owners = new Set((t.owners ?? []).map((o) => tracker.lookup("user", o.id)));
      for (const uid of members) db.insert(teamMembers).values({ teamId, userId: uid, isOwner: owners.has(uid) }).onConflictDoNothing().run();
    };
    tracker.upsert("team", t.id, hashOf([t.name, (t.users ?? []).map((m) => m.id).sort()]), t.name, {
      adopt: () => db.select().from(teams).where(and(eq(teams.accountId, accountId), eq(teams.name, t.name))).get()?.id,
      exists: (id) => !!db.select().from(teams).where(eq(teams.id, id)).get(),
      create: () => { const id = db.insert(teams).values({ accountId, name: t.name }).returning().get().id; setMembers(id); return id; },
      update: (id) => { db.update(teams).set({ name: t.name }).where(eq(teams.id, id)).run(); setMembers(id); },
    });
  }
}

export function importWorkspaces(env: ImportEnv): void {
  const { tracker, accountId } = env;
  const list = [...env.snap.workspaces, ...(env.snap.boards.some((b) => !b.workspace) ? [{ id: "main", name: "Main workspace", kind: "open", state: "active", description: null }] : [])];
  let pos = 100_000;
  for (const w of list) {
    pos += 1000;
    tracker.upsert("workspace", w.id, hashOf([w.name, w.kind, w.description]), w.name, {
      adopt: () => db.select().from(workspaces).where(and(eq(workspaces.accountId, accountId), eq(workspaces.name, w.name), eq(workspaces.state, "active"))).get()?.id,
      exists: (id) => !!db.select().from(workspaces).where(eq(workspaces.id, id)).get(),
      create: () => db.insert(workspaces).values({ accountId, name: w.name, description: w.description, kind: w.kind === "closed" ? "closed" : "open", position: pos }).returning().get().id,
      update: (id) => { db.update(workspaces).set({ description: w.description ?? undefined, kind: w.kind === "closed" ? "closed" : "open" }).where(eq(workspaces.id, id)).run(); },
    });
  }
}

export function importFolders(env: ImportEnv): void {
  const { tracker } = env;
  const pending = [...env.snap.folders];
  const done = new Set<string>();
  for (let guard = 0; pending.length && guard < 20; guard++) {
    for (const f of [...pending]) {
      if (f.parent && !done.has(f.parent.id) && pending.some((p) => p.id === f.parent!.id)) continue;
      const wsId = tracker.lookup("workspace", f.workspace?.id ?? "main");
      if (!wsId) { pending.splice(pending.indexOf(f), 1); continue; } // outside the workspace filter
      const parentId = f.parent ? tracker.lookup("folder", f.parent.id) ?? null : null;
      tracker.upsert("folder", f.id, hashOf([f.name, f.color, f.parent?.id, wsId]), f.name, {
        adopt: () => (tracker.isPlaceholder(wsId) ? undefined : db.select().from(folders).where(and(eq(folders.workspaceId, wsId), eq(folders.name, f.name))).get()?.id),
        exists: (id) => !!db.select().from(folders).where(eq(folders.id, id)).get(),
        create: () => db.insert(folders).values({ workspaceId: wsId, name: f.name, color: /^#[0-9a-f]{6}$/i.test(f.color ?? "") ? f.color : null, parentFolderId: parentId, position: Date.now() % 1_000_000 }).returning().get().id,
        update: (id) => { db.update(folders).set({ name: f.name, parentFolderId: parentId }).where(eq(folders.id, id)).run(); },
      });
      done.add(f.id);
      pending.splice(pending.indexOf(f), 1);
    }
  }
}

const VIEW_TYPES: Record<string, string> = { FeatureBoardView: "table", TableView: "table", KanbanView: "kanban", CalendarView: "calendar", GanttView: "gantt", TimelineView: "timeline", ChartView: "chart", FormView: "form", WorkloadView: "workload", MapView: "map", CardsView: "cards", FilesView: "files" };

/** monday often reports `null` as view type; fall back to the view name. */
const VIEW_NAMES: [RegExp, string][] = [[/kanban/i, "kanban"], [/calendar/i, "calendar"], [/gantt/i, "gantt"], [/time ?line|tijdlijn/i, "timeline"], [/cards/i, "cards"], [/gallery|files/i, "files"], [/chart/i, "chart"], [/workload/i, "workload"], [/map/i, "map"], [/form/i, "form"]];
VIEW_TYPES.TableBoardView = "table";

/** Plans for the item columns and (via the subtasks column) the subitem columns of a monday board. */
export function plansFor(board: MBoard, all: MondaySnapshot["boards"]): PlanColumn[] {
  const plans = board.columns.filter((c) => !c.archived).map((c) => planColumn(c, "item", board));
  const sub = board.columns.find((c) => c.type === "subtasks");
  const subBoardId = sub ? String(((JSON.parse(sub.settings_str || "{}") as { boardIds?: (string | number)[] }).boardIds ?? [])[0] ?? "") : "";
  const subBoard = subBoardId ? all.find((b) => b.id === subBoardId) : undefined;
  if (subBoard) plans.push(...subBoard.columns.filter((c) => !c.archived).map((c) => planColumn(c, "subitem", subBoard)));
  return plans;
}

export function importBoards(env: ImportEnv): BoardPlans {
  const { tracker, snap } = env;
  const out: BoardPlans = new Map();
  let bpos = 0;
  for (const b of snap.boards.filter((x) => x.type === "board")) {
    bpos += 1000;
    const wsId = tracker.lookup("workspace", b.workspace?.id ?? "main");
    if (!wsId) continue;
    const folderId = b.board_folder_id ? tracker.lookup("folder", b.board_folder_id) ?? null : null;
    const visibility = b.board_kind === "private" ? "private" : b.board_kind === "share" ? "share" : "public";
    const plans = plansFor(b, snap.boards);
    const boardId = tracker.upsert("board", b.id, hashOf([b.name, b.description, b.board_kind, folderId, wsId]), `"${b.name}"`, {
      adopt: () => (!env.adoptBoards || tracker.isPlaceholder(wsId) ? undefined : db.select().from(boards).where(and(eq(boards.workspaceId, wsId), eq(boards.name, b.name), eq(boards.state, "active"))).get()?.id),
      exists: (id) => !!db.select().from(boards).where(eq(boards.id, id)).get(),
      create: () => {
        const row = db.insert(boards).values({ workspaceId: wsId, folderId, name: b.name, description: b.description ?? null, visibility, position: bpos, settings: { importedFrom: "monday", mondayBoardId: b.id } }).returning().get();
        for (const o of b.owners ?? []) {
          const uid = tracker.lookup("user", o.id);
          if (uid && visibility !== "public") db.insert(boardMembers).values({ boardId: row.id, userId: uid, role: "owner" }).onConflictDoNothing().run();
        }
        return row.id;
      },
      update: (id) => { db.update(boards).set({ name: b.name, description: b.description ?? null, folderId: folderId ?? undefined, visibility }).where(eq(boards.id, id)).run(); },
    });
    out.set(boardId, { board: b, plans });
    importGroups(env, b, boardId);
    importColumns(env, b, boardId, plans);
    importViews(env, b, boardId);
  }
  return out;
}

function importGroups(env: ImportEnv, b: MBoard, boardId: string): void {
  const { tracker } = env;
  for (const g of b.groups) {
    const color = /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : "#579bfc";
    tracker.upsert("group", g.id, hashOf([g.title, g.color, g.position, g.archived, boardId]), `"${g.title}" in "${b.name}"`, {
      adopt: () => (tracker.isPlaceholder(boardId) ? undefined : db.select().from(groups).where(and(eq(groups.boardId, boardId), eq(groups.title, g.title), eq(groups.state, "active"))).get()?.id),
      exists: (id) => !!db.select().from(groups).where(eq(groups.id, id)).get(),
      create: () => db.insert(groups).values({ boardId, title: g.title, color, position: num(g.position, 1000) * 1000 + 1000, state: g.archived ? "archived" : "active" }).returning().get().id,
      update: (id) => { db.update(groups).set({ title: g.title, color, position: num(g.position, 1000) * 1000 + 1000 }).where(eq(groups.id, id)).run(); },
    });
  }
}

const colExt = (boardId: string, scope: string, id: string) => `${boardId}:${scope}:${id}`;
export const columnExt = colExt;

function importColumns(env: ImportEnv, b: MBoard, boardId: string, plans: PlanColumn[]): void {
  const { tracker } = env;
  let pos = 0;
  for (const p of plans) {
    pos += 1000;
    tracker.upsert("column", colExt(b.id, p.scope, p.mondayId), hashOf([p.title, p.type, p.settings, p.deferred, p.width]), `"${p.title}" (${p.mondayType}) in "${b.name}"`, {
      adopt: () => (tracker.isPlaceholder(boardId) ? undefined : db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.scope, p.scope), eq(columns.key, p.key))).get()?.id),
      exists: (id) => !!db.select().from(columns).where(eq(columns.id, id)).get(),
      create: () => insertColumnRow(boardId, { title: p.title, type: p.type, scope: p.scope, settings: p.settings, key: p.key, width: p.width ?? undefined, description: p.description ?? undefined, position: pos }, { keyBase: p.key }).id,
      update: (id) => {
        const cur = db.select().from(columns).where(eq(columns.id, id)).get();
        if (!cur) return;
        const logic = getColumnLogic(cur.type);
        const merged = { ...cur.settings, ...p.settings };
        db.update(columns).set({ title: p.title, settings: logic.normalizeSettings ? logic.normalizeSettings(merged) : merged, description: p.description ?? null }).where(eq(columns.id, id)).run();
      },
    });
  }
}

function importViews(env: ImportEnv, b: MBoard, boardId: string): void {
  const { tracker } = env;
  const list = [...(b.views ?? [])];
  if (!list.some((v) => (VIEW_TYPES[v.type] ?? "table") === "table")) list.unshift({ id: `${b.id}-main`, name: "Main table", type: "FeatureBoardView", settings_str: "{}" });
  for (const v of list) {
    const guess = VIEW_TYPES[v.type] ?? VIEW_NAMES.find(([re]) => re.test(v.name))?.[1];
    const type = guess && getViewType(guess) ? guess : "table";
    if (type === "table" && guess !== "table" && !/^table$/i.test(v.name)) tracker.note("view(s) of an unsupported type imported as table view");
    tracker.upsert("view", v.id, hashOf([v.name, v.type, v.settings_str]), `"${v.name}" on "${b.name}"`, {
      adopt: () => (tracker.isPlaceholder(boardId) ? undefined : db.select().from(views).where(and(eq(views.boardId, boardId), eq(views.name, v.name), eq(views.type, type))).get()?.id),
      exists: (id) => !!db.select().from(views).where(eq(views.id, id)).get(),
      create: () => insertViewRow(boardId, { name: v.name, type, settings: { mondayType: v.type } }).id,
      update: (id) => { db.update(views).set({ name: v.name }).where(eq(views.id, id)).run(); },
    });
  }
}

/** Second pass once every board and column exists: relation targets, mirrors and formulas. */
export function finalizeColumns(env: ImportEnv, planned: BoardPlans): void {
  const { tracker } = env;
  for (const { board, plans } of planned.values()) {
    for (const p of plans) {
      if (!p.deferred) continue;
      const colId = tracker.lookup("column", colExt(board.id, p.scope, p.mondayId));
      if (!colId || tracker.isPlaceholder(colId)) continue;
      const d = p.deferred;
      let settings: Record<string, unknown> | undefined;
      if (d.boardIds) {
        const ids = d.boardIds.map((id) => tracker.lookup("board", id)).filter((x): x is string => !!x);
        if (ids.length < d.boardIds.length) tracker.warn(`column "${p.title}" on "${board.name}": ${d.boardIds.length - ids.length} linked board(s) not imported`);
        settings = { boardIds: ids };
      } else if (d.relationColumn) {
        const rel = tracker.lookup("column", colExt(board.id, "item", d.relationColumn));
        const target = d.displayedBoard && d.displayedColumn ? tracker.lookup("column", colExt(d.displayedBoard, "item", d.displayedColumn)) : undefined;
        if (!rel || !target) tracker.warn(`mirror "${p.title}" on "${board.name}": relation or target column not found, left unconfigured`);
        settings = { ...(rel ? { relationColumnId: rel } : {}), ...(target ? { targetColumnId: target } : {}), aggregate: d.aggregate ?? "none" };
      } else if (d.formula !== undefined) {
        const titleById = (id: string) => plans.find((x) => x.mondayId === id && x.scope === p.scope)?.title;
        const t = translateFormula(d.formula, titleById);
        if (t.unresolved.length) tracker.warn(`formula "${p.title}" on "${board.name}": unresolved column reference(s) ${t.unresolved.join(", ")}`);
        settings = { formula: t.formula };
        if (/[A-Z]{3,}\(/.test(d.formula)) tracker.warn(`formula "${p.title}" on "${board.name}": check function names after import`);
      }
      if (!settings || !env.tracker.apply) continue;
      const cur = db.select().from(columns).where(eq(columns.id, colId)).get();
      if (!cur) continue;
      const logic = getColumnLogic(cur.type);
      const merged = { ...cur.settings, ...settings };
      db.update(columns).set({ settings: logic.normalizeSettings ? logic.normalizeSettings(merged) : merged }).where(eq(columns.id, colId)).run();
    }
  }
}
