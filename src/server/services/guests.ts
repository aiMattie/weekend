/**
 * Guests: external people with access to specific boards (or the shared boards of a workspace).
 * A guest only ever sees boards with visibility "share" they were given access to; never structure,
 * workspace lists or other users' content.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boardMembers, boards, users, views, workspaces } from "../../db/schema/core";
import { boardPermissions, guestGrants } from "../../db/schema/audit-log";
import { getSettings, patchSettings } from "./account-settings";
import { recordAudit } from "./audit";
import { invite, type InvitationWithLink } from "./members";
import { syncGuestGrants } from "./guest-sync";
import { revokeAllForUser } from "./sessions";
import { parse, requireBoard } from "./_shared";

export interface GuestRow {
  id: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null;
  boards: { id: string; name: string; role: "owner" | "editor" | "viewer" }[];
  workspaces: { id: string; name: string; role: "editor" | "viewer" }[];
}

export interface GuestOverview { enabled: boolean; restrictedViews: boolean; guests: GuestRow[] }

export function overview(actor: Actor): GuestOverview {
  assertCan(actor, "account:guests");
  const gs = db.select().from(users).where(and(eq(users.accountId, actor.accountId), eq(users.role, "guest"))).orderBy(asc(users.name)).all();
  const ids = gs.map((g) => g.id);
  const bm = ids.length ? db.select({ userId: boardMembers.userId, id: boards.id, name: boards.name, role: boardMembers.role }).from(boardMembers).innerJoin(boards, eq(boards.id, boardMembers.boardId)).where(inArray(boardMembers.userId, ids)).all() : [];
  const gg = ids.length ? db.select({ userId: guestGrants.userId, id: workspaces.id, name: workspaces.name, role: guestGrants.role }).from(guestGrants).innerJoin(workspaces, eq(workspaces.id, guestGrants.workspaceId)).where(inArray(guestGrants.userId, ids)).all() : [];
  const s = getSettings(actor.accountId).guests;
  return {
    enabled: s.enabled, restrictedViews: s.restrictedViews,
    guests: gs.map((g) => ({
      id: g.id, name: g.name, email: g.email, isActive: g.isActive, lastLoginAt: g.lastLoginAt,
      boards: bm.filter((r) => r.userId === g.id).map(({ userId: _u, ...r }) => r), // eslint-disable-line @typescript-eslint/no-unused-vars
      workspaces: gg.filter((r) => r.userId === g.id).map(({ userId: _u, ...r }) => r), // eslint-disable-line @typescript-eslint/no-unused-vars
    })),
  };
}

export function updateSettings(actor: Actor, input: unknown): { enabled: boolean; restrictedViews: boolean } {
  assertCan(actor, "account:guests");
  const d = parse(z.object({ enabled: z.boolean().optional(), restrictedViews: z.boolean().optional() }), input);
  const s = patchSettings(actor.accountId, (cur) => { Object.assign(cur.guests, d); });
  recordAudit(actor, "guest.settings_changed", { ...d });
  return s.guests;
}

const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(200).optional(),
  workspaceId: idSchema.optional(),
  boardIds: z.array(idSchema).max(100).default([]),
  role: z.enum(["editor", "viewer"]).default("viewer"),
});

/** Invite a guest to boards and / or all shared boards of a workspace. Public boards become "shareable". */
export function inviteGuest(actor: Actor, input: unknown, ctx: { origin?: string } = {}): InvitationWithLink {
  assertCan(actor, "account:guests");
  const d = parse(inviteInput, input);
  if (!getSettings(actor.accountId).guests.enabled) throw new ValidationError("Guests are disabled for this account");
  if (!d.workspaceId && !d.boardIds.length) throw new ValidationError("Choose at least one board or workspace");
  if (d.workspaceId && !db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, d.workspaceId), eq(workspaces.accountId, actor.accountId))).get()) throw new NotFoundError("Workspace");
  for (const id of d.boardIds) {
    const b = requireBoard(actor, id, "board:manage_members");
    if (b.visibility === "private") throw new ValidationError(`Board "${b.name}" is private; guests can only join shareable boards`);
  }
  const inv = invite(actor, { email: d.email, name: d.name, role: "guest", workspaceId: d.workspaceId, boardIds: d.boardIds, boardRole: d.role }, ctx);
  for (const id of d.boardIds) {
    const b = db.select().from(boards).where(eq(boards.id, id)).get();
    if (b?.visibility === "public") db.update(boards).set({ visibility: "share" }).where(eq(boards.id, id)).run();
  }
  return inv;
}

