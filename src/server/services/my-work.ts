/**
 * My Work: every item assigned to the actor (people column holds the user, or one of the user's
 * teams) across all boards the actor can view, bucketed by due date. Read-only aggregation.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { columns, items, teamMembers, users } from "../../db/schema/core";
import { bucketFor, DEFAULT_TZ, extractDueDate, groupIntoSections, todayString, type Bucket, type Section } from "../../modules/boards-extra/mywork/buckets";
import type { StatusLabel } from "../columns/labels";
import type { PeopleValue } from "../columns/people";
import * as boardsService from "./boards";
import { parse } from "./_shared";

const DATE_TYPES = new Set(["date", "timeline", "week"]);

export const myWorkQuery = z.object({
  showDone: z.boolean().default(false),
  boardIds: z.array(z.string()).optional(),
  search: z.string().max(200).optional(),
  /** status label texts (case-insensitive) */
  statusFilter: z.array(z.string()).optional(),
  /** also include items assigned to one of my teams (default true) */
  includeTeams: z.boolean().default(true),
});
export type MyWorkQuery = z.input<typeof myWorkQuery>;

export interface MyWorkStatus {
  columnId: string;
  labelId: number | null;
  text: string;
  color: string;
  isDone: boolean;
  /** all selectable labels of the column (for the quick-change menu) */
  labels: { id: number; text: string; color: string }[];
}
export interface MyWorkRow {
  itemId: string;
  name: string;
  boardId: string;
  boardName: string;
  parentItemId: string | null;
  parentName: string | null;
  status: MyWorkStatus | null;
  dueDate: string | null;
  dueColumnTitle: string | null;
  bucket: Bucket;
  /** user ids assigned to the item */
  peopleIds: string[];
  updatedAt: string;
}
export interface MyWorkResult {
  sections: Section<MyWorkRow>[];
  total: number;
  boards: { id: string; name: string }[];
  users: { id: string; name: string; photoUrl: string | null }[];
  today: string;
}

export function list(actor: Actor, query: MyWorkQuery = {}, now: Date = new Date()): MyWorkResult {
  const q = parse(myWorkQuery, query);
  const me = db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, actor.id)).get();
  const tz = me?.timeZone || DEFAULT_TZ;
  const myTeams = new Set(q.includeTeams ? db.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, actor.id)).all().map((r) => r.id) : []);

  const visibleBoards = boardsService.list(actor).filter((b) => b.kind === "board" || b.kind === "dev_sprints");
  const boardList = visibleBoards.filter((b) => !q.boardIds?.length || q.boardIds.includes(b.id));
  const boardName = new Map(visibleBoards.map((b) => [b.id, b.name]));
  const rows: MyWorkRow[] = [];
  const needle = q.search?.trim().toLowerCase();
  const statusFilter = q.statusFilter?.map((s) => s.toLowerCase());
  const userIds = new Set<string>();

  if (boardList.length) {
    const ids = boardList.map((b) => b.id);
    const cols = db.select().from(columns).where(inArray(columns.boardId, ids)).all().filter((c) => !c.archived);
    const colsByBoard = new Map<string, typeof cols>();
    for (const c of cols) (colsByBoard.get(c.boardId) ?? colsByBoard.set(c.boardId, []).get(c.boardId)!).push(c);
    const all = db.select().from(items).where(and(inArray(items.boardId, ids), eq(items.state, "active"))).all();
    const byId = new Map(all.map((i) => [i.id, i]));
    for (const it of all) {
      const scope = it.parentItemId ? "subitem" : "item";
      const bc = (colsByBoard.get(it.boardId) ?? []).filter((c) => c.scope === scope);
      const peopleCols = bc.filter((c) => c.type === "people");
      const people = new Set<string>();
      let mine = false;
      for (const pc of peopleCols) {
        for (const p of (it.values[pc.id] as PeopleValue | undefined)?.personsAndTeams ?? []) {
          if (p.kind === "person") people.add(p.id);
          if ((p.kind === "person" && p.id === actor.id) || (p.kind === "team" && myTeams.has(p.id))) mine = true;
        }
      }
      if (!mine) continue;
      if (it.parentItemId && byId.get(it.parentItemId)?.state === "archived") continue;
      if (needle && !it.name.toLowerCase().includes(needle)) continue;

      let status: MyWorkStatus | null = null;
      const sc = bc.find((c) => c.type === "status");
      if (sc) {
        const labels = (Array.isArray(sc.settings.labels) ? sc.settings.labels : []) as StatusLabel[];
        const v = it.values[sc.id] as { index?: number } | undefined;
        const l = v ? labels.find((x) => x.id === v.index) : undefined;
        status = {
          columnId: sc.id, labelId: l?.id ?? null, text: l?.text ?? "", color: l?.color ?? "#c4c4c4", isDone: !!l?.isDone,
          labels: labels.filter((x) => x.text !== "").map((x) => ({ id: x.id, text: x.text, color: x.color })),
        };
      }
      if (!q.showDone && status?.isDone) continue;
      if (statusFilter?.length && !statusFilter.includes((status?.text ?? "").toLowerCase())) continue;

      let dueDate: string | null = null;
      let dueColumnTitle: string | null = null;
      for (const dc of bc.filter((c) => DATE_TYPES.has(c.type))) {
        const d = extractDueDate(it.values[dc.id]);
        if (d && (!dueDate || d < dueDate)) { dueDate = d; dueColumnTitle = dc.title; }
      }
      people.forEach((p) => userIds.add(p));
      rows.push({
        itemId: it.id, name: it.name, boardId: it.boardId, boardName: boardName.get(it.boardId) ?? "",
        parentItemId: it.parentItemId, parentName: it.parentItemId ? byId.get(it.parentItemId)?.name ?? null : null,
        status, dueDate, dueColumnTitle, bucket: bucketFor(dueDate, now, tz), peopleIds: [...people], updatedAt: it.updatedAt,
      });
    }
  }
  const userRows = userIds.size ? db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, [...userIds])).all() : [];
  const boardsWithRows = [...new Set(rows.map((r) => r.boardId))].map((id) => ({ id, name: boardName.get(id) ?? id }));
  return { sections: groupIntoSections(rows, now, tz), total: rows.length, boards: boardsWithRows, users: userRows, today: todayString(now, tz) };
}
