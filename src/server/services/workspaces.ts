import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { assertCan, can, workspaceVisibilityFilter } from "../../lib/permissions";
import { idSchema, nameSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boards, users, workspaceMembers, workspaces } from "../../db/schema/core";
import { emit } from "../../lib/events";
import { computePosition, parse } from "./_shared";

export type Workspace = typeof workspaces.$inferSelect;

const createSchema = z.object({
  name: nameSchema,
  description: z.string().max(2000).nullish(),
  kind: z.enum(["open", "closed"]).default("open"),
  color: z.string().max(20).nullish(),
  icon: z.string().max(60).nullish(),
});
const updateSchema = createSchema.partial();

const wsEvent = (actor: Actor) => emit({ type: "workspace.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });

/** Workspaces the actor may see, ordered by position. */
export function list(actor: Actor): Workspace[] {
  const rows = db.select().from(workspaces)
    .where(and(eq(workspaces.accountId, actor.accountId), eq(workspaces.state, "active")))
    .orderBy(asc(workspaces.position), asc(workspaces.name)).all();
  return rows.filter(workspaceVisibilityFilter(actor));
}

export function get(actor: Actor, id: string): Workspace {
  const ws = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!ws || ws.state === "deleted" || ws.accountId !== actor.accountId) throw new NotFoundError("Workspace");
  assertCan(actor, "workspace:view", { workspaceId: id });
  return ws;
}

export function create(actor: Actor, input: unknown): Workspace {
  const data = parse(createSchema, input);
  assertCan(actor, "workspace:create");
  const siblings = db.select({ id: workspaces.id, position: workspaces.position }).from(workspaces)
    .where(eq(workspaces.accountId, actor.accountId)).orderBy(asc(workspaces.position)).all();
  const ws = db.insert(workspaces).values({
    ...data, accountId: actor.accountId, position: computePosition(siblings), createdBy: actor.isSystem ? null : actor.id,
  }).returning().get();
  if (!actor.isSystem) db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: actor.id, role: "owner" }).run();
  wsEvent(actor);
  return ws;
}

export function update(actor: Actor, id: string, input: unknown): Workspace {
  const data = parse(updateSchema, input);
  get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  const ws = db.update(workspaces).set(data).where(eq(workspaces.id, id)).returning().get();
  wsEvent(actor);
  return ws;
}

/** Soft delete (state = deleted); boards inside stay in the DB but become unreachable. */
export function remove(actor: Actor, id: string): void {
  get(actor, id);
  assertCan(actor, "workspace:delete", { workspaceId: id });
  db.update(workspaces).set({ state: "deleted" }).where(eq(workspaces.id, id)).run();
  db.update(boards).set({ state: "deleted" }).where(eq(boards.workspaceId, id)).run();
  wsEvent(actor);
}

export function archive(actor: Actor, id: string): Workspace {
  get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  const ws = db.update(workspaces).set({ state: "archived" }).where(eq(workspaces.id, id)).returning().get();
  wsEvent(actor);
  return ws;
}

export function move(actor: Actor, id: string, spec: { beforeId?: string; afterId?: string; top?: boolean; position?: number }): Workspace {
  get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  const siblings = db.select({ id: workspaces.id, position: workspaces.position }).from(workspaces)
    .where(eq(workspaces.accountId, actor.accountId)).orderBy(asc(workspaces.position)).all().filter((s) => s.id !== id);
  const ws = db.update(workspaces).set({ position: computePosition(siblings, spec) }).where(eq(workspaces.id, id)).returning().get();
  wsEvent(actor);
  return ws;
}

export type WorkspaceMember = { userId: string; role: "owner" | "member" | "viewer"; name: string; email: string };

export function listMembers(actor: Actor, id: string): WorkspaceMember[] {
  get(actor, id);
  return db.select({ userId: workspaceMembers.userId, role: workspaceMembers.role, name: users.name, email: users.email })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, id)).all();
}

export function setMember(actor: Actor, id: string, userId: string, role: "owner" | "member" | "viewer" = "member"): void {
  const uid = parse(idSchema, userId);
  get(actor, id);
  assertCan(actor, "workspace:manage_members", { workspaceId: id });
  const u = db.select().from(users).where(and(eq(users.id, uid), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  db.insert(workspaceMembers).values({ workspaceId: id, userId: uid, role })
    .onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role } }).run();
  wsEvent(actor);
}

export function removeMember(actor: Actor, id: string, userId: string): void {
  get(actor, id);
  if (userId !== actor.id) assertCan(actor, "workspace:manage_members", { workspaceId: id });
  else if (!can(actor, "workspace:view", { workspaceId: id })) throw new ForbiddenError();
  db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId))).run();
  wsEvent(actor);
}

export function memberCounts(ids: string[]): Record<string, number> {
  if (!ids.length) return {};
  const rows = db.select({ workspaceId: workspaceMembers.workspaceId }).from(workspaceMembers).where(inArray(workspaceMembers.workspaceId, ids)).all();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.workspaceId] = (out[r.workspaceId] ?? 0) + 1;
  return out;
}
