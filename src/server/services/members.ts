/**
 * Admin center > Users: list, invite by e-mail (token link), accept invitation, change role,
 * deactivate / reactivate and bulk import from CSV. Guests are invited through guests.ts.
 */
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { emit } from "../../lib/events";
import { assertCan } from "../../lib/permissions";
import { hashPassword } from "../../lib/auth/password";
import { signSession } from "../../lib/auth/session";
import { db } from "../../db/client";
import { accounts, boardMembers, teamMembers, users, workspaceMembers } from "../../db/schema/core";
import { accountRoles, authSessions, guestGrants, invitations, userRoles, userSecurity } from "../../db/schema/audit-log";
import { emailOutbox } from "../../db/schema/docs";
import { parseCsv } from "../../modules/admin/lib/csv";
import { randomToken, sha256 } from "../../modules/admin/lib/seal";
import { assertPasswordPolicy } from "./security";
import { recordAudit } from "./audit";
import { syncGuestGrants } from "./guest-sync";
import { createSession, revokeAllForUser } from "./sessions";
import { parse } from "./_shared";

export type BuiltinRole = "admin" | "member" | "viewer" | "guest";
const INVITE_DAYS = 7;

export interface MemberRow {
  id: string; name: string; email: string; title: string | null; photoUrl: string | null;
  role: BuiltinRole; customRoleId: string | null; customRoleName: string | null;
  isActive: boolean; isAiAgent: boolean; lastActiveAt: string | null; twoFactor: boolean; createdAt: string; teamIds: string[];
}

export function list(actor: Actor, opts: { q?: string; role?: string; includeInactive?: boolean } = {}): MemberRow[] {
  assertCan(actor, "account:invite");
  const rows = db.select().from(users).where(eq(users.accountId, actor.accountId)).orderBy(users.name).all();
  const last = new Map(db.select({ userId: authSessions.userId, at: max(authSessions.lastSeenAt) }).from(authSessions).groupBy(authSessions.userId).all().map((r) => [r.userId, r.at]));
  const roles = new Map(db.select({ userId: userRoles.userId, id: accountRoles.id, name: accountRoles.name }).from(userRoles).innerJoin(accountRoles, eq(accountRoles.id, userRoles.roleId)).all().map((r) => [r.userId, r]));
  const sec = new Map(db.select({ id: userSecurity.userId, on: userSecurity.totpEnabled }).from(userSecurity).all().map((r) => [r.id, r.on]));
  const teamsOf = new Map<string, string[]>();
  for (const t of db.select().from(teamMembers).all()) teamsOf.set(t.userId, [...(teamsOf.get(t.userId) ?? []), t.teamId]);
  const q = opts.q?.trim().toLowerCase();
  return rows
    .filter((u) => (opts.includeInactive ?? true) || u.isActive)
    .filter((u) => !opts.role || (opts.role.startsWith("custom:") ? roles.get(u.id)?.id === opts.role.slice(7) : u.role === opts.role))
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .map((u) => {
      const at = last.get(u.id) ?? null;
      const lastActiveAt = [at, u.lastLoginAt].filter(Boolean).sort().pop() ?? null;
      return {
        id: u.id, name: u.name, email: u.email, title: u.title, photoUrl: u.photoUrl, role: u.role, customRoleId: roles.get(u.id)?.id ?? null, customRoleName: roles.get(u.id)?.name ?? null,
        isActive: u.isActive, isAiAgent: u.isAiAgent, lastActiveAt, twoFactor: !!sec.get(u.id), createdAt: u.createdAt, teamIds: teamsOf.get(u.id) ?? [],
      };
    });
}

/* ------------------------------------------------------------------ roles */

const roleInput = z.object({ role: z.enum(["admin", "member", "viewer", "guest"]), customRoleId: z.string().max(40).nullish() });

function activeAdminCount(accountId: string, exceptId?: string): number {
  return db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.accountId, accountId), eq(users.role, "admin"), eq(users.isActive, true), exceptId ? sql`${users.id} != ${exceptId}` : undefined)).get()?.n ?? 0;
}