/** Replace the guest's access (existing guests). */
export function setAccess(actor: Actor, guestId: string, input: unknown): GuestRow {
  assertCan(actor, "account:guests");
  const d = parse(z.object({ boardIds: z.array(idSchema).max(100).default([]), workspaceIds: z.array(idSchema).max(50).default([]), role: z.enum(["editor", "viewer"]).default("viewer") }), input);
  const g = db.select().from(users).where(and(eq(users.id, guestId), eq(users.accountId, actor.accountId), eq(users.role, "guest"))).get();
  if (!g) throw new NotFoundError("Guest");
  for (const id of d.boardIds) {
    const b = requireBoard(actor, id, "board:manage_members");
    if (b.visibility === "private") throw new ValidationError(`Board "${b.name}" is private`);
    if (b.visibility === "public") db.update(boards).set({ visibility: "share" }).where(eq(boards.id, id)).run();
  }
  db.transaction((tx) => {
    tx.delete(boardMembers).where(eq(boardMembers.userId, guestId)).run();
    tx.delete(guestGrants).where(eq(guestGrants.userId, guestId)).run();
    for (const id of d.boardIds) tx.insert(boardMembers).values({ boardId: id, userId: guestId, role: d.role }).run();
    for (const id of d.workspaceIds) tx.insert(guestGrants).values({ userId: guestId, workspaceId: id, role: d.role }).run();
  });
  if (d.workspaceIds.length) for (const w of d.workspaceIds) syncGuestGrants(w);
  recordAudit(actor, "guest.access_changed", { targetType: "user", targetId: guestId, targetName: g.name, boardIds: d.boardIds, workspaceIds: d.workspaceIds, role: d.role });
  return overview(actor).guests.find((x) => x.id === guestId)!;
}

/** Remove a guest: deactivated, sessions revoked, access removed. */
export function removeGuest(actor: Actor, guestId: string): void {
  assertCan(actor, "account:guests");
  const g = db.select().from(users).where(and(eq(users.id, guestId), eq(users.accountId, actor.accountId), eq(users.role, "guest"))).get();
  if (!g) throw new NotFoundError("Guest");
  db.update(users).set({ isActive: false }).where(eq(users.id, guestId)).run();
  revokeAllForUser(guestId, "guest_removed");
  db.delete(boardMembers).where(eq(boardMembers.userId, guestId)).run();
  db.delete(guestGrants).where(eq(guestGrants.userId, guestId)).run();
  recordAudit(actor, "guest.removed", { targetType: "user", targetId: guestId, targetName: g.name });
}

/* ------------------------------------------------------------------ restricted views */

/** Views a board is limited to for guests (null = all shared views). Board owners set it. */
export function setGuestViews(actor: Actor, boardId: string, viewIds: string[] | null): string[] | null {
  const b = requireBoard(actor, boardId, "board:manage_members");
  const ids = viewIds === null ? null : parse(z.array(idSchema).max(100), viewIds);
  if (ids) {
    const valid = db.select({ id: views.id }).from(views).where(and(eq(views.boardId, boardId), inArray(views.id, ids.length ? ids : ["-"]))).all().map((v) => v.id);
    if (valid.length !== ids.length) throw new ValidationError("Unknown view");
  }
  db.insert(boardPermissions).values({ boardId, guestViewIds: ids }).onConflictDoUpdate({ target: boardPermissions.boardId, set: { guestViewIds: ids } }).run();
  recordAudit(actor, "guest.views_restricted", { targetType: "board", targetId: boardId, targetName: b.name, viewIds: ids });
  return ids;
}

/**
 * Filter helper for the views service: guests only see the views the board owner released
 * (when "restricted views" is on and the board has a list). Other roles see everything.
 */
export function filterViewsForActor<T extends { id: string; ownerId?: string | null }>(actor: Actor, boardId: string, rows: T[]): T[] {
  if (actor.role !== "guest" || actor.isSystem) return rows;
  const allowed = db.select().from(boardPermissions).where(eq(boardPermissions.boardId, boardId)).get()?.guestViewIds ?? null;
  const restricted = getSettings(actor.accountId).guests.restrictedViews;
  return rows.filter((r) => r.ownerId === actor.id || (!restricted && !allowed) || (allowed ? allowed.includes(r.id) : !restricted));
}
