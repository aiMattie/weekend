/**
 * Server-side auth helpers.
 *  - getCurrentUser(): the logged-in user for Server Components/route handlers (session cookie)
 *  - requireUser(): same but redirects to /login
 *  - getActor(request?): Actor for services; tries Bearer token first (API/MCP), then cookie
 *  - login()/logout(): used by /api/auth/*
 */
import { eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import type { Actor } from "../actor";
import { UnauthorizedError } from "../errors";
import { extractBearer, resolveBearer } from "./bearer";
import "./bearer-resolvers";
import { verifyPassword } from "./password";
import { isLocked } from "../../server/services/account-settings";
import { isSessionAlive } from "../../server/services/sessions";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySessionClaims } from "./session";

export type SessionUser = typeof users.$inferSelect;
export type PublicUser = Omit<SessionUser, "passwordHash">;

export const toPublicUser = ({ passwordHash: _pw, ...rest }: SessionUser): PublicUser => rest; // eslint-disable-line @typescript-eslint/no-unused-vars

export function userToActor(u: Pick<SessionUser, "id" | "accountId" | "role" | "name" | "email">, source: Actor["source"] = "ui"): Actor {
  return { id: u.id, accountId: u.accountId, role: u.role, name: u.name, email: u.email, source };
}

export function findActiveUser(id: string): SessionUser | null {
  const u = db.select().from(users).where(eq(users.id, id)).get();
  return u && u.isActive ? u : null;
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // admin module: the session must also be alive server side (not revoked, account not locked by the panic button)
  const claims = await verifySessionClaims(token);
  const u = claims ? findActiveUser(claims.userId) : null;
  return u && claims && isSessionAlive(u.id, claims.sid, u.accountId) ? u : null;
});

/** Server side session id of the current cookie (admin module: session list / revoke). */
export async function getCurrentSessionId(): Promise<string | null> {
  const claims = await verifySessionClaims((await cookies()).get(SESSION_COOKIE)?.value);
  return claims?.sid ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Actor for the current request. Throws UnauthorizedError when anonymous. */
export async function getActor(request?: Request): Promise<Actor> {
  const h = request ? request.headers : await headers();
  const bearer = extractBearer(h);
  if (bearer) {
    const actor = await resolveBearer(bearer);
    if (!actor) throw new UnauthorizedError("Invalid API token");
    if (isLocked(actor.accountId)) throw new UnauthorizedError("Account is locked"); // panic button
    return actor;
  }
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return userToActor(user);
}

/** Verify credentials, return a signed session token (caller sets the cookie). */
export async function login(email: string, password: string): Promise<{ user: SessionUser; token: string } | null> {
  const user = db.select().from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).get();
  if (!user || !user.isActive || user.isAiAgent) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id)).run();
  return { user, token: await signSession(user.id) };
}

export { SESSION_COOKIE, sessionCookieOptions };