/** Change the account role (built-in role, or a custom role which brings its own base role). */
export function setRole(actor: Actor, userId: string, input: unknown): MemberRow {
  assertCan(actor, "account:invite");
  const d = parse(roleInput, input);
  const u = db.select().from(users).where(and(eq(users.id, userId), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  let base = d.role;
  let customName: string | null = null;
  if (d.customRoleId) {
    const cr = db.select().from(accountRoles).where(and(eq(accountRoles.id, d.customRoleId), eq(accountRoles.accountId, actor.accountId))).get();
    if (!cr) throw new NotFoundError("Role");
    base = cr.baseRole;
    customName = cr.name;
  }
  if (base === "admin" && !actor.isSystem && actor.role !== "admin") throw new ValidationError("Only admins can grant the admin role");
  if (u.role === "admin" && base !== "admin" && activeAdminCount(actor.accountId, u.id) === 0) throw new ValidationError("There must be at least one admin");
  const prevCustom = db.select({ id: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId)).get()?.id ?? null;
  db.transaction((tx) => {
    tx.update(users).set({ role: base }).where(eq(users.id, userId)).run();
    tx.delete(userRoles).where(eq(userRoles.userId, userId)).run();
    if (d.customRoleId) tx.insert(userRoles).values({ userId, roleId: d.customRoleId }).run();
  });
  recordAudit(actor, "user.role_changed", { targetType: "user", targetId: userId, targetName: u.name, from: u.role, to: base, customRole: customName, fromCustomRoleId: prevCustom });
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return list(actor).find((m) => m.id === userId)!;
}

export function setActive(actor: Actor, userId: string, active: boolean): MemberRow {
  assertCan(actor, "account:invite");
  const u = db.select().from(users).where(and(eq(users.id, userId), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  if (!active && userId === actor.id) throw new ValidationError("You cannot deactivate yourself");
  if (!active && u.role === "admin" && activeAdminCount(actor.accountId, u.id) === 0) throw new ValidationError("There must be at least one admin");
  db.update(users).set({ isActive: active }).where(eq(users.id, userId)).run();
  if (!active) revokeAllForUser(userId, "deactivated");
  recordAudit(actor, active ? "user.reactivated" : "user.deactivated", { targetType: "user", targetId: userId, targetName: u.name });
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return list(actor).find((m) => m.id === userId)!;
}

/* ------------------------------------------------------------------ invitations */

export type InvitationRow = typeof invitations.$inferSelect;
export type InvitationWithLink = Omit<InvitationRow, "tokenHash"> & { link: string };

const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(200).optional(),
  role: z.enum(["admin", "member", "viewer", "guest"]).default("member"),
  customRoleId: z.string().max(40).nullish(),
  workspaceId: z.string().max(40).optional(),
  boardIds: z.array(z.string().max(40)).max(100).default([]),
  boardRole: z.enum(["editor", "viewer"]).default("viewer"),
});
export type InviteInput = z.input<typeof inviteInput>;

const strip = ({ tokenHash: _t, ...rest }: InvitationRow): Omit<InvitationRow, "tokenHash"> => rest; // eslint-disable-line @typescript-eslint/no-unused-vars

/** Create an invitation and "send" it (outbox row; the link is also returned for copy / paste). */
export function invite(actor: Actor, input: unknown, ctx: { origin?: string } = {}): InvitationWithLink {
  const d = parse(inviteInput, input);
  assertCan(actor, d.role === "guest" ? "account:guests" : "account:invite");
  if (d.role === "admin" && !actor.isSystem && actor.role !== "admin") throw new ValidationError("Only admins can invite admins");
  if (db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${d.email}`).get()) throw new ConflictError("A user with this email already exists");
  if (d.customRoleId && !db.select({ id: accountRoles.id }).from(accountRoles).where(and(eq(accountRoles.id, d.customRoleId), eq(accountRoles.accountId, actor.accountId))).get()) throw new NotFoundError("Role");
  db.update(invitations).set({ status: "revoked" }).where(and(eq(invitations.accountId, actor.accountId), eq(invitations.email, d.email), eq(invitations.status, "pending"))).run();
  const token = randomToken(24);
  const row = db.insert(invitations).values({
    accountId: actor.accountId, email: d.email, name: d.name ?? null, role: d.role, customRoleId: d.customRoleId ?? null, tokenHash: sha256(token),
    invitedBy: actor.isSystem ? null : actor.id, workspaceId: d.workspaceId ?? null, boardIds: d.boardIds, boardRole: d.boardRole,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(),
  }).returning().get();
  const link = `${ctx.origin ?? ""}/accept-invite/${token}`;
  const acct = db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, actor.accountId)).get();
  db.insert(emailOutbox).values({
    toEmail: d.email, kind: "invite", sentAt: new Date().toISOString(), subject: `${actor.name ?? "Een collega"} nodigt je uit voor ${acct?.name ?? "Weekend"}`,
    body: `<p>Hallo${d.name ? ` ${d.name}` : ""},</p><p>Je bent uitgenodigd voor ${acct?.name ?? "Weekend"}. <a href="${link}">Accepteer de uitnodiging</a> en kies een wachtwoord. De link is ${INVITE_DAYS} dagen geldig.</p>`,
  }).run();
  recordAudit(actor, d.role === "guest" ? "guest.invited" : "invitation.created", { targetType: "invitation", targetId: row.id, targetName: d.email, role: d.role, workspaceId: d.workspaceId, boardIds: d.boardIds });
  return { ...strip(row), link };
}

export function listInvitations(actor: Actor, opts: { status?: "pending" | "accepted" | "revoked"; guests?: boolean } = {}): Omit<InvitationRow, "tokenHash">[] {
  assertCan(actor, opts.guests ? "account:guests" : "account:invite");
  const now = new Date().toISOString();
  return db.select().from(invitations)
    .where(and(eq(invitations.accountId, actor.accountId), opts.status ? eq(invitations.status, opts.status) : undefined, opts.guests === undefined ? undefined : opts.guests ? eq(invitations.role, "guest") : sql`${invitations.role} != 'guest'`))
    .orderBy(desc(invitations.createdAt)).all().map((r) => strip(r.status === "pending" && r.expiresAt < now ? { ...r, status: "revoked" } : r));
}

export function revokeInvitation(actor: Actor, id: string): void {
  const inv = db.select().from(invitations).where(and(eq(invitations.id, id), eq(invitations.accountId, actor.accountId))).get();
  if (!inv) throw new NotFoundError("Invitation");
  assertCan(actor, inv.role === "guest" ? "account:guests" : "account:invite");
  db.update(invitations).set({ status: "revoked" }).where(eq(invitations.id, id)).run();
  recordAudit(actor, "invitation.revoked", { targetType: "invitation", targetId: id, targetName: inv.email });
}

/** New token for a pending (or expired) invitation. */
export function resendInvitation(actor: Actor, id: string, ctx: { origin?: string } = {}): InvitationWithLink {
  const inv = db.select().from(invitations).where(and(eq(invitations.id, id), eq(invitations.accountId, actor.accountId))).get();
  if (!inv || inv.status === "accepted") throw new NotFoundError("Invitation");
  return invite(actor, { email: inv.email, name: inv.name ?? undefined, role: inv.role, customRoleId: inv.customRoleId, workspaceId: inv.workspaceId ?? undefined, boardIds: inv.boardIds, boardRole: inv.boardRole }, ctx);
}

export interface InvitationPublic { email: string; name: string | null; role: BuiltinRole; accountName: string; state: "pending" | "accepted" | "revoked" | "expired" }

/** Public lookup for the accept page. Does not reveal anything for unknown tokens. */
export function getInvitationByToken(token: string): InvitationPublic | null {
  const inv = db.select().from(invitations).where(eq(invitations.tokenHash, sha256(token))).get();
  if (!inv) return null;
  const acct = db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, inv.accountId)).get();
  const state = inv.status === "pending" && inv.expiresAt < new Date().toISOString() ? "expired" : inv.status;
  return { email: inv.email, name: inv.name, role: inv.role, accountName: acct?.name ?? "", state };
}

const acceptInput = z.object({ name: z.string().trim().min(1).max(200).optional(), password: z.string().min(1).max(200) });

/** Accept: create the user with a password, grant memberships, start a session. */
export async function acceptInvitation(token: string, input: unknown, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const d = parse(acceptInput, input);
  const inv = db.select().from(invitations).where(eq(invitations.tokenHash, sha256(token))).get();
  if (!inv || inv.status !== "pending" || inv.expiresAt < new Date().toISOString()) throw new NotFoundError("Invitation");
  assertPasswordPolicy(inv.accountId, d.password);
  if (db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${inv.email.toLowerCase()}`).get()) throw new ConflictError("A user with this email already exists");
  const name = d.name ?? inv.name ?? inv.email.split("@")[0];
  const passwordHash = await hashPassword(d.password);
  let base: BuiltinRole = inv.role;
  if (inv.customRoleId) base = db.select({ b: accountRoles.baseRole }).from(accountRoles).where(eq(accountRoles.id, inv.customRoleId)).get()?.b ?? base;
  const user = db.transaction((tx) => {
    const u = tx.insert(users).values({ accountId: inv.accountId, name, email: inv.email, passwordHash, role: base }).returning().get();
    if (inv.customRoleId) tx.insert(userRoles).values({ userId: u.id, roleId: inv.customRoleId }).run();
    tx.insert(userSecurity).values({ userId: u.id, passwordChangedAt: new Date().toISOString() }).run();
    if (inv.role === "guest") {
      if (inv.workspaceId) tx.insert(guestGrants).values({ userId: u.id, workspaceId: inv.workspaceId, role: inv.boardRole }).onConflictDoNothing().run();
      for (const b of inv.boardIds) tx.insert(boardMembers).values({ boardId: b, userId: u.id, role: inv.boardRole }).onConflictDoNothing().run();
    } else if (inv.workspaceId) {
      tx.insert(workspaceMembers).values({ workspaceId: inv.workspaceId, userId: u.id, role: "member" }).onConflictDoNothing().run();
    }
    tx.update(invitations).set({ status: "accepted", acceptedAt: new Date().toISOString(), acceptedUserId: u.id }).where(eq(invitations.id, inv.id)).run();
    return u;
  });
  if (inv.role === "guest" && inv.workspaceId) syncGuestGrants(inv.workspaceId);
  const s = createSession(user.id, { accountId: user.accountId, ip: ctx.ip, userAgent: ctx.userAgent });
  recordAudit({ accountId: user.accountId, id: user.id, name: user.name, email: user.email, source: "ui" }, "invitation.accepted", { targetType: "user", targetId: user.id, targetName: user.name, role: inv.role, ip: ctx.ip });
  emit({ type: "member.changed", boardId: null, actorId: user.id });
  return { user, token: await signSession(user.id, s.id) };
}

/* ------------------------------------------------------------------ CSV import */

export interface ImportResult { created: InvitationWithLink[]; skipped: { row: number; email: string; reason: string }[] }

/** Bulk invite from CSV with header `name,email,role,title` (role optional: member|viewer|admin). Rows with errors are skipped. */
export function importCsv(actor: Actor, csv: string, ctx: { origin?: string } = {}): ImportResult {
  assertCan(actor, "account:invite");
  const rows = parseCsv(String(csv ?? ""));
  if (rows.length < 2) throw new ValidationError("CSV needs a header row and at least one user");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iEmail = col(["email", "e-mail", "e-mailadres"]);
  const iName = col(["name", "naam"]);
  const iRole = col(["role", "rol"]);
  if (iEmail < 0) throw new ValidationError("CSV needs an 'email' column");
  const out: ImportResult = { created: [], skipped: [] };
  const seen = new Set<string>();
  rows.slice(1, 501).forEach((r, i) => {
    const email = (r[iEmail] ?? "").trim().toLowerCase();
    const role = ((iRole >= 0 ? r[iRole] : "") ?? "").trim().toLowerCase() || "member";
    const skip = (reason: string) => out.skipped.push({ row: i + 2, email, reason });
    if (!email) return skip("missing email");
    if (seen.has(email)) return skip("duplicate in file");
    seen.add(email);
    if (!["member", "viewer", "admin"].includes(role)) return skip(`unknown role "${role}"`);
    try {
      out.created.push(invite(actor, { email, name: iName >= 0 ? r[iName]?.trim() : undefined, role }, ctx));
    } catch (e) {
      skip(e instanceof Error ? e.message : "error");
    }
  });
  recordAudit(actor, "account.users_imported", { created: out.created.length, skipped: out.skipped.length });
  return out;
}

export function usersByIds(ids: string[]): { id: string; name: string }[] {
  return ids.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)).all() : [];
}
