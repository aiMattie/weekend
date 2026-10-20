import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { hashPassword } from "../../lib/auth/password";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { teamMembers, teams, users } from "../../db/schema/core";
import { emit } from "../../lib/events";
import { parse } from "./_shared";

export type User = Omit<typeof users.$inferSelect, "passwordHash">;
export type Team = typeof teams.$inferSelect & { memberIds: string[] };

const publicCols = {
  id: users.id, accountId: users.accountId, name: users.name, email: users.email, title: users.title, phone: users.phone, photoUrl: users.photoUrl,
  role: users.role, isAiAgent: users.isAiAgent, isActive: users.isActive, locale: users.locale, timeZone: users.timeZone,
  lastLoginAt: users.lastLoginAt, createdAt: users.createdAt, updatedAt: users.updatedAt,
};

const createInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200).optional(),
  title: z.string().max(200).nullish(),
  role: z.enum(["admin", "member", "guest", "viewer"]).default("member"),
  isAiAgent: z.boolean().default(false),
});
const updateInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  title: z.string().max(200).nullish(),
  phone: z.string().max(50).nullish(),
  photoUrl: z.string().max(1000).nullish(),
  locale: z.enum(["nl", "en"]).optional(),
  timeZone: z.string().max(60).optional(),
  role: z.enum(["admin", "member", "guest", "viewer"]).optional(),
  isActive: z.boolean().optional(),
});

export function list(actor: Actor, opts: { includeInactive?: boolean } = {}): User[] {
  return db.select(publicCols).from(users)
    .where(and(eq(users.accountId, actor.accountId), opts.includeInactive ? undefined : eq(users.isActive, true))).orderBy(asc(users.name)).all();
}

export function get(actor: Actor, id: string): User {
  const u = db.select(publicCols).from(users).where(and(eq(users.id, id), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  return u;
}

export const me = (actor: Actor): User => get(actor, actor.id);

export async function create(actor: Actor, input: unknown): Promise<User> {
  const d = parse(createInput, input);
  assertCan(actor, "account:manage");
  if (db.select().from(users).where(sql`lower(${users.email}) = ${d.email}`).get()) throw new ConflictError("A user with this email already exists");
  const row = db.insert(users).values({
    accountId: actor.accountId, name: d.name, email: d.email, title: d.title ?? null, role: d.role, isAiAgent: d.isAiAgent,
    passwordHash: d.password ? await hashPassword(d.password) : null,
  }).returning(publicCols).get();
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return row;
}

/** Self-service for profile fields; role/isActive need account admin. */
export function update(actor: Actor, id: string, input: unknown): User {
  const d = parse(updateInput, input);
  const self = id === actor.id;
  if (!self) assertCan(actor, "account:manage");
  if ((d.role !== undefined || d.isActive !== undefined) && actor.role !== "admin" && !actor.isSystem) throw new ForbiddenError("Only admins can change roles");
  get(actor, id);
  if (d.isActive === false && self) throw new ValidationError("You cannot deactivate yourself");
  const row = db.update(users).set(d).where(eq(users.id, id)).returning(publicCols).get();
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return row;
}

export async function setPassword(actor: Actor, id: string, password: string): Promise<void> {
  const pw = parse(z.string().min(8).max(200), password);
  if (id !== actor.id) assertCan(actor, "account:manage");
  get(actor, id);
  db.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, id)).run();
}

/* ---------------------------------------------------------------- teams */

export function listTeams(actor: Actor): Team[] {
  const rows = db.select().from(teams).where(eq(teams.accountId, actor.accountId)).orderBy(asc(teams.name)).all();
  const members = db.select().from(teamMembers).all();
  return rows.map((t) => ({ ...t, memberIds: members.filter((m) => m.teamId === t.id).map((m) => m.userId) }));
}

export function createTeam(actor: Actor, input: unknown): Team {
  const d = parse(z.object({ name: z.string().trim().min(1).max(100), memberIds: z.array(idSchema).default([]) }), input);
  assertCan(actor, "account:manage");
  const t = db.insert(teams).values({ accountId: actor.accountId, name: d.name }).returning().get();
  for (const uid of d.memberIds) db.insert(teamMembers).values({ teamId: t.id, userId: uid }).onConflictDoNothing().run();
  return { ...t, memberIds: d.memberIds };
}

export function setTeamMembers(actor: Actor, teamId: string, userIds: string[]): void {
  assertCan(actor, "account:manage");
  const ids = parse(z.array(idSchema), userIds);
  db.transaction((tx) => {
    tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId)).run();
    for (const uid of ids) tx.insert(teamMembers).values({ teamId, userId: uid }).run();
  });
}

export function deleteTeam(actor: Actor, teamId: string): void {
  assertCan(actor, "account:manage");
  db.delete(teams).where(and(eq(teams.id, teamId), eq(teams.accountId, actor.accountId))).run();
}
