/**
 * Teams: groups of people that can be assigned to items and @mentioned. Account admins (or roles with
 * `account:teams`) manage all teams; a team owner manages the members of that team.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { emit } from "../../lib/events";
import { can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { teamMembers, teams, users } from "../../db/schema/core";
import { recordAudit } from "./audit";
import { parse } from "./_shared";

export interface TeamMember { userId: string; name: string; email: string; isOwner: boolean; isActive: boolean }
export interface TeamFull { id: string; name: string; pictureUrl: string | null; createdAt: string; members: TeamMember[]; memberIds: string[]; ownerIds: string[]; canManage: boolean }

function row(actor: Actor, id: string) {
  const t = db.select().from(teams).where(and(eq(teams.id, id), eq(teams.accountId, actor.accountId))).get();
  if (!t) throw new NotFoundError("Team");
  return t;
}

function isTeamOwner(actor: Actor, teamId: string): boolean {
  return !!db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id), eq(teamMembers.isOwner, true))).get();
}

function canManage(actor: Actor, teamId: string): boolean {
  return can(actor, "account:teams") || isTeamOwner(actor, teamId);
}

function assertManage(actor: Actor, teamId: string): void {
  if (!canManage(actor, teamId)) throw new ForbiddenError("Only admins and team owners can change this team");
}

export function list(actor: Actor): TeamFull[] {
  const rows = db.select().from(teams).where(eq(teams.accountId, actor.accountId)).orderBy(asc(teams.name)).all();
  if (!rows.length) return [];
  const members = db.select({ teamId: teamMembers.teamId, userId: users.id, name: users.name, email: users.email, isOwner: teamMembers.isOwner, isActive: users.isActive })
    .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(inArray(teamMembers.teamId, rows.map((t) => t.id))).orderBy(asc(users.name)).all();
  const manageAll = can(actor, "account:teams");
  return rows.map((t) => {
    const ms = members.filter((m) => m.teamId === t.id).map(({ teamId: _t, ...m }) => m as TeamMember); // eslint-disable-line @typescript-eslint/no-unused-vars
    return {
      id: t.id, name: t.name, pictureUrl: t.pictureUrl, createdAt: t.createdAt, members: ms, memberIds: ms.map((m) => m.userId),
      ownerIds: ms.filter((m) => m.isOwner).map((m) => m.userId), canManage: manageAll || ms.some((m) => m.userId === actor.id && m.isOwner),
    };
  });
}

export const get = (actor: Actor, id: string): TeamFull => {
  row(actor, id);
  return list(actor).find((t) => t.id === id)!;
};

const createInput = z.object({ name: z.string().trim().min(1).max(100), memberIds: z.array(idSchema).max(500).default([]), ownerIds: z.array(idSchema).max(50).default([]) });

export function create(actor: Actor, input: unknown): TeamFull {
  const d = parse(createInput, input);
  if (!can(actor, "account:teams")) throw new ForbiddenError("Not allowed: account:teams");
  const t = db.insert(teams).values({ accountId: actor.accountId, name: d.name }).returning().get();
  const all = new Set([...d.memberIds, ...d.ownerIds]);
  for (const uid of all) db.insert(teamMembers).values({ teamId: t.id, userId: uid, isOwner: d.ownerIds.includes(uid) }).onConflictDoNothing().run();
  recordAudit(actor, "team.created", { targetType: "team", targetId: t.id, targetName: t.name, members: all.size });
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return get(actor, t.id);
}

export function rename(actor: Actor, id: string, name: string): TeamFull {
  const n = parse(z.string().trim().min(1).max(100), name);
  const t = row(actor, id);
  assertManage(actor, id);
  db.update(teams).set({ name: n }).where(eq(teams.id, id)).run();
  recordAudit(actor, "team.renamed", { targetType: "team", targetId: id, targetName: n, from: t.name });
  return get(actor, id);
}

export function remove(actor: Actor, id: string): void {
  const t = row(actor, id);
  if (!can(actor, "account:teams")) throw new ForbiddenError("Not allowed: account:teams");
  db.delete(teams).where(eq(teams.id, id)).run();
  recordAudit(actor, "team.deleted", { targetType: "team", targetId: id, targetName: t.name });
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
}

/** Replace all members. Existing owners keep their flag when they stay. */
export function setMembers(actor: Actor, id: string, userIds: unknown): TeamFull {
  const ids = parse(z.array(idSchema).max(500), userIds);
  const t = row(actor, id);
  assertManage(actor, id);
  const owners = new Set(db.select({ u: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, id), eq(teamMembers.isOwner, true))).all().map((r) => r.u));
  const valid = new Set(db.select({ id: users.id }).from(users).where(and(eq(users.accountId, actor.accountId), inArray(users.id, ids.length ? ids : ["-"]))).all().map((u) => u.id));
  db.transaction((tx) => {
    tx.delete(teamMembers).where(eq(teamMembers.teamId, id)).run();
    for (const uid of valid) tx.insert(teamMembers).values({ teamId: id, userId: uid, isOwner: owners.has(uid) }).run();
  });
  recordAudit(actor, "team.members_changed", { targetType: "team", targetId: id, targetName: t.name, members: valid.size });
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return get(actor, id);
}

/** Make a member a team owner (or not). The user is added to the team when needed. */
export function setOwner(actor: Actor, id: string, userId: string, isOwner: boolean): TeamFull {
  const t = row(actor, id);
  assertManage(actor, id);
  if (!db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.accountId, actor.accountId))).get()) throw new NotFoundError("User");
  db.insert(teamMembers).values({ teamId: id, userId, isOwner }).onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { isOwner } }).run();
  recordAudit(actor, "team.owner_changed", { targetType: "team", targetId: id, targetName: t.name, userId, isOwner });
  return get(actor, id);
}

/** @team mention: the active users that should be notified for a mention of the team. */
export function expandMention(actor: Actor, teamId: string): string[] {
  row(actor, teamId);
  return db.select({ id: users.id }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.isActive, true))).all().map((r) => r.id);
}

/** Teams and people offered by the @mention picker. */
export function mentionables(actor: Actor): { teams: { id: string; name: string; memberCount: number }[] } {
  return { teams: list(actor).map((t) => ({ id: t.id, name: t.name, memberCount: t.members.filter((m) => m.isActive).length })) };
}
